import { useState, useEffect } from 'react'
import { useAppStore } from './stores/app-store'
import { AppSidebar } from './components/AppSidebar'
import { DashboardIconRail } from './components/DashboardIconRail'
import { DashboardTopBar } from './components/DashboardTopBar'
import { DashboardViewer } from './components/DashboardViewer'
import { DashboardsPage } from './components/DashboardsPage'
import { ConnectionsPage } from './components/ConnectionsPage'
import { CreateDashboardPage } from './components/CreateDashboardPage'
import { EditPanel } from './components/EditPanel'
import { FilesPanel } from './components/FilesPanel'
import { SaveDashboardModal } from './components/SaveDashboardModal'
import { UpdateNotification } from './components/UpdateNotification'
import { DashboardLoadingOverlay } from './components/DashboardLoadingOverlay'
import { ImportDashboardModal } from './components/ImportDashboardModal'
import {
  Loader2,
  Package,
} from 'lucide-react'
import type { PackageStatusEvent } from './types/electron'
import { LumyrLogo } from './components/LumyrLogo'

function App() {
  const [platformReady, setPlatformReady] = useState(false)

  // Set platform attribute on <html> so CSS can adjust for Windows titlebar overlay
  useEffect(() => {
    window.electron.getPlatform().then((platform) => {
      document.documentElement.setAttribute('data-platform', platform)
      setPlatformReady(true)
    })
  }, [])

  if (!platformReady) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <div className="fixed top-0 left-0 right-0 h-12 drag-region" />
        <LumyrLogo size="lg" className="mb-8 fade-in" />
        <div className="w-24 h-0.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary to-primary/60 loading-bar" />
        </div>
      </div>
    )
  }

  return <MainApp />
}

