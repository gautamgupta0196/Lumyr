// ODBC connection state wrapper
// Mirrors the pattern in postgresql.ts — module-level state + exported functions

import crypto from 'crypto'
import { ODBCClient } from './data-sources/odbc-client.js'
import type { ODBCConnection, ODBCCredentials, SchemaFetchOptions } from './data-sources/types.js'
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
let odbcClient: ODBCClient | null = null
let activeConnectionId: string | null = null

interface ConnectParams {
  connectionString?: string
  dsn?: string
  driver?: string
  host?: string
  port?: number
  database?: string
  username?: string
  password?: string
  connectionName?: string
}

export async function connectODBC(params: ConnectParams): Promise<{
  success: boolean
  error?: string
  connectionId?: string
  database?: string
}> {
  try {
    if (!params.connectionString && !params.dsn && !params.driver) {
      return { success: false, error: 'Either a connection string, DSN, or driver name is required' }
    }

    const connectionId = crypto.randomUUID()
    const displayName = params.connectionName ||
      params.dsn ||
      params.driver ||
      (params.host ? `${params.host}/${params.database || ''}` : 'ODBC Connection')

    const connection: ODBCConnection = {
      id: connectionId,
      name: displayName,
      type: 'odbc',
      connectionString: params.connectionString,
      dsn: params.dsn,
      driver: params.driver,
      host: params.host,
      port: params.port,
      database: params.database,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    const credentials: ODBCCredentials = {
      type: 'odbc',
      username: params.username,
      password: params.password
    }

    if (odbcClient) {
      odbcClient.disconnect()
      odbcClient = null
    }

    odbcClient = new ODBCClient(connection, credentials)
    const result = await odbcClient.connect()

    if (!result.success) {
      odbcClient = null
      return { success: false, error: result.error }
    }

    const savedConn: SavedConnection = {
      id: connectionId,
      name: displayName,
      type: 'odbc',
      connectionString: params.connectionString,
      dsn: params.dsn,
      driver: params.driver,
      host: params.host,
      port: params.port,
      database: params.database,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    saveConnection(savedConn)
    saveMultiSourceCredentials(connectionId, {
      type: 'odbc',
      username: params.username,
      password: params.password
    })

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)

    return { success: true, connectionId, database: params.database || params.dsn || 'ODBC' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect via ODBC'
    return { success: false, error: message }
  }
}

export async function switchODBCConnection(connectionId: string): Promise<{
  success: boolean
  error?: string
  database?: string
}> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'odbc') {
      return { success: false, error: 'ODBC connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'odbc') {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    if (odbcClient) {
      odbcClient.disconnect()
      odbcClient = null
    }

    const odbcConn: ODBCConnection = {
      id: conn.id,
      name: conn.name,
      type: 'odbc',
      connectionString: conn.connectionString,
      dsn: conn.dsn,
      driver: conn.driver,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }

    const odbcCreds: ODBCCredentials = {
      type: 'odbc',
      username: creds.username,
      password: creds.password
    }

    odbcClient = new ODBCClient(odbcConn, odbcCreds)
    const result = await odbcClient.connect()

    if (!result.success) {
      odbcClient = null
      return { success: false, error: result.error }
    }

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)

    return { success: true, database: conn.database || conn.dsn || 'ODBC' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch ODBC connection'
    return { success: false, error: message }
  }
}

