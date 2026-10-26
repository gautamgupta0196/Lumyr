// NetSuite connection state wrapper
// Mirrors the pattern in postgresql.ts — module-level state + exported functions

import crypto from 'crypto'
import { NetSuiteClient } from './data-sources/netsuite-client.js'
import type { NetSuiteConnection, NetSuiteCredentials, SchemaFetchOptions } from './data-sources/types.js'
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
let nsClient: NetSuiteClient | null = null
let activeConnectionId: string | null = null

interface ConnectParams {
  accountId: string
  consumerKey: string
  consumerSecret: string
  tokenId: string
  tokenSecret: string
  connectionName?: string
}

export async function connectNetSuite(params: ConnectParams): Promise<{
  success: boolean
  error?: string
  connectionId?: string
  database?: string
}> {
  try {
    if (!params.accountId || !params.consumerKey || !params.consumerSecret || !params.tokenId || !params.tokenSecret) {
      return { success: false, error: 'All NetSuite credentials are required (Account ID, Consumer Key/Secret, Token ID/Secret)' }
    }

    const connectionId = crypto.randomUUID()

    const connection: NetSuiteConnection = {
      id: connectionId,
      name: params.connectionName || `NetSuite (${params.accountId})`,
      type: 'netsuite',
      accountId: params.accountId,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }

    const credentials: NetSuiteCredentials = {
      type: 'netsuite',
      consumerKey: params.consumerKey,
      consumerSecret: params.consumerSecret,
      tokenId: params.tokenId,
      tokenSecret: params.tokenSecret
    }

    // Disconnect existing client if any
    if (nsClient) {
      nsClient.disconnect()
      nsClient = null
    }

    nsClient = new NetSuiteClient(connection, credentials)
    const result = await nsClient.connect()

    if (!result.success) {
      nsClient = null
      return { success: false, error: result.error }
    }

    // Persist connection metadata and credentials
    const savedConn: SavedConnection = {
      id: connectionId,
      name: connection.name,
      type: 'netsuite',
      accountId: params.accountId,
      createdAt: Date.now(),
      lastUsed: Date.now()
    }
    saveConnection(savedConn)
    saveMultiSourceCredentials(connectionId, {
      type: 'netsuite',
      consumerKey: params.consumerKey,
      consumerSecret: params.consumerSecret,
      tokenId: params.tokenId,
      tokenSecret: params.tokenSecret
    })

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)

    return { success: true, connectionId, database: params.accountId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect to NetSuite'
    return { success: false, error: message }
  }
}

export async function switchNetSuiteConnection(connectionId: string): Promise<{
  success: boolean
  error?: string
  database?: string
}> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'netsuite') {
      return { success: false, error: 'NetSuite connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'netsuite' || !creds.consumerKey) {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    if (nsClient) {
      nsClient.disconnect()
      nsClient = null
    }

    const nsConn: NetSuiteConnection = {
      id: conn.id,
      name: conn.name,
      type: 'netsuite',
      accountId: conn.accountId || '',
      createdAt: conn.createdAt,
      lastUsed: Date.now()
    }

    const nsCreds: NetSuiteCredentials = {
      type: 'netsuite',
      consumerKey: creds.consumerKey!,
      consumerSecret: creds.consumerSecret!,
      tokenId: creds.tokenId!,
      tokenSecret: creds.tokenSecret!
    }

    nsClient = new NetSuiteClient(nsConn, nsCreds)
    const result = await nsClient.connect()

    if (!result.success) {
      nsClient = null
      return { success: false, error: result.error }
    }

    activeConnectionId = connectionId
    setActiveConnectionId(connectionId)
    updateConnectionLastUsed(connectionId)

    return { success: true, database: conn.accountId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to switch NetSuite connection'
    return { success: false, error: message }
  }
}

