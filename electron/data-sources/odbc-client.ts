// ODBC Data Source Client
// Implements DataSourceClient interface for any ODBC-compatible database

import type {
  DataSourceClient,
  ODBCConnection,
  ODBCCredentials,
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

// Lazy-load odbc to avoid crash when unixodbc is not installed
let _odbc: typeof import('odbc') | null = null
async function getOdbc() {
  if (!_odbc) {
    try {
      _odbc = await import('odbc')
    } catch (err) {
      throw new Error(
        'ODBC driver not available. Please install unixODBC: brew install unixodbc\n' +
        (err instanceof Error ? err.message : String(err))
      )
    }
  }
  return _odbc.default || _odbc
}

export class ODBCClient implements DataSourceClient {
  private connection: ODBCConnection
  private credentials: ODBCCredentials
  private odbcConnection: unknown | null = null
  private cachedSchema: SchemaResult | null = null
  private connected = false

  constructor(connection: ODBCConnection, credentials: ODBCCredentials) {
    this.connection = connection
    this.credentials = credentials
  }

  private buildConnectionString(): string {
    if (this.connection.connectionString) return this.connection.connectionString

    const parts: string[] = []
    if (this.connection.dsn) parts.push(`DSN=${this.connection.dsn}`)
    if (this.connection.driver) parts.push(`DRIVER={${this.connection.driver}}`)
    if (this.connection.host) parts.push(`SERVER=${this.connection.host}`)
    if (this.connection.port) parts.push(`PORT=${this.connection.port}`)
    if (this.connection.database) parts.push(`DATABASE=${this.connection.database}`)
    if (this.credentials.username) parts.push(`UID=${this.credentials.username}`)
    if (this.credentials.password) parts.push(`PWD=${this.credentials.password}`)
    return parts.join(';')
  }

  async connect(): Promise<ConnectionResult> {
    try {
      const odbcModule = await getOdbc()
      const connString = this.buildConnectionString()
      this.odbcConnection = await odbcModule.connect(connString)

      // Test with a simple query
      try {
        await this.odbcConnection.query('SELECT 1')
      } catch {
        // Some drivers don't support SELECT 1, that's fine if connection succeeded
      }

      this.connected = true
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'ODBC connection failed'
      return { success: false, error: message }
    }
  }

  disconnect(): void {
    if (this.odbcConnection) {
      try {
        this.odbcConnection.close()
      } catch {
        // Ignore close errors
      }
      this.odbcConnection = null
    }
    this.connected = false
    this.cachedSchema = null
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now()
    try {
      const odbcModule = await getOdbc()
      const connString = this.buildConnectionString()
      const conn = await odbcModule.connect(connString)
      try {
        await conn.query('SELECT 1')
      } catch {
        // Connection succeeded even if SELECT 1 isn't supported
      }
      await conn.close()
      return {
        success: true,
        latencyMs: Date.now() - start,
        serverVersion: 'ODBC'
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
    return this.connected
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private ensureConnected(): any {
    if (!this.odbcConnection || !this.connected) {
      throw new Error('Not connected. Call connect() first.')
    }
    return this.odbcConnection
  }

  async getSchema(options?: SchemaFetchOptions): Promise<SchemaResult> {
    if (this.cachedSchema && !options?.searchQuery && !options?.datasetFilter?.length) {
      return this.cachedSchema
    }

    const conn = this.ensureConnected()
    const maxTables = options?.maxTablesPerDataset || 500
    const tablesOnly = options?.mode === 'tables_only'

    // Use ODBC catalog functions for schema introspection
    const tableRows = await conn.tables(null, null, options?.searchQuery ? `%${options.searchQuery}%` : '%', 'TABLE,VIEW')

    const datasetMap = new Map<string, Table[]>()
    let tableCount = 0

    for (const row of tableRows) {
      if (tableCount >= maxTables) break

      const schemaName = String(row.TABLE_SCHEM || row.TABLE_SCHEMA || 'default')
      const tableName = String(row.TABLE_NAME || '')

      if (!tableName) continue

      // Skip system schemas
      if (/^(information_schema|pg_|sys|INFORMATION_SCHEMA)/.test(schemaName)) continue

      const fullName = schemaName !== 'default' ? `${schemaName}.${tableName}` : tableName

      let columns: Column[] = []
      if (!tablesOnly) {
        try {
          const colRows = await conn.columns(null, row.TABLE_SCHEM || null, tableName, '%')
          columns = colRows.map(col => {
            const originalType = String(col.TYPE_NAME || 'UNKNOWN')
            return {
              name: String(col.COLUMN_NAME || ''),
              type: this.normalizeType(originalType),
              originalType,
              nullable: col.NULLABLE === 1
            }
          })
        } catch {
          // Some drivers may fail on column introspection
        }
      }

      const table: Table = { id: tableName, fullName, columns }

      if (!datasetMap.has(schemaName)) {
        datasetMap.set(schemaName, [])
      }
      datasetMap.get(schemaName)!.push(table)
      tableCount++
    }

    const datasets: Dataset[] = Array.from(datasetMap.entries()).map(([id, tables]) => ({
      id,
      tables
    }))

    const result: SchemaResult = {
      schema: {
        sourceId: this.connection.id,
        sourceType: 'odbc',
        sourceName: this.connection.dsn || this.connection.driver || 'ODBC',
        datasets
      },
      totalDatasets: datasets.length,
      totalTables: tableCount,
      hasMore: false,
      fetchedAt: Date.now()
    }

    if (!options?.searchQuery && !options?.datasetFilter?.length) {
      this.cachedSchema = result
    }

    return result
  }

  async searchTables(query: string, limit = 20): Promise<Table[]> {
    const conn = this.ensureConnected()
    const tableRows = await conn.tables(null, null, `%${query}%`, 'TABLE,VIEW')

    return tableRows.slice(0, limit).map(row => ({
      id: String(row.TABLE_NAME || ''),
      fullName: row.TABLE_SCHEM
        ? `${row.TABLE_SCHEM}.${row.TABLE_NAME}`
        : String(row.TABLE_NAME || ''),
      columns: []
    }))
  }

  async getTableDetails(tableName: string): Promise<Table | null> {
    const conn = this.ensureConnected()

    // Handle schema.table format
    let schemaName: string | null = null
    let tblName = tableName
    if (tableName.includes('.')) {
      const parts = tableName.split('.')
      schemaName = parts[0]
      tblName = parts[1]
    }

    try {
      const colRows = await conn.columns(null, schemaName, tblName, '%')
      if (colRows.length === 0) return null

      const columns: Column[] = colRows.map(col => {
        const originalType = String(col.TYPE_NAME || 'UNKNOWN')
        return {
          name: String(col.COLUMN_NAME || ''),
          type: this.normalizeType(originalType),
          originalType,
          nullable: col.NULLABLE === 1
        }
      })

      return {
        id: tblName,
        fullName: tableName,
        columns
      }
    } catch {
      return null
    }
  }

  async getTablePreview(tableName: string, limit = 100): Promise<QueryResult> {
    // Try standard SQL FETCH FIRST, fallback to LIMIT, then TOP
    const queries = [
      `SELECT * FROM ${tableName} FETCH FIRST ${limit} ROWS ONLY`,
      `SELECT * FROM ${tableName} LIMIT ${limit}`,
      `SELECT TOP ${limit} * FROM ${tableName}`
    ]

    for (const query of queries) {
      try {
        return await this.executeQuery(query)
      } catch {
        continue
      }
    }

    throw new Error(`Failed to preview table ${tableName}. The ODBC driver may use a different SQL dialect.`)
  }

  async executeQuery(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    const conn = this.ensureConnected()
    const maxRows = options?.maxRows || 1000

    const rows = await conn.query(query) as Record<string, unknown>[]
    const truncated = rows.length >= maxRows
    const limitedRows = rows.slice(0, maxRows)
    const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : []

    return {
      columns,
      rows: limitedRows,
      rowCount: limitedRows.length,
      truncated
    }
  }

  getDriverInfo(): DriverInfo {
    return {
      name: 'ODBC',
      pythonPackage: 'pyodbc',
      pythonImport: 'import pyodbc\nimport pandas as pd',
      connectionTemplate: `conn = pyodbc.connect(os.environ.get('ODBC_CONNECTION_STRING', ''))`,
      queryTemplate: `df = pd.read_sql("""YOUR_QUERY""", conn)`
    }
  }

  getConnectionInfo(): DataSourceConnection {
    return this.connection
  }

  private normalizeType(odbcType: string): string {
    const type = odbcType.toUpperCase()
    if (/^(VARCHAR|CHAR|TEXT|STRING|NVARCHAR|NCHAR|CLOB|LONGVARCHAR|WVARCHAR|WLONGVARCHAR)/.test(type)) return NORMALIZED_TYPES.STRING
    if (/^(INT|INTEGER|BIGINT|SMALLINT|TINYINT|SERIAL)/.test(type)) return NORMALIZED_TYPES.INTEGER
    if (/^(FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|MONEY)/.test(type)) return NORMALIZED_TYPES.FLOAT
    if (/^(BOOL|BOOLEAN|BIT)/.test(type)) return NORMALIZED_TYPES.BOOLEAN
    if (/^(TIMESTAMP|DATETIME)/.test(type)) return NORMALIZED_TYPES.TIMESTAMP
    if (/^DATE$/.test(type)) return NORMALIZED_TYPES.DATE
    if (/^TIME/.test(type)) return NORMALIZED_TYPES.TIME
    if (/^(BINARY|VARBINARY|BLOB|LONGVARBINARY|IMAGE)/.test(type)) return NORMALIZED_TYPES.BYTES
    if (/^(JSON|XML|NTEXT)/.test(type)) return NORMALIZED_TYPES.JSON
    return NORMALIZED_TYPES.UNKNOWN
  }
}
