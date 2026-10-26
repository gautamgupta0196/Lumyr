// Abstract data source types for multi-source support

export type DataSourceType = 'bigquery' | 'postgresql' | 'snowflake' | 'redshift' | 'netsuite' | 'odbc' | 'file'

// ============================================================================
// Connection Types
// ============================================================================

export interface DataSourceConnection {
  id: string
  name: string
  type: DataSourceType
  createdAt: number
  lastUsed: number
  isDefault?: boolean
}

// Type-specific connection extensions
export interface BigQueryConnection extends DataSourceConnection {
  type: 'bigquery'
  projectId: string
  authType: 'oauth' | 'service_account'
}

export interface PostgreSQLConnection extends DataSourceConnection {
  type: 'postgresql'
  host: string
  port: number
  database: string
  ssl: boolean
}

export interface SnowflakeConnection extends DataSourceConnection {
  type: 'snowflake'
  account: string
  warehouse: string
  database: string
  schema?: string
  role?: string
}

export interface RedshiftConnection extends DataSourceConnection {
  type: 'redshift'
  host: string
  port: number
  database: string
  region: string
  clusterId?: string
}

export interface NetSuiteConnection extends DataSourceConnection {
  type: 'netsuite'
  accountId: string
  apiUrl?: string
}

export interface ODBCConnection extends DataSourceConnection {
  type: 'odbc'
  connectionString?: string
  dsn?: string
  driver?: string
  host?: string
  port?: number
  database?: string
}

export interface FileConnection extends DataSourceConnection {
  type: 'file'
  // Files are managed separately, this just represents the "file" data source
}

export type AnyConnection =
  | BigQueryConnection
  | PostgreSQLConnection
  | SnowflakeConnection
  | RedshiftConnection
  | NetSuiteConnection
  | ODBCConnection
  | FileConnection

// ============================================================================
// Credential Types
// ============================================================================

export interface BigQueryCredentials {
  type: 'bigquery'
  tokens?: {
    access_token: string
    refresh_token: string
    expiry_date: number
  }
  serviceAccount?: {
    type: string
    project_id: string
    private_key_id: string
    private_key: string
    client_email: string
    client_id: string
    auth_uri: string
    token_uri: string
  }
}

export interface PostgreSQLCredentials {
  type: 'postgresql'
  username: string
  password: string
  sslCert?: string
  sslKey?: string
  sslRootCert?: string
}

export interface SnowflakeCredentials {
  type: 'snowflake'
  username: string
  password?: string
  privateKey?: string
  privateKeyPassphrase?: string
}

export interface RedshiftCredentials {
  type: 'redshift'
  username: string
  password?: string
  iamRole?: string
  accessKeyId?: string
  secretAccessKey?: string
}

export interface NetSuiteCredentials {
  type: 'netsuite'
  consumerKey: string
  consumerSecret: string
  tokenId: string
  tokenSecret: string
}

export interface ODBCCredentials {
  type: 'odbc'
  username?: string
  password?: string
}

export type DataSourceCredentials =
  | BigQueryCredentials
  | PostgreSQLCredentials
  | SnowflakeCredentials
  | RedshiftCredentials
  | NetSuiteCredentials
  | ODBCCredentials

// ============================================================================
// Schema Types (Unified format across all sources)
// ============================================================================

export interface Column {
  name: string
  type: string           // Normalized type (STRING, INTEGER, FLOAT, BOOLEAN, TIMESTAMP, etc.)
  originalType: string   // Source-specific type (e.g., VARCHAR(255), INT8, VARIANT)
  description?: string
  nullable?: boolean
}

export interface Table {
  id: string            // Table name
  fullName: string      // Fully qualified: project.dataset.table or schema.table
  columns: Column[]
  rowCount?: number     // Optional, may not be available for all sources
}

export interface Dataset {
  id: string            // Dataset/schema name
  tables: Table[]
}

export interface Schema {
  sourceId: string      // Connection ID
  sourceType: DataSourceType
  sourceName: string    // Project ID, database name, etc.
  datasets: Dataset[]
}

// Schema with pagination metadata
export interface SchemaResult {
  schema: Schema
  totalDatasets: number
  totalTables: number
  hasMore: boolean
  fetchedAt: number
}

// ============================================================================
// Query Types
// ============================================================================

export interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  rowCount: number
  truncated: boolean    // True if results were limited
}

export interface ExecuteOptions {
  maxRows?: number
  timeout?: number      // In milliseconds
}

// ============================================================================
// Schema Fetch Options (for lazy loading and pagination)
// ============================================================================

export interface SchemaFetchOptions {
  maxDatasets?: number
  maxTablesPerDataset?: number
  datasetFilter?: string[]      // Only fetch specific datasets/schemas
  tableFilter?: string[]        // Only fetch specific tables
  searchQuery?: string          // Filter tables by name pattern
  includeSystemTables?: boolean
  offset?: number               // For pagination
  mode?: 'tables_only' | 'full' // 'tables_only' skips column fetching for fast initial load
}

// ============================================================================
// Driver Info (for code generation)
// ============================================================================

export interface DriverInfo {
  name: string
  pythonPackage: string
  pythonImport: string
  connectionTemplate: string
  queryTemplate: string
}

