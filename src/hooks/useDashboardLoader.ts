import { useCallback } from 'react'
import { useAppStore, type SavedDashboard } from '@/stores/app-store'
import { useShallow } from 'zustand/react/shallow'

/** Cancel any in-flight agent generation so it stops executing code */
function cancelActiveAgent() {
  const { runId } = useAppStore.getState().agentState
  if (runId) {
    window.electron.claude.cancelAgent(runId)
  }
}

export function useDashboardLoader() {
  const {
    savedConnections,
    activeDashboardId,
    setActiveDashboard,
    loadSavedDashboards,
    setGeneration,
    setStreamlit,
    setConversation,
    clearConversation,
    resetAgentState,
    setDashboardFiles,
    loadDashboardFilesByIds,
    setDashboardLoading,
    connection,
    setConnection,
    setSchema,
    setCurrentPage,
  } = useAppStore(useShallow((state) => ({
    savedConnections: state.savedConnections,
    activeDashboardId: state.activeDashboardId,
    setActiveDashboard: state.setActiveDashboard,
    loadSavedDashboards: state.loadSavedDashboards,
    setGeneration: state.setGeneration,
    setStreamlit: state.setStreamlit,
    setConversation: state.setConversation,
    clearConversation: state.clearConversation,
    resetAgentState: state.resetAgentState,
    setDashboardFiles: state.setDashboardFiles,
    loadDashboardFilesByIds: state.loadDashboardFilesByIds,
    setDashboardLoading: state.setDashboardLoading,
    connection: state.connection,
    setConnection: state.setConnection,
    setSchema: state.setSchema,
    setCurrentPage: state.setCurrentPage,
  })))

  const handleNewDashboard = useCallback(async () => {
    cancelActiveAgent()
    await window.electron.streamlit.stop()
    setStreamlit({ isRunning: false, port: null, error: null, output: [], stopped: false })
    clearConversation()
    resetAgentState()
    setActiveDashboard(null)
    setGeneration({ generatedCode: null, error: null, isGenerating: false })
    setDashboardFiles([])
    setCurrentPage('create')
  }, [setStreamlit, clearConversation, resetAgentState, setActiveDashboard, setGeneration, setDashboardFiles, setCurrentPage])

  const handleLoadDashboard = useCallback(async (dashboardId: string) => {
    try {
      // Cancel any running agent so it doesn't overwrite the dashboard we're about to load
      cancelActiveAgent()
      resetAgentState()

      const result = await window.electron.dashboards.load(dashboardId)
      if (!result.success || !result.dashboard || !result.code) return

      const dashboard = result.dashboard as SavedDashboard & { code?: string }
      const needsSwitch =
        dashboard.connectionId && dashboard.connectionId !== connection.connectionId
      const conn = needsSwitch
        ? savedConnections.find((c) => c.id === dashboard.connectionId)
        : null
      const connName = conn?.name || dashboard.connectionId || null

      // Handle connection switch if needed
      if (needsSwitch) {
        if (dashboard.connectionId === 'local-files') {
          setConnection({
            isConnected: true,
            projectId: 'local',
            authType: 'service_account',
            connectionId: 'local-files',
            connectionName: 'Local Files',
            error: null,
          })
          setSchema({ projectId: 'local', datasets: [] })
        } else {
          setDashboardLoading({
            isLoading: true,
            connectionName: connName,
            step: 'switching_connection',
            error: null,
          })

          const connType = conn?.type || 'bigquery'
          let switchSuccess = false

          const switchFns: Record<string, any> = {
            postgresql: window.electron.postgresql?.switchConnection,
            snowflake: window.electron.snowflake?.switchConnection,
            redshift: window.electron.redshift?.switchConnection,
            netsuite: window.electron.netsuite?.switchConnection,
            odbc: window.electron.odbc?.switchConnection,
            bigquery: window.electron.bigquery?.switchConnection,
          }

          const fn = switchFns[connType]
          if (fn) {
            const switchResult = await fn(dashboard.connectionId)
            if (switchResult?.success) {
              setConnection({
                isConnected: true,
                projectId: switchResult.projectId || switchResult.database || conn?.database,
                authType: conn?.authType || 'password',
                connectionId: dashboard.connectionId,
                connectionName: conn?.name || null,
                error: null,
              })
              switchSuccess = true
            }
          }

          if (!switchSuccess) {
            setDashboardLoading({
              isLoading: false,
              connectionName: connName,
              step: null,
              error: 'Failed to switch connection',
            })
            return
          }
        }
      }

      // Set dashboard state
      setActiveDashboard(dashboardId)
      setGeneration({ isGenerating: false, generatedCode: result.code, error: null })

      if (result.dashboard.conversation) {
        setConversation(result.dashboard.conversation)
      } else {
        clearConversation()
      }

      if (result.dashboard.fileIds?.length) {
        await loadDashboardFilesByIds(result.dashboard.fileIds)
      } else {
        setDashboardFiles([])
      }

      // Run in Streamlit
      if (needsSwitch) {
        setDashboardLoading({
          isLoading: true,
          connectionName: connName,
          step: 'starting_streamlit',
          error: null,
        })
      }
      const streamlitResult = await window.electron.streamlit.runCode(result.code)
      if (streamlitResult.success) {
        setStreamlit({ isRunning: true, port: streamlitResult.port, error: null })
      }
      setDashboardLoading(null)
      setCurrentPage('dashboard-view')
    } catch (error) {
      console.error('Failed to load dashboard:', error)
      setDashboardLoading({
        isLoading: false,
        connectionName: null,
        step: null,
        error: error instanceof Error ? error.message : 'Failed to load dashboard',
      })
    }
  }, [connection.connectionId, savedConnections, setActiveDashboard, setGeneration, setConversation, clearConversation, loadDashboardFilesByIds, setDashboardFiles, setDashboardLoading, setConnection, setSchema, setStreamlit, setCurrentPage])

  const handleDeleteDashboard = useCallback(async (dashboardId: string) => {
    if (!confirm('Are you sure you want to delete this dashboard?')) return
    try {
      await window.electron.dashboards.delete(dashboardId)
      if (activeDashboardId === dashboardId) setActiveDashboard(null)
      await loadSavedDashboards()
    } catch (error) {
      console.error('Failed to delete dashboard:', error)
    }
  }, [activeDashboardId, setActiveDashboard, loadSavedDashboards])

  const handleDuplicate = useCallback(async (dashboardId: string) => {
    try {
      const result = await window.electron.dashboards.load(dashboardId)
      if (result.success && result.dashboard && result.code) {
        await window.electron.dashboards.save({
          name: `${result.dashboard.name} (Copy)`,
          query: result.dashboard.query,
          code: result.code,
          connectionId: result.dashboard.connectionId,
          conversation: result.dashboard.conversation,
          fileIds: result.dashboard.fileIds,
        })
        await loadSavedDashboards()
      }
    } catch (error) {
      console.error('Failed to duplicate dashboard:', error)
    }
  }, [loadSavedDashboards])

  const handleExport = useCallback(async (dashboardId: string) => {
    try {
      const result = await window.electron.dashboards.load(dashboardId)
      if (result.success && result.dashboard && result.code) {
        const blob = new Blob([result.code], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${result.dashboard.name.replace(/\s+/g, '_')}.py`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Failed to export dashboard:', error)
    }
  }, [])

  return {
    activeDashboardId,
    handleNewDashboard,
    handleLoadDashboard,
    handleDeleteDashboard,
    handleDuplicate,
    handleExport,
    loadSavedDashboards,
  }
}
