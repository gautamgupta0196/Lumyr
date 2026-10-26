import crypto from 'crypto'
import Store from 'electron-store'
import { getSecureStoreKey, type SecureKeyProvider } from './secure-key.js'
import { createLogger } from './logger.js'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// Data source types
export type DataSourceType = 'bigquery' | 'postgresql' | 'snowflake' | 'redshift' | 'netsuite' | 'odbc' | 'file'

const storeLogger = createLogger('Store')
export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  recentQueries: string[]
  executionTimeoutSeconds: number  // Timeout for code execution (default 600, max 600)
  clientId: string  // Persistent anonymous device identifier for analytics
  selectedModel: string
}

interface Credentials {
  bigquery: {
    tokens?: {
      access_token: string
      refresh_token: string
      expiry_date: number
    }
    projectId?: string
  }
  anthropicApiKey?: string
  githubToken?: string  // For auto-updates from private repos
}

// Conversation message for chat history
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  code?: string
  error?: string
}

// Saved dashboard interface
export interface SavedDashboard {
  id: string
  name: string
  query: string
  connectionId: string
  createdAt: number
  updatedAt: number
  conversation?: ConversationMessage[]
  fileIds?: string[]
  isFavorite?: boolean
}

interface DashboardStore {
  dashboards: Record<string, SavedDashboard>
}

// Saved connection interface - supports multiple data source types
export interface SavedConnection {
  id: string
  name: string
  type: DataSourceType
  createdAt: number
  lastUsed: number
  isDefault?: boolean

  // BigQuery specific
  projectId?: string
  authType?: 'oauth' | 'service_account'

  // PostgreSQL/Redshift specific
  host?: string
  port?: number
  database?: string
  ssl?: boolean

  // Snowflake specific
  account?: string
  warehouse?: string
  schema?: string
  role?: string

  // Redshift specific
  region?: string
  clusterId?: string

  // NetSuite specific
  accountId?: string

  // ODBC specific
  connectionString?: string
  dsn?: string
  driver?: string

  /** Extra guidance appended to the agent's system prompt for this connection. */
  customInstructions?: string

  // MCP servers for this connection
  mcpServers?: Array<{
    name: string
    url: string
    apiKey?: string
  }>
}

interface ConnectionsStore {
  connections: Record<string, SavedConnection>
  activeConnectionId: string | null
  defaultConnectionId: string | null
}

// Credentials keyed by connection ID - supports all data source types
interface ConnectionCredentials {
  connections: Record<string, {
    type: DataSourceType

    // BigQuery OAuth tokens
    tokens?: {
      access_token: string
      refresh_token: string
      expiry_date: number
    }
    // BigQuery Service Account
    serviceAccount?: object

    // PostgreSQL/Redshift credentials
    username?: string
    password?: string
    sslCert?: string
    sslKey?: string
    sslRootCert?: string

    // Snowflake credentials
    privateKey?: string
    privateKeyPassphrase?: string

    // Redshift IAM credentials
    iamRole?: string
    accessKeyId?: string
    secretAccessKey?: string

    // NetSuite TBA credentials
    consumerKey?: string
    consumerSecret?: string
    tokenId?: string
    tokenSecret?: string

    // ODBC credentials (connectionString stored in SavedConnection)
  }>
}

// Uploaded file interface
export interface UploadedFile {
  id: string
  name: string
  originalName: string
  format: FileFormat
  size: number
  rowCount: number
  uploadedAt: number
  filePath: string
  columns: {
    name: string
    type: string
    originalType: string
    nullable?: boolean
  }[]
}

// Files store interface
interface FilesStore {
  files: Record<string, UploadedFile>
}

const SECURE_STORE_NAMESPACE = 'lumyr'
const LEGACY_CREDENTIALS_KEY = 'lumyr-secure-key-2024'

interface EncryptedStoreDefinition<T extends object> {
  name: string
  defaults: T
  legacyKeys: string[]
}

// Settings store (not encrypted)
export const settingsStore = new Store<AppSettings>({
  name: 'lumyr-settings',
  defaults: {
    theme: 'system',
    recentQueries: [],
    executionTimeoutSeconds: 600,  // Default 10 minutes
    clientId: '',  // Generated on first access via getClientId()
    selectedModel: 'auto'
  }
})

// Credentials store (encrypted)
export let credentialsStore: Store<Credentials>

