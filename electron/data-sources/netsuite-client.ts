// NetSuite Data Source Client
// Implements DataSourceClient interface using SuiteQL REST API with OAuth 1.0 TBA

import crypto from 'crypto'
import type {
  DataSourceClient,
  NetSuiteConnection,
  NetSuiteCredentials,
  ConnectionResult,
  TestConnectionResult,
  SchemaResult,
  SchemaFetchOptions,
  QueryResult,
  ExecuteOptions,
  DriverInfo,
  Table,
  Column,
  Dataset,
  DataSourceConnection
} from './types.js'
import { NORMALIZED_TYPES } from './types.js'

// OAuth 1.0 helper for NetSuite Token-Based Authentication
function generateNonce(): string {
  return crypto.randomBytes(16).toString('hex')
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString()
}

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

function buildOAuthHeader(
  method: string,
  url: string,
  credentials: NetSuiteCredentials,
  accountId: string
): string {
  const nonce = generateNonce()
  const timestamp = generateTimestamp()

  const params: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA256',
    oauth_timestamp: timestamp,
    oauth_token: credentials.tokenId,
    oauth_version: '1.0'
  }

  // Build signature base string
  const sortedParams = Object.keys(params).sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(sortedParams)
  ].join('&')

  // Sign with HMAC-SHA256
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.tokenSecret)}`
  const signature = crypto.createHmac('sha256', signingKey).update(baseString).digest('base64')

  // Build Authorization header
  const headerParams = {
    ...params,
    oauth_signature: signature,
    realm: accountId
  }

  const headerString = Object.keys(headerParams)
    .map(k => `${k}="${percentEncode(headerParams[k])}"`)
    .join(', ')

  return `OAuth ${headerString}`
}

// Escape single quotes for SuiteQL string literals
function escapeSql(str: string): string {
  return str.replace(/'/g, "''")
}

interface SuiteQLResponse {
  items: Record<string, unknown>[]
  hasMore: boolean
  totalResults?: number
  count?: number
  offset?: number
  links?: Array<{ rel: string; href: string }>
}

export class NetSuiteClient implements DataSourceClient {
  private connection: NetSuiteConnection
  private credentials: NetSuiteCredentials
  private cachedSchema: SchemaResult | null = null
  private _connected = false

  constructor(connection: NetSuiteConnection, credentials: NetSuiteCredentials) {
    this.connection = connection
    this.credentials = credentials
  }

  private getBaseUrl(): string {
    if (this.connection.apiUrl) return this.connection.apiUrl
    const accountId = this.connection.accountId.replace(/_/g, '-').toLowerCase()
    return `https://${accountId}.suitetalk.api.netsuite.com`
  }

  private getSuiteQLUrl(): string {
    return `${this.getBaseUrl()}/services/rest/query/v1/suiteql`
  }

  private async executeSuiteQL(query: string, limit = 1000, offset = 0): Promise<SuiteQLResponse> {
    const url = this.getSuiteQLUrl()
    const authHeader = buildOAuthHeader('POST', url, this.credentials, this.connection.accountId)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Prefer': 'transient',
        'limit': limit.toString(),
        'offset': offset.toString()
      },
      body: JSON.stringify({ q: query })
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMsg = `SuiteQL error (${response.status})`
      try {
        const errorJson = JSON.parse(errorText)
        errorMsg = errorJson['o:errorDetails']?.[0]?.detail || errorJson.title || errorMsg
      } catch {
        if (errorText) errorMsg += `: ${errorText.slice(0, 200)}`
      }
      throw new Error(errorMsg)
    }

    return await response.json() as SuiteQLResponse
  }

  async connect(): Promise<ConnectionResult> {
    try {
      await this.executeSuiteQL('SELECT 1 AS test', 1)
      this._connected = true
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed'
      return { success: false, error: message }
    }
  }

  disconnect(): void {
    this._connected = false
    this.cachedSchema = null
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now()
    try {
      await this.executeSuiteQL('SELECT 1 AS test', 1)
      this._connected = true
      return {
        success: true,
        latencyMs: Date.now() - start,
        serverVersion: `NetSuite (${this.connection.accountId})`
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection test failed',
        latencyMs: Date.now() - start
      }
    }
  }

  isConnected(): boolean {
    return this._connected
  }

  async getSchema(options?: SchemaFetchOptions): Promise<SchemaResult> {
    if (this.cachedSchema && !options?.searchQuery && !options?.datasetFilter?.length) {
      return this.cachedSchema
    }

    const maxTables = options?.maxTablesPerDataset || 500
    const tablesOnly = options?.mode === 'tables_only'

    // Query the OA_TABLES system table for table listing
    let tableQuery = `SELECT TABLE_NAME, TABLE_TYPE FROM OA_TABLES WHERE TABLE_TYPE IN ('TABLE', 'VIEW') ORDER BY TABLE_NAME`
    if (options?.searchQuery) {
      const escaped = escapeSql(options.searchQuery.toUpperCase())
      tableQuery = `SELECT TABLE_NAME, TABLE_TYPE FROM OA_TABLES WHERE TABLE_TYPE IN ('TABLE', 'VIEW') AND TABLE_NAME LIKE '%${escaped}%' ORDER BY TABLE_NAME`
    }

    const tableResult = await this.executeSuiteQL(tableQuery, maxTables)
    const tableNames = tableResult.items.map(row => String(row.table_name || row.TABLE_NAME || ''))

    const tables: Table[] = []

    if (tablesOnly) {
      for (const name of tableNames) {
        tables.push({
          id: name,
          fullName: name,
          columns: []
        })
      }
    } else {
      // Fetch columns for each table (sequential to respect rate limits)
      for (const name of tableNames) {
        const columns = await this.fetchColumnsForTable(name)
        tables.push({
          id: name,
          fullName: name,
          columns
        })
      }
    }

    // NetSuite doesn't have datasets/schemas in the traditional sense — use a single group
    const dataset: Dataset = {
      id: 'SuiteQL',
      tables
    }

    const result: SchemaResult = {
      schema: {
        sourceId: this.connection.id,
        sourceType: 'netsuite',
        sourceName: this.connection.accountId,
        datasets: [dataset]
      },
      totalDatasets: 1,
      totalTables: tables.length,
      hasMore: tableResult.hasMore || false,
      fetchedAt: Date.now()
    }

    if (!options?.searchQuery && !options?.datasetFilter?.length) {
      this.cachedSchema = result
    }

    return result
  }

  private async fetchColumnsForTable(tableName: string): Promise<Column[]> {
    try {
      const query = `SELECT COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION FROM OA_COLUMNS WHERE TABLE_NAME = '${escapeSql(tableName)}' ORDER BY ORDINAL_POSITION`
      const result = await this.executeSuiteQL(query, 500)

      return result.items.map(row => {
        const originalType = String(row.data_type || row.DATA_TYPE || 'UNKNOWN')
        return {
          name: String(row.column_name || row.COLUMN_NAME || ''),
          type: this.normalizeType(originalType),
          originalType
        }
      })
    } catch {
      return []
    }
  }

  async searchTables(query: string, limit = 20): Promise<Table[]> {
    const suiteql = `SELECT TABLE_NAME FROM OA_TABLES WHERE TABLE_TYPE IN ('TABLE', 'VIEW') AND TABLE_NAME LIKE '%${escapeSql(query.toUpperCase())}%' ORDER BY TABLE_NAME`
    const result = await this.executeSuiteQL(suiteql, limit)

    return result.items.map(row => ({
      id: String(row.table_name || row.TABLE_NAME || ''),
      fullName: String(row.table_name || row.TABLE_NAME || ''),
      columns: []
    }))
  }

  async getTableDetails(tableName: string): Promise<Table | null> {
    const columns = await this.fetchColumnsForTable(tableName)
    if (columns.length === 0) return null
    return { id: tableName, fullName: tableName, columns }
  }

  async getTablePreview(tableName: string, limit = 100): Promise<QueryResult> {
    const result = await this.executeSuiteQL(`SELECT * FROM ${tableName}`, limit)
    const rows = result.items as Record<string, unknown>[]
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { columns, rows, rowCount: rows.length, truncated: result.hasMore || false }
  }

  async executeQuery(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    const maxRows = options?.maxRows || 1000
    const result = await this.executeSuiteQL(query, maxRows)
    const rows = result.items as Record<string, unknown>[]
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    return { columns, rows, rowCount: rows.length, truncated: result.hasMore || false }
  }

  getDriverInfo(): DriverInfo {
    return {
      name: 'Oracle NetSuite',
      pythonPackage: 'requests_oauthlib',
      pythonImport: 'import requests\nfrom requests_oauthlib import OAuth1\nimport pandas as pd',
      connectionTemplate: `auth = OAuth1(
    os.environ.get('NETSUITE_CONSUMER_KEY'),
    os.environ.get('NETSUITE_CONSUMER_SECRET'),
    os.environ.get('NETSUITE_TOKEN_ID'),
    os.environ.get('NETSUITE_TOKEN_SECRET'),
    signature_method='HMAC-SHA256',
    realm=os.environ.get('NETSUITE_ACCOUNT_ID')
)
url = f"https://{os.environ.get('NETSUITE_ACCOUNT_ID', '').replace('_', '-').lower()}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql"`,
      queryTemplate: `response = requests.post(url, json={"q": """YOUR_QUERY"""}, auth=auth, headers={"Prefer": "transient"})
df = pd.DataFrame(response.json().get("items", []))`
    }
  }

  getConnectionInfo(): DataSourceConnection {
    return this.connection
  }

  private normalizeType(nsType: string): string {
    const type = nsType.toUpperCase()
    if (/^(VARCHAR|CHAR|TEXT|STRING|NVARCHAR|NCHAR|CLOB)/.test(type)) return NORMALIZED_TYPES.STRING
    if (/^(INT|INTEGER|BIGINT|SMALLINT)/.test(type)) return NORMALIZED_TYPES.INTEGER
    if (/^(FLOAT|DOUBLE|DECIMAL|NUMERIC|NUMBER|REAL)/.test(type)) return NORMALIZED_TYPES.FLOAT
    if (/^(BOOL|BOOLEAN)/.test(type)) return NORMALIZED_TYPES.BOOLEAN
    if (/^(TIMESTAMP|DATETIME)/.test(type)) return NORMALIZED_TYPES.TIMESTAMP
    if (/^DATE$/.test(type)) return NORMALIZED_TYPES.DATE
    if (/^TIME/.test(type)) return NORMALIZED_TYPES.TIME
    if (/^(BLOB|BINARY|VARBINARY|RAW)/.test(type)) return NORMALIZED_TYPES.BYTES
    if (/^(JSON|OBJECT)/.test(type)) return NORMALIZED_TYPES.JSON
    return NORMALIZED_TYPES.UNKNOWN
  }
}