// ============================================================================
// Connection Result Types
// ============================================================================

export interface ConnectionResult {
  success: boolean
  error?: string
}

export interface TestConnectionResult {
  success: boolean
  error?: string
  serverVersion?: string
  latencyMs?: number
}

// ============================================================================
// Abstract Data Source Client Interface
// ============================================================================

export interface DataSourceClient {
  // Connection management
  connect(): Promise<ConnectionResult>
  disconnect(): void
  testConnection(): Promise<TestConnectionResult>
  isConnected(): boolean

  // Schema operations
  getSchema(options?: SchemaFetchOptions): Promise<SchemaResult>
  searchTables(query: string, limit?: number): Promise<Table[]>
  getTableDetails(tableName: string): Promise<Table | null>
  getTablePreview(tableName: string, limit?: number): Promise<QueryResult>

  // Query execution
  executeQuery(query: string, options?: ExecuteOptions): Promise<QueryResult>

  // Metadata
  getDriverInfo(): DriverInfo
  getConnectionInfo(): DataSourceConnection
}

// ============================================================================
// File Types (for uploaded CSV/Excel files)
// ============================================================================

export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'

export interface UploadedFile {
  id: string
  name: string           // Display name
  originalName: string   // Original filename
  format: FileFormat
  size: number           // In bytes
  rowCount: number
  uploadedAt: number
  schema: Table          // Column schema
  filePath: string       // Path in userData/lumyr-files/
}

export interface FileUploadResult {
  success: boolean
  file?: UploadedFile
  error?: string
}

export interface FilePreviewResult {
  success: boolean
  columns?: string[]
  rows?: Record<string, unknown>[]
  error?: string
}

// ============================================================================
// Type Guards
// ============================================================================

export function isBigQueryConnection(conn: DataSourceConnection): conn is BigQueryConnection {
  return conn.type === 'bigquery'
}

export function isPostgreSQLConnection(conn: DataSourceConnection): conn is PostgreSQLConnection {
  return conn.type === 'postgresql'
}

export function isSnowflakeConnection(conn: DataSourceConnection): conn is SnowflakeConnection {
  return conn.type === 'snowflake'
}

export function isRedshiftConnection(conn: DataSourceConnection): conn is RedshiftConnection {
  return conn.type === 'redshift'
}

export function isNetSuiteConnection(conn: DataSourceConnection): conn is NetSuiteConnection {
  return conn.type === 'netsuite'
}

export function isODBCConnection(conn: DataSourceConnection): conn is ODBCConnection {
  return conn.type === 'odbc'
}

export function isFileConnection(conn: DataSourceConnection): conn is FileConnection {
  return conn.type === 'file'
}

// ============================================================================
// Type Mapping (normalize types across sources)
// ============================================================================

export const NORMALIZED_TYPES = {
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  FLOAT: 'FLOAT',
  BOOLEAN: 'BOOLEAN',
  TIMESTAMP: 'TIMESTAMP',
  DATE: 'DATE',
  TIME: 'TIME',
  BYTES: 'BYTES',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT',
  JSON: 'JSON',
  UNKNOWN: 'UNKNOWN'
} as const

export type NormalizedType = typeof NORMALIZED_TYPES[keyof typeof NORMALIZED_TYPES]

// Map source-specific types to normalized types
export function normalizeType(sourceType: string, source: DataSourceType): NormalizedType {
  const type = sourceType.toUpperCase()

  // String types
  if (/^(VARCHAR|CHAR|TEXT|STRING|NVARCHAR|NCHAR|CLOB)/.test(type)) {
    return NORMALIZED_TYPES.STRING
  }

  // Integer types
  if (/^(INT|INTEGER|BIGINT|SMALLINT|TINYINT|INT2|INT4|INT8|SERIAL|BIGSERIAL)/.test(type)) {
    return NORMALIZED_TYPES.INTEGER
  }

  // Float types
  if (/^(FLOAT|DOUBLE|DECIMAL|NUMERIC|REAL|NUMBER|FLOAT4|FLOAT8)/.test(type)) {
    return NORMALIZED_TYPES.FLOAT
  }

  // Boolean types
  if (/^(BOOL|BOOLEAN)/.test(type)) {
    return NORMALIZED_TYPES.BOOLEAN
  }

  // Timestamp types
  if (/^(TIMESTAMP|DATETIME)/.test(type)) {
    return NORMALIZED_TYPES.TIMESTAMP
  }

  // Date types
  if (/^DATE$/.test(type)) {
    return NORMALIZED_TYPES.DATE
  }

  // Time types
  if (/^TIME/.test(type)) {
    return NORMALIZED_TYPES.TIME
  }

  // Binary types
  if (/^(BYTES|BYTEA|BINARY|VARBINARY|BLOB)/.test(type)) {
    return NORMALIZED_TYPES.BYTES
  }

  // Array types
  if (/^ARRAY/.test(type) || type.endsWith('[]')) {
    return NORMALIZED_TYPES.ARRAY
  }

  // JSON/Object types
  if (/^(JSON|JSONB|VARIANT|OBJECT|STRUCT|RECORD)/.test(type)) {
    return NORMALIZED_TYPES.JSON
  }

  return NORMALIZED_TYPES.UNKNOWN
}
