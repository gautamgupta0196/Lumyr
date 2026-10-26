import type { AgentPhase, AgentStep } from '@/stores/app-store'

const PHASE_LABELS: Record<Exclude<AgentPhase, 'error'>, string> = {
  exploring: 'Reading your data',
  generating: 'Writing the dashboard',
  testing: 'Testing',
  polishing: 'Polishing',
  verifying: 'Verifying final load',
  complete: 'Done'
}

function truncate(text: string | unknown, maxLength: number): string {
  if (typeof text !== 'string') return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

// opencode's built-in tools, in words a user recognizes.
const TOOL_LABELS: Record<string, string> = {
  bash: 'Running a command...',
  read: 'Reading a file...',
  write: 'Writing a file...',
  edit: 'Editing a file...',
  glob: 'Looking for files...',
  grep: 'Searching files...',
  list: 'Listing files...',
  todowrite: 'Planning the next steps...',
  todoread: 'Reviewing the plan...',
  webfetch: 'Reading a web page...',
}

export function getStepDescription(step: AgentStep): string {
  switch (step.type) {
    case 'thinking':
      return step.thinking || 'Thinking...'
    case 'tool_call':
      if (step.toolName === 'list_tables') return 'Listing available tables...'
      if (step.toolName === 'get_table_schema') {
        const input = step.toolInput as { tables?: string[] }
        const tables = input?.tables?.map(t => t.split('.').pop()).join(', ') || ''
        return `Getting schema for: ${tables}`
      }
      if (step.toolName === 'run_sql') return 'Checking a query against your data...'
      if (step.toolName === 'write_dashboard') return 'Writing the dashboard...'
      return TOOL_LABELS[step.toolName ?? ''] ?? `Using ${step.toolName}...`
    case 'tool_result':
      if (step.isError) {
        return `Error: ${truncate(String(step.toolResult ?? step.errorMessage ?? 'failed'), 50)}`
      }
      if (step.toolName === 'list_tables') {
        const result = step.toolResult as { tables?: unknown[] }
        return `Found ${result?.tables?.length ?? 0} tables`
      }
      if (step.toolName === 'get_table_schema') {
        const count = Object.keys((step.toolResult as object) ?? {}).length
        return `Read ${count} ${count === 1 ? 'schema' : 'schemas'}`
      }
      if (step.toolName === 'run_sql') {
        const result = step.toolResult as { rowCount?: number }
        return typeof result?.rowCount === 'number'
          ? `Query returned ${result.rowCount} ${result.rowCount === 1 ? 'row' : 'rows'}`
          : 'Query checked'
      }
      if (step.toolName === 'write_dashboard') return 'Dashboard written'
      return 'Done'
    case 'retry':
      return `Retry ${step.retryCount}/10: Fixing error...`
    case 'error':
      return step.errorMessage || 'An error occurred'
    case 'complete':
      return step.thinking || 'Dashboard ready!'
    default:
      return ''
  }
}

function getLatestStepLabel(steps: AgentStep[], currentPhase: AgentPhase): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.type === 'thinking' && step.thinking?.startsWith('__phase:')) continue
    if (step.type === 'tool_result' && !step.isError) continue
    const desc = getStepDescription(step)
    if (desc) return desc
  }
  return getPhaseLabel(currentPhase)
}

export function getPhaseLabel(phase: AgentPhase): string {
  if (phase === 'error') return 'Working...'
  return PHASE_LABELS[phase] || 'Working...'
}

export function getCollapsedStatusLabel(steps: AgentStep[], currentPhase: AgentPhase, isError: boolean): string {
  if (isError) return 'Generation failed'


  return getLatestStepLabel(steps, currentPhase)
}
