import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAppStore, type DataSourceType } from '@/stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import { ConnectionModal } from './ConnectionModal'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { cn } from '@/lib/utils'
import {
  Database,
  Server,
  Snowflake,
  Cloud,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Unplug,
  Search,
  ChevronRight,
  ChevronDown,
  Shield,
  Table2,
  Columns3,
} from 'lucide-react'

const DATA_SOURCES: {
  type: DataSourceType
  name: string
  icon: React.ReactNode
  iconColor: string
  description: string
}[] = [
  { type: 'snowflake', name: 'Snowflake', icon: <Snowflake className="h-6 w-6" />, iconColor: 'text-cyan-500', description: 'Cloud data platform' },
  { type: 'bigquery', name: 'BigQuery', icon: <Database className="h-6 w-6" />, iconColor: 'text-blue-500', description: 'Google Cloud warehouse' },
  { type: 'postgresql', name: 'PostgreSQL', icon: <Server className="h-6 w-6" />, iconColor: 'text-indigo-500', description: 'Open-source database' },
  { type: 'redshift', name: 'Redshift', icon: <Cloud className="h-6 w-6" />, iconColor: 'text-orange-500', description: 'AWS data warehouse' },
  { type: 'file', name: 'Local File', icon: <FileSpreadsheet className="h-6 w-6" />, iconColor: 'text-emerald-500', description: 'CSV, JSON, Parquet' },
]

