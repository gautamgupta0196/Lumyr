import { useEffect, useState } from 'react'
import { useAppStore, type AgentStep, type AgentPhase } from '../stores/app-store'
import { cn } from '../lib/utils'
import { getCollapsedStatusLabel } from './agent-progress-utils'
import {
  Brain,
  Search,
  Code,
  Play,
  CheckCircle2,
  Check,
  XCircle,
  RefreshCw,
  Table,
  Sparkles,
  Loader2,
  Square,
  ChevronDown
} from 'lucide-react'

// Phase configuration. These are the stages the opencode run actually passes
// through: reading the data (tables, schemas, query checks), writing app.py,
// done. Lumyr launches the dashboard after the run completes.
const PHASES: { phase: AgentPhase; label: string; icon: typeof Brain }[] = [
  { phase: 'exploring', label: 'Reading your data', icon: Search },
  { phase: 'generating', label: 'Writing the dashboard', icon: Code },
  { phase: 'complete', label: 'Done', icon: CheckCircle2 }
]

// Get step icon based on type
function getStepIcon(step: AgentStep) {
  switch (step.type) {
    case 'thinking':
      return <Brain className="h-3.5 w-3.5" />
    case 'tool_call':
      if (step.toolName === 'list_tables') return <Table className="h-3.5 w-3.5" />
      if (step.toolName === 'get_table_schema') return <Search className="h-3.5 w-3.5" />
      if (step.toolName === 'execute_code') return <Play className="h-3.5 w-3.5" />
      if (step.toolName === 'submit_dashboard') return <Sparkles className="h-3.5 w-3.5" />
      return <Code className="h-3.5 w-3.5" />
    case 'tool_result':
      return step.isError ? (
        <XCircle className="h-3.5 w-3.5 text-red-500" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      )
    case 'retry':
      return <RefreshCw className="h-3.5 w-3.5 text-amber-500" />
    case 'error':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />
    case 'complete':
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    default:
      return <Brain className="h-3.5 w-3.5" />
  }
}

