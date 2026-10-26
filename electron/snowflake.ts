import crypto from 'crypto'
import { SnowflakeClient } from './data-sources/snowflake-client.js'
import type { SnowflakeConnection, SnowflakeCredentials, SchemaFetchOptions } from './data-sources/types.js'
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

let snowflakeClient: SnowflakeClient | null = null
let activeConnectionId: string | null = null

interface ConnectParams {
  account: string
  warehouse: string
  database: string
  schema?: string
  role?: string
  username: string
  password?: string
  connectionName?: string
}

export async function connectSnowflake(params: ConnectParams): Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }> {
  try {
    if (!params.account || !params.warehouse || !params.database || !params.username) {
      return { success: false, error: 'Account, warehouse, database, and username are required' }
    }

    const connectionId = crypto.randomUUID()
    const connection: SnowflakeConnection = {
      id: connectionId,
      name: params.connectionName || `${params.account}/${params.database}`,
      type: 'snowflake',
      account: params.account,
      warehouse: params.warehouse,
      database: params.database,
      schema: params.schema || 'PUBLIC',
      role: params.role,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    const credentials: SnowflakeCredentials = {
      type: 'snowflake',
      username: params.username,
      password: params.password || ''
    }

    if (snowflakeClient) {
      snowflakeClient.disconnect()
      snowflakeClient = null
    }

    snowflakeClient = new SnowflakeClient(connection, credentials)
    const result = await snowflakeClient.connect()
    if (!result.success) {
      snowflakeClient = null
      return { success: false, error: result.error }
    }

    const savedConn: SavedConnection = {
      id: connectionId,
      name: connection.name,
      type: 'snowflake',
      account: connection.account,
      warehouse: connection.warehouse,
      database: connection.database,
      schema: connection.schema,
      role: connection.role,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    saveConnection(savedConn)
    saveMultiSourceCredentials(connectionId, {
      type: 'snowflake',
      username: params.username,
      password: params.password || ''
    })

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)

    return { success: true, connectionId, database: params.database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect to Snowflake'
    return { success: false, error: message }
  }
}

export async function switchSnowflakeConnection(connectionId: string): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'snowflake') {
      return { success: false, error: 'Snowflake connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'snowflake' || !creds.username) {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    if (snowflakeClient) {
      snowflakeClient.disconnect()
      snowflakeClient = null
    }

    const snowConn: SnowflakeConnection = {
      id: conn.id,
      name: conn.name,
      type: 'snowflake',
      account: conn.account || '',
      warehouse: conn.warehouse || '',
      database: conn.database || '',
      schema: conn.schema || 'PUBLIC',
      role: conn.role,
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }

    const snowCreds: SnowflakeCredentials = {
      type: 'snowflake',
      username: creds.username,
      password: creds.password || ''
    }

    snowflakeClient = new SnowflakeClient(snowConn, snowCreds)
    const result = await snowflakeClient.connect()
    if (!result.success) {
      snowflakeClient = null
      return { success: false, error: result.error }
    }

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)
    return { success: true, database: conn.database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch Snowflake connection'
    return { success: false, error: message }
  }
}

