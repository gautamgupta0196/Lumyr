import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAppStore, type DataSourceType } from '@/stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import { useDashboardLoader } from '@/hooks/useDashboardLoader'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import {
  Plus,
  Search,
  Star,
  Pencil,
  Trash2,
  Copy,
  Download,
  Upload,
  Check,
  X,
  MoreHorizontal,
} from 'lucide-react'
import { ImportDashboardModal } from './ImportDashboardModal'

// Gradient generation from dashboard name hash
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

const GRADIENT_PAIRS = [
  ['#3b82f6', '#8b5cf6'], // blue -> violet
  ['#06b6d4', '#3b82f6'], // cyan -> blue
  ['#10b981', '#06b6d4'], // emerald -> cyan
  ['#f59e0b', '#ef4444'], // amber -> red
  ['#8b5cf6', '#ec4899'], // violet -> pink
  ['#14b8a6', '#0ea5e9'], // teal -> sky
  ['#f97316', '#f59e0b'], // orange -> amber
  ['#6366f1', '#8b5cf6'], // indigo -> violet
]

function getDashboardGradient(name: string) {
  const hash = hashString(name)
  const pair = GRADIENT_PAIRS[hash % GRADIENT_PAIRS.length]
  const angle = (hash % 4) * 45 + 135
  return `linear-gradient(${angle}deg, ${pair[0]}, ${pair[1]})`
}

