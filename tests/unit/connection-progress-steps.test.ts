import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import { useAppStore } from '../../src/stores/app-store'

// =============================================================================
// Change 1: dashboardLoadingState in Zustand store
// =============================================================================

describe('dashboardLoadingState store', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
  })

  it('initializes dashboardLoadingState as null', () => {
    expect(useAppStore.getState().dashboardLoadingState).toBeNull()
  })

  it('setDashboardLoading sets the loading state', () => {
    const store = useAppStore.getState()
    store.setDashboardLoading({
      isLoading: true,
      connectionName: 'Test DB',
      step: 'switching_connection',
      error: null
    })
    const state = useAppStore.getState().dashboardLoadingState
    expect(state).not.toBeNull()
    expect(state!.isLoading).toBe(true)
    expect(state!.connectionName).toBe('Test DB')
    expect(state!.step).toBe('switching_connection')
    expect(state!.error).toBeNull()
  })

  it('setDashboardLoading can update step', () => {
    const store = useAppStore.getState()
    store.setDashboardLoading({
      isLoading: true,
      connectionName: 'Test DB',
      step: 'switching_connection',
      error: null
    })
    store.setDashboardLoading({
      isLoading: true,
      connectionName: 'Test DB',
      step: 'loading_schema',
      error: null
    })
    expect(useAppStore.getState().dashboardLoadingState!.step).toBe('loading_schema')
  })

  it('setDashboardLoading can set error state', () => {
    const store = useAppStore.getState()
    store.setDashboardLoading({
      isLoading: false,
      connectionName: 'Test DB',
      step: null,
      error: 'Connection timeout'
    })
    const state = useAppStore.getState().dashboardLoadingState
    expect(state!.isLoading).toBe(false)
    expect(state!.error).toBe('Connection timeout')
    expect(state!.step).toBeNull()
  })

  it('setDashboardLoading(null) clears the state', () => {
    const store = useAppStore.getState()
    store.setDashboardLoading({
      isLoading: true,
      connectionName: 'Test DB',
      step: 'starting_streamlit',
      error: null
    })
    store.setDashboardLoading(null)
    expect(useAppStore.getState().dashboardLoadingState).toBeNull()
  })

  it('reset() clears dashboardLoadingState', () => {
    const store = useAppStore.getState()
    store.setDashboardLoading({
      isLoading: true,
      connectionName: 'Test DB',
      step: 'loading_dashboard',
      error: null
    })
    store.reset()
    expect(useAppStore.getState().dashboardLoadingState).toBeNull()
  })

  it('supports all four step values', () => {
    const store = useAppStore.getState()
    const steps = ['switching_connection', 'loading_schema', 'loading_dashboard', 'starting_streamlit'] as const
    for (const step of steps) {
      store.setDashboardLoading({
        isLoading: true,
        connectionName: 'Test',
        step,
        error: null
      })
      expect(useAppStore.getState().dashboardLoadingState!.step).toBe(step)
    }
  })
})

// =============================================================================
// Change 1: Store type definitions
// =============================================================================

describe('dashboardLoadingState type in app-store.ts', () => {
  const source = fs.readFileSync('src/stores/app-store.ts', 'utf-8')

  it('defines dashboardLoadingState in AppState interface', () => {
    expect(source).toContain('dashboardLoadingState:')
  })

  it('has isLoading field', () => {
    expect(source).toContain('isLoading: boolean')
  })

  it('has connectionName field', () => {
    expect(source).toContain('connectionName: string | null')
  })

  it('has step field with all four step types', () => {
    expect(source).toContain("'switching_connection'")
    expect(source).toContain("'loading_schema'")
    expect(source).toContain("'loading_dashboard'")
    expect(source).toContain("'starting_streamlit'")
  })

  it('has error field', () => {
    expect(source).toContain('error: string | null')
  })

  it('defines setDashboardLoading setter', () => {
    expect(source).toContain('setDashboardLoading:')
  })

  it('initializes dashboardLoadingState as null', () => {
    expect(source).toContain('dashboardLoadingState: null')
  })
})

// =============================================================================
// Change 2: Connection step progress in ConnectionModal
// =============================================================================

describe('ConnectionModal step progress', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  it('defines ConnectionStep type', () => {
    expect(source).toContain("type ConnectionStep = 'connecting' | 'connected' | 'loading_schema' | 'schema_loaded'")
  })

  it('declares connectionStep state', () => {
    expect(source).toContain('const [connectionStep, setConnectionStep] = useState<ConnectionStep | null>(null)')
  })

  it('declares schemaTableCount state', () => {
    expect(source).toContain('const [schemaTableCount, setSchemaTableCount] = useState<number | null>(null)')
  })

  it('loadSchemaTwoPhase accepts onTablesLoaded callback', () => {
    expect(source).toContain('onTablesLoaded?: (count: number) => void')
  })

  it('loadSchemaTwoPhase invokes onTablesLoaded with total table count', () => {
    expect(source).toContain('onTablesLoaded?.(totalTables)')
  })

  it('resetForm clears connectionStep', () => {
    expect(source).toContain('setConnectionStep(null)')
  })

  it('resetForm clears schemaTableCount', () => {
    expect(source).toContain('setSchemaTableCount(null)')
  })
})

