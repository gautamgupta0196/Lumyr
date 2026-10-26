// PostgreSQL connection state wrapper
// Mirrors the pattern in bigquery.ts — module-level state + exported functions

import crypto from 'crypto'
import { PostgreSQLClient } from './data-sources/postgresql-client.js'
import type { PostgreSQLConnection, PostgreSQLCredentials, SchemaFetchOptions } from './data-sources/types.js'
import {
  saveConnection,
  getConnection,
  setActiveConnectionId,
  updateConnectionLastUsed,
  updateConnection,
  saveMultiSourceCredentials,
  getMultiSourceCredentials,
  type SavedConnection
} from './store.js'

// Module-level state
let pgClient: PostgreSQLClient | null = null
let activeConnectionId: string | null = null

interface ConnectParams {
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  ssl?: boolean
  connectionName?: string
  connectionString?: string
}

/**
 * Parse a PostgreSQL connection string (URI format) into individual components.
 * Format: postgresql://user:password@host:port/database?sslmode=require
 */
function parseConnectionString(connStr: string): {
  host: string; port: number; database: string; username: string; password: string; ssl: boolean
} {
  const url = new URL(connStr)
  return {
    host: url.hostname,
    port: parseInt(url.port) || 5432,
    database: url.pathname.slice(1) || 'postgres', // remove leading /
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: url.searchParams.get('sslmode') !== 'disable'
  }
}

