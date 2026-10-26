import { useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { useDashboardLoader } from '@/hooks/useDashboardLoader'
import { SettingsModal } from './SettingsModal'
import {
  Plus,
  BarChart3,
  Database,
  Settings,
} from 'lucide-react'

export function DashboardIconRail() {
  const setCurrentPage = useAppStore((s) => s.setCurrentPage)
  const { handleNewDashboard } = useDashboardLoader()
  const [showSettings, setShowSettings] = useState(false)

  // Order matches AppSidebar: Connections, New Dashboard, My Dashboards
  const navItems = [
    { icon: Database, tooltip: 'Connections', action: () => setCurrentPage('connections') },
    { icon: Plus, tooltip: 'New Dashboard', action: handleNewDashboard },
    { icon: BarChart3, tooltip: 'My Dashboards', action: () => setCurrentPage('dashboards') },
  ]

  return (
    <>
      <div className="w-20 shrink-0 sidebar-dark flex flex-col items-center py-3 gap-1">
        {/* Drag region spacer for macOS traffic lights */}
        <div className="h-9 w-full drag-region" />

        {/* Nav icons */}
        {navItems.map(({ icon: Icon, tooltip, action }) => (
          <div key={tooltip} className="relative group">
            <button
              onClick={action}
              className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors no-drag"
              style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--sidebar-accent))')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium bg-foreground text-background rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {tooltip}
            </span>
          </div>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings */}
        <div className="relative group">
          <button
            onClick={() => setShowSettings(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors no-drag"
            style={{ color: 'hsl(var(--sidebar-muted-foreground))' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'hsl(var(--sidebar-accent))')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <Settings className="h-[18px] w-[18px]" />
          </button>
          <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[11px] font-medium bg-foreground text-background rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            Settings
          </span>
        </div>

      </div>

      {showSettings && <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />}
    </>
  )
}