// Helper functions
export function getTheme(): 'light' | 'dark' | 'system' {
  return settingsStore.get('theme')
}

export function setTheme(theme: 'light' | 'dark' | 'system'): void {
  settingsStore.set('theme', theme)
}

export function addRecentQuery(query: string): void {
  const recent = settingsStore.get('recentQueries')
  const updated = [query, ...recent.filter(q => q !== query)].slice(0, 20)
  settingsStore.set('recentQueries', updated)
}

export function getRecentQueries(): string[] {
  return settingsStore.get('recentQueries')
}

export function getClientId(): string {
  let id = settingsStore.get('clientId')
  if (!id) {
    id = crypto.randomUUID()
    settingsStore.set('clientId', id)
  }
  return id
}

// Schema cache store (not encrypted - schema data is not sensitive)
interface SchemaStoreData {
  schemas: Record<string, {
    schema: {
      projectId: string
      datasets: Array<{
        id: string
        tables: Array<{
          id: string
          columns: Array<{ name: string; type: string; description?: string }>
        }>
      }>
    }
    fetchedAt: number
  }>
}

export const schemaStore = new Store<SchemaStoreData>({
  name: 'lumyr-schemas',
  defaults: { schemas: {} }
})

export function getCachedSchema(connectionId: string): { schema: SchemaStoreData['schemas'][string]['schema']; fetchedAt: number } | undefined {
  return schemaStore.get(`schemas.${connectionId}`) as SchemaStoreData['schemas'][string] | undefined
}

export function saveCachedSchema(connectionId: string, schema: SchemaStoreData['schemas'][string]['schema']): void {
  schemaStore.set(`schemas.${connectionId}`, { schema, fetchedAt: Date.now() })
}

export function deleteCachedSchema(connectionId: string): void {
  schemaStore.delete(`schemas.${connectionId}` as keyof SchemaStoreData)
}

// Dashboard store (not encrypted - code is not sensitive)
export const dashboardStore = new Store<DashboardStore>({
  name: 'lumyr-dashboards',
  defaults: {
    dashboards: {}
  }
})

// Connections store (not encrypted - just metadata)
export const connectionsStore = new Store<ConnectionsStore>({
  name: 'lumyr-connections',
  defaults: {
    connections: {},
    activeConnectionId: null,
    defaultConnectionId: null
  }
})

// Connection credentials store (encrypted - contains tokens/keys)
export let connectionCredentialsStore: Store<ConnectionCredentials>

// Files store (not encrypted - just metadata, actual files stored separately)
export const filesStore = new Store<FilesStore>({
  name: 'lumyr-files',
  defaults: {
    files: {}
  }
})

// Dashboard helper functions
export function saveDashboard(dashboard: SavedDashboard): void {
  dashboardStore.set(`dashboards.${dashboard.id}`, dashboard)
}

export function getDashboard(id: string): SavedDashboard | undefined {
  return dashboardStore.get(`dashboards.${id}`)
}

export function getAllDashboards(): SavedDashboard[] {
  const dashboards = dashboardStore.get('dashboards')
  return Object.values(dashboards).sort((a, b) => b.updatedAt - a.updatedAt)
}

export function deleteDashboard(id: string): void {
  dashboardStore.delete(`dashboards.${id}` as keyof DashboardStore)
}

export function updateDashboard(id: string, updates: Partial<SavedDashboard>): void {
  const existing = getDashboard(id)
  if (existing) {
    dashboardStore.set(`dashboards.${id}`, { ...existing, ...updates, updatedAt: Date.now() })
  }
}

// Connection helper functions
export function saveConnection(connection: SavedConnection): void {
  connectionsStore.set(`connections.${connection.id}`, connection)
}

export function getConnection(id: string): SavedConnection | undefined {
  return connectionsStore.get(`connections.${id}`)
}

export function getAllConnections(): SavedConnection[] {
  const connections = connectionsStore.get('connections')
  return Object.values(connections).sort((a, b) => b.lastUsed - a.lastUsed)
}

export function deleteConnection(id: string): void {
  connectionsStore.delete(`connections.${id}` as keyof ConnectionsStore)
  assertSecureStoresInitialized()
  connectionCredentialsStore.delete(`connections.${id}` as keyof ConnectionCredentials)
  deleteCachedSchema(id)
}

export function getActiveConnectionId(): string | null {
  return connectionsStore.get('activeConnectionId')
}

