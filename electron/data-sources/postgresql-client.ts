// PostgreSQL Data Source Client
// Implements DataSourceClient interface for PostgreSQL

import pg from 'pg'
import type {
  DataSourceClient,
  PostgreSQLConnection,
  PostgreSQLCredentials,
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

const { Pool } = pg

export class PostgreSQLClient implements DataSourceClient {
  private connection: PostgreSQLConnection
  private credentials: PostgreSQLCredentials
  private pool: pg.Pool | null = null
  private cachedSchema: SchemaResult | null = null
  private connected = false

  constructor(connection: PostgreSQLConnection, credentials: PostgreSQLCredentials) {
    this.connection = connection
    this.credentials = credentials
  }

  async connect(): Promise<ConnectionResult> {
    try {
      // Use 127.0.0.1 instead of localhost to force TCP connection
      // (localhost causes pg to attempt Unix socket at /tmp/.s.PGSQL.5432)
      const host = this.connection.host === 'localhost' ? '127.0.0.1' : this.connection.host
      this.pool = new Pool({
        host,
        port: this.connection.port,
        database: this.connection.database,
        user: this.credentials.username,
        password: this.credentials.password,
        ssl: this.connection.ssl ? {
          rejectUnauthorized: false,
          ca: this.credentials.sslRootCert,
          key: this.credentials.sslKey,
          cert: this.credentials.sslCert
        } : undefined,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      })

      // Test the connection
      const client = await this.pool.connect()
      client.release()
      this.connected = true

      return { success: true }
    } catch (error) {
      this.pool = null
      this.connected = false
      const message = error instanceof Error ? error.message : 'Failed to connect to PostgreSQL'
      return { success: false, error: message }
    }
  }

  disconnect(): void {
    if (this.pool) {
      this.pool.end()
      this.pool = null
    }
    this.cachedSchema = null
    this.connected = false
  }

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now()

    try {
      const host = this.connection.host === 'localhost' ? '127.0.0.1' : this.connection.host
      const testPool = new Pool({
        host,
        port: this.connection.port,
        database: this.connection.database,
        user: this.credentials.username,
        password: this.credentials.password,
        ssl: this.connection.ssl ? { rejectUnauthorized: false } : undefined,
        max: 1,
        connectionTimeoutMillis: 10000
      })

      const client = await testPool.connect()
      const result = await client.query('SELECT version()')
      client.release()
      await testPool.end()

      return {
        success: true,
        serverVersion: result.rows[0]?.version,
        latencyMs: Date.now() - startTime
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed'
      return { success: false, error: message }
    }
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null
  }

  async getSchema(options?: SchemaFetchOptions): Promise<SchemaResult> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
    }

    // Return cached schema if available, no specific filters, and mode matches
    const requestingFull = options?.mode !== 'tables_only'
    const cachedHasColumns = this.cachedSchema?.schema?.datasets?.some(ds => ds.tables.some(t => t.columns.length > 0))
    if (this.cachedSchema && !options?.datasetFilter && !options?.searchQuery && !(requestingFull && !cachedHasColumns)) {
      return this.cachedSchema
    }

    const maxDatasets = options?.maxDatasets ?? 50
    const maxTablesPerDataset = options?.maxTablesPerDataset ?? 100
    const includeSystemTables = options?.includeSystemTables ?? false

    try {
      // Get all schemas (PostgreSQL "schemas" map to our "datasets")
      let schemaQuery = `
        SELECT schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      `

      if (!includeSystemTables) {
        schemaQuery += ` AND schema_name NOT LIKE 'pg_%'`
      }

      if (options?.datasetFilter && options.datasetFilter.length > 0) {
        const schemaList = options.datasetFilter.map(s => `'${s}'`).join(',')
        schemaQuery += ` AND schema_name IN (${schemaList})`
      }

      schemaQuery += ` ORDER BY schema_name LIMIT ${maxDatasets}`

      if (options?.offset) {
        schemaQuery += ` OFFSET ${options.offset}`
      }

      const schemasResult = await this.pool.query(schemaQuery)
      const schemas = schemasResult.rows.map(r => r.schema_name)

      // Count total schemas
      const countResult = await this.pool.query(`
        SELECT COUNT(*) as count
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        ${!includeSystemTables ? "AND schema_name NOT LIKE 'pg_%'" : ''}
      `)
      const totalDatasets = parseInt(countResult.rows[0].count, 10)

      let totalTables = 0
      const datasets: Dataset[] = []

      const isTablesOnly = options?.mode === 'tables_only'

      for (const schemaName of schemas) {
        // Get tables for this schema
        let tableQuery = `
          SELECT table_name,
                 (SELECT reltuples::bigint
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = $1 AND c.relname = t.table_name) as row_count
          FROM information_schema.tables t
          WHERE table_schema = $1
          AND table_type = 'BASE TABLE'
        `

        if (options?.searchQuery) {
          tableQuery += ` AND table_name ILIKE $2`
        }

        tableQuery += ` ORDER BY table_name LIMIT ${maxTablesPerDataset}`

        const params = options?.searchQuery
          ? [schemaName, `%${options.searchQuery}%`]
          : [schemaName]

        const tablesResult = await this.pool.query(tableQuery, params)

        // Count total tables in this schema
        const tableCountResult = await this.pool.query(`
          SELECT COUNT(*) as count
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        `, [schemaName])
        totalTables += parseInt(tableCountResult.rows[0].count, 10)

        const tables: Table[] = []

        if (isTablesOnly) {
          // Fast path: skip column queries entirely
          for (const tableRow of tablesResult.rows) {
            tables.push({
              id: tableRow.table_name,
              fullName: `${schemaName}.${tableRow.table_name}`,
              columns: [],
              rowCount: tableRow.row_count ? parseInt(tableRow.row_count, 10) : undefined
            })
          }
        } else {
          // Batched path: fetch all columns for this schema in one query, then group by table
          const tableNames = tablesResult.rows.map(r => r.table_name)
          const columnsByTable = new Map<string, Column[]>()

          if (tableNames.length > 0) {
            const columnsResult = await this.pool.query(`
              SELECT table_name, column_name, data_type, is_nullable, ordinal_position,
                     col_description((table_schema || '.' || table_name)::regclass::oid, ordinal_position) as description
              FROM information_schema.columns
              WHERE table_schema = $1
              ORDER BY table_name, ordinal_position
            `, [schemaName])

            for (const col of columnsResult.rows) {
              const tName = col.table_name
              if (!columnsByTable.has(tName)) {
                columnsByTable.set(tName, [])
              }
              columnsByTable.get(tName)!.push({
                name: col.column_name,
                type: this.normalizeType(col.data_type),
                originalType: col.data_type,
                description: col.description || undefined,
                nullable: col.is_nullable === 'YES'
              })
            }
          }

          for (const tableRow of tablesResult.rows) {
            const tableName = tableRow.table_name
            tables.push({
              id: tableName,
              fullName: `${schemaName}.${tableName}`,
              columns: columnsByTable.get(tableName) || [],
              rowCount: tableRow.row_count ? parseInt(tableRow.row_count, 10) : undefined
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
          sourceType: 'postgresql',
          sourceName: this.connection.database,
          datasets
        },
        totalDatasets,
        totalTables,
        hasMore: totalDatasets > maxDatasets || totalTables > datasets.reduce((acc, d) => acc + d.tables.length, 0),
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
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
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
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
    }

    try {
      // Parse table name: schema.table or just table (default to public)
      const parts = tableName.split('.')
      let schemaName: string
      let tableId: string

      if (parts.length === 2) {
        schemaName = parts[0]
        tableId = parts[1]
      } else {
        schemaName = 'public'
        tableId = parts[0]
      }

      // Get columns
      const columnsResult = await this.pool.query(`
        SELECT column_name, data_type, is_nullable,
               col_description((table_schema || '.' || table_name)::regclass::oid, ordinal_position) as description
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `, [schemaName, tableId])

      if (columnsResult.rows.length === 0) {
        return null
      }

      // Get row count
      const countResult = await this.pool.query(`
        SELECT reltuples::bigint as count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
      `, [schemaName, tableId])

      const columns: Column[] = columnsResult.rows.map(col => ({
        name: col.column_name,
        type: this.normalizeType(col.data_type),
        originalType: col.data_type,
        description: col.description || undefined,
        nullable: col.is_nullable === 'YES'
      }))

      return {
        id: tableId,
        fullName: `${schemaName}.${tableId}`,
        columns,
        rowCount: countResult.rows[0]?.count ? parseInt(countResult.rows[0].count, 10) : undefined
      }
    } catch {
      return null
    }
  }

  async getTablePreview(tableName: string, limit = 10): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
    }

    // Ensure proper quoting for table name
    const parts = tableName.split('.')
    const quotedName = parts.map(p => `"${p}"`).join('.')

    const query = `SELECT * FROM ${quotedName} LIMIT ${limit}`
    return this.executeQuery(query, { maxRows: limit })
  }

  async executeQuery(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    if (!this.pool) {
      throw new Error('Not connected to PostgreSQL')
    }

    const maxRows = options?.maxRows ?? 1000

    try {
      // Add LIMIT if not already present
      let limitedQuery = query.trim()
      if (!limitedQuery.toLowerCase().includes('limit')) {
        limitedQuery = `${limitedQuery} LIMIT ${maxRows}`
      }

      const result = await this.pool.query({
        text: limitedQuery,
        rowMode: 'array'
      })

      // Get column names from fields
      const columns = result.fields.map(f => f.name)

      // Convert array rows to objects
      const rows = result.rows.map(row => {
        const obj: Record<string, unknown> = {}
        columns.forEach((col, i) => {
          obj[col] = row[i]
        })
        return obj
      })

      return {
        columns,
        rows,
        rowCount: rows.length,
        truncated: rows.length >= maxRows
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Query failed'
      throw new Error(message)
    }
  }

  getDriverInfo(): DriverInfo {
    return {
      name: 'PostgreSQL',
      pythonPackage: 'psycopg2-binary',
      pythonImport: 'import psycopg2\nimport pandas as pd',
      connectionTemplate: `conn = psycopg2.connect(
    host=os.environ.get('PGHOST', '127.0.0.1'),
    port=os.environ.get('PGPORT', 5432),
    database=os.environ.get('PGDATABASE'),
    user=os.environ.get('PGUSER'),
    password=os.environ.get('PGPASSWORD')
)`,
      queryTemplate: 'df = pd.read_sql("""YOUR_QUERY""", conn)'
    }
  }

  getConnectionInfo(): PostgreSQLConnection {
    return this.connection
  }

  // Helper to normalize PostgreSQL types
  private normalizeType(pgType: string): string {
    const type = pgType.toLowerCase()

    // String types
    if (type.includes('char') || type.includes('text') || type === 'name' || type === 'uuid') {
      return 'STRING'
    }

    // Integer types
    if (type.includes('int') || type === 'serial' || type === 'bigserial' || type === 'smallserial') {
      return 'INTEGER'
    }

    // Float types
    if (type.includes('numeric') || type.includes('decimal') || type.includes('real') ||
        type.includes('double') || type === 'money') {
      return 'FLOAT'
    }

    // Boolean
    if (type === 'boolean' || type === 'bool') {
      return 'BOOLEAN'
    }

    // Timestamp
    if (type.includes('timestamp')) {
      return 'TIMESTAMP'
    }

    // Date
    if (type === 'date') {
      return 'DATE'
    }

    // Time
    if (type.includes('time') && !type.includes('timestamp')) {
      return 'TIME'
    }

    // Binary
    if (type === 'bytea') {
      return 'BYTES'
    }

    // JSON
    if (type === 'json' || type === 'jsonb') {
      return 'JSON'
    }

    // Array
    if (type.includes('[]') || type === 'array') {
      return 'ARRAY'
    }

    return 'UNKNOWN'
  }

  clearCache(): void {
    this.cachedSchema = null
  }
}