export async function getNetSuiteSchema(options?: SchemaFetchOptions): Promise<{
  success: boolean
  error?: string
  schema?: { projectId: string; datasets: { id: string; tables: { id: string; columns: { name: string; type: string; description?: string }[] }[] }[] }
  metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean }
}> {
  if (!nsClient) {
    return { success: false, error: 'Not connected to NetSuite' }
  }

  try {
    const result = await nsClient.getSchema(options)
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

export async function runNetSuiteQuery(query: string): Promise<{
  success: boolean
  error?: string
  data?: Record<string, unknown>[]
}> {
  if (!nsClient) {
    return { success: false, error: 'Not connected to NetSuite' }
  }

  try {
    const result = await nsClient.executeQuery(query)
    return { success: true, data: result.rows }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    return { success: false, error: message }
  }
}

export function disconnectNetSuite(): void {
  if (nsClient) {
    nsClient.disconnect()
    nsClient = null
  }
  activeConnectionId = null
}

export function getNetSuiteEnvVars(): Record<string, string> {
  if (!nsClient || !activeConnectionId) {
    return {}
  }

  const conn = getConnection(activeConnectionId)
  const creds = getMultiSourceCredentials(activeConnectionId)

  if (!conn || !creds || creds.type !== 'netsuite') {
    return {}
  }

  return {
    NETSUITE_ACCOUNT_ID: conn.accountId || '',
    NETSUITE_CONSUMER_KEY: creds.consumerKey || '',
    NETSUITE_CONSUMER_SECRET: creds.consumerSecret || '',
    NETSUITE_TOKEN_ID: creds.tokenId || '',
    NETSUITE_TOKEN_SECRET: creds.tokenSecret || ''
  }
}

export async function updateNetSuiteConnection(
  connectionId: string,
  params: Partial<ConnectParams>
): Promise<{ success: boolean; error?: string; database?: string }> {
  try {
    const conn = getConnection(connectionId)
    if (!conn || conn.type !== 'netsuite') {
      return { success: false, error: 'NetSuite connection not found' }
    }

    const creds = getMultiSourceCredentials(connectionId)
    if (!creds || creds.type !== 'netsuite') {
      return { success: false, error: 'Credentials not found for this connection' }
    }

    const accountId = params.accountId ?? conn.accountId ?? ''
    const consumerKey = params.consumerKey ?? creds.consumerKey ?? ''
    const consumerSecret = params.consumerSecret ?? creds.consumerSecret ?? ''
    const tokenId = params.tokenId ?? creds.tokenId ?? ''
    const tokenSecret = params.tokenSecret ?? creds.tokenSecret ?? ''

    // Test connection before saving
    const testClient = new NetSuiteClient(
      { id: connectionId, name: conn.name, type: 'netsuite', accountId, createdAt: conn.createdAt, lastUsed: Date.now() },
      { type: 'netsuite', consumerKey, consumerSecret, tokenId, tokenSecret }
    )
    const testResult = await testClient.connect()
    if (!testResult.success) {
      testClient.disconnect()
      return { success: false, error: testResult.error }
    }
    testClient.disconnect()

    const name = params.connectionName ?? conn.name
    updateConnection(connectionId, { name, accountId, lastUsed: Date.now() })
    saveMultiSourceCredentials(connectionId, { type: 'netsuite', consumerKey, consumerSecret, tokenId, tokenSecret })

    if (activeConnectionId === connectionId && nsClient) {
      nsClient.disconnect()
      nsClient = new NetSuiteClient(
        { id: connectionId, name, type: 'netsuite', accountId, createdAt: conn.createdAt, lastUsed: Date.now() },
        { type: 'netsuite', consumerKey, consumerSecret, tokenId, tokenSecret }
      )
      await nsClient.connect()
    }

    return { success: true, database: accountId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update NetSuite connection'
    return { success: false, error: message }
  }
}

export function getNetSuiteConnectionDetails(connectionId: string): {
  success: boolean
  error?: string
  connection?: { name: string; accountId: string }
} {
  const conn = getConnection(connectionId)
  if (!conn || conn.type !== 'netsuite') {
    return { success: false, error: 'NetSuite connection not found' }
  }

  return {
    success: true,
    connection: {
      name: conn.name,
      accountId: conn.accountId || ''
    }
  }
}

export async function getNetSuiteTableDetails(tableName: string): Promise<{
  success: boolean
  error?: string
  table?: { columns: { name: string; type: string; description?: string }[] }
}> {
  if (!nsClient) {
    return { success: false, error: 'Not connected to NetSuite' }
  }

  try {
    const table = await nsClient.getTableDetails(tableName)
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

export function cleanupNetSuite(): void {
  disconnectNetSuite()
}