export function setActiveConnectionId(id: string | null): void {
  connectionsStore.set('activeConnectionId', id)
}

export function updateConnectionLastUsed(id: string): void {
  const connection = getConnection(id)
  if (connection) {
    connectionsStore.set(`connections.${id}`, { ...connection, lastUsed: Date.now() })
  }
}

export function updateConnection(id: string, updates: Partial<SavedConnection>): void {
  const connection = getConnection(id)
  if (connection) {
    connectionsStore.set(`connections.${id}`, { ...connection, ...updates })
  }
}

// Connection credentials helpers
export function saveConnectionCredentials(
  connectionId: string,
  credentials: { tokens?: { access_token: string; refresh_token: string; expiry_date: number }; serviceAccount?: object }
): void {
  assertSecureStoresInitialized()
  connectionCredentialsStore.set(`connections.${connectionId}`, credentials)
}

export function getConnectionCredentials(connectionId: string): {
  tokens?: { access_token: string; refresh_token: string; expiry_date: number }
  serviceAccount?: object
} | undefined {
  assertSecureStoresInitialized()
  return connectionCredentialsStore.get(`connections.${connectionId}`)
}

// Default connection helpers
export function getDefaultConnectionId(): string | null {
  return connectionsStore.get('defaultConnectionId')
}

export function setDefaultConnectionId(id: string | null): void {
  // Clear isDefault from all connections first
  const connections = connectionsStore.get('connections')
  for (const connId of Object.keys(connections)) {
    if (connections[connId].isDefault) {
      connectionsStore.set(`connections.${connId}`, { ...connections[connId], isDefault: false })
    }
  }

  // Set new default
  connectionsStore.set('defaultConnectionId', id)

  // Mark the connection as default
  if (id) {
    const connection = getConnection(id)
    if (connection) {
      connectionsStore.set(`connections.${id}`, { ...connection, isDefault: true })
    }
  }
}

// Anthropic API key helpers
export function getAnthropicApiKey(): string | undefined {
  assertSecureStoresInitialized()
  return credentialsStore.get('anthropicApiKey')
}

export function setAnthropicApiKey(apiKey: string): void {
  assertSecureStoresInitialized()
  credentialsStore.set('anthropicApiKey', apiKey)
}

export function clearAnthropicApiKey(): void {
  assertSecureStoresInitialized()
  credentialsStore.delete('anthropicApiKey')
}

export function hasAnthropicApiKey(): boolean {
  assertSecureStoresInitialized()
  return !!credentialsStore.get('anthropicApiKey')
}

// GitHub token helpers (for auto-updates from private repos)
export function getGitHubToken(): string | undefined {
  assertSecureStoresInitialized()
  return credentialsStore.get('githubToken')
}

export function setGitHubToken(token: string): void {
  assertSecureStoresInitialized()
  credentialsStore.set('githubToken', token)
}

export function clearGitHubToken(): void {
  assertSecureStoresInitialized()
  credentialsStore.delete('githubToken')
}

export function hasGitHubToken(): boolean {
  assertSecureStoresInitialized()
  return !!credentialsStore.get('githubToken')
}

// Execution timeout helpers
export function getExecutionTimeout(): number {
  return settingsStore.get('executionTimeoutSeconds')
}

export function setExecutionTimeout(seconds: number): void {
  // Clamp between 10 seconds and 10 minutes (600 seconds)
  const clamped = Math.max(10, Math.min(600, seconds))
  settingsStore.set('executionTimeoutSeconds', clamped)
}

// Selected model helpers
export function getSelectedModel(): string {
  return settingsStore.get('selectedModel')
}

export function setSelectedModel(model: string): void {
  settingsStore.set('selectedModel', model)
}

// ============ FILE HELPER FUNCTIONS ============

export function saveFile(file: UploadedFile): void {
  filesStore.set(`files.${file.id}`, file)
}

export function getFile(id: string): UploadedFile | undefined {
  return filesStore.get(`files.${id}`)
}

export function getAllFiles(): UploadedFile[] {
  const files = filesStore.get('files')
  return Object.values(files).sort((a, b) => b.uploadedAt - a.uploadedAt)
}

export function deleteFile(id: string): void {
  filesStore.delete(`files.${id}` as keyof FilesStore)
}

