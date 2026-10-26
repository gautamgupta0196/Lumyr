import type { Schema, ConversationMessage, SavedDashboard, SavedConnection, Column, UploadedFile } from '@/stores/app-store'

// Schema fetch options (for large warehouses)
export interface SchemaFetchOptions {
  maxDatasets?: number
  maxTablesPerDataset?: number
  datasetFilter?: string[]
  searchQuery?: string
  offset?: number
  mode?: 'tables_only' | 'full' // 'tables_only' skips column fetching for fast initial load
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
  mcpServers?: Array<{ name: string; url: string; apiKey?: string }>
  customInstructions?: string
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
  quickActions?: string[]
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

export interface ElectronAPI {
  // App utilities
  getAppPath: (name: 'home' | 'appData' | 'userData' | 'temp') => Promise<string>
  getPlatform: () => Promise<NodeJS.Platform>
  openExternal: (url: string) => Promise<void>

  // Claude AI operations
  claude: {
    generate: (request: GenerateRequest) => Promise<GenerateResult>
    generateAgent: (request: AgentRequest) => Promise<AgentResult>
    validateKey: (apiKey: string) => Promise<boolean>
    cancelAgent: (runId: string) => Promise<{ success: boolean }>
    onAgentStep: (callback: (step: AgentStep) => void) => () => void
    removeAgentStepListener: () => void
    onWorkingCode: (callback: (data: { code: string; runId: string }) => void) => () => void
    removeWorkingCodeListener: () => void
  }

  // Settings operations
  settings: {
    hasApiKey: () => Promise<boolean>
    setApiKey: (apiKey: string) => Promise<{ success: boolean }>
    clearApiKey: () => Promise<{ success: boolean }>
    getExecutionTimeout: () => Promise<number>
    setExecutionTimeout: (seconds: number) => Promise<{ success: boolean }>
    getSelectedModel: () => Promise<string | null>
    setSelectedModel: (model: string) => Promise<{ success: boolean }>
    getAvailableModels: () => Promise<{ models: Array<{ id: string; name: string; provider: string; description?: string }> }>
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
      fileIds?: string[]
    }) => Promise<{ success: boolean; error?: string; dashboard?: SavedDashboard }>
    load: (id: string) => Promise<{ success: boolean; error?: string; dashboard?: SavedDashboard; code?: string }>
    update: (params: {
      id: string
      name?: string
      code?: string
      conversation?: ConversationMessage[]
      fileIds?: string[]
      isFavorite?: boolean
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
    update: (connectionId: string, updates: { name?: string; mcpServers?: Array<{ name: string; url: string; apiKey?: string }>; customInstructions?: string }) => Promise<{ success: boolean; error?: string }>
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

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