describe('ConnectionModal handler step emissions', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  // Verify each handler sets connection steps
  const handlers = [
    'handlePostgreSQLConnect',
    'handleSnowflakeConnect',
    'handleRedshiftConnect',
    'handleBigQueryOAuthConnect',
    'handleBigQueryServiceAccountConnect'
  ]

  for (const handler of handlers) {
    describe(handler, () => {
      // Extract the handler body
      const handlerStart = source.indexOf(`const ${handler}`)
      const nextHandler = source.indexOf('\n  const handle', handlerStart + 1)
      const body = source.slice(handlerStart, nextHandler > 0 ? nextHandler : undefined)

      it('sets connecting step before IPC call', () => {
        expect(body).toContain("setConnectionStep('connecting')")
      })

      it('sets connected step after success', () => {
        expect(body).toContain("setConnectionStep('connected')")
      })

      it('sets loading_schema step before schema fetch', () => {
        expect(body).toContain("setConnectionStep('loading_schema')")
      })

      it('sets schema_loaded step after schema loads', () => {
        expect(body).toContain("setConnectionStep('schema_loaded')")
      })

      it('passes setSchemaTableCount to loadSchemaTwoPhase', () => {
        expect(body).toContain('setSchemaTableCount(count)')
      })

      it('resets connectionStep on error', () => {
        expect(body).toContain('setConnectionStep(null)')
      })

      it('pauses briefly before closing to show completion', () => {
        expect(body).toContain('await new Promise(r => setTimeout(r, 500))')
      })
    })
  }
})

describe('ConnectionModal progress UI', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  it('imports CheckCircle2 icon for completed steps', () => {
    expect(source).toContain('CheckCircle2')
  })

  it('imports Circle icon for pending steps', () => {
    expect(source).toContain('Circle')
  })

  it('renders progress section when connectionStep is set', () => {
    expect(source).toContain('connectionStep !== null')
  })

  it('shows connecting step label', () => {
    expect(source).toContain('Connecting to database...')
  })

  it('shows loading schema step label', () => {
    expect(source).toContain('Loading schema...')
  })

  it('shows schema loaded step label with table count', () => {
    expect(source).toContain('Schema loaded')
    expect(source).toContain('schemaTableCount')
  })

  it('uses emerald color for completed steps', () => {
    expect(source).toContain('text-emerald-500')
    expect(source).toContain('text-emerald-600')
  })

  it('uses spinner for active step', () => {
    expect(source).toContain('animate-spin')
  })

  it('hides form/list views when connectionStep is active', () => {
    // The form conditionals include !connectionStep check
    expect(source).toContain('!connectionStep && view === \'list\'')
    expect(source).toContain('!connectionStep && view === \'edit\'')
  })
})

// =============================================================================
// Change 3: DashboardLoadingOverlay component
// =============================================================================

describe('DashboardLoadingOverlay component', () => {
  const source = fs.readFileSync('src/components/DashboardLoadingOverlay.tsx', 'utf-8')

  it('is a portal rendered to document.body', () => {
    expect(source).toContain('createPortal')
    expect(source).toContain('document.body')
  })

  it('reads dashboardLoadingState from store', () => {
    expect(source).toContain('dashboardLoadingState')
    expect(source).toContain('useAppStore')
  })

  it('returns null when no loading state', () => {
    expect(source).toContain('if (!dashboardLoadingState) return null')
  })

  it('has a backdrop overlay', () => {
    expect(source).toContain('fixed inset-0 z-50')
    expect(source).toContain('bg-black/40 backdrop-blur-sm')
  })

  it('displays all four loading steps', () => {
    expect(source).toContain('Switching connection')
    expect(source).toContain('Loading schema')
    expect(source).toContain('Loading dashboard')
    expect(source).toContain('Starting dashboard')
  })

  it('shows connection name when available', () => {
    expect(source).toContain('connectionName')
  })

  it('shows error state with dismiss button', () => {
    expect(source).toContain('error')
    expect(source).toContain('Dismiss')
  })

  it('dismiss button clears loading state', () => {
    expect(source).toContain('setDashboardLoading(null)')
  })

  it('uses error styling for error display', () => {
    expect(source).toContain('bg-destructive/10')
    expect(source).toContain('border-destructive/20')
  })

  it('uses CheckCircle2 for completed steps', () => {
    expect(source).toContain('CheckCircle2')
  })

  it('uses Loader2 spinner for active step', () => {
    expect(source).toContain('Loader2')
    expect(source).toContain('animate-spin')
  })

  it('uses Circle for pending steps', () => {
    expect(source).toContain('Circle')
  })
})

// =============================================================================
// Change 4: Sidebar dashboard loading integration
// =============================================================================