const TYPE_COLORS: Record<string, string> = {
  STRING: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  INTEGER: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  INT64: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  FLOAT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  FLOAT64: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  BOOLEAN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  BOOL: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  TIMESTAMP: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  DATE: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  DATETIME: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  NUMERIC: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DECIMAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

const SOURCE_LABELS: Record<string, string> = {
  bigquery: 'BigQuery',
  postgresql: 'PostgreSQL',
  snowflake: 'Snowflake',
  redshift: 'Redshift',
  file: 'Local Files',
}

export function ConnectionsPage() {
  const { connection, schema, savedConnections, setConnection, setSchema, setDashboardLoading, loadSavedConnections } = useAppStore(useShallow((state) => ({
    connection: state.connection,
    schema: state.schema,
    savedConnections: state.savedConnections,
    setConnection: state.setConnection,
    setSchema: state.setSchema,
    setDashboardLoading: state.setDashboardLoading,
    loadSavedConnections: state.loadSavedConnections,
  })))

  const [showConnectionModal, setShowConnectionModal] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_preselectedSource, setPreselectedSource] = useState<DataSourceType | undefined>()
  const [tableSearch, setTableSearch] = useState('')
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())

  const activeConn = savedConnections.find(c => c.id === connection.connectionId)
  const connType = activeConn?.type || 'bigquery'

  const handleOpenConnectionModal = (source?: DataSourceType) => {
    setPreselectedSource(source)
    setShowConnectionModal(true)
  }

  const getConnectorForType = (type: string) => {
    switch (type) {
      case 'postgresql': return window.electron.postgresql
      case 'snowflake': return window.electron.snowflake
      case 'redshift': return window.electron.redshift
      case 'netsuite': return window.electron.netsuite
      case 'odbc': return window.electron.odbc
      default: return window.electron.bigquery
    }
  }

  const handleDisconnect = async () => {
    try {
      const connector = getConnectorForType(connType)
      await connector.disconnect()
      setConnection({ isConnected: false, projectId: null, authType: null, connectionId: null, connectionName: null, error: null })
      setSchema(null)
    } catch (err) {
      console.error('Failed to disconnect:', err)
    }
  }

  const handleRefresh = async () => {
    if (!connection.isConnected) return
    try {
      setDashboardLoading({ isLoading: true, connectionName: connection.connectionName, step: 'loading_schema', error: null })
      const connector = getConnectorForType(connType)
      const result = await connector.getSchema({ mode: 'full' })
      if (result.success && result.schema) {
        setSchema(result.schema)
        if (connection.connectionId) {
          window.electron.schema.saveCache(connection.connectionId, result.schema)
        }
      }
      setDashboardLoading(null)
    } catch (err) {
      console.error('Failed to refresh schema:', err)
      setDashboardLoading(null)
    }
  }

  const [isLoadingFullSchema, setIsLoadingFullSchema] = useState(false)

  // Check if schema has columns loaded
  const schemaHasColumns = useMemo(() => {
    if (!schema) return false
    return schema.datasets.some(ds => ds.tables.some(t => t.columns.length > 0))
  }, [schema])

  // Auto-fetch full schema (with columns) when page mounts and columns are missing
  const fetchFullSchema = useCallback(async () => {
    if (!connection.isConnected || schemaHasColumns || isLoadingFullSchema) return
    setIsLoadingFullSchema(true)
    try {
      const connector = getConnectorForType(connType)
      const result = await connector.getSchema({ mode: 'full' })
      if (result.success && result.schema) {
        setSchema(result.schema)
        if (connection.connectionId) {
          window.electron.schema.saveCache(connection.connectionId, result.schema)
        }
      }
    } catch (err) {
      console.error('Failed to fetch full schema:', err)
    } finally {
      setIsLoadingFullSchema(false)
    }
  }, [connection.isConnected, connection.connectionId, connType, schemaHasColumns, isLoadingFullSchema, setSchema])

  useEffect(() => {
    if (connection.isConnected && schema && !schemaHasColumns) {
      fetchFullSchema()
    }
  }, [connection.isConnected, schema, schemaHasColumns]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTable = (tableKey: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev)
      if (next.has(tableKey)) next.delete(tableKey)
      else next.add(tableKey)
      return next
    })
  }

  // Flatten schema into tables with dataset prefix
  const allTables = useMemo(() => {
    if (!schema) return []
    const tables: { key: string; datasetId: string; tableId: string; columns: { name: string; type: string }[]; columnCount: number }[] = []
    for (const dataset of schema.datasets) {
      for (const table of dataset.tables) {
        const key = `${dataset.id}.${table.id}`
        tables.push({
          key,
          datasetId: dataset.id,
          tableId: table.id,
          columns: table.columns,
          columnCount: table.columns.length,
        })
      }
    }
    return tables
  }, [schema])

  const filteredTables = useMemo(() => {
    if (!tableSearch.trim()) return allTables
    const q = tableSearch.toLowerCase()
    return allTables.filter(t =>
      t.tableId.toLowerCase().includes(q) ||
      t.datasetId.toLowerCase().includes(q) ||
      t.columns.some(c => c.name.toLowerCase().includes(q))
    )
  }, [allTables, tableSearch])

  // No connection state
  if (!connection.isConnected) {
    return (
      <>
        <div className="h-full flex flex-col items-center justify-center bg-background px-8">
          <div className="max-w-lg w-full text-center stagger-children">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Database className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Connect your data warehouse</h1>
            <p className="text-sm text-muted-foreground mb-8">
              Link your data source to start building dashboards with natural language. All data stays local.
            </p>

            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Popular Sources
            </p>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
              {DATA_SOURCES.map((source) => (
                <button
                  key={source.type}
                  onClick={() => handleOpenConnectionModal(source.type)}
                  className="flex items-center gap-3 p-4 rounded-xl border bg-card hover:shadow-md hover:border-primary/20 transition-all duration-200 text-left"
                >
                  <div className={cn('shrink-0', source.iconColor)}>{source.icon}</div>
                  <div>
                    <p className="text-[13px] font-semibold">{source.name}</p>
                    <p className="text-[11px] text-muted-foreground">{source.description}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-8 flex items-center gap-2 justify-center text-[12px] text-emerald-600 dark:text-emerald-400">
              <Shield className="h-3.5 w-3.5" />
              Your data never leaves your infrastructure
            </div>
          </div>
        </div>

        <ConnectionModal isOpen={showConnectionModal} onClose={() => { setShowConnectionModal(false); loadSavedConnections() }} />
      </>
    )
  }

  // Connected state with tables explorer
  return (
    <>
      <div className="h-full flex flex-col bg-background overflow-hidden">
        {/* Drag region for titlebar */}
        <div className="h-12 drag-region shrink-0" />

        {/* Header */}
        <div className="px-8 pb-4 flex items-center justify-between win-titlebar-pad">
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <Button onClick={() => handleOpenConnectionModal()} size="sm" className="gap-1.5 h-9">
            <Plus className="h-3.5 w-3.5" />
            Add Connection
          </Button>
        </div>

        <div className="flex-1 overflow-auto px-8 pb-8">
          {/* Active connection card */}
          <div className="rounded-xl border bg-card p-5 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                  <Database className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[15px] font-semibold">{connection.connectionName || connection.projectId}</p>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground mt-0.5">
                    {SOURCE_LABELS[connType] || connType}
                    {activeConn?.database && ` | ${activeConn.database}`}
                    {connection.projectId && connType === 'bigquery' && ` | ${connection.projectId}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1.5 h-8">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-1.5 h-8 text-destructive hover:text-destructive">
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </Button>
              </div>
            </div>
          </div>

          {/* Tables section */}
          {schema && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Table2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Tables</h2>
                  <span className="text-xs text-muted-foreground/60">{allTables.length}</span>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <Input
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Search tables..."
                    className="h-8 pl-8 w-48 text-[12px]"
                  />
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[1fr_100px_100px] gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b">
                <span>Table Name</span>
                <span>Columns</span>
                <span>Dataset</span>
              </div>

              {/* Table rows */}
              <div className="divide-y">
                {filteredTables.map((table) => (
                  <div key={table.key}>
                    <button
                      onClick={() => toggleTable(table.key)}
                      className="w-full grid grid-cols-[1fr_100px_100px] gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors items-center"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {expandedTables.has(table.key)
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        }
                        <Table2 className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                        <span className="text-[13px] font-medium truncate">{table.tableId}</span>
                      </div>
                      <span className="text-[12px] text-muted-foreground">
                        {table.columnCount === 0 ? (isLoadingFullSchema ? '...' : '—') : `${table.columnCount} columns`}
                      </span>
                      <span className="text-[12px] text-muted-foreground truncate">{table.datasetId}</span>
                    </button>

                    {/* Expanded columns */}
                    {expandedTables.has(table.key) && (
                      <div className="pl-12 pr-4 pb-2 space-y-0.5">
                        {table.columns.length === 0 ? (
                          isLoadingFullSchema ? (
                            <div className="flex items-center gap-2 py-2 text-[12px] text-muted-foreground">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              Loading columns...
                            </div>
                          ) : (
                            <div className="py-2 text-[12px] text-muted-foreground">No columns available</div>
                          )
                        ) : (
                          table.columns.map((col) => (
                            <div key={col.name} className="flex items-center gap-2 py-1">
                              <Columns3 className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                              <span className="text-[12px]">{col.name}</span>
                              <span className={cn(
                                'text-[9px] font-medium uppercase px-1.5 py-0.5 rounded',
                                TYPE_COLORS[col.type.toUpperCase()] || 'bg-muted text-muted-foreground'
                              )}>
                                {col.type}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {filteredTables.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    {tableSearch ? 'No matching tables' : 'No tables found'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConnectionModal isOpen={showConnectionModal} onClose={() => { setShowConnectionModal(false); loadSavedConnections() }} />
    </>
  )
}
