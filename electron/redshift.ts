import crypto from 'crypto'
import { RedshiftClient } from './data-sources/redshift-client.js'
import type { RedshiftConnection, RedshiftCredentials, SchemaFetchOptions } from './data-sources/types.js'
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

let redshiftClient: RedshiftClient | null = null
let activeConnectionId: string | null = null

interface ConnectParams {
  host: string
  port?: number
  database: string
  region: string
  username: string
  password?: string
  connectionName?: string
}

export async function connectRedshift(params: ConnectParams): Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }> {
  try {
    if (!params.host || !params.database || !params.username) {
      return { success: false, error: 'Host, database, and username are required' }
    }

    const connectionId = crypto.randomUUID()
    const connection: RedshiftConnection = {
      id: connectionId,
      name: params.connectionName || `${params.host}/${params.database}`,
      type: 'redshift',
      host: params.host,
      port: params.port || 5439,
      database: params.database,
      region: params.region || 'us-east-1',
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    const credentials: RedshiftCredentials = {
      type: 'redshift',
      username: params.username,
      password: params.password || ''
    }

    if (redshiftClient) {
      redshiftClient.disconnect()
      redshiftClient = null
    }

    redshiftClient = new RedshiftClient(connection, credentials)
    const result = await redshiftClient.connect()
    if (!result.success) {
      redshiftClient = null
      return { success: false, error: result.error }
    }

    const savedConn: SavedConnection = {
      id: connectionId,
      name: connection.name,
      type: 'redshift',
      host: connection.host,
      port: connection.port,
      database: connection.database,
      region: connection.region,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    saveConnection(savedConn)
    saveMultiSourceCredentials(connectionId, {
      type: 'redshift',
      username: params.username,
      password: params.password || ''
    })

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)

    return { success: true, connectionId, database: params.database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect to Redshift'
    return { success: false, error: message }
  }
}

export async function switchRedshiftConnection(connectionId: string): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'redshift') {
      return { success: false, error: 'Redshift connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'redshift' || !creds.username) {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    if (redshiftClient) {
      redshiftClient.disconnect()
      redshiftClient = null
    }

    const redConn: RedshiftConnection = {
      id: conn.id,
      name: conn.name,
      type: 'redshift',
      host: conn.host || '',
      port: conn.port || 5439,
      database: conn.database || '',
      region: conn.region || 'us-east-1',
      clusterId: conn.clusterId,
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }

    const redCreds: RedshiftCredentials = {
      type: 'redshift',
      username: creds.username,
      password: creds.password || ''
    }

    redshiftClient = new RedshiftClient(redConn, redCreds)
    const result = await redshiftClient.connect()
    if (!result.success) {
      redshiftClient = null
      return { success: false, error: result.error }
    }

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)
    return { success: true, database: conn.database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch Redshift connection'
    return { success: false, error: message }
  }
}

export async function getRedshiftSchema(options?: SchemaFetchOptions): Promise<{ success: boolean; error?: string; schema?: { projectId: string; datasets: { id: string; tables: { id: string; columns: { name: string; type: string; description?: string }[] }[] }[] }; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }> {
  if (!redshiftClient) {
    return { success: false, error: 'Not connected to Redshift' }
  }

  try {
    const result = await redshiftClient.getSchema(options)
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

export async function runRedshiftQuery(query: string): Promise<{ success: boolean; error?: string; data?: Record<string, unknown>[] }> {
  if (!redshiftClient) {
    return { success: false, error: 'Not connected to Redshift' }
  }

  try {
    const result = await redshiftClient.executeQuery(query)
    return { success: true, data: result.rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    return { success: false, error: message }
  }
}

export function disconnectRedshift(): void {
  if (redshiftClient) {
    redshiftClient.disconnect()
    redshiftClient = null
  }
  activeConnectionId = null
}

export function getRedshiftEnvVars(): Record<string, string> {
  if (!activeConnectionId) {
    return {}
  }

  const conn = getConnection(activeConnectionId)
  const creds = getMultiSourceCredentials(activeConnectionId)
  if (!conn || !creds || conn.type !== 'redshift' || creds.type !== 'redshift') {
    return {}
  }

  return {
    REDSHIFT_HOST: conn.host || '',
    REDSHIFT_PORT: String(conn.port || 5439),
    REDSHIFT_DATABASE: conn.database || '',
    REDSHIFT_USER: creds.username || '',
    REDSHIFT_PASSWORD: creds.password || ''
  }
}

export async function getRedshiftTableDetails(tableName: string): Promise<{
  success: boolean
  error?: string
  table?: { columns: { name: string; type: string; description?: string }[] }
}> {
  if (!redshiftClient) {
    return { success: false, error: 'Not connected to Redshift' }
  }

  try {
    const table = await redshiftClient.getTableDetails(tableName)
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

export async function updateRedshiftConnection(
  connectionId: string,
  params: { host?: string; port?: number; database?: string; region?: string; username?: string; password?: string; connectionName?: string }
): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'redshift') {
      return { success: false, error: 'Redshift connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'redshift') {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    const host = params.host ?? conn.host ?? ''
    const port = params.port ?? conn.port ?? 5439
    const database = params.database ?? conn.database ?? ''
    const region = params.region ?? conn.region ?? 'us-east-1'
    const username = params.username ?? creds.username ?? ''
    const password = params.password ?? creds.password ?? ''
    const name = params.connectionName ?? conn.name

    // Test connection before saving
    const testConn: RedshiftConnection = {
      id: connectionId,
      name,
      type: 'redshift',
      host,
      port,
      database,
      region,
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }
    const testCreds: RedshiftCredentials = { type: 'redshift', username, password }

    const testClient = new RedshiftClient(testConn, testCreds)
    const testResult = await testClient.connect()
    if (!testResult.success) {
      testClient.disconnect()
      return { success: false, error: testResult.error }
    }
    testClient.disconnect()

    // Update metadata store
    updateConnection(connectionId, { name, host, port, database, region, lastUsed: Date.now() })

    // Update credentials store
    saveMultiSourceCredentials(connectionId, { type: 'redshift', username, password })

    // If this is the active connection, reconnect
    if (activeConnectionId === connectionId && redshiftClient) {
      redshiftClient.disconnect()
      redshiftClient = new RedshiftClient(testConn, testCreds)
      await redshiftClient.connect()
    }

    return { success: true, database }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update Redshift connection'
    return { success: false, error: message }
  }
}

export function getRedshiftConnectionDetails(connectionId: string): {
  success: boolean
  error?: string
  connection?: { name: string; host: string; port: number; database: string; region: string; username: string; password: string }
} {
  const conn = getConnection(connectionId)
  if (!conn || conn.type !== 'redshift') {
    return { success: false, error: 'Redshift connection not found' }
  }

  const creds = getMultiSourceCredentials(connectionId)
  if (!creds || creds.type !== 'redshift') {
    return { success: false, error: 'Credentials not found for this connection' }
  }

  return {
    success: true,
    connection: {
      name: conn.name,
      host: conn.host || '',
      port: conn.port || 5439,
      database: conn.database || '',
      region: conn.region || 'us-east-1',
      username: creds.username || '',
      password: creds.password || ''
    }
  }
}

export function cleanupRedshift(): void {
  disconnectRedshift()
}
