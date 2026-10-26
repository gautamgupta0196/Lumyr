import { useAppStore } from '@/stores/app-store'
import { useGeneration } from '@/hooks/useGeneration'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import {
  Send,
  Loader2,
  Paperclip,
  X,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
  Square,
  ChevronDown,
  Brain,
  Check,
  ClipboardList,
  Zap,
  BarChart3,
  Pencil,
} from 'lucide-react'

const EXAMPLE_QUERIES = [
  'Revenue by quarter, stacked by product',
  'Top 10 customers by lifetime value',
  'Daily active users over the past 30 days',
  'Churn rate by cohort',
]

const FEATURES = [
  { icon: Zap, label: 'Auto-generates SQL' },
  { icon: BarChart3, label: 'Best chart type suggested' },
  { icon: Pencil, label: 'Editable after creation' },
]

export function CreateDashboardPage() {
  const savedDashboards = useAppStore((s) => s.savedDashboards)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const {
    query,
    setQuery,
    generation,
    connection,
    schema,
    isLoadingSchema,
    agentState,
    selectedModel,
    setSelectedModel,
    availableModels,
    pendingAttachments,
    responseMode,
    setResponseMode,
    modelMenuOpen,
    setModelMenuOpen,
    modelMenuRef,
    handleGenerate,
    handleKeyDown,
    handleAttachFiles,
    handleRemoveAttachment,
    getModelDisplayName,
  } = useGeneration({
    onGenerationStart: () => {
      setCurrentPage('dashboard-edit')
    },
    onDashboardReady: () => {
      setCurrentPage('dashboard-edit')
    },
  })

  const isFirstTime = savedDashboards.length === 0

  return (
    <div className="h-full flex flex-col items-center justify-center bg-background px-8 relative overflow-hidden">
      {/* Background pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(hsl(var(--foreground)) 0.5px, transparent 0.5px)`,
          backgroundSize: '24px 24px'
        }}
      />

      <div className="relative w-full max-w-2xl stagger-children">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 flex justify-center">
            <svg viewBox="0 0 300 300" className="w-20 h-20">
              <path d="M150 30 L50 240 L150 195 Z" fill="hsl(var(--muted-foreground) / 0.2)" />
              <path d="M150 30 L250 240 L150 195 Z" fill="hsl(var(--muted-foreground) / 0.15)" />
              <path d="M50 240 L150 195 L250 240 L150 275 Z" fill="hsl(var(--muted-foreground) / 0.1)" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">
            {isFirstTime ? 'Create your first dashboard' : 'New Dashboard'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isFirstTime
              ? 'Describe what you want to see in natural language. Lumyr will query your data and build the visualization.'
              : 'Describe what you want to see in natural language.'
            }
          </p>
        </div>

        {/* Input */}
        <div className="rounded-2xl border bg-card shadow-sm p-2 mb-4">
          <Textarea
            placeholder="Show me monthly revenue trends by region..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[48px] max-h-[120px] resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent text-[14px] px-3 py-2.5"
            disabled={!connection.isConnected || generation.isGenerating}
          />

          {/* Pending file attachments */}
          {pendingAttachments.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {pendingAttachments.map(file => (
                <span
                  key={file.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-[11px] border border-border/50"
                >
                  <Paperclip className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="truncate max-w-[100px]">{file.name}</span>
                  <button onClick={() => handleRemoveAttachment(file.id)} className="hover:text-destructive ml-0.5">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Controls row */}
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="flex items-center gap-2">
              {/* Attach */}
              <Button
                variant="ghost"
                onClick={handleAttachFiles}
                disabled={generation.isGenerating}
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-muted-foreground"
                title="Attach files"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </Button>

              {/* Mode label + toggles */}
              <span className="text-[11px] text-muted-foreground/60 font-medium">Mode:</span>
              <div className="flex items-center h-7 rounded-md border border-border/50 bg-muted/30 p-0.5">
                {([
                  { mode: 'auto' as const, icon: Sparkles, label: 'Auto' },
                  { mode: 'plan' as const, icon: ClipboardList, label: 'Plan' },
                  { mode: 'answer' as const, icon: MessageSquareText, label: 'Answer' },
                  { mode: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
                ]).map(({ mode, icon: Icon, label }) => (
                  <div key={mode} className="relative group">
                    <button
                      onClick={() => setResponseMode(mode)}
                      className={cn(
                        'flex items-center gap-1 h-6 px-2 rounded text-[11px] font-medium transition-all duration-150',
                        responseMode === mode
                          ? 'bg-background shadow-sm text-foreground border border-border/50'
                          : 'text-muted-foreground/60 hover:text-muted-foreground'
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                    </button>
                  </div>
                ))}
              </div>

              {/* Model selector */}
              <span className="text-[11px] text-muted-foreground/60 font-medium ml-1">Model:</span>
              <div className="relative" ref={modelMenuRef}>
                <button
                  onClick={() => setModelMenuOpen(!modelMenuOpen)}
                  className={cn(
                    'flex items-center gap-1 h-7 px-2 rounded-md border border-border/50 bg-muted/30 text-[11px] transition-all duration-150',
                    modelMenuOpen ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'
                  )}
                >
                  <Brain className="h-3 w-3" />
                  <span className="max-w-[60px] truncate">{getModelDisplayName()}</span>
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                {modelMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border bg-popover shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedModel('auto'); setModelMenuOpen(false) }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors flex items-center justify-between',
                        selectedModel === 'auto' && 'bg-accent/50 font-medium'
                      )}
                    >
                      <div>
                        <div className="font-medium">Auto</div>
                        <div className="text-[10px] text-muted-foreground">Best model for the task</div>
                      </div>
                      {selectedModel === 'auto' && <Check className="h-3 w-3 text-primary" />}
                    </button>
                    <div className="border-t my-1" />
                    {[...new Set(availableModels.map(m => m.provider))].map(provider => {
                      const models = availableModels.filter(m => m.provider === provider)
                      if (models.length === 0) return null
                      return (
                        <div key={provider}>
                          <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                            {provider}
                          </div>
                          {models.map(model => (
                            <button
                              key={model.id}
                              onClick={() => { setSelectedModel(model.id); setModelMenuOpen(false) }}
                              className={cn(
                                'w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors flex items-center justify-between',
                                selectedModel === model.id && 'bg-accent/50 font-medium'
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="truncate">{model.name}</div>
                                {model.description && (
                                  <div className="text-[10px] text-muted-foreground truncate">{model.description}</div>
                                )}
                              </div>
                              {selectedModel === model.id && <Check className="h-3 w-3 text-primary shrink-0 ml-1" />}
                            </button>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Send */}
            {generation.isGenerating ? (
              <Button
                onClick={() => {
                  if (agentState.runId) {
                    window.electron.claude.cancelAgent(agentState.runId)
                  }
                }}
                size="sm"
                className="h-8 w-8 p-0 rounded-lg"
                title="Stop"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={() => handleGenerate()}
                disabled={!query.trim() || !connection.isConnected || !schema}
                size="sm"
                className="h-8 w-8 p-0 rounded-lg"
                title="Send"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {isLoadingSchema && !schema && connection.isConnected && (
          <div className="flex items-center gap-2 justify-center text-[12px] text-muted-foreground mb-4">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading schema...
          </div>
        )}

        {/* Examples / Recent queries */}
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            {isFirstTime ? 'Try these examples' : 'Recent Queries'}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => setQuery(q)}
                className="px-3 py-1.5 text-[12px] rounded-full border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-150"
              >
                <Sparkles className="h-3 w-3 inline mr-1.5 text-primary/50" />
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Feature pills (first time only) */}
        {isFirstTime && (
          <div className="flex items-center gap-4 justify-center mt-8">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </div>
            ))}
          </div>
        )}

        {!connection.isConnected && (
          <div className="mt-6 text-center text-[13px] text-muted-foreground">
            Connect a data source to start creating dashboards.
          </div>
        )}
      </div>
    </div>
  )
}
