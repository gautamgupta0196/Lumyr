import { useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useGeneration } from '@/hooks/useGeneration'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { ChatMessage } from './ChatMessage'
import { AgentProgress } from './AgentProgress'
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
} from 'lucide-react'

export function EditPanel() {
  const savedDashboards = useAppStore((s) => s.savedDashboards)

  const {
    query,
    setQuery,
    generation,
    connection,
    schema,
    conversation,
    agentState,
    isLoadingSchema,
    selectedModel,
    setSelectedModel,
    availableModels,
    pendingAttachments,
    isAttachingFiles,
    responseMode,
    setResponseMode,
    modelMenuOpen,
    setModelMenuOpen,
    modelMenuRef,
    activeDashboardId,
    handleGenerate,
    handleQuickAction,
    handleKeyDown,
    handleAttachFiles,
    handleRemoveAttachment,
    getModelDisplayName,
  } = useGeneration()

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation, agentState.steps])

  const activeDashboardName = activeDashboardId
    ? savedDashboards.find(d => d.id === activeDashboardId)?.name || 'Current Dashboard'
    : null

  const emptyConversationPrompt = connection.isConnected
    ? activeDashboardId
      ? 'Describe updates to iterate on this dashboard.'
      : 'Describe the dashboard you want to create.'
    : 'Connect a data source to start.'

  return (
    <div className="w-[350px] shrink-0 border-l flex flex-col h-full bg-background">
      {/* Header — h-12 matches DashboardTopBar */}
      <div className="h-12 shrink-0 px-4 border-b flex items-center">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold leading-tight">Edit Dashboard</h3>
          {activeDashboardName && (
            <p className="text-[11px] text-muted-foreground truncate leading-tight">{activeDashboardName}</p>
          )}
        </div>
      </div>

      {/* Conversation History */}
      <div className="flex-1 overflow-auto px-3 py-3">
        {conversation.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center px-2">
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                {emptyConversationPrompt}
              </p>
              {connection.isConnected && (
                <div className="flex flex-col gap-1.5 pt-1">
                  {[
                    'Monthly revenue trends',
                    'Compare metrics by region',
                    'Summarize top 10 rows'
                  ].map((hint) => (
                    <button
                      key={hint}
                      className="px-2.5 py-1.5 text-[11px] rounded-md border border-border/50 text-muted-foreground/70 hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all duration-150 text-left"
                      onClick={() => setQuery(hint)}
                    >
                      {hint}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {conversation.map((message) => (
              <ChatMessage key={message.id} message={message} onQuickAction={handleQuickAction} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Agent Progress */}
        {(generation.isGenerating || agentState.steps.length > 0) && (
          <div className="pt-3">
            <AgentProgress />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border/40 px-3 pb-3 pt-2">
        {/* Pending file attachments */}
        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
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

        {isLoadingSchema && !schema && connection.isConnected && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
              <span className="truncate">Loading schema...</span>
            </div>
          </div>
        )}

        <div className="rounded-xl border bg-background input-focus-ring p-1.5 transition-all duration-150">
          <Textarea
            placeholder={
              conversation.length === 0
                ? "Describe your analysis..."
                : "Ask to edit..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-h-[36px] max-h-[100px] resize-none border-0 shadow-none focus-visible:ring-0 bg-transparent text-[13px] px-2 py-1.5"
            disabled={!connection.isConnected || generation.isGenerating}
          />

          {/* Controls row */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              {/* Attach */}
              <Button
                variant="ghost"
                onClick={handleAttachFiles}
                disabled={generation.isGenerating}
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-muted-foreground"
                title="Attach files"
              >
                <Paperclip className="h-3 w-3" />
              </Button>

              {/* Model selector */}
              <div className="relative" ref={modelMenuRef}>
                <button
                  onClick={() => setModelMenuOpen(!modelMenuOpen)}
                  className={cn(
                    'flex items-center gap-0.5 h-6 px-1.5 rounded-md border border-border/50 bg-muted/30 text-[10px] transition-all duration-150',
                    modelMenuOpen ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground/60 hover:text-muted-foreground'
                  )}
                  title="Select AI model"
                >
                  <Brain className="h-2.5 w-2.5" />
                  <span className="max-w-[50px] truncate">{getModelDisplayName()}</span>
                  <ChevronDown className="h-2 w-2" />
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

              {/* Response mode toggle */}
              <div className="flex items-center h-6 rounded-md border border-border/50 bg-muted/30 p-0.5">
                {([
                  { mode: 'auto' as const, icon: Sparkles, label: 'Auto' },
                  { mode: 'answer' as const, icon: MessageSquareText, label: 'Answer' },
                  { mode: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
                  { mode: 'plan' as const, icon: ClipboardList, label: 'Plan' },
                ]).map(({ mode, icon: Icon, label }) => (
                  <div key={mode} className="relative group">
                    <button
                      onClick={() => setResponseMode(mode)}
                      className={cn(
                        'flex items-center justify-center h-5 w-5 rounded text-[10px] transition-all duration-150',
                        responseMode === mode
                          ? 'bg-background shadow-sm text-foreground border border-border/50'
                          : 'text-muted-foreground/60 hover:text-muted-foreground'
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                    </button>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] font-medium bg-foreground text-background rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Send / Cancel */}
            {generation.isGenerating ? (
              <Button
                onClick={() => {
                  if (agentState.runId) {
                    window.electron.claude.cancelAgent(agentState.runId)
                  }
                }}
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground/60 hover:text-foreground"
                title="Stop generation"
              >
                <Square className="h-3 w-3 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={() => handleGenerate()}
                disabled={!query.trim() || !connection.isConnected}
                size="sm"
                className="h-6 w-6 p-0"
                title="Send"
              >
                <Send className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {isAttachingFiles && (
          <p className="text-[10px] text-muted-foreground/60 mt-1 text-center">Attaching files...</p>
        )}
      </div>
    </div>
  )
}
