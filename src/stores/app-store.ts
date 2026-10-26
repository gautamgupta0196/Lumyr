import { create } from 'zustand'

export interface Column {
  name: string
  type: string
  description?: string
}

export interface Table {
  id: string
  columns: Column[]
}

export interface Dataset {
  id: string
  tables: Table[]
}

export interface Schema {
  projectId: string
  datasets: Dataset[]
}

export interface ConnectionState {
  isConnected: boolean
  projectId: string | null
  authType: 'oauth' | 'service_account' | 'password' | null
  connectionId: string | null
  connectionName: string | null
  error: string | null
}

export interface StreamlitState {
  isRunning: boolean
  port: number | null
  error: string | null
  output: string[]
  stopped: boolean
}

export interface GenerationState {
  isGenerating: boolean
  generatedCode: string | null
  error: string | null
}

// Conversation message for chat history
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  code?: string
  error?: string
  fileIds?: string[] // File attachments for user messages
  quickActions?: string[] // Clickable action buttons shown below the message
}

// Saved dashboard
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

// Saved connection
export interface SavedConnection {
  id: string
  name: string
  type?: DataSourceType             // defaults to 'bigquery'
  projectId?: string                // BigQuery
  authType?: 'oauth' | 'service_account' | 'password'
  host?: string                     // PostgreSQL / Redshift
  port?: number                     // PostgreSQL / Redshift
  database?: string                 // PostgreSQL / Snowflake / Redshift
  ssl?: boolean                     // PostgreSQL
  account?: string                  // Snowflake
  warehouse?: string                // Snowflake
  schema?: string                   // Snowflake
  role?: string                     // Snowflake
  region?: string                   // Redshift
  clusterId?: string                // Redshift
  accountId?: string                // NetSuite
  connectionString?: string         // ODBC
  dsn?: string                      // ODBC
  driver?: string                   // ODBC
  mcpServers?: Array<{             // MCP servers for this connection
    name: string
    url: string
    apiKey?: string
  }>
  customInstructions?: string       // Custom instructions injected into Claude's system prompt
  createdAt: number
  lastUsed: number
  isDefault?: boolean
}

// Data source types
export type DataSourceType = 'bigquery' | 'postgresql' | 'snowflake' | 'redshift' | 'netsuite' | 'odbc' | 'file'
export type FileFormat = 'csv' | 'xlsx' | 'xls' | 'pdf'

// Uploaded file
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

// Model option for AI model selector
export interface ModelOption {
  id: string          // e.g. "anthropic/claude-opus-4-6"
  name: string        // e.g. "Claude Opus 4"
  provider: string    // e.g. "anthropic"
  description?: string
}

export interface AgentState {
  runId: string | null
  isRunning: boolean
  steps: AgentStep[]
  selectedTables: string[]
  currentPhase: AgentPhase
  errorRetries: number
  maxRetries: number
}

interface AppState {
  // Connection
  connection: ConnectionState
  setConnection: (connection: Partial<ConnectionState>) => void

  // Schema
  schema: Schema | null
  isLoadingSchema: boolean
  setSchema: (schema: Schema | null) => void
  setLoadingSchema: (loading: boolean) => void

  // Selected items
  selectedDataset: string | null
  selectedTable: string | null
  setSelectedDataset: (datasetId: string | null) => void
  setSelectedTable: (tableId: string | null) => void

  // Query
  query: string
  setQuery: (query: string) => void

  // Generation
  generation: GenerationState
  setGeneration: (generation: Partial<GenerationState>) => void

  // Streamlit
  streamlit: StreamlitState
  setStreamlit: (streamlit: Partial<StreamlitState>) => void
  addStreamlitOutput: (output: string) => void

  // Conversation (chat history)
  conversation: ConversationMessage[]
  addUserMessage: (content: string, fileIds?: string[]) => string // Returns message ID
  addAssistantMessage: (content: string, code?: string, error?: string, quickActions?: string[]) => string // Returns message ID
  clearConversation: () => void
  setConversation: (conversation: ConversationMessage[]) => void

  // Saved dashboards
  savedDashboards: SavedDashboard[]
  activeDashboardId: string | null
  setSavedDashboards: (dashboards: SavedDashboard[]) => void
  setActiveDashboard: (id: string | null) => void
  loadSavedDashboards: () => Promise<void>

  // Saved connections
  savedConnections: SavedConnection[]
  setSavedConnections: (connections: SavedConnection[]) => void
  loadSavedConnections: () => Promise<void>

  // Dashboard-scoped files
  dashboardFiles: UploadedFile[]
  isUploadingFile: boolean
  setDashboardFiles: (files: UploadedFile[]) => void
  addDashboardFile: (file: UploadedFile) => void
  removeDashboardFile: (fileId: string) => void
  setIsUploadingFile: (isUploading: boolean) => void
  loadDashboardFilesByIds: (fileIds: string[]) => Promise<void>