export async function connectPostgreSQL(params: ConnectParams): Promise<{
  success: boolean
  error?: string
  connectionId?: string
  database?: string
}> {
  try {
    // Parse connection string if provided, otherwise use individual fields
    let host: string, port: number, database: string, username: string, password: string, ssl: boolean

    if (params.connectionString) {
      try {
        const parsed = parseConnectionString(params.connectionString)
        host = parsed.host
        port = parsed.port
        database = parsed.database
        username = parsed.username
        password = parsed.password
        ssl = parsed.ssl
      } catch {
        return { success: false, error: 'Invalid connection string. Expected format: postgresql://user:password@host:port/database' }
      }
    } else {
      if (!params.host || !params.database || !params.username) {
        return { success: false, error: 'Host, database, and username are required' }
      }
      host = params.host
      port = params.port || 5432
      database = params.database
      username = params.username
      password = params.password || ''
      ssl = params.ssl ?? true
    }

    const connectionId = crypto.randomUUID()

    const connection: PostgreSQLConnection = {
      id: connectionId,
      name: params.connectionName || `${host}/${database}`,
      type: 'postgresql',
      host,
      port,
      database,
      ssl,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    const credentials: PostgreSQLCredentials = {
      type: 'postgresql',
      username,
      password
    }

    // Disconnect existing client if any
    if (pgClient) {
      pgClient.disconnect()
      pgClient = null
    }

    // Create and test the connection
    pgClient = new PostgreSQLClient(connection, credentials)
    const result = await pgClient.connect()

    if (!result.success) {
      pgClient = null
      return { success: false, error: result.error }
    }

    // Persist connection metadata and credentials
    const savedConn: SavedConnection = {
      id: connectionId,
      name: connection.name,
      type: 'postgresql',
      host,
      port,
      database,
      ssl,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    saveConnection(savedConn)
    saveMultiSourceCredentials(connectionId, {
      type: 'postgresql',
      username,
      password
    })

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)

    return { success: true, connectionId, database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect to PostgreSQL'
    return { success: false, error: message }
  }
}

export async function switchPostgreSQLConnection(connectionId: string): Promise<{
  success: boolean
  error?: string
  database?: string
}> {
  try {
    const conn = getConnection(connectionId)
    console.log('[PostgreSQL] switchConnection - conn found:', !!conn, 'type:', conn?.type)
    if (!conn || conn.type !== 'postgresql') {
      return { success: false, error: 'PostgreSQL connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    console.log('[PostgreSQL] switchConnection - creds found:', !!creds, 'creds.type:', creds?.type, 'has username:', !!creds?.username)
    if (!creds || creds.type !== 'postgresql' || !creds.username) {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    // Disconnect existing client
    if (pgClient) {
      pgClient.disconnect()
      pgClient = null
    }

    const pgConn: PostgreSQLConnection = {
      id: conn.id,
      name: conn.name,
      type: 'postgresql',
      host: conn.host || 'localhost',
      port: conn.port || 5432,
      database: conn.database || 'postgres',
      ssl: conn.ssl ?? false,
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }

    const pgCreds: PostgreSQLCredentials = {
      type: 'postgresql',
      username: creds.username,
      password: creds.password || ''
    }

    pgClient = new PostgreSQLClient(pgConn, pgCreds)
    console.log('[PostgreSQL] switchConnection - connecting to', pgConn.host, ':', pgConn.port, '/', pgConn.database)
    const result = await pgClient.connect()
    console.log('[PostgreSQL] switchConnection - connect result:', result.success, result.error || '')

    if (!result.success) {
      pgClient = null
      return { success: false, error: result.error }
    }

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)

    return { success: true, database: conn.database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch PostgreSQL connection'
    return { success: false, error: message }
  }
}

export async function getPostgreSQLSchema(options?: SchemaFetchOptions): Promise<{
  success: boolean
  error?: string
  schema?: { projectId: string; datasets: { id: string; tables: { id: string; columns: { name: string; type: string; description?: string }[] }[] }[] }
  metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean }
}> {
  if (!pgClient) {
    return { success: false, error: 'Not connected to PostgreSQL' }
  }

  try {
    const result = await pgClient.getSchema(options)

    // Convert to frontend Schema format: projectId = database name
    const schema = {
      projectId: result.schema.sourceName,
      datasets: result.schema.datasets.map(ds => ({
        id: ds.id,
        tables: ds.tables.map(t => ({
          id: t.id,
          columns: t.columns.map(c => ({
            name: c.name,
            type: c.type,
            description: c.description
          }))
        }))
      }))
    }

    return {
      success: true,
      schema,
      metadata: {
        totalDatasets: result.totalDatasets,
        totalTables: result.totalTables,
        hasMore: result.hasMore
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch schema'
    return { success: false, error: message }
  }
}

export async function runPostgreSQLQuery(query: string): Promise<{
  success: boolean
  error?: string
  data?: Record<string, unknown>[]
}> {
  if (!pgClient) {
    return { success: false, error: 'Not connected to PostgreSQL' }
  }

  try {
    const result = await pgClient.executeQuery(query)
    return { success: true, data: result.rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    return { success: false, error: message }
  }
}

export function disconnectPostgreSQL(): void {
  if (pgClient) {
    pgClient.disconnect()
    pgClient = null
  }
  activeConnectionId = null
}

export function getPostgreSQLEnvVars(): Record<string, string> {
  if (!pgClient || !activeConnectionId) {
    return {}
  }

  const conn = getConnection(activeConnectionId)
  const creds = getMultiSourceCredentials(activeConnectionId)

  if (!conn || !creds || creds.type !== 'postgresql') {
    return {}
  }

  return {
    PGHOST: (conn.host === 'localhost' ? '127.0.0.1' : conn.host) || '127.0.0.1',
    PGPORT: String(conn.port || 5432),
    PGDATABASE: conn.database || 'postgres',
    PGUSER: creds.username || '',
    PGPASSWORD: creds.password || ''
  }
}

export async function updatePostgreSQLConnection(
  connectionId: string,
  params: ConnectParams
): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'postgresql') {
      return { success: false, error: 'PostgreSQL connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'postgresql') {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    // Resolve final values: merge provided params over existing
    let host: string, port: number, database: string, username: string, password: string, ssl: boolean

    if (params.connectionString) {
      try {
        const parsed = parseConnectionString(params.connectionString)
        host = parsed.host
        port = parsed.port
        database = parsed.database
        username = parsed.username
        password = parsed.password
        ssl = parsed.ssl
      } catch {
        return { success: false, error: 'Invalid connection string. Expected format: postgresql://user:password@host:port/database' }
      }
    } else {
      host = params.host ?? conn.host ?? 'localhost'
      port = params.port ?? conn.port ?? 5432
      database = params.database ?? conn.database ?? 'postgres'
      username = params.username ?? creds.username ?? ''
      password = params.password ?? creds.password ?? ''
      ssl = params.ssl ?? conn.ssl ?? true
    }

    // Test connection before saving
    const testClient = new PostgreSQLClient(
      { id: connectionId, name: conn.name, type: 'postgresql', host, port, database, ssl, createdAt: conn.createdAt, lastUsed: Date.now() },
      { type: 'postgresql', username, password }
    )
    const testResult = await testClient.connect()
    if (!testResult.success) {
      testClient.disconnect()
      return { success: false, error: testResult.error }
    }
    testClient.disconnect()

    // Update metadata store
    const name = params.connectionName ?? conn.name
    updateConnection(connectionId, { name, host, port, database, ssl, lastUsed: Date.now() })

    // Update credentials store
    saveMultiSourceCredentials(connectionId, { type: 'postgresql', username, password })

    // If this is the active connection, reconnect
    if (activeConnectionId === connectionId && pgClient) {
      pgClient.disconnect()
      pgClient = new PostgreSQLClient(
        { id: connectionId, name, type: 'postgresql', host, port, database, ssl, createdAt: conn.createdAt, lastUsed: Date.now() },
        { type: 'postgresql', username, password }
      )
      await pgClient.connect()
    }

    return { success: true, database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update PostgreSQL connection'
    return { success: false, error: message }
  }
}

export function getPostgreSQLConnectionDetails(connectionId: string): {
  success: boolean
  error?: string
  connection?: { name: string; host: string; port: number; database: string; ssl: boolean; username: string; password: string }
} {
  const conn = getConnection(connectionId)
  if (!conn || conn.type !== 'postgresql') {
    return { success: false, error: 'PostgreSQL connection not found' }
  }

  const creds = getMultiSourceCredentials(connectionId)
  if (!creds || creds.type !== 'postgresql') {
    return { success: false, error: 'Credentials not found for this connection' }
  }

  return {
    success: true,
    connection: {
      name: conn.name,
      host: conn.host || 'localhost',
      port: conn.port || 5432,
      database: conn.database || 'postgres',
      ssl: conn.ssl ?? false,
      username: creds.username || '',
      password: creds.password || ''
    }
  }
}

export async function getPostgreSQLTableDetails(tableName: string): Promise<{
  success: boolean
  error?: string
  table?: { columns: { name: string; type: string; description?: string }[] }
}> {
  if (!pgClient) {
    return { success: false, error: 'Not connected to PostgreSQL' }
  }

  try {
    const table = await pgClient.getTableDetails(tableName)
    if (!table) {
      return { success: false, error: 'Table not found' }
    }
    return {
      success: true,
      table: {
        columns: table.columns.map(c => ({ name: c.name, type: c.type, description: c.description }))
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get table details'
    return { success: false, error: message }
  }
}

export function cleanupPostgreSQL(): void {
  disconnectPostgreSQL()
}
