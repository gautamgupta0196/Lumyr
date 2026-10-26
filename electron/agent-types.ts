// Agent step types for tracking progress
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

export interface AgentState {
  isRunning: boolean
  steps: AgentStep[]
  selectedTables: string[]
  currentPhase: AgentPhase
  errorRetries: number
  maxRetries: number
}

// Tool definitions for Claude API
export interface ListTablesResult {
  tables: {
    fullName: string
    columnCount: number
  }[]
}

export interface GetTableSchemaInput {
  tables: string[]
}

export interface GetTableSchemaResult {
  schemas: {
    tableName: string
    columns: {
      name: string
      type: string
      description?: string
    }[]
  }[]
}

export interface ExecuteCodeInput {
  code: string
}

export interface ExecuteCodeResult {
  success: boolean
  error?: string
  port?: number
}

export interface SubmitDashboardInput {
  code: string
  summary: string
}

export interface SubmitDashboardResult {
  success: boolean
  message: string
}

// Agent request/response types
export interface AgentRequest {
  runId?: string
  query: string
  schema: {
    projectId: string
    datasets: {
      id: string
      tables: {
        id: string
        columns: {
          name: string
          type: string
          description?: string
        }[]
      }[]
    }[]
  }
  conversationHistory?: {
    id: string
    role: 'user' | 'assistant'
    content: string
    timestamp: number
    code?: string
  }[]
  currentCode?: string
  executionTimeoutSeconds?: number  // Optional, defaults to 600
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

// Initial agent state
export function createInitialAgentState(): AgentState {
  return {
    isRunning: false,
    steps: [],
    selectedTables: [],
    currentPhase: 'exploring',
    errorRetries: 0,
    maxRetries: 3
  }
}

// ── Data-access contracts ───────────────────────────────────────
// Shared by the IPC layer and the opencode MCP bridge.

export interface Schema {
  projectId: string
  datasets: {
    id: string
    tables: {
      id: string
      columns: {
        name: string
        type: string
        description?: string
      }[]
    }[]
  }[]
}

/** Fetch full column detail for one table (schemas may be tables-only). */
export type GetTableDetailsFn = (
  tableName: string
) => Promise<{ columns: { name: string; type: string; description?: string }[] } | null>

/** Execute a read-only query against the active connection. */
export type RunQueryFn = (
  sql: string
) => Promise<{ success: boolean; error?: string; data?: unknown[] }>