  // Active data source type
  activeDataSourceType: DataSourceType
  setActiveDataSourceType: (type: DataSourceType) => void

  // Agent state
  agentState: AgentState
  startAgentRun: (runId: string) => void
  addAgentStep: (step: AgentStep) => void
  setAgentPhase: (phase: AgentPhase) => void
  setAgentRunning: (isRunning: boolean) => void
  resetAgentState: () => void

  // Model selection
  selectedModel: string
  availableModels: ModelOption[]
  setSelectedModel: (model: string) => void
  setAvailableModels: (models: ModelOption[]) => void
  loadModelSettings: () => Promise<void>

  // Dashboard loading overlay
  dashboardLoadingState: {
    isLoading: boolean
    connectionName: string | null
    step: 'switching_connection' | 'loading_schema' | 'loading_dashboard' | 'starting_streamlit' | null
    error: string | null
  } | null
  setDashboardLoading: (state: AppState['dashboardLoadingState']) => void

  // Page-based navigation
  currentPage: 'connections' | 'dashboards' | 'create' | 'dashboard-view' | 'dashboard-edit'
  setCurrentPage: (page: AppState['currentPage']) => void
  editPanelOpen: boolean
  setEditPanelOpen: (open: boolean) => void

  // Reset
  reset: () => void
}

// Generate unique IDs
const generateId = () => crypto.randomUUID()