export async function getSnowflakeSchema(options?: SchemaFetchOptions): Promise<{ success: boolean; error?: string; schema?: { projectId: string; datasets: { id: string; tables: { id: string; columns: { name: string; type: string; description?: string }[] }[] }[] }; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }> {
  if (!snowflakeClient) {
    return { success: false, error: 'Not connected to Snowflake' }
  }

  try {
    const result = await snowflakeClient.getSchema(options)
    const schema = {
      projectId: result.schema.sourceName,
      datasets: result.schema.datasets.map(ds => ({
        id: ds.id,
        tables: ds.tables.map(t => ({
          id: t.id,
          columns: t.columns.map(c => ({ name: c.name, type: c.type, description: c.description }))
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

export async function runSnowflakeQuery(query: string): Promise<{ success: boolean; error?: string; data?: Record<string, unknown>[] }> {
  if (!snowflakeClient) {
    return { success: false, error: 'Not connected to Snowflake' }
  }

  try {
    const result = await snowflakeClient.executeQuery(query)
    return { success: true, data: result.rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    return { success: false, error: message }
  }
}

export function disconnectSnowflake(): void {
  if (snowflakeClient) {
    snowflakeClient.disconnect()
    snowflakeClient = null
  }
  activeConnectionId = null
}

export function getSnowflakeEnvVars(): Record<string, string> {
  if (!activeConnectionId) {
    return {}
  }

  const conn = getConnection(activeConnectionId)
  const creds = getMultiSourceCredentials(activeConnectionId)
  if (!conn || !creds || conn.type !== 'snowflake' || creds.type !== 'snowflake') {
    return {}
  }

  return {
    SNOWFLAKE_ACCOUNT: conn.account || '',
    SNOWFLAKE_USER: creds.username || '',
    SNOWFLAKE_PASSWORD: creds.password || '',
    SNOWFLAKE_WAREHOUSE: conn.warehouse || '',
    SNOWFLAKE_DATABASE: conn.database || '',
    SNOWFLAKE_SCHEMA: conn.schema || 'PUBLIC'
  }
}

export async function getSnowflakeTableDetails(tableName: string): Promise<{
  success: boolean
  error?: string
  table?: { columns: { name: string; type: string; description?: string }[] }
}> {
  if (!snowflakeClient) {
    return { success: false, error: 'Not connected to Snowflake' }
  }

  try {
    const table = await snowflakeClient.getTableDetails(tableName)
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

export async function updateSnowflakeConnection(
  connectionId: string,
  params: { account?: string; warehouse?: string; database?: string; schema?: string; role?: string; username?: string; password?: string; connectionName?: string }
): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'snowflake') {
      return { success: false, error: 'Snowflake connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'snowflake') {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    const account = params.account ?? conn.account ?? ''
    const warehouse = params.warehouse ?? conn.warehouse ?? ''
    const database = params.database ?? conn.database ?? ''
    const schema = params.schema ?? conn.schema ?? 'PUBLIC'
    const role = params.role ?? conn.role
    const username = params.username ?? creds.username ?? ''
    const password = params.password ?? creds.password ?? ''
    const name = params.connectionName ?? conn.name

    // Test connection before saving
    const testConn: SnowflakeConnection = {
      id: connectionId,
      name,
      type: 'snowflake',
      account,
      warehouse,
      database,
      schema,
      role,
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }
    const testCreds: SnowflakeCredentials = { type: 'snowflake', username, password }

    const testClient = new SnowflakeClient(testConn, testCreds)
    const testResult = await testClient.connect()
    if (!testResult.success) {
      testClient.disconnect()
      return { success: false, error: testResult.error }
    }
    testClient.disconnect()

    // Update metadata store
    updateConnection(connectionId, { name, account, warehouse, database, schema, role, lastUsed: Date.now() })

    // Update credentials store
    saveMultiSourceCredentials(connectionId, { type: 'snowflake', username, password })

    // If this is the active connection, reconnect
    if (activeConnectionId === connectionId && snowflakeClient) {
      snowflakeClient.disconnect()
      snowflakeClient = new SnowflakeClient(testConn, testCreds)
      await snowflakeClient.connect()
    }

    return { success: true, database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Snowflake connection'
    return { success: false, error: message }
  }
}

export function getSnowflakeConnectionDetails(connectionId: string): {
  success: boolean
  error?: string
  connection?: { name: string; account: string; warehouse: string; database: string; schema: string; role?: string; username: string; password: string }
} {
  const conn = getConnection(connectionId)
  if (!conn || conn.type !== 'snowflake') {
    return { success: false, error: 'Snowflake connection not found' }
  }

  const creds = getMultiSourceCredentials(connectionId)
  if (!creds || creds.type !== 'snowflake') {
    return { success: false, error: 'Credentials not found for this connection' }
  }

  return {
    success: true,
    connection: {
      name: conn.name,
      account: conn.account || '',
      warehouse: conn.warehouse || '',
      database: conn.database || '',
      schema: conn.schema || 'PUBLIC',
      role: conn.role,
      username: creds.username || '',
      password: creds.password || ''
    }
  }
}

export function cleanupSnowflake(): void {
  disconnectSnowflake()
}