export function updateFile(id: string, updates: Partial<UploadedFile>): void {
  const existing = getFile(id)
  if (existing) {
    filesStore.set(`files.${id}`, { ...existing, ...updates })
  }
}

export function getFileByPath(filePath: string): UploadedFile | undefined {
  const files = filesStore.get('files')
  return Object.values(files).find(f => f.filePath === filePath)
}

export function getFilesByFormat(format: FileFormat): UploadedFile[] {
  const files = filesStore.get('files')
  return Object.values(files).filter(f => f.format === format)
}

export function getFilesByIds(ids: string[]): UploadedFile[] {
  const idSet = new Set(ids)
  const files = filesStore.get('files')
  return Object.values(files).filter(f => idSet.has(f.id))
}

let secureStoresInitialized = false

function createEncryptedStore<T extends object>(
  definition: EncryptedStoreDefinition<T>,
  encryptionKey: string
): Store<T> {
  try {
    return new Store<T>({
      name: definition.name,
      encryptionKey,
      defaults: definition.defaults
    })
  } catch (error) {
    // Handle corrupted store files (e.g., from merge conflicts)
    if (error instanceof SyntaxError || (error instanceof Error && error.message.includes('not valid JSON'))) {
      storeLogger.warn('Detected corrupted store file, attempting to recover', { store: definition.name, error: error.message })
      try {
        // Delete the corrupted store file
        const userDataPath = app.getPath('userData')
        const storePath = path.join(userDataPath, `${definition.name}.json`)
        if (fs.existsSync(storePath)) {
          fs.unlinkSync(storePath)
          storeLogger.info('Deleted corrupted store file', { store: definition.name })
        }
        // Retry creating the store with defaults
        return new Store<T>({
          name: definition.name,
          encryptionKey,
          defaults: definition.defaults
        })
      } catch (recoveryError) {
        storeLogger.error('Failed to recover corrupted store', { store: definition.name, error: recoveryError })
        throw recoveryError
      }
    }
    throw error
  }
}

export function initializeEncryptedStoreWithMigration<T extends object>(
  definition: EncryptedStoreDefinition<T>,
  encryptionKey: string
): Store<T> {
  try {
    return createEncryptedStore(definition, encryptionKey)
  } catch (newKeyError) {
    for (const legacyKey of definition.legacyKeys) {
      try {
        const legacyStore = createEncryptedStore(definition, legacyKey)
        const legacyData = legacyStore.store
        const migratedStore = createEncryptedStore(definition, encryptionKey)
        migratedStore.store = legacyData
        return migratedStore
      } catch {
        // Try next legacy key.
      }
    }

    throw newKeyError
  }
}

function assertSecureStoresInitialized(): void {
  if (!secureStoresInitialized) {
    throw new Error('Secure stores are not initialized. Call initializeSecureStores() during startup.')
  }
}

export async function initializeSecureStores(provider?: SecureKeyProvider): Promise<void> {
  const encryptionKey = await getSecureStoreKey(SECURE_STORE_NAMESPACE, provider)

  credentialsStore = initializeEncryptedStoreWithMigration(
    {
      name: 'lumyr-credentials',
      defaults: { bigquery: {} },
      legacyKeys: [LEGACY_CREDENTIALS_KEY]
    },
    encryptionKey
  )

  connectionCredentialsStore = initializeEncryptedStoreWithMigration(
    {
      name: 'lumyr-connection-credentials',
      defaults: { connections: {} },
      legacyKeys: [LEGACY_CREDENTIALS_KEY]
    },
    encryptionKey
  )

  secureStoresInitialized = true
}

// ============ MULTI-SOURCE CONNECTION HELPERS ============

export function getConnectionsByType(type: DataSourceType): SavedConnection[] {
  const connections = connectionsStore.get('connections')
  return Object.values(connections)
    .filter(c => c.type === type)
    .sort((a, b) => b.lastUsed - a.lastUsed)
}

export function saveMultiSourceCredentials(
  connectionId: string,
  credentials: ConnectionCredentials['connections'][string]
): void {
  assertSecureStoresInitialized()
  connectionCredentialsStore.set(`connections.${connectionId}`, credentials)
}

export function getMultiSourceCredentials(
  connectionId: string
): ConnectionCredentials['connections'][string] | undefined {
  assertSecureStoresInitialized()
  return connectionCredentialsStore.get(`connections.${connectionId}`)
}
