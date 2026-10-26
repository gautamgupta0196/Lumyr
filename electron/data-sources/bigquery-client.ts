// BigQuery Data Source Client
// Implements DataSourceClient interface for BigQuery

import { BigQuery } from '@google-cloud/bigquery'
import { OAuth2Client } from 'google-auth-library'
import type {
  DataSourceClient,
  BigQueryConnection,
  BigQueryCredentials,
  ConnectionResult,
  TestConnectionResult,
  SchemaResult,
  SchemaFetchOptions,
  QueryResult,
  ExecuteOptions,
  DriverInfo,
  Table,
  Column,
  normalizeType
} from './types.js'

interface BigQueryField {
  name: string
  type: string
  description?: string
}

export class BigQueryClient implements DataSourceClient {
  private connection: BigQueryConnection
  private credentials: BigQueryCredentials
  private client: BigQuery | null = null
  private oauth2Client: OAuth2Client | null = null
  private cachedSchema: SchemaResult | null = null
  private connected = false

  constructor(connection: BigQueryConnection, credentials: BigQueryCredentials) {
    this.connection = connection
    this.credentials = credentials
  }

  async connect(): Promise<ConnectionResult> {
    try {
      if (this.credentials.tokens) {
        // OAuth authentication
        this.oauth2Client = new OAuth2Client()
        this.oauth2Client.setCredentials(this.credentials.tokens)

        this.client = new BigQuery({
          projectId: this.connection.projectId,
          authClient: this.oauth2Client as any
        })
      } else if (this.credentials.serviceAccount) {
        // Service Account authentication
        this.client = new BigQuery({
          projectId: this.connection.projectId,
          credentials: this.credentials.serviceAccount
        })
      } else {
        return { success: false, error: 'No valid credentials provided' }
      }

      // Verify connection by listing datasets
      await this.client.getDatasets({ maxResults: 1 })
      this.connected = true

      return { success: true }
    } catch (error) {
      this.client = null
      this.oauth2Client = null
      this.connected = false
      const message = error instanceof Error ? error.message : 'Failed to connect to BigQuery'
      return { success: false, error: message }
    }
  }

  disconnect(): void {
    this.client = null
    this.oauth2Client = null
    this.cachedSchema = null
    this.connected = false
  }