const initialState = {
  connection: {
    isConnected: false,
    projectId: null,
    authType: null,
    connectionId: null,
    connectionName: null,
    error: null
  } as ConnectionState,
  schema: null,
  isLoadingSchema: false,
  selectedDataset: null,
  selectedTable: null,
  query: '',
  generation: {
    isGenerating: false,
    generatedCode: null,
    error: null
  },
  streamlit: {
    isRunning: false,
    port: null,
    error: null,
    output: [],
    stopped: false
  },
  conversation: [] as ConversationMessage[],
  savedDashboards: [] as SavedDashboard[],
  activeDashboardId: null as string | null,
  savedConnections: [] as SavedConnection[],
  dashboardFiles: [] as UploadedFile[],
  isUploadingFile: false,
  activeDataSourceType: 'bigquery' as DataSourceType,
  agentState: {
    runId: null as string | null,
    isRunning: false,
    steps: [],
    selectedTables: [],
    currentPhase: 'exploring' as AgentPhase,
    errorRetries: 0,
    maxRetries: 10
  },
  selectedModel: 'auto',
  availableModels: [] as ModelOption[],
  dashboardLoadingState: null as AppState['dashboardLoadingState'],
  currentPage: 'dashboards' as AppState['currentPage'],
  editPanelOpen: true,
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setConnection: (connection) =>
    set((state) => ({
      connection: { ...state.connection, ...connection }
    })),

  setSchema: (schema) => set({ schema }),
  setLoadingSchema: (isLoadingSchema) => set({ isLoadingSchema }),

  setSelectedDataset: (selectedDataset) =>
    set({ selectedDataset, selectedTable: null }),
  setSelectedTable: (selectedTable) => set({ selectedTable }),

  setQuery: (query) => set({ query }),

  setGeneration: (generation) =>
    set((state) => ({
      generation: { ...state.generation, ...generation }
    })),

  setStreamlit: (streamlit) =>
    set((state) => ({
      streamlit: {
        ...state.streamlit,
        ...streamlit,
        // Clear stopped when streamlit starts running
        ...(streamlit.isRunning ? { stopped: false } : {})
      }
    })),

  addStreamlitOutput: (output) =>
    set((state) => ({
      streamlit: {
        ...state.streamlit,
        output: [...state.streamlit.output, output].slice(-100) // Keep last 100 lines
      }
    })),

  // Conversation actions
  addUserMessage: (content, fileIds) => {
    const id = generateId()
    const message: ConversationMessage = {
      id,
      role: 'user',
      content,
      timestamp: Date.now(),
      fileIds: fileIds && fileIds.length > 0 ? fileIds : undefined
    }
    set((state) => ({
      conversation: [...state.conversation, message]
    }))
    return id
  },

  addAssistantMessage: (content, code, error, quickActions) => {
    const id = generateId()
    const message: ConversationMessage = {
      id,
      role: 'assistant',
      content,
      timestamp: Date.now(),
      code,
      error,
      quickActions
    }
    set((state) => ({
      conversation: [...state.conversation, message]
    }))
    return id
  },

  clearConversation: () => set({ conversation: [] }),

  setConversation: (conversation) => set({ conversation }),

  // Dashboard actions
  setSavedDashboards: (savedDashboards) => set({ savedDashboards }),

  setActiveDashboard: (activeDashboardId) => set({ activeDashboardId }),

  loadSavedDashboards: async () => {
    try {
      const result = await window.electron.dashboards.list()
      if (result.success) {
        set({ savedDashboards: result.dashboards })
      }
    } catch (error) {
      console.error('Failed to load dashboards:', error)
    }
  },

  // Connection actions
  setSavedConnections: (savedConnections) => set({ savedConnections }),

  loadSavedConnections: async () => {
    try {
      const result = await window.electron.connections.list()
      if (result.success) {
        set({ savedConnections: result.connections })
      }
    } catch (error) {
      console.error('Failed to load connections:', error)
    }
  },

  // Dashboard-scoped file actions
  setDashboardFiles: (dashboardFiles) => set({ dashboardFiles }),

  addDashboardFile: (file) =>
    set((state) => ({
      dashboardFiles: [...state.dashboardFiles, file]
    })),

  removeDashboardFile: (fileId) =>
    set((state) => ({
      dashboardFiles: state.dashboardFiles.filter(f => f.id !== fileId)
    })),

  setIsUploadingFile: (isUploadingFile) => set({ isUploadingFile }),

  loadDashboardFilesByIds: async (fileIds: string[]) => {
    if (fileIds.length === 0) {
      set({ dashboardFiles: [] })
      return
    }
    try {
      const result = await window.electron.files.list()
      if (result.success) {
        const idSet = new Set(fileIds)
        set({ dashboardFiles: result.files.filter(f => idSet.has(f.id)) })
      }
    } catch (error) {
      console.error('Failed to load dashboard files:', error)
    }
  },

  // Data source type
  setActiveDataSourceType: (activeDataSourceType) => set({ activeDataSourceType }),

  // Agent actions
  startAgentRun: (runId) =>
    set({
      agentState: {
        runId,
        isRunning: true,
        steps: [],
        selectedTables: [],
        currentPhase: 'exploring',
        errorRetries: 0,
        maxRetries: 10
      }
    }),

  addAgentStep: (step) =>
    set((state) => {
      if (!state.agentState.runId || step.runId !== state.agentState.runId) {
        return state
      }

      // Infer phase from tool calls
      let currentPhase = state.agentState.currentPhase
      let selectedTables = state.agentState.selectedTables
      let errorRetries = state.agentState.errorRetries

      if (step.type === 'thinking') {
        // Backend sends thinking steps with phase hints
        if (step.thinking === '__phase:polishing') {
          currentPhase = 'polishing'
        } else if (step.thinking === '__phase:verifying') {
          currentPhase = 'verifying'
        }
      } else if (step.type === 'tool_call') {
        // Tool names are normalized by the main process (electron/opencode/provider.ts).
        if (step.toolName === 'get_table_schema') {
          const input = step.toolInput as { tables?: string[] }
          if (input?.tables) {
            selectedTables = input.tables
          }
        } else if (step.toolName === 'write_dashboard') {
          // list_tables, get_table_schema and run_sql (query checks) all happen
          // before this and stay in 'exploring'; phases must only move forward.
          currentPhase = 'generating'
        }
      } else if (step.type === 'retry') {
        errorRetries = step.retryCount || errorRetries + 1
      } else if (step.type === 'complete') {
        currentPhase = 'complete'
      } else if (step.type === 'error') {
        currentPhase = 'error'
      }

      return {
        agentState: {
          ...state.agentState,
          steps: [...state.agentState.steps, step],
          currentPhase,
          selectedTables,
          errorRetries
        }
      }
    }),

  setAgentPhase: (phase) =>
    set((state) => ({
      agentState: { ...state.agentState, currentPhase: phase }
    })),

  setAgentRunning: (isRunning) =>
    set((state) => ({
      agentState: { ...state.agentState, isRunning }
    })),

  resetAgentState: () =>
    set({
      agentState: {
        runId: null,
        isRunning: false,
        steps: [],
        selectedTables: [],
        currentPhase: 'exploring',
        errorRetries: 0,
        maxRetries: 10
      }
    }),

  // Model selection
  setSelectedModel: (model) => {
    set({ selectedModel: model })
    window.electron.settings.setSelectedModel(model)
  },

  setAvailableModels: (availableModels) => set({ availableModels }),

  loadModelSettings: async () => {
    try {
      const [model, result] = await Promise.all([
        window.electron.settings.getSelectedModel(),
        window.electron.settings.getAvailableModels(),
      ])
      set({
        selectedModel: model || 'auto',
        availableModels: result.models || [],
      })
    } catch (error) {
      console.error('Failed to load model settings:', error)
    }
  },

  setDashboardLoading: (dashboardLoadingState) => set({ dashboardLoadingState }),

  setCurrentPage: (currentPage) =>
    set({
      currentPage,
      editPanelOpen: currentPage === 'dashboard-edit',
    }),
  setEditPanelOpen: (editPanelOpen) => set({ editPanelOpen }),

  reset: () => set(initialState)
}))