function MainApp() {
  const {
    streamlit,
    generation,
    savedConnections,
    loadSavedConnections,
    setConnection,
    setSchema,
    setLoadingSchema,
    setStreamlit,
    currentPage,
  } = useAppStore()

  const [mainView, setMainView] = useState<'dashboard' | 'files'>('dashboard')
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importData, setImportData] = useState<{ manifest: any; zipPath: string } | null>(null)
  const [packageStatus, setPackageStatus] = useState<PackageStatusEvent | null>(null)

  // Initialize connection state from saved data
  useEffect(() => {
    const getConnector = (type: string) => {
      switch (type) {
        case 'postgresql': return window.electron.postgresql
        case 'snowflake': return window.electron.snowflake
        case 'redshift': return window.electron.redshift
        case 'netsuite': return window.electron.netsuite
        case 'odbc': return window.electron.odbc
        default: return null
      }
    }

    const loadSchemaForConnection = async (connectionId: string, connector: { getSchema: (options?: { mode: 'tables_only' | 'full' }) => Promise<{ success: boolean; schema?: any }> }) => {
      const cached = await window.electron.schema.getCached(connectionId)
      if (cached) {
        setSchema(cached.schema)
        // Background refresh (non-blocking)
        connector.getSchema({ mode: 'tables_only' }).then(result => {
          if (result.success && result.schema) {
            setSchema(result.schema)
            window.electron.schema.saveCache(connectionId, result.schema)
          }
        }).catch(() => {})
      } else {
        // No cache — fetch with loading indicator
        setLoadingSchema(true)
        const tablesResult = await connector.getSchema({ mode: 'tables_only' })
        if (tablesResult.success && tablesResult.schema) {
          setSchema(tablesResult.schema)
          window.electron.schema.saveCache(connectionId, tablesResult.schema)
        }
        setLoadingSchema(false)
      }
    }

    const initializeConnection = async () => {
      try {
        // Try BigQuery first (it auto-initializes on startup via initBigQuery())
        const authStatus = await window.electron.bigquery.getAuthStatus()

        if (authStatus.isConnected) {
          setConnection({
            isConnected: true,
            projectId: authStatus.projectId || null,
            authType: authStatus.authType || null,
            connectionId: authStatus.connectionId || null,
            connectionName: authStatus.connectionName || null,
            error: null
          })

          if (authStatus.connectionId) {
            await loadSchemaForConnection(authStatus.connectionId, window.electron.bigquery)
          }
          return
        }

        // Check for an active non-BigQuery connection to restore
        const activeResult = await window.electron.connections.getActive()
        const activeConnectionId = activeResult.activeConnectionId
        if (!activeConnectionId) return

        const connectionsResult = await window.electron.connections.list()
        if (!connectionsResult.success) return
        const activeConn = connectionsResult.connections.find((c: any) => c.id === activeConnectionId)
        if (!activeConn) return

        const connType = activeConn.type || 'bigquery'
        if (connType === 'bigquery') return // Already handled above

        const connector = getConnector(connType)
        if (!connector) return

        // Re-establish the connection
        const switchResult = await connector.switchConnection(activeConnectionId)
        if (!switchResult.success) return

        setConnection({
          isConnected: true,
          projectId: switchResult.database || activeConn.projectId || activeConn.database || activeConn.accountId || null,
          authType: activeConn.authType || 'password',
          connectionId: activeConnectionId,
          connectionName: activeConn.name,
          error: null
        })

        await loadSchemaForConnection(activeConnectionId, connector)
      } catch (error) {
        console.error('Failed to initialize connection:', error)
      }
    }

    initializeConnection()
    loadSavedConnections()
  }, [])

  // Listen for Streamlit started event from agent
  useEffect(() => {
    const handleStreamlitStarted = (data: { port: number }) => {
      console.log('[App] Streamlit started notification received, port:', data.port)
      setStreamlit({ isRunning: true, port: data.port, error: null })
    }

    window.electron.streamlit.onStarted(handleStreamlitStarted)

    return () => {
      window.electron.streamlit.removeStartedListener()
    }
  }, [setStreamlit])

  // Listen for package installation status
  useEffect(() => {
    window.electron.packages.onStatus((status) => {
      if (status.phase === 'complete' || status.phase === 'error') {
        setTimeout(() => setPackageStatus(null), 500)
      }
      setPackageStatus(status)
    })

    return () => {
      window.electron.packages.removeStatusListener()
    }
  }, [])

  // Listen for unexpected Streamlit exit
  useEffect(() => {
    const handleStreamlitExited = () => {
      console.log('[App] Streamlit exited unexpectedly')
      setStreamlit({ isRunning: false, port: null, stopped: true })
    }

    window.electron.streamlit.onExited(handleStreamlitExited)

    return () => {
      window.electron.streamlit.removeExitedListener()
    }
  }, [setStreamlit])

  // Listen for .lmr file open events (double-click or drag)
  useEffect(() => {
    window.electron.dashboards.onOpenFile(async (filePath: string) => {
      try {
        const result = await window.electron.dashboards.importFile(filePath)
        if (result.success && result.manifest && result.zipPath) {
          setImportData({ manifest: result.manifest, zipPath: result.zipPath })
          setShowImportModal(true)
        }
      } catch (error) {
        console.error('Failed to import from open-file:', error)
      }
    })

    return () => {
      window.electron.dashboards.removeOpenFileListener()
    }
  }, [])

  // Listen for save-dashboard custom event (from DashboardTopBar)
  useEffect(() => {
    const handleSave = () => setShowSaveModal(true)
    window.addEventListener('lumyr:save-dashboard', handleSave)
    return () => window.removeEventListener('lumyr:save-dashboard', handleSave)
  }, [])

  const hasDashboard = (streamlit.isRunning && streamlit.port) || (streamlit.stopped && generation.generatedCode)
  const isPreparingDashboard = !!generation.generatedCode && !streamlit.isRunning && !streamlit.stopped

  const handleImportComplete = async () => {
    setShowImportModal(false)
    setImportData(null)
    useAppStore.getState().loadSavedDashboards()
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* ─── Navigation pages: dark sidebar + full-page content ─── */}
        {(currentPage === 'connections' || currentPage === 'dashboards' || currentPage === 'create') && (
          <>
            <AppSidebar />
            <main className="flex-1 overflow-hidden">
              {currentPage === 'connections' && <ConnectionsPage />}
              {currentPage === 'dashboards' && <DashboardsPage />}
              {currentPage === 'create' && <CreateDashboardPage />}
            </main>
          </>
        )}

        {/* ─── Dashboard View / Edit: shared layout to prevent iframe flicker ─── */}
        {(currentPage === 'dashboard-view' || currentPage === 'dashboard-edit') && (
          <>
            <DashboardIconRail />
            <div className="flex-1 flex flex-col overflow-hidden">
              <DashboardTopBar
                mainView={currentPage === 'dashboard-view' ? mainView : 'dashboard'}
                setMainView={currentPage === 'dashboard-view' ? setMainView : () => {}}
              />
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {currentPage === 'dashboard-view' && mainView === 'files' ? (
                  <FilesPanel />
                ) : (
                  <>
                    {!hasDashboard && !isPreparingDashboard && (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-sm text-muted-foreground">
                          {currentPage === 'dashboard-edit'
                            ? 'Waiting for dashboard generation...'
                            : 'No dashboard loaded. Go back and create or select one.'}
                        </p>
                      </div>
                    )}
                    {isPreparingDashboard && (
                      <PreparingDashboardState packageStatus={packageStatus} />
                    )}
                    {hasDashboard && (
                      <div className="flex-1 overflow-hidden">
                        <DashboardViewer port={streamlit.port || 0} isVisible={true} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {currentPage === 'dashboard-edit' && <EditPanel />}
          </>
        )}
      </div>

      {/* Modals */}
      <SaveDashboardModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
      />

      <ImportDashboardModal
        isOpen={showImportModal}
        manifest={importData?.manifest}
        zipPath={importData?.zipPath || ''}
        connections={savedConnections}
        onClose={() => {
          setShowImportModal(false)
          setImportData(null)
        }}
        onImported={handleImportComplete}
      />

      <UpdateNotification />
      <DashboardLoadingOverlay />
    </div>
  )
}

function PreparingDashboardState({ packageStatus }: { packageStatus: PackageStatusEvent | null }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center">
        {packageStatus && (packageStatus.phase === 'detecting' || packageStatus.phase === 'installing') ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {packageStatus.phase === 'detecting' ? 'Checking dependencies...' : 'Installing packages...'}
              </p>
              {packageStatus.phase === 'installing' && packageStatus.package && (
                <p className="text-xs text-muted-foreground mt-1">
                  {packageStatus.package}
                  {packageStatus.total && packageStatus.total > 1 ? ` (${packageStatus.current}/${packageStatus.total})` : ''}
                </p>
              )}
            </div>
            <div className="w-48 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-primary loading-bar" style={{ width: '33%' }} />
            </div>
          </>
        ) : (
          <>
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Starting dashboard...</p>
          </>
        )}
      </div>
    </div>
  )
}

export default App
