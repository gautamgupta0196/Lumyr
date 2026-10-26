/**
 * MCP bridge — exposes Lumyr's data tools to the opencode agent.
 *
 * opencode brings its own filesystem/bash tools, but it knows nothing about the
 * user's connected database. This hosts an MCP server on loopback so opencode
 * can inspect the schema and run read-only queries while it writes the
 * dashboard.
 *
 * It runs *inside* the Electron main process (rather than as a stdio
 * subprocess) because the query callbacks close over live connection state that
 * a child process could not reach. opencode connects to it as a `remote` MCP
 * server — see provider.ts.
 */
import express from 'express'
import type { Server } from 'http'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createLogger } from '../logger.js'
import type { Schema, GetTableDetailsFn, RunQueryFn } from '../agent-types.js'

const logger = createLogger('MCP Bridge')

export interface BridgeDeps {
  /** Schema for the active connection, used to answer list_tables. */
  schema: Schema
  /** Fetch full column detail for one table (lazy — schema may be tables-only). */
  getTableDetails?: GetTableDetailsFn
  /** Execute a read-only query against the active connection. */
  runQuery?: RunQueryFn
}

export interface RunningBridge {
  url: string
  close: () => Promise<void>
}

function flattenTables(schema: Schema): string[] {
  const out: string[] = []
  for (const dataset of schema.datasets ?? []) {
    for (const table of dataset.tables ?? []) {
      out.push(`${dataset.id}.${table.id}`)
    }
  }
  return out
}

function buildServer(deps: BridgeDeps): McpServer {
  const server = new McpServer({ name: 'lumyr-data', version: '1.0.0' })

  server.registerTool(
    'list_tables',
    {
      description:
        'List the tables available in the connected database, as "dataset.table" identifiers. Call this before writing any query.',
      inputSchema: {
        search: z.string().optional().describe('Optional case-insensitive substring filter'),
      },
    },
    async ({ search }) => {
      let tables = flattenTables(deps.schema)
      if (search) {
        const needle = search.toLowerCase()
        tables = tables.filter(t => t.toLowerCase().includes(needle))
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ projectId: deps.schema.projectId, tables }, null, 2),
          },
        ],
      }
    }
  )

  server.registerTool(
    'get_table_schema',
    {
      description:
        'Get column names and types for one or more tables. Always call this before writing a query that references a table.',
      inputSchema: {
        tables: z.array(z.string()).describe('Table identifiers, e.g. ["sales.orders"]'),
      },
    },
    async ({ tables }) => {
      const results: Record<string, unknown> = {}

      for (const name of tables) {
        // Prefer the cached schema; fall back to a lazy lookup.
        const [datasetId, tableId] = name.includes('.') ? name.split('.') : [undefined, name]
        const cached = deps.schema.datasets
          ?.find(d => (datasetId ? d.id === datasetId : true))
          ?.tables?.find(t => t.id === tableId)

        if (cached?.columns?.length) {
          results[name] = { columns: cached.columns }
          continue
        }

        if (deps.getTableDetails) {
          try {
            const detail = await deps.getTableDetails(name)
            results[name] = detail ?? { error: 'Table not found' }
          } catch (err) {
            results[name] = { error: err instanceof Error ? err.message : String(err) }
          }
        } else {
          results[name] = { error: 'Schema details unavailable for this connection' }
        }
      }

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
    }
  )

  if (deps.runQuery) {
    server.registerTool(
      'run_sql',
      {
        description:
          'Run a read-only SQL query against the connected database and return the rows as JSON. Use a LIMIT while exploring. Never issue statements that modify data or schema.',
        inputSchema: {
          sql: z.string().describe('A single read-only SELECT statement'),
        },
      },
      async ({ sql }) => {
        const result = await deps.runQuery!(sql)
        if (!result.success) {
          return {
            isError: true,
            content: [{ type: 'text', text: result.error || 'Query failed' }],
          }
        }
        // Cap the payload so a careless SELECT * cannot flood the context window.
        const rows = Array.isArray(result.data) ? result.data.slice(0, 200) : []
        const truncated = Array.isArray(result.data) && result.data.length > rows.length
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { rowCount: rows.length, truncated, rows },
                null,
                2
              ),
            },
          ],
        }
      }
    )
  }

  return server
}

/**
 * Start the bridge on an ephemeral loopback port. Resolves with the URL to hand
 * to opencode. Each MCP request gets a fresh stateless transport, which is all
 * opencode needs and avoids per-session bookkeeping here.
 */
export async function startMcpBridge(deps: BridgeDeps): Promise<RunningBridge> {
  const app = express()
  app.use(express.json({ limit: '4mb' }))

  app.post('/mcp', async (req, res) => {
    const server = buildServer(deps)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

    res.on('close', () => {
      void transport.close()
      void server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      logger.error('MCP request failed', { error: err instanceof Error ? err.message : String(err) })
      if (!res.headersSent) res.status(500).json({ error: 'MCP bridge error' })
    }
  })

  const httpServer: Server = await new Promise(resolve => {
    // Port 0 => OS assigns a free port. Bind to loopback only.
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })

  const address = httpServer.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const url = `http://127.0.0.1:${port}/mcp`
  logger.info('MCP bridge listening', { url })

  return {
    url,
    close: () =>
      new Promise<void>(resolve => {
        httpServer.close(() => {
          logger.info('MCP bridge closed')
          resolve()
        })
      }),
  }
}
