// Snowflake Data Source Client
// Implements DataSourceClient interface for Snowflake

import snowflake from 'snowflake-sdk'
import type {
  DataSourceClient,
  SnowflakeConnection,
  SnowflakeCredentials,
  ConnectionResult,
  TestConnectionResult,
  SchemaResult,
  SchemaFetchOptions,
  QueryResult,
  ExecuteOptions,
  DriverInfo,
  Table,
  Column,
  Dataset
} from './types.js'

export class SnowflakeClient implements DataSourceClient {
  private connection: SnowflakeConnection
  private credentials: SnowflakeCredentials
  private sfConnection: snowflake.Connection | null = null
  private cachedSchema: SchemaResult | null = null
  private connected = false

  constructor(connection: SnowflakeConnection, credentials: SnowflakeCredentials) {
    this.connection = connection
    this.credentials = credentials
  }

  async connect(): Promise<ConnectionResult> {
    try {
      const connectionOptions: snowflake.ConnectionOptions = {
        account: this.connection.account,
        username: this.credentials.username,
        warehouse: this.connection.warehouse,
        database: this.connection.database,
        schema: this.connection.schema || 'PUBLIC'
      }

      if (this.credentials.password) {
        connectionOptions.password = this.credentials.password
      } else if (this.credentials.privateKey) {
        connectionOptions.authenticator = 'SNOWFLAKE_JWT'
        connectionOptions.privateKey = this.credentials.privateKey
        if (this.credentials.privateKeyPassphrase) {
          connectionOptions.privateKeyPass = this.credentials.privateKeyPassphrase
        }
      }

      if (this.connection.role) {
        connectionOptions.role = this.connection.role
      }

      this.sfConnection = snowflake.createConnection(connectionOptions)

      await new Promise<void>((resolve, reject) => {
        this.sfConnection!.connect((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      this.connected = true
      return { success: true }
    } catch (error) {
      this.sfConnection = null
      this.connected = false
      const message = error instanceof Error ? error.message : 'Failed to connect to Snowflake'
      return { success: false, error: message }
    }
  }

  disconnect(): void {
    if (this.sfConnection) {
      this.sfConnection.destroy((err) => {
        if (err) {
          console.error('Error disconnecting from Snowflake:', err)
        }
      })
      this.sfConnection = null
    }
    this.cachedSchema = null
    this.connected = false
  }

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now()

    try {
      const connectionOptions: snowflake.ConnectionOptions = {
        account: this.connection.account,
        username: this.credentials.username,
        warehouse: this.connection.warehouse,
        database: this.connection.database,
        schema: this.connection.schema || 'PUBLIC'
      }

      if (this.credentials.password) {
        connectionOptions.password = this.credentials.password
      } else if (this.credentials.privateKey) {
        connectionOptions.authenticator = 'SNOWFLAKE_JWT'
        connectionOptions.privateKey = this.credentials.privateKey
      }

      const testConn = snowflake.createConnection(connectionOptions)

      await new Promise<void>((resolve, reject) => {
        testConn.connect((err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      // Get version
      const versionResult = await this.executeQueryOnConnection(testConn, 'SELECT CURRENT_VERSION()')

      testConn.destroy(() => {})

      return {
        success: true,
        serverVersion: versionResult.rows[0]?.['CURRENT_VERSION()'],
        latencyMs: Date.now() - startTime
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed'
      return { success: false, error: message }
    }
  }

  isConnected(): boolean {
    return this.connected && this.sfConnection !== null
  }

  async getSchema(options?: SchemaFetchOptions): Promise<SchemaResult> {
    if (!this.sfConnection) {
      throw new Error('Not connected to Snowflake')
    }

    // Return cached schema if available, no specific filters, and mode matches
    const requestingFull = options?.mode !== 'tables_only'
    const cachedHasColumns = this.cachedSchema?.schema?.datasets?.some(ds => ds.tables.some(t => t.columns.length > 0))
    if (this.cachedSchema && !options?.datasetFilter && !options?.searchQuery && !(requestingFull && !cachedHasColumns)) {
      return this.cachedSchema
    }

    const maxDatasets = options?.maxDatasets ?? 50
    const maxTablesPerDataset = options?.maxTablesPerDataset ?? 100

    try {
      // Get all schemas in the database
      let schemaQuery = `
        SELECT SCHEMA_NAME
        FROM ${this.connection.database}.INFORMATION_SCHEMA.SCHEMATA
        WHERE SCHEMA_NAME != 'INFORMATION_SCHEMA'
      `

      if (options?.datasetFilter && options.datasetFilter.length > 0) {
        const schemaList = options.datasetFilter.map(s => `'${s}'`).join(',')
        schemaQuery += ` AND SCHEMA_NAME IN (${schemaList})`
      }

      schemaQuery += ` ORDER BY SCHEMA_NAME LIMIT ${maxDatasets}`

      if (options?.offset) {
        schemaQuery += ` OFFSET ${options.offset}`
      }

      const schemasResult = await this.executeQueryInternal(schemaQuery)
      const schemas = schemasResult.rows.map(r => r.SCHEMA_NAME as string)

      // Count total schemas
      const countResult = await this.executeQueryInternal(`
        SELECT COUNT(*) as COUNT
        FROM ${this.connection.database}.INFORMATION_SCHEMA.SCHEMATA
        WHERE SCHEMA_NAME != 'INFORMATION_SCHEMA'
      `)
      const totalDatasets = parseInt(String(countResult.rows[0]?.COUNT || 0), 10)

      let totalTables = 0
      const datasets: Dataset[] = []

      const isTablesOnly = options?.mode === 'tables_only'

      for (const schemaName of schemas) {
        // Get tables for this schema
        let tableQuery = `
          SELECT TABLE_NAME, ROW_COUNT
          FROM ${this.connection.database}.INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = '${schemaName}'
          AND TABLE_TYPE = 'BASE TABLE'
        `

        if (options?.searchQuery) {
          tableQuery += ` AND TABLE_NAME ILIKE '%${options.searchQuery}%'`
        }

        tableQuery += ` ORDER BY TABLE_NAME LIMIT ${maxTablesPerDataset}`

        const tablesResult = await this.executeQueryInternal(tableQuery)

        // Count total tables
        const tableCountResult = await this.executeQueryInternal(`
          SELECT COUNT(*) as COUNT
          FROM ${this.connection.database}.INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_TYPE = 'BASE TABLE'
        `)
        totalTables += parseInt(String(tableCountResult.rows[0]?.COUNT || 0), 10)

        const tables: Table[] = []

        if (isTablesOnly) {
          // Fast path: skip column queries entirely
          for (const tableRow of tablesResult.rows) {
            tables.push({
              id: tableRow.TABLE_NAME as string,
              fullName: `${this.connection.database}.${schemaName}.${tableRow.TABLE_NAME}`,
              columns: [],
              rowCount: tableRow.ROW_COUNT ? parseInt(String(tableRow.ROW_COUNT), 10) : undefined
            })
          }
        } else {
          // Batched path: fetch all columns for this schema in one query
          const columnsByTable = new Map<string, Column[]>()

          if (tablesResult.rows.length > 0) {
            const columnsResult = await this.executeQueryInternal(`
              SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COMMENT, ORDINAL_POSITION
              FROM ${this.connection.database}.INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = '${schemaName}'
              ORDER BY TABLE_NAME, ORDINAL_POSITION
            `)

            for (const col of columnsResult.rows) {
              const tName = col.TABLE_NAME as string
              if (!columnsByTable.has(tName)) {
                columnsByTable.set(tName, [])
              }
              columnsByTable.get(tName)!.push({
                name: col.COLUMN_NAME as string,
                type: this.normalizeType(col.DATA_TYPE as string),
                originalType: col.DATA_TYPE as string,
                description: (col.COMMENT as string) || undefined,
                nullable: col.IS_NULLABLE === 'YES'
              })
            }
          }

          for (const tableRow of tablesResult.rows) {
            const tableName = tableRow.TABLE_NAME as string
            tables.push({
              id: tableName,
              fullName: `${this.connection.database}.${schemaName}.${tableName}`,
              columns: columnsByTable.get(tableName) || [],
              rowCount: tableRow.ROW_COUNT ? parseInt(String(tableRow.ROW_COUNT), 10) : undefined
            })
          }
        }

        datasets.push({
          id: schemaName,
          tables
        })
      }

      const result: SchemaResult = {
        schema: {
          sourceId: this.connection.id,
          sourceType: 'snowflake',
          sourceName: this.connection.database,
          datasets
        },
        totalDatasets,
        totalTables,
        hasMore: totalDatasets > maxDatasets,
        fetchedAt: Date.now()
      }

      // Cache if no filters applied
      if (!options?.datasetFilter && !options?.searchQuery && !options?.tableFilter) {
        this.cachedSchema = result
      }

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch schema'
      throw new Error(message)
    }
  }

  async searchTables(query: string, limit = 50): Promise<Table[]> {
    if (!this.sfConnection) {
      throw new Error('Not connected to Snowflake')
    }

    const schemaResult = await this.getSchema({ searchQuery: query, maxTablesPerDataset: limit })
    const tables: Table[] = []

    for (const dataset of schemaResult.schema.datasets) {
      tables.push(...dataset.tables)
      if (tables.length >= limit) break
    }

    return tables.slice(0, limit)
  }

  async getTableDetails(tableName: string): Promise<Table | null> {
    if (!this.sfConnection) {
      throw new Error('Not connected to Snowflake')
    }

    try {
      // Parse table name: database.schema.table or schema.table or just table
      const parts = tableName.split('.')
      let database: string
      let schemaName: string
      let tableId: string

      if (parts.length === 3) {
        database = parts[0]
        schemaName = parts[1]
        tableId = parts[2]
      } else if (parts.length === 2) {
        database = this.connection.database
        schemaName = parts[0]
        tableId = parts[1]
      } else {
        database = this.connection.database
        schemaName = this.connection.schema || 'PUBLIC'
        tableId = parts[0]
      }

      // Get columns
      const columnsResult = await this.executeQueryInternal(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COMMENT
        FROM ${database}.INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableId}'
        ORDER BY ORDINAL_POSITION
      `)

      if (columnsResult.rows.length === 0) {
        return null
      }

      // Get row count
      const countResult = await this.executeQueryInternal(`
        SELECT ROW_COUNT
        FROM ${database}.INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = '${schemaName}' AND TABLE_NAME = '${tableId}'
      `)

      const columns: Column[] = columnsResult.rows.map(col => ({
        name: col.COLUMN_NAME as string,
        type: this.normalizeType(col.DATA_TYPE as string),
        originalType: col.DATA_TYPE as string,
        description: (col.COMMENT as string) || undefined,
        nullable: col.IS_NULLABLE === 'YES'
      }))

      return {
        id: tableId,
        fullName: `${database}.${schemaName}.${tableId}`,
        columns,
        rowCount: countResult.rows[0]?.ROW_COUNT
          ? parseInt(String(countResult.rows[0].ROW_COUNT), 10)
          : undefined
      }
    } catch {
      return null
    }
  }

  async getTablePreview(tableName: string, limit = 10): Promise<QueryResult> {
    if (!this.sfConnection) {
      throw new Error('Not connected to Snowflake')
    }

    const query = `SELECT * FROM ${tableName} LIMIT ${limit}`
    return this.executeQuery(query, { maxRows: limit })
  }

  async executeQuery(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    if (!this.sfConnection) {
      throw new Error('Not connected to Snowflake')
    }

    return this.executeQueryInternal(query, options)
  }

  private async executeQueryInternal(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    const maxRows = options?.maxRows ?? 1000

    return new Promise((resolve, reject) => {
      this.sfConnection!.execute({
        sqlText: query,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(new Error(err.message))
            return
          }

          const columns = stmt?.getColumns().map(c => c.getName()) || []
          const resultRows = (rows || []).slice(0, maxRows) as Record<string, unknown>[]

          resolve({
            columns,
            rows: resultRows,
            rowCount: resultRows.length,
            truncated: (rows?.length || 0) >= maxRows
          })
        }
      })
    })
  }

  private async executeQueryOnConnection(
    conn: snowflake.Connection,
    query: string
  ): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      conn.execute({
        sqlText: query,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(new Error(err.message))
            return
          }

          const columns = stmt?.getColumns().map(c => c.getName()) || []

          resolve({
            columns,
            rows: (rows || []) as Record<string, unknown>[],
            rowCount: rows?.length || 0,
            truncated: false
          })
        }
      })
    })
  }

  getDriverInfo(): DriverInfo {
    return {
      name: 'Snowflake',
      pythonPackage: 'snowflake-connector-python',
      pythonImport: 'import snowflake.connector\nimport pandas as pd',
      connectionTemplate: `conn = snowflake.connector.connect(
    account=os.environ.get('SNOWFLAKE_ACCOUNT'),
    user=os.environ.get('SNOWFLAKE_USER'),
    password=os.environ.get('SNOWFLAKE_PASSWORD'),
    warehouse=os.environ.get('SNOWFLAKE_WAREHOUSE'),
    database=os.environ.get('SNOWFLAKE_DATABASE'),
    schema=os.environ.get('SNOWFLAKE_SCHEMA')
)`,
      queryTemplate: `cur = conn.cursor()
cur.execute("""YOUR_QUERY""")
df = cur.fetch_pandas_all()`
    }
  }

  getConnectionInfo(): SnowflakeConnection {
    return this.connection
  }

  // Helper to normalize Snowflake types
  private normalizeType(sfType: string): string {
    const type = sfType.toUpperCase()

    // String types
    if (type.includes('VARCHAR') || type.includes('CHAR') || type.includes('STRING') || type.includes('TEXT')) {
      return 'STRING'
    }

    // Integer types
    if (type.includes('INT') || type === 'NUMBER' || type === 'DECIMAL') {
      // NUMBER without scale is typically used as integer
      return 'INTEGER'
    }

    // Float types
    if (type.includes('FLOAT') || type.includes('DOUBLE') || type === 'REAL') {
      return 'FLOAT'
    }

    // Boolean
    if (type === 'BOOLEAN') {
      return 'BOOLEAN'
    }

    // Timestamp
    if (type.includes('TIMESTAMP')) {
      return 'TIMESTAMP'
    }

    // Date
    if (type === 'DATE') {
      return 'DATE'
    }

    // Time
    if (type === 'TIME') {
      return 'TIME'
    }

    // Binary
    if (type === 'BINARY' || type === 'VARBINARY') {
      return 'BYTES'
    }

    // Semi-structured types
    if (type === 'VARIANT' || type === 'OBJECT') {
      return 'JSON'
    }

    if (type === 'ARRAY') {
      return 'ARRAY'
    }

    return 'UNKNOWN'
  }

  clearCache(): void {
    this.cachedSchema = null
  }
}
