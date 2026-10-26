import { contextBridge, ipcRenderer } from 'electron'

const streamlitOutputListeners = new WeakMap<(output: string) => void, (_event: Electron.IpcRendererEvent, output: string) => void>()
const streamlitErrorListeners = new WeakMap<(error: string) => void, (_event: Electron.IpcRendererEvent, error: string) => void>()

// Conversation message type
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  code?: string
  error?: string
}

// Saved dashboard type
export interface SavedDashboard {
  id: string
  name: string
  query: string
  connectionId: string
  createdAt: number
  updatedAt: number
  conversation?: ConversationMessage[]
  fileIds?: string[]
}

// Saved connection type
export interface SavedConnection {
  id: string
  name: string
  type?: 'bigquery' | 'postgresql' | 'snowflake' | 'redshift' | 'netsuite' | 'odbc' | 'file'
  projectId?: string
  authType?: 'oauth' | 'service_account' | 'password'
  host?: string
  port?: number
  database?: string
  ssl?: boolean
  account?: string
  warehouse?: string
  schema?: string
  role?: string
  region?: string
  clusterId?: string
  accountId?: string
  connectionString?: string
  dsn?: string
  driver?: string
  mcpServers?: Array<{
    name: string
    url: string
    apiKey?: string
  }>
  createdAt: number
  lastUsed: number
  isDefault?: boolean
}

// Uploaded file type
export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'

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

// Schema fetch options (for large warehouses)
export interface SchemaFetchOptions {
  maxDatasets?: number
  maxTablesPerDataset?: number
  datasetFilter?: string[]
  searchQuery?: string
  offset?: number
}

// Claude generation types
export interface GenerateRequest {
  query: string
  schema: Schema
  selectedTables?: string[]
  conversationHistory?: ConversationMessage[]
  currentCode?: string
}

export interface GenerateResult {
  success: boolean
  code?: string
  model?: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
  error?: string
}

// Agent types
export type AgentStepType = 'thinking' | 'tool_call' | 'tool_result' | 'error' | 'retry' | 'complete'
export type AgentPhase = 'exploring' | 'generating' | 'testing' | 'polishing' | 'verifying' | 'complete' | 'error'

export interface AgentStep {
  id: string
  runId?: string
  type: AgentStepType
  timestamp: number
  thinking?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  isError?: boolean
  errorMessage?: string
  retryCount?: number
}

export interface AgentRequest {
  runId?: string
  query: string
  schema: Schema
  conversationHistory?: ConversationMessage[]
  currentCode?: string
  executionTimeoutSeconds?: number
  fileIds?: string[]
  sourceType?: 'bigquery' | 'postgresql' | 'snowflake' | 'redshift' | 'netsuite' | 'odbc' | 'file'
  connectionMeta?: {
    warehouse?: string
    account?: string
    host?: string
    region?: string
    database?: string
    schema?: string
    accountId?: string
    dsn?: string
    driver?: string
  }
  mcpServers?: Array<{
    name: string
    url: string
    apiKey?: string
  }>
  model?: string
}

export interface AgentResult {
  success: boolean
  code?: string
  summary?: string
  message?: string
  requiresUserInput?: boolean
  respondedDirectly?: boolean
  model?: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
  error?: string
  steps: AgentStep[]
}

// Import manifest type
export interface ImportManifest {
  version: number
  name: string
  query: string
  createdAt: number
  conversation: ConversationMessage[]
  files: Array<{ originalName: string; format: string; columns: unknown[] }>
}

// Package installation status
export interface PackageStatusEvent {
  phase: 'detecting' | 'installing' | 'complete' | 'error'
  package?: string
  total?: number
  current?: number
  error?: string
}

// Update status type
export interface OpenExternalResponse {
  success: boolean
  error?: {
    code: 'INVALID_URL' | 'DISALLOWED_PROTOCOL'
    message: string
  }
}

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: {
    version: string
    releaseDate?: string
    releaseNotes?: string
  }
  progress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: string
}

// Types for the exposed API
export interface ElectronAPI {
  // App utilities
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp') => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  /**
   * Opens a URL in the default external handler.
   *
   * Allowed schemes: https:, mailto:.
   * All other schemes (including file:, javascript:, and custom protocols) are blocked.
   */
  openExternal: (url: string) => Promise<OpenExternalResponse>