export async function getODBCSchema(options?: SchemaFetchOptions): Promise<{
  success: boolean
  error?: string
  schema?: { projectId: string; datasets: { id: string; tables: { id: string; columns: { name: string; type: string; description?: string }[] }[] }[] }
  metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean }
}> {
  if (!odbcClient) {
    return { success: false, error: 'Not connected via ODBC' }
  }

  try {
    const result = await odbcClient.getSchema(options)
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

export async function runODBCQuery(query: string): Promise<{
  success: boolean
  error?: string
  data?: Record<string, unknown>[]
}> {
  if (!odbcClient) {
    return { success: false, error: 'Not connected via ODBC' }
  }

  try {
    const result = await odbcClient.executeQuery(query)
    return { success: true, data: result.rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    return { success: false, error: message }
  }
}

export function disconnectODBC(): void {
  if (odbcClient) {
    odbcClient.disconnect()
    odbcClient = null
  }
  activeConnectionId = null
}

export function getODBCEnvVars(): Record<string, string> {
  if (!odbcClient || !activeConnectionId) {
    return {}
  }

  const conn = getConnection(activeConnectionId)
  const creds = getMultiSourceCredentials(activeConnectionId)

  if (!conn || !creds || creds.type !== 'odbc') {
    return {}
  }

  // Build the connection string for Python pyodbc
  const parts: string[] = []
  if (conn.connectionString) {
    // Use the raw connection string, but inject credentials if provided separately
    let connStr = conn.connectionString
    if (creds.username && !connStr.includes('UID=')) connStr += `;UID=${creds.username}`
    if (creds.password && !connStr.includes('PWD=')) connStr += `;PWD=${creds.password}`
    return { ODBC_CONNECTION_STRING: connStr }
  }

  if (conn.dsn) parts.push(`DSN=${conn.dsn}`)
  if (conn.driver) parts.push(`DRIVER={${conn.driver}}`)
  if (conn.host) parts.push(`SERVER=${conn.host}`)
  if (conn.port) parts.push(`PORT=${conn.port}`)
  if (conn.database) parts.push(`DATABASE=${conn.database}`)
  if (creds.username) parts.push(`UID=${creds.username}`)
  if (creds.password) parts.push(`PWD=${creds.password}`)

  return { ODBC_CONNECTION_STRING: parts.join(';') }
}

export async function updateODBCConnection(
  connectionId: string,
  params: Partial<ConnectParams>
): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'odbc') {
      return { success: false, error: 'ODBC connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'odbc') {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    const connectionString = params.connectionString ?? conn.connectionString
    const dsn = params.dsn ?? conn.dsn
    const driver = params.driver ?? conn.driver
    const host = params.host ?? conn.host
    const port = params.port ?? conn.port
    const database = params.database ?? conn.database
    const username = params.username ?? creds.username
    const password = params.password ?? creds.password

    // Test connection before saving
    const testClient = new ODBCClient(
      { id: connectionId, name: conn.name, type: 'odbc', connectionString, dsn, driver, host, port, database, createdAt: conn.createdAt, lastUsed: Date.now() },
      { type: 'odbc', username, password }
    )
    const testResult = await testClient.connect()
    if (!testResult.success) {
      testClient.disconnect()
      return { success: false, error: testResult.error }
    }
    testClient.disconnect()

    const name = params.connectionName ?? conn.name
    updateConnection(connectionId, { name, connectionString, dsn, driver, host, port, database, lastUsed: Date.now() })
    saveMultiSourceCredentials(connectionId, { type: 'odbc', username, password })

    if (activeConnectionId === connectionId && odbcClient) {
      odbcClient.disconnect()
      odbcClient = new ODBCClient(
        { id: connectionId, name, type: 'odbc', connectionString, dsn, driver, host, port, database, createdAt: conn.createdAt, lastUsed: Date.now() },
        { type: 'odbc', username, password }
      )
      await odbcClient.connect()
    }

    return { success: true, database: database || dsn || 'ODBC' }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update ODBC connection'
    return { success: false, error: message }
  }
}

export function getODBCConnectionDetails(connectionId: string): {
  success: boolean
  error?: string
  connection?: { name: string; connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username: string; password: string }
} {
  const conn = getConnection(connectionId)
  if (!conn || conn.type !== 'odbc') {
    return { success: false, error: 'ODBC connection not found' }
  }

  const creds = getMultiSourceCredentials(connectionId)
  if (!creds || creds.type !== 'odbc') {
    return { success: false, error: 'Credentials not found for this connection' }
  }

  return {
    success: true,
    connection: {
      name: conn.name,
      connectionString: conn.connectionString,
      dsn: conn.dsn,
      driver: conn.driver,
      host: conn.host,
      port: conn.port,
      database: conn.database,
      username: creds.username || '',
      password: creds.password || ''
    }
  }
}

export async function getODBCTableDetails(tableName: string): Promise<{
  success: boolean
  error?: string
  table?: { columns: { name: string; type: string; description?: string }[] }
}> {
  if (!odbcClient) {
    return { success: false, error: 'Not connected via ODBC' }
  }

  try {
    const table = await odbcClient.getTableDetails(tableName)
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

export function cleanupODBC(): void {
  disconnectODBC()
}
