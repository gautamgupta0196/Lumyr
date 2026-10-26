import { useState } from 'react'
import { useAppStore, type SavedConnection } from '@/stores/app-store'
import { ConnectionModal } from './ConnectionModal'
import { SettingsModal } from './SettingsModal'
import { cn } from '@/lib/utils'
import {
  Database,
  BarChart3,
  Plus,
  Settings,
  ChevronDown,
} from 'lucide-react'

export function AppSidebar() {
  const currentPage = useAppStore((s) => s.currentPage)
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const connection = useAppStore((s) => s.connection)
  const savedConnections = useAppStore((s) => s.savedConnections)
  const setConnection = useAppStore((s) => s.setConnection)
  const setSchema = useAppStore((s) => s.setSchema)
  const setDashboardLoading = useAppStore((s) => s.setDashboardLoading)

  const [showConnectionMenu, setShowConnectionMenu] = useState(false)
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const handleSwitchConnection = async (conn: SavedConnection) => {
    setShowConnectionMenu(false)
    if (conn.id === connection.connectionId) return

    const connType = conn.type || 'bigquery'

    try {
      setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'switching_connection', error: null })

      let switchSuccess = false
      if (connType === 'postgresql') {
        const result = await window.electron.postgresql.switchConnection(conn.id)
        if (result.success) {
          setConnection({ isConnected: true, projectId: result.database || conn.database, authType: 'password', connectionId: conn.id, connectionName: conn.name, error: null })
          setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'loading_schema', error: null })
          const schema = await window.electron.postgresql.getSchema({ mode: 'tables_only' })
          if (schema.success && schema.schema) setSchema(schema.schema)
          switchSuccess = true
        }
      } else if (connType === 'snowflake') {
        const result = await window.electron.snowflake.switchConnection(conn.id)
        if (result.success) {
          setConnection({ isConnected: true, projectId: result.database || conn.database, authType: 'password', connectionId: conn.id, connectionName: conn.name, error: null })
          setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'loading_schema', error: null })
          const schema = await window.electron.snowflake.getSchema({ mode: 'tables_only' })
          if (schema.success && schema.schema) setSchema(schema.schema)
          switchSuccess = true
        }
      } else if (connType === 'redshift') {
        const result = await window.electron.redshift.switchConnection(conn.id)
        if (result.success) {
          setConnection({ isConnected: true, projectId: result.database || conn.database, authType: 'password', connectionId: conn.id, connectionName: conn.name, error: null })
          setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'loading_schema', error: null })
          const schema = await window.electron.redshift.getSchema({ mode: 'tables_only' })
          if (schema.success && schema.schema) setSchema(schema.schema)
          switchSuccess = true
        }
      } else if (connType === 'netsuite') {
        const result = await window.electron.netsuite.switchConnection(conn.id)
        if (result.success) {
          setConnection({ isConnected: true, projectId: result.database || conn.accountId, authType: 'password', connectionId: conn.id, connectionName: conn.name, error: null })
          setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'loading_schema', error: null })
          const schema = await window.electron.netsuite.getSchema({ mode: 'tables_only' })
          if (schema.success && schema.schema) setSchema(schema.schema)
          switchSuccess = true
        }
      } else if (connType === 'odbc') {
        const result = await window.electron.odbc.switchConnection(conn.id)
        if (result.success) {
          setConnection({ isConnected: true, projectId: result.database || conn.database, authType: 'password', connectionId: conn.id, connectionName: conn.name, error: null })
          setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'loading_schema', error: null })
          const schema = await window.electron.odbc.getSchema({ mode: 'tables_only' })
          if (schema.success && schema.schema) setSchema(schema.schema)
          switchSuccess = true
        }
      } else {
        const result = await window.electron.bigquery.switchConnection(conn.id)
        if (result.success) {
          setConnection({ isConnected: true, projectId: result.projectId, authType: conn.authType || null, connectionId: conn.id, connectionName: conn.name, error: null })
          setDashboardLoading({ isLoading: true, connectionName: conn.name, step: 'loading_schema', error: null })
          const schema = await window.electron.bigquery.getSchema({ mode: 'tables_only' })
          if (schema.success && schema.schema) {
            setSchema(schema.schema)
            window.electron.schema.saveCache(conn.id, schema.schema)
          }
          switchSuccess = true
        }
      }

      if (!switchSuccess) {
        setDashboardLoading({ isLoading: false, connectionName: null, step: null, error: 'Failed to switch connection' })
      } else {
        setDashboardLoading(null)
      }
    } catch (err) {
      console.error('Failed to switch connection:', err)
      setDashboardLoading(null)
    }
  }

  const handleNewDashboard = async () => {
    // Cancel any running agent so it doesn't keep executing code
    const { runId } = useAppStore.getState().agentState
    if (runId) window.electron.claude.cancelAgent(runId)
    await window.electron.streamlit.stop()
    useAppStore.getState().setStreamlit({ isRunning: false, port: null, error: null, output: [], stopped: false })
    useAppStore.getState().clearConversation()
    useAppStore.getState().resetAgentState()
    useAppStore.getState().setActiveDashboard(null)
    useAppStore.getState().setGeneration({ generatedCode: null, error: null, isGenerating: false })
    useAppStore.getState().setDashboardFiles([])
    setCurrentPage('create')
  }


  return (
    <>
      <div className="w-[220px] shrink-0 sidebar-dark flex flex-col h-full select-none">
        {/* Drag region at top for macOS traffic lights */}
        <div className="h-12 drag-region" />

        {/* Connections nav item */}
        <div className="px-3 pt-2">
          <button
            onClick={() => setCurrentPage('connections')}
            className={cn(
              'sidebar-nav-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium',
              currentPage === 'connections' && 'active'
            )}
          >
            <Database className="h-[18px] w-[18px] shrink-0" />
            Connections
          </button>
        </div>

        {/* Connection selector */}
        <div className="px-3 pt-2 pb-1 relative">
          <button
            onClick={() => setShowConnectionMenu(!showConnectionMenu)}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors"
            style={{
              background: 'hsl(var(--sidebar-muted))',
              color: 'hsl(var(--sidebar-foreground))',
            }}
          >
            <div className="flex-1 min-w-0 text-left">
              {connection.isConnected ? (
                <span className="truncate block">
                  {connection.connectionName || connection.projectId || 'Connected'}
                </span>
              ) : (
                <span style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}>No connection</span>
              )}
            </div>
            {connection.isConnected && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
          </button>

          {showConnectionMenu && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg border bg-popover text-popover-foreground shadow-lg py-1 max-h-48 overflow-y-auto">
              {savedConnections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => handleSwitchConnection(conn)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors flex items-center gap-2',
                    conn.id === connection.connectionId && 'bg-accent/50 font-medium'
                  )}
                >
                  <span className="truncate">{conn.name}</span>
                  {conn.id === connection.connectionId && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 ml-auto" />
                  )}
                </button>
              ))}
              <div className="border-t my-1" />
              <button
                onClick={() => {
                  setShowConnectionMenu(false)
                  setShowConnectionModal(true)
                }}
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors flex items-center gap-2 text-primary"
              >
                <Plus className="h-3 w-3" />
                Add connection
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="px-3 py-2">
          <div className="border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }} />
        </div>

        {/* New Dashboard button */}
        <div className="px-3 pb-2">
          <button
            onClick={handleNewDashboard}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
            style={{ background: 'hsl(var(--sidebar-primary))' }}
          >
            <Plus className="h-4 w-4" />
            New Dashboard
          </button>
        </div>

        {/* My Dashboards nav item */}
        <div className="px-3 pt-1">
          <button
            onClick={() => setCurrentPage('dashboards')}
            className={cn(
              'sidebar-nav-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium',
              currentPage === 'dashboards' && 'active'
            )}
          >
            <BarChart3 className="h-[18px] w-[18px] shrink-0" />
            My Dashboards
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings */}
        <div className="px-3 pb-2">
          <button
            onClick={() => setShowSettings(true)}
            className="sidebar-nav-item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium"
          >
            <Settings className="h-[18px] w-[18px] shrink-0" />
            Settings
          </button>
        </div>

      </div>

      <ConnectionModal isOpen={showConnectionModal} onClose={() => setShowConnectionModal(false)} />
      {showSettings && <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />}
    </>
  )
}