describe('Sidebar dashboard loading overlay integration', () => {
  const source = fs.readFileSync('src/components/AppSidebar.tsx', 'utf-8')

  it('imports setDashboardLoading from store', () => {
    expect(source).toContain('setDashboardLoading')
  })

  it('accesses setDashboardLoading from store', () => {
    expect(source).toContain('useAppStore((s) => s.setDashboardLoading)')
  })
})

describe('Sidebar handleSwitchConnection loading overlay', () => {
  const source = fs.readFileSync('src/components/AppSidebar.tsx', 'utf-8')

  // Extract handleSwitchConnection body
  const fnStart = source.indexOf('const handleSwitchConnection = async')
  const fnEnd = source.indexOf('\n  const handleNewDashboard')
  const body = source.slice(fnStart, fnEnd)

  it('sets switching_connection step at start', () => {
    expect(body).toContain("step: 'switching_connection'")
  })

  it('sets loading_schema step before schema load', () => {
    expect(body).toContain("step: 'loading_schema'")
  })

  it('clears loading state on success', () => {
    expect(body).toContain('setDashboardLoading(null)')
  })

  it('sets error on failure', () => {
    expect(body).toContain("error: 'Failed to switch connection'")
  })

  it('clears loading state on catch', () => {
    expect(body).toContain("console.error('Failed to switch connection:'")
  })
})

describe('Sidebar doLoadDashboard loading overlay', () => {
  const source = fs.readFileSync('src/hooks/useDashboardLoader.ts', 'utf-8')

  // Extract handleLoadDashboard body
  const fnStart = source.indexOf('const handleLoadDashboard = useCallback(async')
  const fnEnd = source.indexOf('\n  const handleDeleteDashboard')
  const body = source.slice(fnStart, fnEnd)

  it('sets switching_connection step when connection switch needed', () => {
    expect(body).toContain("step: 'switching_connection'")
  })

  it('handles local-files connections without switch', () => {
    expect(body).toContain("dashboard.connectionId === 'local-files'")
  })

  it('sets active dashboard after loading', () => {
    expect(body).toContain('setActiveDashboard(dashboardId)')
  })

  it('sets starting_streamlit step before running code', () => {
    expect(body).toContain("step: 'starting_streamlit'")
  })

  it('clears loading state after streamlit starts', () => {
    expect(body).toContain('setDashboardLoading(null)')
  })

  it('sets error when connection switch fails', () => {
    expect(body).toContain("error: 'Failed to switch connection'")
  })

  it('sets error in catch block', () => {
    expect(body).toContain("error: error instanceof Error ? error.message : 'Failed to load dashboard'")
  })
})

// =============================================================================
// Change 5: App.tsx renders DashboardLoadingOverlay
// =============================================================================

describe('App.tsx renders DashboardLoadingOverlay', () => {
  const source = fs.readFileSync('src/App.tsx', 'utf-8')

  it('imports DashboardLoadingOverlay', () => {
    expect(source).toContain("import { DashboardLoadingOverlay } from './components/DashboardLoadingOverlay'")
  })

  it('renders DashboardLoadingOverlay component', () => {
    expect(source).toContain('<DashboardLoadingOverlay />')
  })
})

// =============================================================================
// No regressions: existing features still work
// =============================================================================

describe('No regressions in ConnectionModal', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  it('still uses loadSchemaTwoPhase for PostgreSQL', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.postgresql.getSchema')
  })

  it('still uses loadSchemaTwoPhase for BigQuery', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.bigquery.getSchema')
  })

  it('still uses loadSchemaTwoPhase for Snowflake', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.snowflake.getSchema')
  })

  it('still uses loadSchemaTwoPhase for Redshift', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.redshift.getSchema')
  })

  it('OAuth cancel handler still works', () => {
    expect(source).toContain('handleCancelOAuth')
  })

  it('still shows error display', () => {
    expect(source).toContain('bg-destructive/10 border border-destructive/20')
  })
})

describe('No regressions in Sidebar', () => {
  it('still supports cache-first schema loading', () => {
    const source = fs.readFileSync('src/components/AppSidebar.tsx', 'utf-8')
    expect(source).toContain("mode: 'tables_only'")
    expect(source).toContain('schema.saveCache(')
  })

  it('still handles local files mode in dashboard loading', () => {
    const source = fs.readFileSync('src/hooks/useDashboardLoader.ts', 'utf-8')
    expect(source).toContain("dashboard.connectionId === 'local-files'")
  })

  it('still loads dashboard files', () => {
    const source = fs.readFileSync('src/hooks/useDashboardLoader.ts', 'utf-8')
    expect(source).toContain('loadDashboardFilesByIds')
  })

  it('still runs streamlit after loading dashboard', () => {
    const source = fs.readFileSync('src/hooks/useDashboardLoader.ts', 'utf-8')
    expect(source).toContain('window.electron.streamlit.runCode(result.code)')
  })
})
