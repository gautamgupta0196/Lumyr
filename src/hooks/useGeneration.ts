import { useRef, useEffect, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import type { UploadedFile } from '@/stores/app-store'
import { shouldFallbackStreamlitRun } from '@/components/query-panel-utils'

export type ResponseMode = 'auto' | 'dashboard' | 'answer' | 'plan'

export function useGeneration(options?: { onDashboardReady?: () => void; onGenerationStart?: () => void }) {
  const {
    query,
    setQuery,
    generation,
    setGeneration,
    connection,
    schema,
    setStreamlit,
    conversation,
    addUserMessage,
    addAssistantMessage,
    activeDashboardId,
    loadSavedDashboards,
    agentState,
    addAgentStep,
    startAgentRun,
    setAgentPhase,
    setAgentRunning,
    resetAgentState,
    dashboardFiles,
    addDashboardFile,
    isLoadingSchema,
    savedConnections,
    selectedModel,
    setSelectedModel,
    availableModels,
    loadModelSettings,
  } = useAppStore(useShallow((state) => ({
    query: state.query,
    setQuery: state.setQuery,
    generation: state.generation,
    setGeneration: state.setGeneration,
    connection: state.connection,
    schema: state.schema,
    isLoadingSchema: state.isLoadingSchema,
    setStreamlit: state.setStreamlit,
    conversation: state.conversation,
    addUserMessage: state.addUserMessage,
    addAssistantMessage: state.addAssistantMessage,
    activeDashboardId: state.activeDashboardId,
    loadSavedDashboards: state.loadSavedDashboards,
    agentState: state.agentState,
    addAgentStep: state.addAgentStep,
    startAgentRun: state.startAgentRun,
    setAgentPhase: state.setAgentPhase,
    setAgentRunning: state.setAgentRunning,
    resetAgentState: state.resetAgentState,
    dashboardFiles: state.dashboardFiles,
    addDashboardFile: state.addDashboardFile,
    savedConnections: state.savedConnections,
    selectedModel: state.selectedModel,
    setSelectedModel: state.setSelectedModel,
    availableModels: state.availableModels,
    loadModelSettings: state.loadModelSettings,
  })))

  const [pendingAttachments, setPendingAttachments] = useState<UploadedFile[]>([])
  const [isAttachingFiles, setIsAttachingFiles] = useState(false)
  const [responseMode, setResponseMode] = useState<ResponseMode>('auto')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const modelMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    if (modelMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelMenuOpen])

  useEffect(() => {
    loadModelSettings()
  }, [])

  const getModelDisplayName = () => {
    if (selectedModel === 'auto') return 'Auto'
    const model = availableModels.find(m => m.id === selectedModel)
    return model?.name || selectedModel.split('/').pop() || 'Auto'
  }

  // Set up agent step listener
  useEffect(() => {
    const unsubscribe = window.electron.claude.onAgentStep((step) => {
      addAgentStep(step)
    })

    return () => {
      unsubscribe()
    }
  }, [addAgentStep])

  // Listen for working code (early save)
  useEffect(() => {
    const unsubscribe = window.electron.claude.onWorkingCode((data) => {
      const currentRunId = useAppStore.getState().agentState.runId
      if (data.runId === currentRunId) {
        setGeneration({ generatedCode: data.code })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [setGeneration])

  const handleAttachFiles = async () => {
    setIsAttachingFiles(true)

    try {
      const result = await window.electron.files.selectFiles()
      if (result.success && result.filePaths) {
        const { filePaths } = result
        const uploadResults = await Promise.allSettled(
          filePaths.map(filePath => window.electron.files.upload(filePath))
        )

        const successfulUploads: UploadedFile[] = []
        const failedUploads: string[] = []

        uploadResults.forEach((uploadResult, index) => {
          const filePath = filePaths[index]

          if (uploadResult.status === 'fulfilled') {
            if (uploadResult.value.success && uploadResult.value.file) {
              successfulUploads.push(uploadResult.value.file)
              addDashboardFile(uploadResult.value.file)
            } else {
              failedUploads.push(uploadResult.value.error || `Failed to upload ${filePath}`)
            }
            return
          }

          const rejectionMessage = uploadResult.reason instanceof Error
            ? uploadResult.reason.message
            : String(uploadResult.reason)
          failedUploads.push(`Failed to upload ${filePath}: ${rejectionMessage}`)
        })

        if (successfulUploads.length > 0) {
          setPendingAttachments(prev => [...prev, ...successfulUploads])
        }

        if (failedUploads.length > 0) {
          console.warn(`Some file uploads failed (${failedUploads.length}/${filePaths.length}).`, failedUploads)
        }
      }
    } catch (err) {
      console.error('Failed to attach files:', err)
    } finally {
      setIsAttachingFiles(false)
    }
  }

  const handleRemoveAttachment = (fileId: string) => {
    setPendingAttachments(prev => prev.filter(f => f.id !== fileId))
  }

  const handleGenerate = async (overrideQuery?: string) => {
    const inputQuery = overrideQuery || query.trim()
    if (!inputQuery || !connection.isConnected || !schema) return

    // Prepend intent hint for the agent when user explicitly picks a mode
    const currentMode = responseMode
    let agentQuery = inputQuery
    if (currentMode === 'dashboard') {
      agentQuery = `[User wants a dashboard/visualization] ${inputQuery}`
    } else if (currentMode === 'answer') {
      agentQuery = `[User wants a text answer, NOT a dashboard] ${inputQuery}`
    } else if (currentMode === 'plan') {
      agentQuery = `[User wants a PLAN ONLY — describe what you would build (which tables to query, what charts/visualizations to create, layout structure, key metrics) without generating any code. Do NOT call execute_code or submit_dashboard. Use the respond tool to output a structured plan with sections: Data Sources, Visualizations, Layout, Key Metrics.] ${inputQuery}`
    }
    const userQuery = inputQuery
    setQuery('')

    // Add user message to conversation (show original text, not the agent hint)
    const fileIds = pendingAttachments.map(f => f.id)
    addUserMessage(userQuery, fileIds.length > 0 ? fileIds : undefined)
    setPendingAttachments([])

    const runId = crypto.randomUUID()
    setGeneration({ isGenerating: true, error: null })

    // Notify caller that generation has started (e.g. to switch pages)
    options?.onGenerationStart?.()

    try {
      startAgentRun(runId)

      // Get execution timeout from settings
      const executionTimeoutSeconds = await window.electron.settings.getExecutionTimeout()

      // Use the new agent-based generation
      const allFileIds = dashboardFiles.map(f => f.id)
      const activeConn = savedConnections.find(c => c.id === connection.connectionId)
      const result = await window.electron.claude.generateAgent({
        runId,
        query: agentQuery,
        schema: schema,
        model: selectedModel,
        conversationHistory: conversation,
        currentCode: generation.generatedCode || undefined,
        executionTimeoutSeconds,
        fileIds: allFileIds.length > 0 ? allFileIds : undefined,
        mcpServers: activeConn?.mcpServers?.length ? activeConn.mcpServers : undefined,
        customInstructions: activeConn?.customInstructions || undefined
      })

      setAgentRunning(false)

      if (result.respondedDirectly) {
        resetAgentState()
        const actions = currentMode === 'plan'
          ? ['Accept plan and build', ...(result.quickActions || [])]
          : result.quickActions
        addAssistantMessage(result.message || '', undefined, undefined, actions)
        if (currentMode === 'plan') {
          setResponseMode('auto')
        }
        setGeneration({ isGenerating: false, error: null })
        return
      }

      if (result.requiresUserInput) {
        resetAgentState()
        addAssistantMessage(
          result.message || 'Could you clarify what you want to see?',
          undefined,
          undefined,
          result.quickActions
        )
        setGeneration({
          isGenerating: false,
          error: null
        })
        return
      }

      if (!result.success || !result.code) {
        const errorMsg = result.error || 'Generation failed before code was returned'
        if (errorMsg === 'Generation cancelled') {
          resetAgentState()
          setGeneration({ isGenerating: false, error: null })
          return
        }
        throw new Error(errorMsg)
      }

      // Add assistant message to conversation
      const summary = result.summary || 'Dashboard updated successfully.'
      addAssistantMessage(summary, result.code)

      setGeneration({
        isGenerating: false,
        generatedCode: result.code,
        error: null
      })

      await new Promise(resolve => setTimeout(resolve, 50))

      const finalizeCompletionIfNeeded = () => {
        const currentPhase = useAppStore.getState().agentState.currentPhase
        if (currentPhase !== 'complete') {
          addAgentStep({
            id: crypto.randomUUID(),
            runId,
            type: 'complete',
            timestamp: Date.now(),
            thinking: summary
          })
        }
      }

      const currentStreamlit = useAppStore.getState().streamlit
      if (shouldFallbackStreamlitRun(currentStreamlit)) {
        const streamlitResult = await window.electron.streamlit.runCode(result.code)
        if (streamlitResult.success) {
          setStreamlit({ isRunning: true, port: streamlitResult.port, error: null })
          finalizeCompletionIfNeeded()
          options?.onDashboardReady?.()
        } else {
          setStreamlit({ error: streamlitResult.error })
          setAgentPhase('error')
          addAgentStep({
            id: crypto.randomUUID(),
            runId,
            type: 'error',
            timestamp: Date.now(),
            errorMessage: streamlitResult.error || 'Failed to run dashboard'
          })
        }
      } else {
        setStreamlit({ error: null })
        finalizeCompletionIfNeeded()
        options?.onDashboardReady?.()
      }

      // If we have an active dashboard, update it
      if (activeDashboardId) {
        const currentFileIds = dashboardFiles.map(f => f.id)
        await window.electron.dashboards.update({
          id: activeDashboardId,
          code: result.code,
          fileIds: currentFileIds.length > 0 ? currentFileIds : undefined,
          conversation: [...conversation, {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content: userQuery,
            timestamp: Date.now()
          }, {
            id: crypto.randomUUID(),
            role: 'assistant' as const,
            content: summary,
            timestamp: Date.now(),
            code: result.code
          }]
        })
        await loadSavedDashboards()
      }
    } catch (err) {
      setAgentRunning(false)
      const errorMessage = err instanceof Error ? err.message : 'Generation failed'
      if (errorMessage === 'Generation cancelled') {
        resetAgentState()
        setGeneration({ isGenerating: false, error: null })
        return
      }
      setAgentPhase('error')
      addAgentStep({
        id: crypto.randomUUID(),
        runId,
        type: 'error',
        timestamp: Date.now(),
        errorMessage
      })
      addAssistantMessage('Something went wrong. Please try again.', undefined, errorMessage)
      setGeneration({
        isGenerating: false,
        error: errorMessage
      })
    }
  }

  const handleQuickAction = (action: string) => {
    if (generation.isGenerating) return
    if (action === 'Accept plan and build') {
      setResponseMode('auto')
      handleGenerate('Build the dashboard based on the plan above')
    } else {
      handleGenerate(action)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleGenerate()
    }
  }

  return {
    // State
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
    dashboardFiles,

    // Actions
    handleGenerate,
    handleQuickAction,
    handleKeyDown,
    handleAttachFiles,
    handleRemoveAttachment,
    getModelDisplayName,
  }
}