  async testConnection(): Promise<TestConnectionResult> {
    const startTime = Date.now()

    try {
      // Create a temporary client for testing
      let testClient: BigQuery

      if (this.credentials.tokens) {
        const oauth = new OAuth2Client()
        oauth.setCredentials(this.credentials.tokens)
        testClient = new BigQuery({
          projectId: this.connection.projectId,
          authClient: oauth as any
        })
      } else if (this.credentials.serviceAccount) {
        testClient = new BigQuery({
          projectId: this.connection.projectId,
          credentials: this.credentials.serviceAccount
        })
      } else {
        return { success: false, error: 'No valid credentials provided' }
      }

      // Test by listing datasets
      await testClient.getDatasets({ maxResults: 1 })

      return {
        success: true,
        latencyMs: Date.now() - startTime
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed'
      return { success: false, error: message }
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null
  }

  async getSchema(options?: SchemaFetchOptions): Promise<SchemaResult> {
    if (!this.client) {
      throw new Error('Not connected to BigQuery')
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
      const [allDatasets] = await this.client.getDatasets()

      // Apply dataset filter if provided
      let datasets = allDatasets
      if (options?.datasetFilter && options.datasetFilter.length > 0) {
        datasets = allDatasets.filter(d => options.datasetFilter!.includes(d.id!))
      }

      // Apply offset if provided
      const offset = options?.offset ?? 0
      datasets = datasets.slice(offset)

      // Track totals for pagination
      const totalDatasets = allDatasets.length
      let totalTables = 0

      const schemaDatasets: { id: string; tables: Table[] }[] = []

      for (const dataset of datasets.slice(0, maxDatasets)) {
        const datasetId = dataset.id!
        const [allTables] = await dataset.getTables()

        totalTables += allTables.length

        // Apply table filter if provided
        let tables = allTables
        if (options?.tableFilter && options.tableFilter.length > 0) {
          tables = allTables.filter(t =>
            options.tableFilter!.some(filter =>
              `${datasetId}.${t.id}`.includes(filter) || t.id!.includes(filter)
            )
          )
        }

        // Apply search query if provided
        if (options?.searchQuery) {
          const query = options.searchQuery.toLowerCase()
          tables = tables.filter(t => t.id!.toLowerCase().includes(query))
        }

        const datasetSchema: { id: string; tables: Table[] } = {
          id: datasetId,
          tables: []
        }

        for (const table of tables.slice(0, maxTablesPerDataset)) {
          const [metadata] = await table.getMetadata()
          const fields: BigQueryField[] = metadata.schema?.fields || []

          const tableSchema: Table = {
            id: table.id!,
            fullName: `${this.connection.projectId}.${datasetId}.${table.id}`,
            columns: fields.map((field: BigQueryField): Column => ({
              name: field.name,
              type: this.normalizeType(field.type),
              originalType: field.type,
              description: field.description,
              nullable: true // BigQuery doesn't enforce NOT NULL at schema level typically
            })),
            rowCount: metadata.numRows ? parseInt(metadata.numRows, 10) : undefined
          }

          datasetSchema.tables.push(tableSchema)
        }

        schemaDatasets.push(datasetSchema)
      }

      const result: SchemaResult = {
        schema: {
          sourceId: this.connection.id,
          sourceType: 'bigquery',
          sourceName: this.connection.projectId,
          datasets: schemaDatasets
        },
        totalDatasets,
        totalTables,
        hasMore: datasets.length > maxDatasets || totalTables > maxDatasets * maxTablesPerDataset,
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
    if (!this.client) {
      throw new Error('Not connected to BigQuery')
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
    if (!this.client) {
      throw new Error('Not connected to BigQuery')
    }

    try {
      // Parse table name: project.dataset.table or dataset.table
      const parts = tableName.split('.')
      let datasetId: string
      let tableId: string

      if (parts.length === 3) {
        // project.dataset.table
        datasetId = parts[1]
        tableId = parts[2]
      } else if (parts.length === 2) {
        // dataset.table
        datasetId = parts[0]
        tableId = parts[1]
      } else {
        return null
      }

      const dataset = this.client.dataset(datasetId)
      const table = dataset.table(tableId)
      const [metadata] = await table.getMetadata()
      const fields: BigQueryField[] = metadata.schema?.fields || []

      return {
        id: tableId,
        fullName: `${this.connection.projectId}.${datasetId}.${tableId}`,
        columns: fields.map((field: BigQueryField): Column => ({
          name: field.name,
          type: this.normalizeType(field.type),
          originalType: field.type,
          description: field.description,
          nullable: true
        })),
        rowCount: metadata.numRows ? parseInt(metadata.numRows, 10) : undefined
      }
    } catch {
      return null
    }
  }

  async getTablePreview(tableName: string, limit = 10): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('Not connected to BigQuery')
    }

    const query = `SELECT * FROM \`${tableName}\` LIMIT ${limit}`
    return this.executeQuery(query, { maxRows: limit })
  }

  async executeQuery(query: string, options?: ExecuteOptions): Promise<QueryResult> {
    if (!this.client) {
      throw new Error('Not connected to BigQuery')
    }

    const maxRows = options?.maxRows ?? 1000

    try {
      const [rows] = await this.client.query({
        query,
        maxResults: maxRows,
        timeoutMs: options?.timeout
      })

      const columns = rows.length > 0 ? Object.keys(rows[0]) : []

      return {
        columns,
        rows: rows as Record<string, unknown>[],
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
      name: 'BigQuery',
      pythonPackage: 'google-cloud-bigquery',
      pythonImport: 'from google.cloud import bigquery',
      connectionTemplate: 'client = bigquery.Client()',
      queryTemplate: 'df = client.query("""YOUR_QUERY""").to_dataframe()'
    }
  }

  getConnectionInfo(): BigQueryConnection {
    return this.connection
  }

  // Helper to normalize BigQuery types to our standard types
  private normalizeType(bqType: string): string {
    const type = bqType.toUpperCase()

    switch (type) {
      case 'STRING':
        return 'STRING'
      case 'BYTES':
        return 'BYTES'
      case 'INTEGER':
      case 'INT64':
        return 'INTEGER'
      case 'FLOAT':
      case 'FLOAT64':
        return 'FLOAT'
      case 'NUMERIC':
      case 'BIGNUMERIC':
        return 'FLOAT'
      case 'BOOLEAN':
      case 'BOOL':
        return 'BOOLEAN'
      case 'TIMESTAMP':
        return 'TIMESTAMP'
      case 'DATE':
        return 'DATE'
      case 'TIME':
        return 'TIME'
      case 'DATETIME':
        return 'TIMESTAMP'
      case 'GEOGRAPHY':
        return 'STRING'
      case 'RECORD':
      case 'STRUCT':
        return 'OBJECT'
      case 'ARRAY':
        return 'ARRAY'
      case 'JSON':
        return 'JSON'
      default:
        return 'UNKNOWN'
    }
  }

  // Clear cached schema
  clearCache(): void {
    this.cachedSchema = null
  }
}