// Get step description
function getStepDescription(step: AgentStep): string {
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
      if (step.toolName === 'execute_code') return 'Executing code...'
      if (step.toolName === 'submit_dashboard') return 'Submitting dashboard...'
      return `Calling ${step.toolName}...`
    case 'tool_result':
      if (step.isError) {
        return `Error: ${truncate(step.toolResult as string, 50)}`
      }
      if (step.toolName === 'list_tables') {
        const result = step.toolResult as { tables?: { fullName: string }[] }
        return `Found ${result?.tables?.length || 0} tables`
      }
      if (step.toolName === 'execute_code') {
        const result = step.toolResult as { success?: boolean }
        return result?.success ? 'Code executed successfully' : 'Execution failed'
      }
      return 'Completed'
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

function truncate(text: string | unknown, maxLength: number): string {
  if (typeof text !== 'string') return ''
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
}

export function AgentProgress() {
  const { agentState } = useAppStore()
  const { runId, isRunning, steps, selectedTables, currentPhase, errorRetries, maxRetries } = agentState

  if (!isRunning && steps.length === 0) {
    return null
  }

  const [expanded, setExpanded] = useState(false)

  // Reset expanded state on new run
  useEffect(() => {
    setExpanded(false)
  }, [runId])

  const isComplete = currentPhase === 'complete'
  const isError = currentPhase === 'error'

  // Complete state — compact green bar
  if (isComplete) {
    return (
      <div className="border border-emerald-500/15 rounded-lg bg-emerald-500/5 px-3.5 py-3 flex items-center justify-between scale-in">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[13px] font-semibold">Dashboard ready</p>
            <p className="text-[11px] text-muted-foreground">Opening dashboard...</p>
          </div>
        </div>
        <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
          Complete
        </span>
      </div>
    )
  }

  const inferPhaseIndexFromSteps = (): number => {
    for (let i = steps.length - 1; i >= 0; i--) {
      const step = steps[i]
      if (step.type === 'complete') return PHASES.findIndex(p => p.phase === 'complete')
      if (step.type === 'tool_call' && step.toolName === 'write_dashboard') {
        return PHASES.findIndex(p => p.phase === 'generating')
      }
    }
    return 0
  }

  const currentPhaseIndex =
    currentPhase === 'error'
      ? inferPhaseIndexFromSteps()
      : Math.max(0, PHASES.findIndex(p => p.phase === currentPhase))

  const recentSteps = steps.slice(-5)

  // Current status label for collapsed view
  const statusLabel = getCollapsedStatusLabel(steps, currentPhase, isError)

  return (
    <div className="border rounded-lg bg-muted/20 scale-in">
      {/* Collapsed single-line view */}
      <div
        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Spinner / Error icon */}
        {isRunning && !isError ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
        ) : isError ? (
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        )}

        {/* Status text */}
        <span className={cn(
          'text-[12px] font-medium truncate flex-1',
          isError ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
        )}>
          {statusLabel}
        </span>

        {/* Right side: retry badge + stop button + chevron */}
        <div className="flex items-center gap-1.5 shrink-0">
          {errorRetries > 0 && (
            <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/15 font-medium">
              Retry {errorRetries}/{maxRetries}
            </span>
          )}
          {isRunning && !isComplete && runId && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                window.electron.claude.cancelAgent(runId)
              }}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-border/50 text-muted-foreground/60 font-medium hover:text-foreground hover:border-border transition-colors"
              title="Stop generation"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
              Stop
            </button>
          )}
          <ChevronDown className={cn(
            'h-3.5 w-3.5 text-muted-foreground/40 transition-transform duration-200',
            expanded && 'rotate-180'
          )} />
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-border/40 pt-3">
          {/* Phase list */}
          <div className="space-y-1">
            {PHASES.map((phase, index) => {
              const Icon = phase.icon
              const isActive = index === currentPhaseIndex && !isComplete
              const isDone = isComplete || index < currentPhaseIndex
              const isItemError = isError && index === currentPhaseIndex

              const indicator = isDone ? (
                <Check className="h-3 w-3" />
              ) : isItemError ? (
                <XCircle className="h-3 w-3" />
              ) : isActive ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Icon className="h-3 w-3" />
              )

              return (
                <div key={phase.phase} className="flex gap-2.5">
                  <div className="relative flex flex-col items-center">
                    <div
                      className={cn(
                        'h-6 w-6 rounded-md flex items-center justify-center border transition-all duration-200',
                        isDone && 'bg-emerald-500/12 border-emerald-500/20 text-emerald-600 dark:text-emerald-400',
                        isItemError && 'bg-red-500/12 border-red-500/20 text-red-600 dark:text-red-400',
                        isActive && !isItemError && 'bg-primary/10 border-primary/20 text-primary phase-active-pulse',
                        !isDone && !isActive && !isItemError && 'bg-muted/40 border-border/50 text-muted-foreground/40'
                      )}
                      aria-label={phase.label}
                    >
                      {indicator}
                    </div>
                    {index < PHASES.length - 1 && (
                      <div
                        className={cn(
                          'w-px flex-1 mt-0.5 transition-colors duration-300',
                          isDone ? 'bg-emerald-500/20' : 'bg-border/40'
                        )}
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5 pb-1">
                    <div className="flex items-center justify-between gap-3">
                      <p
                        className={cn(
                          'text-[12px] font-medium truncate transition-colors',
                          isDone && 'text-foreground',
                          isActive && 'text-foreground',
                          isItemError && 'text-red-600 dark:text-red-400',
                          !isDone && !isActive && !isItemError && 'text-muted-foreground/50'
                        )}
                      >
                        {phase.label}
                      </p>
                      <span
                        className={cn(
                          'shrink-0 text-[9px] px-1.5 py-px rounded font-medium uppercase tracking-wider',
                          isDone && 'text-emerald-600 dark:text-emerald-400',
                          isItemError && 'text-red-600 dark:text-red-400',
                          isActive && !isItemError && 'text-primary',
                          !isDone && !isActive && !isItemError && 'text-muted-foreground/30'
                        )}
                      >
                        {isDone ? 'Done' : isItemError ? 'Failed' : isActive ? 'Active' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected Tables */}
          {selectedTables.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">Tables</span>
              {selectedTables.map(table => (
                <span
                  key={table}
                  className="text-[10px] bg-primary/8 text-primary/80 px-1.5 py-px rounded font-medium"
                >
                  {table.split('.').pop()}
                </span>
              ))}
            </div>
          )}

          {/* Activity log */}
          {recentSteps.length > 0 && (
            <div className="rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 space-y-1">
              <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">Activity</span>
              {recentSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-start gap-1.5 text-[11px] min-w-0',
                    index < recentSteps.length - 1 ? 'text-muted-foreground/50' : 'text-muted-foreground'
                  )}
                >
                  <div className="mt-0.5">{getStepIcon(step)}</div>
                  <span className="flex-1 leading-relaxed break-words overflow-hidden line-clamp-2">{getStepDescription(step)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
