import { useAppStore } from '@/stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import {
  Pencil,
  Share2,
  Save,
  AlertTriangle,
  LayoutDashboard,
  FileSpreadsheet,
} from 'lucide-react'

interface DashboardTopBarProps {
  mainView: 'dashboard' | 'files'
  setMainView: (v: 'dashboard' | 'files') => void
}

export function DashboardTopBar({ mainView, setMainView }: DashboardTopBarProps) {
  const {
    currentPage,
    setCurrentPage,
    activeDashboardId,
    savedDashboards,
    generation,
  } = useAppStore(useShallow((state) => ({
    currentPage: state.currentPage,
    setCurrentPage: state.setCurrentPage,
    activeDashboardId: state.activeDashboardId,
    savedDashboards: state.savedDashboards,
    generation: state.generation,
  })))

  const activeDashboard = activeDashboardId
    ? savedDashboards.find(d => d.id === activeDashboardId)
    : null
  const dashboardName = activeDashboard?.name || 'Untitled Dashboard'
  const hasUnsavedChanges = generation.generatedCode && !activeDashboardId
  const isEditMode = currentPage === 'dashboard-edit'

  return (
    <div className="h-12 drag-region surface-1 border-b flex items-center justify-between pr-4 shrink-0 pl-4 relative win-titlebar-pad">
      {/* Left: Dashboard name + badge */}
      <div className="flex items-center gap-2.5 no-drag min-w-0">
        <h2 className="text-[14px] font-semibold truncate max-w-[300px]">{dashboardName}</h2>
        {activeDashboardId && (
          <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
            Saved
          </span>
        )}
        {hasUnsavedChanges && (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-2.5 w-2.5" />
            Unsaved
          </span>
        )}
      </div>

      {/* Center: Dashboard/Files toggle (only in view mode) */}
      {!isEditMode && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto no-drag flex items-center gap-px rounded-lg border bg-muted/60 p-0.5">
            {([
              { view: 'dashboard' as const, icon: LayoutDashboard, label: 'Dashboard' },
              { view: 'files' as const, icon: FileSpreadsheet, label: 'Files' },
            ]).map(({ view, icon: Icon, label }) => (
              <button
                key={view}
                onClick={() => setMainView(view)}
                className={cn(
                  'relative flex items-center gap-1.5 px-3 py-1 rounded-md text-[12px] font-medium transition-all duration-150',
                  mainView === view
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground/80'
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Right: Actions */}
      <div className="flex items-center gap-2 no-drag">
        {hasUnsavedChanges && (
          <Button
            size="sm"
            onClick={() => {
              // Trigger save modal via the parent
              const event = new CustomEvent('lumyr:save-dashboard')
              window.dispatchEvent(event)
            }}
            className="h-8 text-[12px] gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        )}
        {!isEditMode ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[12px] gap-1.5"
              disabled={!activeDashboardId}
              onClick={async () => {
                if (!activeDashboardId) return
                try {
                  await window.electron.dashboards.export(activeDashboardId)
                } catch (err) {
                  console.error('Failed to export dashboard:', err)
                }
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
            <Button
              size="sm"
              onClick={() => setCurrentPage('dashboard-edit')}
              className="h-8 text-[12px] gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage('dashboard-view')}
            className="h-8 text-[12px]"
          >
            Done Editing
          </Button>
        )}
      </div>
    </div>
  )
}