// Deterministic chart graphic SVGs based on dashboard name hash
function getChartSvg(name: string) {
  const hash = hashString(name)
  const type = hash % 4 // 0=bar, 1=line, 2=donut, 3=area

  if (type === 0) {
    // Bar chart
    const bars = [0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.45].map((base, i) => {
      const h = ((hash >> (i * 3)) % 40 + 30) / 100
      return Math.max(0.2, Math.min(0.95, base + (h - 0.5) * 0.4))
    })
    return (
      <svg viewBox="0 0 120 60" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {bars.map((h, i) => (
          <rect key={i} x={8 + i * 15} y={60 - h * 50} width={10} height={h * 50} rx={2} fill="white" opacity={0.25 + (i % 3) * 0.08} />
        ))}
      </svg>
    )
  }

  if (type === 1) {
    // Line chart
    const points = Array.from({ length: 8 }, (_, i) => {
      const y = ((hash >> (i * 4)) % 35 + 10)
      return `${10 + i * 14.5},${y}`
    })
    return (
      <svg viewBox="0 0 120 60" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        <polyline points={points.join(' ')} fill="none" stroke="white" strokeWidth="2" opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => {
          const [x, y] = p.split(',')
          return <circle key={i} cx={x} cy={y} r="2.5" fill="white" opacity={0.3} />
        })}
      </svg>
    )
  }

  if (type === 2) {
    // Donut chart
    const segments = [0.35, 0.25, 0.2, 0.2].map((base, i) => {
      return Math.max(0.1, base + ((hash >> (i * 5)) % 10 - 5) / 100)
    })
    const total = segments.reduce((a, b) => a + b, 0)
    const normalized = segments.map(s => s / total)
    let cumulative = 0
    const r = 20, cx = 60, cy = 30
    return (
      <svg viewBox="0 0 120 60" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {normalized.map((seg, i) => {
          const start = cumulative * Math.PI * 2 - Math.PI / 2
          cumulative += seg
          const end = cumulative * Math.PI * 2 - Math.PI / 2
          const x1 = cx + r * Math.cos(start)
          const y1 = cy + r * Math.sin(start)
          const x2 = cx + r * Math.cos(end)
          const y2 = cy + r * Math.sin(end)
          const large = seg > 0.5 ? 1 : 0
          return (
            <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`} fill="white" opacity={0.2 + i * 0.06} />
          )
        })}
        <circle cx={cx} cy={cy} r={10} fill="white" opacity={0.1} />
      </svg>
    )
  }

  // Area chart
  const pts = Array.from({ length: 8 }, (_, i) => {
    const y = ((hash >> (i * 3 + 1)) % 30 + 12)
    return [10 + i * 14.5, y] as [number, number]
  })
  const polyLine = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const areaPath = `M${pts[0][0]},55 ` + pts.map(([x, y]) => `L${x},${y}`).join(' ') + ` L${pts[pts.length - 1][0]},55 Z`
  return (
    <svg viewBox="0 0 120 60" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <path d={areaPath} fill="white" opacity={0.15} />
      <polyline points={polyLine} fill="none" stroke="white" strokeWidth="2" opacity={0.35} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Helpers
function relativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  const date = new Date(timestamp)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const SOURCE_BADGE: Record<DataSourceType | string, { label: string; className: string }> = {
  bigquery: { label: 'BigQuery', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  snowflake: { label: 'Snowflake', className: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' },
  postgresql: { label: 'PostgreSQL', className: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400' },
  redshift: { label: 'Redshift', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  file: { label: 'File', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
}
const DEFAULT_BADGE = { label: 'Unknown', className: 'bg-muted text-muted-foreground' }

// Context menu
interface ContextMenuState {
  x: number
  y: number
  dashboardId: string
}

function ContextMenu({ state, onRename, onDelete, onExport, onDuplicate, onClose }: {
  state: ContextMenuState
  onRename: () => void
  onDelete: () => void
  onExport: () => void
  onDuplicate: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const items = [
    { label: 'Rename', icon: Pencil, action: onRename },
    { label: 'Duplicate', icon: Copy, action: onDuplicate },
    { label: 'Export', icon: Download, action: onExport },
    { label: 'Delete', icon: Trash2, action: onDelete, destructive: true },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[160px] rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        top: Math.min(state.y, window.innerHeight - 180),
        left: Math.min(state.x, window.innerWidth - 180),
      }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
            item.destructive
              ? 'text-destructive hover:bg-destructive/10'
              : 'text-popover-foreground hover:bg-accent'
          )}
          onClick={() => { item.action(); onClose() }}
        >
          <item.icon className="h-3.5 w-3.5" />
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function DashboardsPage() {
  const { savedDashboards, savedConnections } = useAppStore(useShallow((state) => ({
    savedDashboards: state.savedDashboards,
    savedConnections: state.savedConnections,
  })))

  const {
    handleNewDashboard,
    handleLoadDashboard,
    handleDeleteDashboard,
    handleDuplicate,
    handleExport,
    loadSavedDashboards,
  } = useDashboardLoader()

  const [searchQuery, setSearchQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [cardMenu, setCardMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  const [importModal, setImportModal] = useState<{ manifest: any; zipPath: string } | null>(null)

  useEffect(() => {
    loadSavedDashboards()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close card menu when clicking outside
  useEffect(() => {
    if (!cardMenu) return
    const handleClick = () => setCardMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [cardMenu])

  const connectionMap = useMemo(() => {
    const map = new Map<string, (typeof savedConnections)[0]>()
    for (const c of savedConnections) map.set(c.id, c)
    return map
  }, [savedConnections])

  const getSourceType = useCallback(
    (connectionId: string): DataSourceType | string => {
      if (connectionId === 'local-files') return 'file'
      return connectionMap.get(connectionId)?.type || 'bigquery'
    },
    [connectionMap]
  )

  const filteredDashboards = useMemo(() => {
    let list = [...savedDashboards]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(d => d.name.toLowerCase().includes(q) || d.query?.toLowerCase().includes(q))
    }
    list.sort((a, b) => {
      const aFav = a.isFavorite ? 1 : 0
      const bFav = b.isFavorite ? 1 : 0
      if (aFav !== bFav) return bFav - aFav
      return b.updatedAt - a.updatedAt
    })
    return list
  }, [savedDashboards, searchQuery])

  const toggleFavorite = async (e: React.MouseEvent, dashboardId: string) => {
    e.stopPropagation()
    const dashboard = savedDashboards.find(d => d.id === dashboardId)
    if (!dashboard) return
    try {
      await window.electron.dashboards.update({ id: dashboardId, isFavorite: !dashboard.isFavorite })
      await loadSavedDashboards()
    } catch (error) {
      console.error('Failed to toggle favorite:', error)
    }
  }

  const handleStartRename = (dashboardId: string, currentName: string) => {
    setRenamingId(dashboardId)
    setRenameValue(currentName)
  }

  const handleConfirmRename = async (dashboardId: string) => {
    if (!renameValue.trim()) return
    try {
      await window.electron.dashboards.update({ id: dashboardId, name: renameValue.trim() })
      await loadSavedDashboards()
    } catch (error) {
      console.error('Failed to rename:', error)
    }
    setRenamingId(null)
    setRenameValue('')
  }

  const handleContextMenu = (e: React.MouseEvent, dashboardId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, dashboardId })
  }

  const handleImport = async () => {
    try {
      const result = await window.electron.dashboards.importFile()
      if (result.success && result.manifest && result.zipPath) {
        setImportModal({ manifest: result.manifest, zipPath: result.zipPath })
      }
    } catch (err) {
      console.error('Failed to open import:', err)
    }
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Drag region for macOS traffic lights / Windows titlebar */}
      <div className="h-12 drag-region shrink-0" />

      {/* Header */}
      <div className="px-6 pb-3 flex items-center justify-between win-titlebar-pad">
        <h1 className="text-xl font-bold tracking-tight">My Dashboards</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dashboards..."
              className="h-8 pl-9 w-56 text-[13px]"
            />
          </div>
          <Button variant="outline" onClick={handleImport} size="sm" className="gap-1.5 h-8 text-[12px]">
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button onClick={handleNewDashboard} size="sm" className="gap-1.5 h-8 text-[12px]">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Dashboard grid */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {filteredDashboards.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? 'No matching dashboards' : 'No saved dashboards yet. Create your first one!'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDashboards.map((dashboard) => {
              const sourceType = getSourceType(dashboard.connectionId)
              const badge = SOURCE_BADGE[sourceType] || DEFAULT_BADGE
              const isFavorited = !!dashboard.isFavorite
              const isRenaming = renamingId === dashboard.id
              const connName = connectionMap.get(dashboard.connectionId)?.name

              return (
                <div
                  key={dashboard.id}
                  className="group rounded-xl border bg-card overflow-hidden cursor-pointer hover:shadow-md hover:border-primary/20 transition-all duration-200"
                  onClick={() => !isRenaming && handleLoadDashboard(dashboard.id)}
                  onContextMenu={(e) => handleContextMenu(e, dashboard.id)}
                >
                  {/* Gradient thumbnail with chart graphic */}
                  <div
                    className="h-24 relative"
                    style={{ background: getDashboardGradient(dashboard.name) }}
                  >
                    {/* Chart graphic */}
                    <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                      {getChartSvg(dashboard.name)}
                    </div>

                    {/* Top-right actions */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        className={cn(
                          'p-1 rounded-full transition-all',
                          isFavorited
                            ? 'text-amber-400 bg-black/20'
                            : 'text-white/60 opacity-0 group-hover:opacity-100 hover:!text-amber-400 bg-black/20'
                        )}
                        onClick={(e) => toggleFavorite(e, dashboard.id)}
                      >
                        <Star className="h-3.5 w-3.5" fill={isFavorited ? 'currentColor' : 'none'} />
                      </button>

                      {/* Three-dot menu (always visible) */}
                      <button
                        className="p-1 rounded-full text-white/60 hover:!text-white bg-black/20 transition-all"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (cardMenu?.id === dashboard.id) {
                            setCardMenu(null)
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setCardMenu({ id: dashboard.id, x: rect.right, y: rect.bottom + 4 })
                          }
                        }}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card body */}
                  <div className="px-3 py-2.5">
                    {isRenaming ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); handleConfirmRename(dashboard.id) }
                            else if (e.key === 'Escape') { setRenamingId(null); setRenameValue('') }
                          }}
                          className="h-7 text-[13px] flex-1"
                          autoFocus
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-green-600" onClick={(e) => { e.stopPropagation(); handleConfirmRename(dashboard.id) }}>
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); setRenamingId(null); setRenameValue('') }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold truncate">{dashboard.name}</p>
                          <span className={cn(
                            'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none shrink-0',
                            badge.className
                          )}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                          <span>{relativeTime(dashboard.updatedAt)}</span>
                          {connName && (
                            <>
                              <span className="text-muted-foreground/30">&middot;</span>
                              <span className="truncate max-w-[120px]">{connName}</span>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>

      {/* Card three-dot menu (fixed position to avoid overflow clipping) */}
      {cardMenu && (
        <div
          className="fixed w-40 rounded-lg border bg-popover shadow-lg py-1 z-50 animate-in fade-in-0 zoom-in-95"
          style={{
            top: Math.min(cardMenu.y, window.innerHeight - 180),
            left: cardMenu.x - 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-popover-foreground hover:bg-accent transition-colors"
            onClick={() => { handleStartRename(cardMenu.id, savedDashboards.find(d => d.id === cardMenu.id)?.name || ''); setCardMenu(null) }}
          >
            <Pencil className="h-3.5 w-3.5" /> Rename
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-popover-foreground hover:bg-accent transition-colors"
            onClick={() => { handleDuplicate(cardMenu.id); setCardMenu(null) }}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicate
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-popover-foreground hover:bg-accent transition-colors"
            onClick={() => { handleExport(cardMenu.id); setCardMenu(null) }}
          >
            <Download className="h-3.5 w-3.5" /> Export
          </button>
          <div className="border-t my-1" />
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => { handleDeleteDashboard(cardMenu.id); setCardMenu(null) }}
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          onRename={() => {
            const d = savedDashboards.find(d => d.id === contextMenu.dashboardId)
            if (d) handleStartRename(d.id, d.name)
          }}
          onDelete={() => handleDeleteDashboard(contextMenu.dashboardId)}
          onExport={() => handleExport(contextMenu.dashboardId)}
          onDuplicate={() => handleDuplicate(contextMenu.dashboardId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {importModal && (
        <ImportDashboardModal
          isOpen={!!importModal}
          manifest={importModal.manifest}
          zipPath={importModal.zipPath}
          connections={savedConnections.map(c => ({ id: c.id, name: c.name, projectId: c.projectId }))}
          onClose={() => setImportModal(null)}
          onImported={() => { setImportModal(null); loadSavedDashboards() }}
        />
      )}
    </div>
  )
}