  // Claude AI operations
  claude: {
    generate: (request: GenerateRequest) => Promise<GenerateResult>
    generateAgent: (request: AgentRequest) => Promise<AgentResult>
    validateKey: (apiKey: string) => Promise<boolean>
    cancelAgent: (runId: string) => Promise<{ success: boolean }>
    onAgentStep: (callback: (step: AgentStep) => void) => void
    removeAgentStepListener: () => void
    onWorkingCode: (callback: (data: { code: string; runId: string }) => void) => void
    removeWorkingCodeListener: () => void
  }

  // Settings operations
  settings: {
    hasApiKey: () => Promise<boolean>
    setApiKey: (apiKey: string) => Promise<{ success: boolean }>
    clearApiKey: () => Promise<{ success: boolean }>
    getExecutionTimeout: () => Promise<number>
    setExecutionTimeout: (seconds: number) => Promise<{ success: boolean }>
    getSelectedModel: () => Promise<string>
    setSelectedModel: (model: string) => Promise<{ success: boolean }>
    getAvailableModels: () => Promise<{ models: Array<{ id: string; name: string; provider: string; description?: string }>; default: string }>
  }

  // BigQuery operations
  bigquery: {
    getAuthStatus: () => Promise<{
      isConnected: boolean
      authType?: 'oauth' | 'service_account'
      projectId?: string
      connectionId?: string
      connectionName?: string
    }>
    connectWithOAuth: (projectId: string, connectionName?: string) => Promise<{ success: boolean; error?: string; projectId?: string; connectionId?: string }>
    selectServiceAccountFile: () => Promise<{ success: boolean; error?: string; filePath?: string }>
    connectWithServiceAccount: (filePath: string, connectionName?: string) => Promise<{ success: boolean; error?: string; projectId?: string; connectionId?: string }>
    switchConnection: (connectionId: string) => Promise<{ success: boolean; error?: string; projectId?: string }>
    getSavedConnections: () => Promise<{ success: boolean; connections: SavedConnection[] }>
    disconnect: () => Promise<{ success: boolean }>
    reconnect: (connectionId: string) => Promise<{ success: boolean; error?: string }>
    updateServiceAccount: (connectionId: string, filePath: string, connectionName?: string) => Promise<{ success: boolean; error?: string; projectId?: string }>
    cancelOAuth: () => Promise<{ success: boolean }>
    startOAuthAndListProjects: () => Promise<{
      success: boolean
      error?: string
      projects?: Array<{ projectId: string; name: string; projectNumber: string }>
    }>
    completeOAuthConnection: (projectId: string, connectionName?: string) => Promise<{
      success: boolean
      error?: string
      projectId?: string
      connectionId?: string
    }>
    cancelPendingOAuth: () => Promise<{ success: boolean }>
    getSchema: (options?: SchemaFetchOptions) => Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }>
    runQuery: (query: string) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
  }

  // NetSuite operations
  netsuite: {
    connect: (params: { accountId: string; consumerKey: string; consumerSecret: string; tokenId: string; tokenSecret: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }>
    switchConnection: (connectionId: string) => Promise<{ success: boolean; error?: string; database?: string }>
    update: (connectionId: string, params: { accountId?: string; consumerKey?: string; consumerSecret?: string; tokenId?: string; tokenSecret?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; database?: string }>
    getConnectionDetails: (connectionId: string) => Promise<{ success: boolean; error?: string; connection?: { name: string; accountId: string } }>
    getSchema: (options?: SchemaFetchOptions) => Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }>
    runQuery: (query: string) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
    disconnect: () => Promise<{ success: boolean }>
  }
  // ODBC operations
  odbc: {
    connect: (params: { connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username?: string; password?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }>
    switchConnection: (connectionId: string) => Promise<{ success: boolean; error?: string; database?: string }>
    update: (connectionId: string, params: { connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username?: string; password?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; database?: string }>
    getConnectionDetails: (connectionId: string) => Promise<{ success: boolean; error?: string; connection?: { name: string; connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username: string; password: string } }>
    getSchema: (options?: SchemaFetchOptions) => Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }>
    runQuery: (query: string) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
    disconnect: () => Promise<{ success: boolean }>
  }

  // PostgreSQL operations
  postgresql: {
    connect: (params: { host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean; connectionName?: string; connectionString?: string })
      => Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }>
    switchConnection: (connectionId: string) => Promise<{ success: boolean; error?: string; database?: string }>
    update: (connectionId: string, params: { host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean; connectionName?: string; connectionString?: string })
      => Promise<{ success: boolean; error?: string; database?: string }>
    getConnectionDetails: (connectionId: string) => Promise<{ success: boolean; error?: string; connection?: { name: string; host: string; port: number; database: string; ssl: boolean; username: string; password: string } }>
    getSchema: (options?: SchemaFetchOptions) => Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }>
    runQuery: (query: string) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
    disconnect: () => Promise<{ success: boolean }>
  }

  // Snowflake operations
  snowflake: {
    connect: (params: { account: string; warehouse: string; database: string; schema?: string; role?: string; username: string; password?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }>
    switchConnection: (connectionId: string) => Promise<{ success: boolean; error?: string; database?: string }>
    update: (connectionId: string, params: { account?: string; warehouse?: string; database?: string; schema?: string; role?: string; username?: string; password?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; database?: string }>
    getConnectionDetails: (connectionId: string) => Promise<{ success: boolean; error?: string; connection?: { name: string; account: string; warehouse: string; database: string; schema: string; role?: string; username: string; password: string } }>
    getSchema: (options?: SchemaFetchOptions) => Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }>
    runQuery: (query: string) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
    disconnect: () => Promise<{ success: boolean }>
  }

  // Redshift operations
  redshift: {
    connect: (params: { host: string; port?: number; database: string; region: string; username: string; password?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; connectionId?: string; database?: string }>
    switchConnection: (connectionId: string) => Promise<{ success: boolean; error?: string; database?: string }>
    update: (connectionId: string, params: { host?: string; port?: number; database?: string; region?: string; username?: string; password?: string; connectionName?: string })
      => Promise<{ success: boolean; error?: string; database?: string }>
    getConnectionDetails: (connectionId: string) => Promise<{ success: boolean; error?: string; connection?: { name: string; host: string; port: number; database: string; region: string; username: string; password: string } }>
    getSchema: (options?: SchemaFetchOptions) => Promise<{ success: boolean; error?: string; schema?: Schema; metadata?: { totalDatasets: number; totalTables: number; hasMore: boolean } }>
    runQuery: (query: string) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
    disconnect: () => Promise<{ success: boolean }>
  }

  // Schema operations (for large warehouses)
  schema: {
    search: (query: string, limit?: number) => Promise<{ success: boolean; error?: string; tables?: Array<{ datasetId: string; tableId: string; fullName: string; columns: Column[] }> }>
    getTableDetails: (tableName: string) => Promise<{ success: boolean; error?: string; table?: { datasetId: string; tableId: string; fullName: string; columns: Column[]; rowCount?: number } }>
    getTablePreview: (tableName: string, limit?: number) => Promise<{ success: boolean; error?: string; columns?: string[]; rows?: unknown[] }>
    getCached: (connectionId: string) => Promise<{ schema: Schema; fetchedAt: number } | null>
    saveCache: (connectionId: string, schema: Schema) => Promise<void>
    clearCache: (connectionId: string) => Promise<void>
  }

  // Streamlit operations
  streamlit: {
    start: () => Promise<{ success: boolean; error?: string; port?: number }>
    stop: () => Promise<{ success: boolean; error?: string }>
    runCode: (code: string) => Promise<{ success: boolean; error?: string; port?: number }>
    onOutput: (callback: (output: string) => void) => () => void
    removeOutputListener: () => void
    onError: (callback: (error: string) => void) => () => void
    removeErrorListener: () => void
    onStarted: (callback: (data: { port: number }) => void) => void
    removeStartedListener: () => void
    onExited: (callback: () => void) => void
    removeExitedListener: () => void
  }

  // Dashboard operations
  dashboards: {
    list: () => Promise<{ success: boolean; dashboards: SavedDashboard[] }>
    save: (params: {
      name: string
      query: string
      code: string
      connectionId: string
      conversation?: ConversationMessage[]
    }) => Promise<{ success: boolean; error?: string; dashboard?: SavedDashboard }>
    load: (id: string) => Promise<{ success: boolean; error?: string; dashboard?: SavedDashboard; code?: string }>
    update: (params: {
      id: string
      name?: string
      code?: string
      conversation?: ConversationMessage[]
    }) => Promise<{ success: boolean; error?: string }>
    delete: (id: string) => Promise<{ success: boolean; error?: string }>
    export: (dashboardId: string) => Promise<{ success: boolean; error?: string }>
    importFile: (filePath?: string) => Promise<{ success: boolean; error?: string; manifest?: ImportManifest; zipPath?: string }>
    onOpenFile: (callback: (filePath: string) => void) => void
    removeOpenFileListener: () => void
    importConfirm: (params: { zipPath: string; connectionId: string; name?: string }) => Promise<{ success: boolean; error?: string; dashboard?: SavedDashboard }>
  }

  // Connection management operations
  connections: {
    list: () => Promise<{ success: boolean; connections: SavedConnection[] }>
    getActive: () => Promise<{ success: boolean; activeConnectionId: string | null }>
    setActive: (connectionId: string | null) => Promise<{ success: boolean }>
    getDefault: () => Promise<{ success: boolean; defaultConnectionId: string | null }>
    setDefault: (connectionId: string | null) => Promise<{ success: boolean }>
    delete: (connectionId: string) => Promise<{ success: boolean; error?: string }>
    update: (connectionId: string, updates: { name?: string; mcpServers?: Array<{ name: string; url: string; apiKey?: string }> }) => Promise<{ success: boolean; error?: string }>
  }

  // File operations
  files: {
    upload: (filePath: string) => Promise<{ success: boolean; file?: UploadedFile; error?: string }>
    list: () => Promise<{ success: boolean; files: UploadedFile[] }>
    delete: (fileId: string) => Promise<{ success: boolean; error?: string }>
    preview: (fileId: string, limit?: number) => Promise<{ success: boolean; columns?: string[]; rows?: Record<string, unknown>[]; error?: string }>
    selectFiles: () => Promise<{ success: boolean; filePaths?: string[]; error?: string }>
  }

  // Package installation status
  packages: {
    onStatus: (callback: (status: PackageStatusEvent) => void) => void
    removeStatusListener: () => void
  }

  // Auto-updater operations
  updater: {
    check: () => Promise<void>
    download: () => Promise<void>
    install: () => void
    onStatus: (callback: (status: UpdateStatus) => void) => void
  }

  // Logging
  log: {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
  }
}

export interface Schema {
  projectId: string
  datasets: Dataset[]
}

export interface Dataset {
  id: string
  tables: Table[]
}

export interface Table {
  id: string
  columns: Column[]
}

export interface Column {
  name: string
  type: string
  description?: string
}

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electron', {
  // App utilities
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp') =>
    ipcRenderer.invoke('get-app-path', name),
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // Claude AI operations
  claude: {
    generate: (request: GenerateRequest) => ipcRenderer.invoke('claude:generate', request),
    generateAgent: (request: AgentRequest) => ipcRenderer.invoke('claude:generate-agent', request),
    validateKey: (apiKey: string) => ipcRenderer.invoke('claude:validate-key', apiKey),
    cancelAgent: (runId: string) => ipcRenderer.invoke('claude:cancel-agent', runId),
    onAgentStep: (callback: (step: AgentStep) => void) => {
      const listener = (_: Electron.IpcRendererEvent, step: AgentStep) => callback(step)
      ipcRenderer.on('agent:step', listener)
      return () => ipcRenderer.removeListener('agent:step', listener)
    },
    removeAgentStepListener: () => {
      ipcRenderer.removeAllListeners('agent:step')
    },
    onWorkingCode: (callback: (data: { code: string; runId: string }) => void) => {
      const listener = (_: Electron.IpcRendererEvent, data: { code: string; runId: string }) => callback(data)
      ipcRenderer.on('agent:working-code', listener)
      return () => ipcRenderer.removeListener('agent:working-code', listener)
    },
    removeWorkingCodeListener: () => {
      ipcRenderer.removeAllListeners('agent:working-code')
    }
  },

  // Settings operations
  settings: {
    hasApiKey: () => ipcRenderer.invoke('settings:has-api-key'),
    setApiKey: (apiKey: string) => ipcRenderer.invoke('settings:set-api-key', apiKey),
    clearApiKey: () => ipcRenderer.invoke('settings:clear-api-key'),
    getExecutionTimeout: () => ipcRenderer.invoke('settings:get-execution-timeout'),
    setExecutionTimeout: (seconds: number) => ipcRenderer.invoke('settings:set-execution-timeout', seconds),
    getSelectedModel: () => ipcRenderer.invoke('settings:get-model') as Promise<string>,
    setSelectedModel: (model: string) => ipcRenderer.invoke('settings:set-model', model) as Promise<{ success: boolean }>,
    getAvailableModels: () => ipcRenderer.invoke('settings:get-available-models') as Promise<{ models: Array<{ id: string; name: string; provider: string; description?: string }>; default: string }>,
  },

  // BigQuery operations
  bigquery: {
    getAuthStatus: () => ipcRenderer.invoke('bigquery:get-auth-status'),
    connectWithOAuth: (projectId: string, connectionName?: string) => ipcRenderer.invoke('bigquery:connect-oauth', projectId, connectionName),
    selectServiceAccountFile: () => ipcRenderer.invoke('bigquery:select-service-account'),
    connectWithServiceAccount: (filePath: string, connectionName?: string) =>
      ipcRenderer.invoke('bigquery:connect-service-account', filePath, connectionName),
    switchConnection: (connectionId: string) => ipcRenderer.invoke('bigquery:switch-connection', connectionId),
    getSavedConnections: () => ipcRenderer.invoke('bigquery:get-saved-connections'),
    disconnect: () => ipcRenderer.invoke('bigquery:disconnect'),
    reconnect: (connectionId: string) => ipcRenderer.invoke('bigquery:reconnect', connectionId),
    updateServiceAccount: (connectionId: string, filePath: string, connectionName?: string) =>
      ipcRenderer.invoke('bigquery:update-service-account', connectionId, filePath, connectionName),
    cancelOAuth: () => ipcRenderer.invoke('bigquery:cancel-oauth'),
    startOAuthAndListProjects: () => ipcRenderer.invoke('bigquery:start-oauth-and-list-projects'),
    completeOAuthConnection: (projectId: string, connectionName?: string) =>
      ipcRenderer.invoke('bigquery:complete-oauth-connection', projectId, connectionName),
    cancelPendingOAuth: () => ipcRenderer.invoke('bigquery:cancel-pending-oauth'),
    getSchema: (options?: SchemaFetchOptions) => ipcRenderer.invoke('bigquery:get-schema', options),
    runQuery: (query: string) => ipcRenderer.invoke('bigquery:run-query', query)
  },

  // PostgreSQL operations
  postgresql: {
    connect: (params: { host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean; connectionName?: string; connectionString?: string }) =>
      ipcRenderer.invoke('postgresql:connect', params),
    switchConnection: (connectionId: string) => ipcRenderer.invoke('postgresql:switch-connection', connectionId),
    update: (connectionId: string, params: { host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean; connectionName?: string; connectionString?: string }) =>
      ipcRenderer.invoke('postgresql:update', connectionId, params),
    getConnectionDetails: (connectionId: string) => ipcRenderer.invoke('postgresql:get-connection-details', connectionId),
    getSchema: (options?: SchemaFetchOptions) => ipcRenderer.invoke('postgresql:get-schema', options),
    runQuery: (query: string) => ipcRenderer.invoke('postgresql:run-query', query),
    disconnect: () => ipcRenderer.invoke('postgresql:disconnect')
  },

  snowflake: {
    connect: (params: { account: string; warehouse: string; database: string; schema?: string; role?: string; username: string; password?: string; connectionName?: string }) =>
      ipcRenderer.invoke('snowflake:connect', params),
    switchConnection: (connectionId: string) => ipcRenderer.invoke('snowflake:switch-connection', connectionId),
    update: (connectionId: string, params: { account?: string; warehouse?: string; database?: string; schema?: string; role?: string; username?: string; password?: string; connectionName?: string }) =>
      ipcRenderer.invoke('snowflake:update', connectionId, params),
    getConnectionDetails: (connectionId: string) => ipcRenderer.invoke('snowflake:get-connection-details', connectionId),
    getSchema: (options?: SchemaFetchOptions) => ipcRenderer.invoke('snowflake:get-schema', options),
    runQuery: (query: string) => ipcRenderer.invoke('snowflake:run-query', query),
    disconnect: () => ipcRenderer.invoke('snowflake:disconnect')
  },

  redshift: {
    connect: (params: { host: string; port?: number; database: string; region: string; username: string; password?: string; connectionName?: string }) =>
      ipcRenderer.invoke('redshift:connect', params),
    switchConnection: (connectionId: string) => ipcRenderer.invoke('redshift:switch-connection', connectionId),
    update: (connectionId: string, params: { host?: string; port?: number; database?: string; region?: string; username?: string; password?: string; connectionName?: string }) =>
      ipcRenderer.invoke('redshift:update', connectionId, params),
    getConnectionDetails: (connectionId: string) => ipcRenderer.invoke('redshift:get-connection-details', connectionId),
    getSchema: (options?: SchemaFetchOptions) => ipcRenderer.invoke('redshift:get-schema', options),
    runQuery: (query: string) => ipcRenderer.invoke('redshift:run-query', query),
    disconnect: () => ipcRenderer.invoke('redshift:disconnect')
  },

  // NetSuite operations
  netsuite: {
    connect: (params: { accountId: string; consumerKey: string; consumerSecret: string; tokenId: string; tokenSecret: string; connectionName?: string }) =>
      ipcRenderer.invoke('netsuite:connect', params),
    switchConnection: (connectionId: string) => ipcRenderer.invoke('netsuite:switch-connection', connectionId),
    update: (connectionId: string, params: { accountId?: string; consumerKey?: string; consumerSecret?: string; tokenId?: string; tokenSecret?: string; connectionName?: string }) =>
      ipcRenderer.invoke('netsuite:update', connectionId, params),
    getConnectionDetails: (connectionId: string) => ipcRenderer.invoke('netsuite:get-connection-details', connectionId),
    getSchema: (options?: SchemaFetchOptions) => ipcRenderer.invoke('netsuite:get-schema', options),
    runQuery: (query: string) => ipcRenderer.invoke('netsuite:run-query', query),
    disconnect: () => ipcRenderer.invoke('netsuite:disconnect')
  },

  // ODBC operations
  odbc: {
    connect: (params: { connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username?: string; password?: string; connectionName?: string }) =>
      ipcRenderer.invoke('odbc:connect', params),
    switchConnection: (connectionId: string) => ipcRenderer.invoke('odbc:switch-connection', connectionId),
    update: (connectionId: string, params: { connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username?: string; password?: string; connectionName?: string }) =>
      ipcRenderer.invoke('odbc:update', connectionId, params),
    getConnectionDetails: (connectionId: string) => ipcRenderer.invoke('odbc:get-connection-details', connectionId),
    getSchema: (options?: SchemaFetchOptions) => ipcRenderer.invoke('odbc:get-schema', options),
    runQuery: (query: string) => ipcRenderer.invoke('odbc:run-query', query),
    disconnect: () => ipcRenderer.invoke('odbc:disconnect')
  },

  // Schema operations (for large warehouses)
  schema: {
    search: (query: string, limit?: number) => ipcRenderer.invoke('schema:search', query, limit),
    getTableDetails: (tableName: string) => ipcRenderer.invoke('schema:get-table-details', tableName),
    getTablePreview: (tableName: string, limit?: number) => ipcRenderer.invoke('schema:get-table-preview', tableName, limit),
    getCached: (connectionId: string) => ipcRenderer.invoke('schema:get-cached', connectionId),
    saveCache: (connectionId: string, schema: Schema) => ipcRenderer.invoke('schema:save-cache', connectionId, schema),
    clearCache: (connectionId: string) => ipcRenderer.invoke('schema:clear-cache', connectionId)
  },

  // Streamlit operations
  streamlit: {
    start: () => ipcRenderer.invoke('streamlit:start'),
    stop: () => ipcRenderer.invoke('streamlit:stop'),
    runCode: (code: string) => ipcRenderer.invoke('streamlit:run-code', code),
    onOutput: (callback: (output: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, output: string) => callback(output)
      ipcRenderer.on('streamlit:output', listener)
      return () => ipcRenderer.removeListener('streamlit:output', listener)
    },
    removeOutputListener: () => {
      ipcRenderer.removeAllListeners('streamlit:output')
    },
    onError: (callback: (error: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, error: string) => callback(error)
      ipcRenderer.on('streamlit:error', listener)
      return () => ipcRenderer.removeListener('streamlit:error', listener)
    },
    removeErrorListener: () => {
      ipcRenderer.removeAllListeners('streamlit:error')
    },
    onStarted: (callback: (data: { port: number }) => void) => {
      ipcRenderer.on('streamlit:started', (_, data) => callback(data))
    },
    removeStartedListener: () => {
      ipcRenderer.removeAllListeners('streamlit:started')
    },
    onExited: (callback: () => void) => {
      ipcRenderer.on('streamlit:exited', () => callback())
    },
    removeExitedListener: () => {
      ipcRenderer.removeAllListeners('streamlit:exited')
    }
  },

  // Dashboard operations
  dashboards: {
    list: () => ipcRenderer.invoke('dashboard:list'),
    save: (params: {
      name: string
      query: string
      code: string
      connectionId: string
      conversation?: ConversationMessage[]
      fileIds?: string[]
    }) => ipcRenderer.invoke('dashboard:save', params),
    load: (id: string) => ipcRenderer.invoke('dashboard:load', id),
    update: (params: {
      id: string
      name?: string
      code?: string
      conversation?: ConversationMessage[]
      fileIds?: string[]
      isFavorite?: boolean
    }) => ipcRenderer.invoke('dashboard:update', params),
    delete: (id: string) => ipcRenderer.invoke('dashboard:delete', id),
    export: (dashboardId: string) => ipcRenderer.invoke('dashboard:export', dashboardId),
    importFile: (filePath?: string) => ipcRenderer.invoke('dashboard:import', filePath),
    onOpenFile: (callback: (filePath: string) => void) => {
      ipcRenderer.on('open-file', (_event, filePath) => callback(filePath))
    },
    removeOpenFileListener: () => {
      ipcRenderer.removeAllListeners('open-file')
    },
    importConfirm: (params: { zipPath: string; connectionId: string; name?: string }) =>
      ipcRenderer.invoke('dashboard:import-confirm', params)
  },

  // Connection management operations
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    getActive: () => ipcRenderer.invoke('connections:get-active'),
    setActive: (connectionId: string | null) => ipcRenderer.invoke('connections:set-active', connectionId),
    getDefault: () => ipcRenderer.invoke('connections:get-default'),
    setDefault: (connectionId: string | null) => ipcRenderer.invoke('connections:set-default', connectionId),
    delete: (connectionId: string) => ipcRenderer.invoke('connections:delete', connectionId),
    update: (connectionId: string, updates: { name?: string; mcpServers?: Array<{ name: string; url: string; apiKey?: string }> }) => ipcRenderer.invoke('connections:update', connectionId, updates)
  },

  // File operations
  files: {
    upload: (filePath: string) => ipcRenderer.invoke('files:upload', filePath),
    list: () => ipcRenderer.invoke('files:list'),
    delete: (fileId: string) => ipcRenderer.invoke('files:delete', fileId),
    preview: (fileId: string, limit?: number) => ipcRenderer.invoke('files:preview', fileId, limit),
    selectFiles: () => ipcRenderer.invoke('files:select')
  },

  // Package installation status
  packages: {
    onStatus: (callback: (status: PackageStatusEvent) => void) => {
      ipcRenderer.on('packages:status', (_, status) => callback(status))
    },
    removeStatusListener: () => {
      ipcRenderer.removeAllListeners('packages:status')
    }
  },

  // Auto-updater operations
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback: (status: UpdateStatus) => void) => {
      ipcRenderer.on('updater:status', (_, status) => callback(status))
    }
  },

  // Logging (forwarded to main process electron-log)
  log: {
    info: (...args: unknown[]) => ipcRenderer.send('log:info', ...args),
    warn: (...args: unknown[]) => ipcRenderer.send('log:warn', ...args),
    error: (...args: unknown[]) => ipcRenderer.send('log:error', ...args),
    debug: (...args: unknown[]) => ipcRenderer.send('log:debug', ...args),
  }
} satisfies ElectronAPI)

// Type declaration for window.electron
declare global {
  interface Window {
    electron: ElectronAPI
  }
}
