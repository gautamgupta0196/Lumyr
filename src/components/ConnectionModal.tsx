import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore, type SavedConnection, type DataSourceType } from '@/stores/app-store'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import {
  User,
  Loader2,
  X,
  FileKey,
  Database,
  Trash2,
  ChevronRight,
  Star,
  Check,
  Server,
  Snowflake,
  Cloud,
  FileSpreadsheet,
  RefreshCw,
  Pencil,
  CheckCircle2,
  Circle,
  Plus,
  ChevronDown
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ConnectionModalProps {
  isOpen: boolean
  onClose: () => void
}

type ModalView = 'list' | 'new' | 'edit'
type ConnectionStep = 'connecting' | 'connected' | 'loading_schema' | 'schema_loaded'

// Data source configuration
const DATA_SOURCES: {
  type: DataSourceType
  name: string
  icon: React.ReactNode
  color: string
  description: string
}[] = [
  {
    type: 'bigquery',
    name: 'BigQuery',
    icon: <Database className="h-5 w-5" />,
    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    description: 'Google Cloud data warehouse'
  },
  {
    type: 'postgresql',
    name: 'PostgreSQL',
    icon: <Server className="h-5 w-5" />,
    color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
    description: 'Open-source relational database'
  },
  {
    type: 'snowflake',
    name: 'Snowflake',
    icon: <Snowflake className="h-5 w-5" />,
    color: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400',
    description: 'Cloud data platform'
  },
  {
    type: 'redshift',
    name: 'Redshift',
    icon: <Cloud className="h-5 w-5" />,
    color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
    description: 'AWS data warehouse'
  },
  {
    type: 'netsuite' as DataSourceType,
    name: 'Oracle NetSuite',
    icon: <Database className="h-5 w-5" />,
    color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
    description: 'NetSuite WMS / ERP via SuiteQL'
  },
  {
    type: 'odbc' as DataSourceType,
    name: 'ODBC',
    icon: <Server className="h-5 w-5" />,
    color: 'bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400',
    description: 'Any ODBC-compatible database'
  },
  {
    type: 'file',
    name: 'Local Files',
    icon: <FileSpreadsheet className="h-5 w-5" />,
    color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    description: 'CSV & Excel files only'
  }
]

export function ConnectionModal({ isOpen, onClose }: ConnectionModalProps) {
  const { setConnection, setSchema, setLoadingSchema, loadSavedConnections, savedConnections, connection } = useAppStore()
  const [isConnecting, setIsConnecting] = useState(false)
  const [authMethod, setAuthMethod] = useState<'oauth' | 'service_account' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ModalView>('list')
  const [selectedSource, setSelectedSource] = useState<DataSourceType>('bigquery')

  // Form state for all connection types
  const [connectionName, setConnectionName] = useState('')

  // BigQuery
  const [projectId, setProjectId] = useState('')

  // PostgreSQL / Redshift
  const [host, setHost] = useState('')
  const [port, setPort] = useState('5432')
  const [database, setDatabase] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [useSSL, setUseSSL] = useState(true)
  const [connectionString, setConnectionString] = useState('')
  const [useConnectionString, setUseConnectionString] = useState(false)

  // Snowflake
  const [account, setAccount] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [sfDatabase, setSfDatabase] = useState('')
  const [sfSchema, setSfSchema] = useState('')
  const [sfUsername, setSfUsername] = useState('')
  const [sfPassword, setSfPassword] = useState('')

  // Redshift specific
  const [region, setRegion] = useState('us-east-1')

  // NetSuite specific
  const [nsAccountId, setNsAccountId] = useState('')
  const [nsConsumerKey, setNsConsumerKey] = useState('')
  const [nsConsumerSecret, setNsConsumerSecret] = useState('')
  const [nsTokenId, setNsTokenId] = useState('')
  const [nsTokenSecret, setNsTokenSecret] = useState('')

  // ODBC specific
  const [odbcConnectionString, setOdbcConnectionString] = useState('')
  const [odbcDsn, setOdbcDsn] = useState('')
  const [odbcDriver, setOdbcDriver] = useState('')
  const [odbcUseConnString, setOdbcUseConnString] = useState(true)

  // MCP servers
  const [mcpServers, setMcpServers] = useState<Array<{ name: string; url: string; apiKey: string }>>([])
  const [showMcpSection, setShowMcpSection] = useState(false)

  // MCP servers for edit mode
  const [editMcpServers, setEditMcpServers] = useState<Array<{ name: string; url: string; apiKey: string }>>([])
  const [showEditMcpSection, setShowEditMcpSection] = useState(false)

  // Custom instructions
  const [customInstructions, setCustomInstructions] = useState('')
  const [showCustomInstructions, setShowCustomInstructions] = useState(false)

  // Custom instructions for edit mode
  const [editCustomInstructions, setEditCustomInstructions] = useState('')
  const [showEditCustomInstructions, setShowEditCustomInstructions] = useState(false)

  const [connectionStep, setConnectionStep] = useState<ConnectionStep | null>(null)
  const [schemaTableCount, setSchemaTableCount] = useState<number | null>(null)

  const [reconnectingId, setReconnectingId] = useState<string | null>(null)
  const [editingConnection, setEditingConnection] = useState<SavedConnection | null>(null)
  const [editName, setEditName] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editHost, setEditHost] = useState('')
  const [editPort, setEditPort] = useState('5432')
  const [editDatabase, setEditDatabase] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editSSL, setEditSSL] = useState(true)
  const [editUseConnectionString, setEditUseConnectionString] = useState(false)
  const [editConnectionString, setEditConnectionString] = useState('')
  // Snowflake edit state
  const [editAccount, setEditAccount] = useState('')
  const [editWarehouse, setEditWarehouse] = useState('')
  const [editSfDatabase, setEditSfDatabase] = useState('')
  const [editSfSchema, setEditSfSchema] = useState('')
  const [editSfUsername, setEditSfUsername] = useState('')
  const [editSfPassword, setEditSfPassword] = useState('')
  const [editRole, setEditRole] = useState('')
  // Redshift edit state
  const [editRegion, setEditRegion] = useState('us-east-1')
  const [editRsHost, setEditRsHost] = useState('')
  const [editRsPort, setEditRsPort] = useState('5439')
  const [editRsDatabase, setEditRsDatabase] = useState('')
  const [editRsUsername, setEditRsUsername] = useState('')
  const [editRsPassword, setEditRsPassword] = useState('')

  // Schema loading helper: fast table names, saves to disk cache
  const loadSchemaTwoPhase = async (
    getSchemaFn: (options?: { mode?: 'tables_only' | 'full' }) => Promise<{ success: boolean; schema?: any; metadata?: { totalTables: number } }>,
    onTablesLoaded?: (count: number) => void,
    connectionId?: string
  ) => {
    setLoadingSchema(true)
    const tablesResult = await getSchemaFn({ mode: 'tables_only' })
    if (tablesResult.success && tablesResult.schema) {
      setSchema(tablesResult.schema)
      if (connectionId) {
        window.electron.schema.saveCache(connectionId, tablesResult.schema)
      }
    }
    const totalTables = tablesResult.metadata?.totalTables ?? 0
    onTablesLoaded?.(totalTables)
    setLoadingSchema(false)
  }

  // Load saved connections on mount
  useEffect(() => {
    if (isOpen) {
      loadSavedConnections()
      resetForm()
    }
  }, [isOpen])

  // Update view based on connections
  useEffect(() => {
    if (isOpen) {
      setView(savedConnections.length > 0 ? 'list' : 'new')
    }
  }, [savedConnections.length, isOpen])

  const resetForm = () => {
    setConnectionName('')
    setProjectId('')
    setHost('')
    setPort('5432')
    setDatabase('')
    setUsername('')
    setPassword('')
    setUseSSL(true)
    setConnectionString('')
    setUseConnectionString(false)
    setAccount('')
    setWarehouse('')
    setSfDatabase('')
    setSfSchema('')
    setSfUsername('')
    setSfPassword('')
    setRegion('us-east-1')
    setError(null)
    setConnectionStep(null)
    setSchemaTableCount(null)
    setEditingConnection(null)
    setEditName('')
    setEditLoading(false)
    setEditSaving(false)
    setEditHost('')
    setEditPort('5432')
    setEditDatabase('')
    setEditUsername('')
    setEditPassword('')
    setEditSSL(true)
    setEditUseConnectionString(false)
    setEditConnectionString('')
    setMcpServers([])
    setShowMcpSection(false)
    setEditMcpServers([])
    setShowEditMcpSection(false)
    setCustomInstructions('')
    setShowCustomInstructions(false)
    setEditCustomInstructions('')
    setShowEditCustomInstructions(false)
  }

  if (!isOpen) return null

  const handleSwitchConnection = async (conn: SavedConnection) => {
    // Skip if already active
    if (connection.connectionId === conn.id) {
      onClose()
      return
    }
    setIsConnecting(true)
    setError(null)

    try {
      const connType = conn.type || 'bigquery'
      console.log('[ConnectionModal] Switching to connection:', conn.id, 'type:', connType, 'name:', conn.name)

      if (connType === 'postgresql') {
        const result = await window.electron.postgresql.switchConnection(conn.id)
        console.log('[ConnectionModal] PG switch result:', result)

        if (result.success) {
          setConnection({
            isConnected: true,
            projectId: result.database || conn.database,
            authType: 'password',
            connectionId: conn.id,
            connectionName: conn.name,
            error: null
          })

          await loadSchemaTwoPhase(window.electron.postgresql.getSchema, undefined, conn.id)

          onClose()
        } else {
          setError(result.error || 'Failed to switch connection')
        }
      } else if (connType === 'snowflake') {
        const result = await window.electron.snowflake.switchConnection(conn.id)

        if (result.success) {
          setConnection({
            isConnected: true,
            projectId: result.database || conn.database,
            authType: 'password',
            connectionId: conn.id,
            connectionName: conn.name,
            error: null
          })

          await loadSchemaTwoPhase(window.electron.snowflake.getSchema, undefined, conn.id)

          onClose()
        } else {
          setError(result.error || 'Failed to switch connection')
        }
      } else if (connType === 'redshift') {
        const result = await window.electron.redshift.switchConnection(conn.id)

        if (result.success) {
          setConnection({
            isConnected: true,
            projectId: result.database || conn.database,
            authType: 'password',
            connectionId: conn.id,
            connectionName: conn.name,
            error: null
          })

          await loadSchemaTwoPhase(window.electron.redshift.getSchema, undefined, conn.id)

          onClose()
        } else {
          setError(result.error || 'Failed to switch connection')
        }
      } else {
        const result = await window.electron.bigquery.switchConnection(conn.id)

        if (result.success) {
          setConnection({
            isConnected: true,
            projectId: result.projectId,
            authType: conn.authType || null,
            connectionId: conn.id,
            connectionName: conn.name,
            error: null
          })

          await loadSchemaTwoPhase(window.electron.bigquery.getSchema, undefined, conn.id)

          onClose()
        } else {
          setError(result.error || 'Failed to switch connection')
        }
      }
    } catch (err) {
      console.error('[ConnectionModal] Switch connection error:', err)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleReconnect = async (e: React.MouseEvent, connId: string) => {
    e.stopPropagation()
    setReconnectingId(connId)
    setError(null)

    try {
      const result = await window.electron.bigquery.reconnect(connId)
      if (result.success) {
        const conn = savedConnections.find(c => c.id === connId)
        if (conn) {
          setConnection({
            isConnected: true,
            projectId: conn.projectId,
            authType: conn.authType || null,
            connectionId: conn.id,
            connectionName: conn.name,
            error: null
          })

          await loadSchemaTwoPhase(window.electron.bigquery.getSchema, undefined, conn.id)
        }
        await loadSavedConnections()
        onClose()
      } else {
        setError(result.error || 'Reconnect failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconnect failed')
    } finally {
      setReconnectingId(null)
    }
  }

  const handleSetDefault = async (e: React.MouseEvent, connId: string) => {
    e.stopPropagation()
    try {
      await window.electron.connections.setDefault(connId)
      await loadSavedConnections()
    } catch (err) {
      console.error('Failed to set default connection:', err)
    }
  }

  const handleDeleteConnection = async (e: React.MouseEvent, connId: string) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this connection?')) {
      try {
        await window.electron.connections.delete(connId)
        await loadSavedConnections()
      } catch (err) {
        console.error('Failed to delete connection:', err)
      }
    }
  }

  const handleEditConnection = async (e: React.MouseEvent, conn: SavedConnection) => {
    e.stopPropagation()
    setEditingConnection(conn)
    setEditName(conn.name)
    setEditMcpServers((conn.mcpServers || []).map(s => ({ name: s.name, url: s.url, apiKey: s.apiKey || '' })))
    setShowEditMcpSection((conn.mcpServers?.length || 0) > 0)
    setEditCustomInstructions(conn.customInstructions || '')
    setShowEditCustomInstructions(!!(conn.customInstructions))
    setError(null)
    setView('edit')

    const connType = conn.type || 'bigquery'
    setEditLoading(true)
    try {
      if (connType === 'postgresql') {
        const result = await window.electron.postgresql.getConnectionDetails(conn.id)
        if (result.success && result.connection) {
          setEditHost(result.connection.host)
          setEditPort(String(result.connection.port))
          setEditDatabase(result.connection.database)
          setEditUsername(result.connection.username)
          setEditPassword(result.connection.password)
          setEditSSL(result.connection.ssl)
        }
      } else if (connType === 'snowflake') {
        const result = await window.electron.snowflake.getConnectionDetails(conn.id)
        if (result.success && result.connection) {
          setEditAccount(result.connection.account)
          setEditWarehouse(result.connection.warehouse)
          setEditSfDatabase(result.connection.database)
          setEditSfSchema(result.connection.schema)
          setEditSfUsername(result.connection.username)
          setEditSfPassword(result.connection.password)
          setEditRole(result.connection.role || '')
        }
      } else if (connType === 'redshift') {
        const result = await window.electron.redshift.getConnectionDetails(conn.id)
        if (result.success && result.connection) {
          setEditRsHost(result.connection.host)
          setEditRsPort(String(result.connection.port))
          setEditRsDatabase(result.connection.database)
          setEditRegion(result.connection.region)
          setEditRsUsername(result.connection.username)
          setEditRsPassword(result.connection.password)
        }
      }
    } catch (err) {
      console.error('Failed to fetch connection details:', err)
    } finally {
      setEditLoading(false)
    }
  }

  const handleSaveEdit = async () => {
    if (!editingConnection) return
    const trimmed = editName.trim()
    if (!trimmed) {
      setError('Connection name cannot be empty')
      return
    }

    const connType = editingConnection.type || 'bigquery'
    setEditSaving(true)
    setError(null)

    try {
      if (connType === 'postgresql') {
        // Full PostgreSQL update with test
        const params = editUseConnectionString
          ? { connectionString: editConnectionString.trim(), connectionName: trimmed }
          : {
              host: editHost,
              port: parseInt(editPort) || 5432,
              database: editDatabase,
              username: editUsername,
              password: editPassword,
              ssl: editSSL,
              connectionName: trimmed
            }

        const result = await window.electron.postgresql.update(editingConnection.id, params)
        if (!result.success) {
          setError(result.error || 'Failed to update connection')
          return
        }

        // If this is the active connection, refresh schema
        if (connection.connectionId === editingConnection.id) {
          setConnection({ connectionName: trimmed, projectId: result.database })
          await loadSchemaTwoPhase(window.electron.postgresql.getSchema, undefined, editingConnection.id)
        }
      } else if (connType === 'snowflake') {
        const params = {
          account: editAccount,
          warehouse: editWarehouse,
          database: editSfDatabase,
          schema: editSfSchema || 'PUBLIC',
          role: editRole || undefined,
          username: editSfUsername,
          password: editSfPassword,
          connectionName: trimmed
        }
        const result = await window.electron.snowflake.update(editingConnection.id, params)
        if (!result.success) {
          setError(result.error || 'Failed to update connection')
          return
        }

        if (connection.connectionId === editingConnection.id) {
          setConnection({ connectionName: trimmed, projectId: result.database })
          await loadSchemaTwoPhase(window.electron.snowflake.getSchema, undefined, editingConnection.id)
        }
      } else if (connType === 'redshift') {
        const params = {
          host: editRsHost,
          port: parseInt(editRsPort) || 5439,
          database: editRsDatabase,
          region: editRegion,
          username: editRsUsername,
          password: editRsPassword,
          connectionName: trimmed
        }
        const result = await window.electron.redshift.update(editingConnection.id, params)
        if (!result.success) {
          setError(result.error || 'Failed to update connection')
          return
        }

        if (connection.connectionId === editingConnection.id) {
          setConnection({ connectionName: trimmed, projectId: result.database })
          await loadSchemaTwoPhase(window.electron.redshift.getSchema, undefined, editingConnection.id)
        }
      } else {
        // BigQuery name-only update
        await window.electron.connections.update(editingConnection.id, { name: trimmed })

        if (connection.connectionId === editingConnection.id) {
          setConnection({ connectionName: trimmed })
        }
      }

      // Save MCP servers for the edited connection
      const mcpConfig = cleanMcpServers(editMcpServers)
      if ((mcpConfig && mcpConfig.length > 0) || editingConnection.mcpServers?.length) {
        await window.electron.connections.update(editingConnection.id, {
          mcpServers: mcpConfig && mcpConfig.length > 0 ? mcpConfig : undefined
        })
      }

      // Save custom instructions for the edited connection
      const trimmedInstructions = editCustomInstructions.trim()
      if (trimmedInstructions || editingConnection.customInstructions) {
        await window.electron.connections.update(editingConnection.id, {
          customInstructions: trimmedInstructions || undefined
        })
      }

      await loadSavedConnections()
      setEditingConnection(null)
      setView('list')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update connection')
    } finally {
      setEditSaving(false)
    }
  }

  const handleUpdateServiceAccount = async () => {
    if (!editingConnection) return
    setEditSaving(true)
    setError(null)

    try {
      const fileResult = await window.electron.bigquery.selectServiceAccountFile()
      if (!fileResult.success || !fileResult.filePath) {
        setEditSaving(false)
        return
      }

      const result = await window.electron.bigquery.updateServiceAccount(
        editingConnection.id,
        fileResult.filePath,
        editName.trim() || undefined
      )

      if (result.success) {
        if (connection.connectionId === editingConnection.id) {
          setConnection({ projectId: result.projectId, connectionName: editName.trim() })
          await loadSchemaTwoPhase(window.electron.bigquery.getSchema, undefined, editingConnection.id)
        }
        await loadSavedConnections()
        setEditingConnection(null)
        setView('list')
      } else {
        setError(result.error || 'Failed to update service account')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update service account')
    } finally {
      setEditSaving(false)
    }
  }

  const handleEditReconnect = async () => {
    if (!editingConnection) return
    setEditSaving(true)
    setError(null)

    try {
      // Save name first if changed
      const trimmed = editName.trim()
      if (trimmed && trimmed !== editingConnection.name) {
        await window.electron.connections.update(editingConnection.id, { name: trimmed })
      }

      const result = await window.electron.bigquery.reconnect(editingConnection.id)
      if (result.success) {
        if (connection.connectionId === editingConnection.id || !connection.isConnected) {
          setConnection({
            isConnected: true,
            projectId: editingConnection.projectId,
            authType: editingConnection.authType || null,
            connectionId: editingConnection.id,
            connectionName: trimmed || editingConnection.name,
            error: null
          })
          await loadSchemaTwoPhase(window.electron.bigquery.getSchema, undefined, editingConnection.id)
        }
        await loadSavedConnections()
        setEditingConnection(null)
        setView('list')
      } else {
        setError(result.error || 'Re-authentication failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-authentication failed')
    } finally {
      setEditSaving(false)
    }
  }

  const handleCancelOAuth = async () => {
    await window.electron.bigquery.cancelOAuth()
    setIsConnecting(false)
    setAuthMethod(null)
    setError('Authentication cancelled')
  }

  const handleBigQueryOAuthConnect = async () => {
    if (!projectId.trim()) {
      setError('Please enter your GCP Project ID')
      return
    }

    setIsConnecting(true)
    setAuthMethod('oauth')
    setError(null)
    setConnectionStep('connecting')

    try {
      const result = await window.electron.bigquery.connectWithOAuth(
        projectId.trim(),
        connectionName || undefined
      )

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.projectId,
          authType: 'oauth',
          connectionId: result.connectionId || null,
          connectionName: connectionName || result.projectId || null,
          error: null
        })

        // Save MCP servers if configured
        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        // Save custom instructions if provided
        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.bigquery.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'OAuth failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
      setAuthMethod(null)
    }
  }

  const handleBigQueryServiceAccountConnect = async () => {
    setIsConnecting(true)
    setAuthMethod('service_account')
    setError(null)

    try {
      const fileResult = await window.electron.bigquery.selectServiceAccountFile()

      if (!fileResult.success || !fileResult.filePath) {
        setIsConnecting(false)
        setAuthMethod(null)
        return
      }

      setConnectionStep('connecting')
      const result = await window.electron.bigquery.connectWithServiceAccount(
        fileResult.filePath,
        connectionName || undefined
      )

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.projectId,
          authType: 'service_account',
          connectionId: result.connectionId || null,
          connectionName: connectionName || result.projectId || null,
          error: null
        })

        // Save MCP servers if configured
        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        // Save custom instructions if provided
        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.bigquery.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'Service account connection failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
      setAuthMethod(null)
    }
  }

  const handlePostgreSQLConnect = async () => {
    if (useConnectionString) {
      if (!connectionString.trim()) {
        setError('Please enter a connection string')
        return
      }
    } else if (!host || !database || !username) {
      setError('Host, database, and username are required')
      return
    }

    setIsConnecting(true)
    setError(null)
    setConnectionStep('connecting')

    try {
      const result = await window.electron.postgresql.connect(
        useConnectionString
          ? { connectionString: connectionString.trim(), connectionName: connectionName || undefined }
          : { host, port: parseInt(port) || 5432, database, username, password, ssl: useSSL, connectionName: connectionName || undefined }
      )

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.database,
          authType: 'password',
          connectionId: result.connectionId || null,
          connectionName: connectionName || result.database || null,
          error: null
        })

        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        // Save custom instructions if provided
        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.postgresql.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'Connection failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleSnowflakeConnect = async () => {
    if (!account || !warehouse || !sfDatabase || !sfUsername || !sfPassword) {
      setError('Account, warehouse, database, username, and password are required')
      return
    }

    setIsConnecting(true)
    setError(null)
    setConnectionStep('connecting')

    try {
      const result = await window.electron.snowflake.connect({
        account,
        warehouse,
        database: sfDatabase,
        schema: sfSchema || undefined,
        username: sfUsername,
        password: sfPassword,
        connectionName: connectionName || undefined
      })

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.database,
          authType: 'password',
          connectionId: result.connectionId || null,
          connectionName: connectionName || result.database || null,
          error: null
        })

        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        // Save custom instructions if provided
        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.snowflake.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'Connection failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleRedshiftConnect = async () => {
    if (!host || !database || !username || !password) {
      setError('Host, database, username, and password are required')
      return
    }

    setIsConnecting(true)
    setError(null)
    setConnectionStep('connecting')

    try {
      const result = await window.electron.redshift.connect({
        host,
        port: parseInt(port) || 5439,
        database,
        region,
        username,
        password,
        connectionName: connectionName || undefined
      })

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.database,
          authType: 'password',
          connectionId: result.connectionId || null,
          connectionName: connectionName || result.database || null,
          error: null
        })

        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        // Save custom instructions if provided
        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.redshift.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'Connection failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleNetSuiteConnect = async () => {
    if (!nsAccountId || !nsConsumerKey || !nsConsumerSecret || !nsTokenId || !nsTokenSecret) {
      setError('All NetSuite fields are required')
      return
    }

    setIsConnecting(true)
    setError(null)
    setConnectionStep('connecting')

    try {
      const result = await window.electron.netsuite.connect({
        accountId: nsAccountId,
        consumerKey: nsConsumerKey,
        consumerSecret: nsConsumerSecret,
        tokenId: nsTokenId,
        tokenSecret: nsTokenSecret,
        connectionName: connectionName || undefined
      })

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.database,
          authType: 'password',
          connectionId: result.connectionId || null,
          connectionName: connectionName || `NetSuite (${nsAccountId})`,
          error: null
        })

        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.netsuite.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'Connection failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleODBCConnect = async () => {
    if (odbcUseConnString) {
      if (!odbcConnectionString.trim()) {
        setError('Please enter a connection string')
        return
      }
    } else if (!odbcDsn && !odbcDriver) {
      setError('Either a DSN or driver name is required')
      return
    }

    setIsConnecting(true)
    setError(null)
    setConnectionStep('connecting')

    try {
      const result = await window.electron.odbc.connect(
        odbcUseConnString
          ? { connectionString: odbcConnectionString.trim(), connectionName: connectionName || undefined }
          : {
              dsn: odbcDsn || undefined,
              driver: odbcDriver || undefined,
              host: host || undefined,
              port: port ? parseInt(port) : undefined,
              database: database || undefined,
              username: username || undefined,
              password: password || undefined,
              connectionName: connectionName || undefined
            }
      )

      if (result.success) {
        setConnectionStep('connected')
        setConnection({
          isConnected: true,
          projectId: result.database,
          authType: 'password',
          connectionId: result.connectionId || null,
          connectionName: connectionName || result.database || 'ODBC',
          error: null
        })

        const mcpConfig = cleanMcpServers(mcpServers)
        if (mcpConfig && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { mcpServers: mcpConfig })
        }

        if (customInstructions.trim() && result.connectionId) {
          await window.electron.connections.update(result.connectionId, { customInstructions: customInstructions.trim() })
        }

        setConnectionStep('loading_schema')
        await loadSchemaTwoPhase(window.electron.odbc.getSchema, (count) => setSchemaTableCount(count), result.connectionId || undefined)
        setConnectionStep('schema_loaded')

        await loadSavedConnections()
        await new Promise(r => setTimeout(r, 500))
        onClose()
      } else {
        setConnectionStep(null)
        setError(result.error || 'Connection failed')
      }
    } catch (err) {
      setConnectionStep(null)
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleLocalFilesConnect = () => {
    // Set connection state to indicate local files mode
    setConnection({
      isConnected: true,
      projectId: 'local',
      authType: 'service_account', // Using service_account as a placeholder
      connectionId: 'local-files',
      connectionName: 'Local Files',
      error: null
    })

    // Set an empty schema since we're using files only
    setSchema({
      projectId: 'local',
      datasets: []
    })

    onClose()
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getSourceColor = (type: string) => {
    const source = DATA_SOURCES.find(s => s.type === type)
    return source?.color || 'bg-gray-100 text-gray-600'
  }

  const renderMcpSection = (
    servers: Array<{ name: string; url: string; apiKey: string }>,
    setServers: (s: Array<{ name: string; url: string; apiKey: string }>) => void,
    show: boolean,
    setShow: (s: boolean) => void,
    disabled: boolean
  ) => (
    <div className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShow(!show)}
      >
        <span>MCP Servers (Optional)</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", !show && "-rotate-90")} />
      </button>
      {show && (
        <div className="px-3 pb-3 space-y-3">
          {servers.map((server, idx) => (
            <div key={idx} className="space-y-2 p-2 rounded-md bg-muted/50">
              <div className="flex items-center gap-1.5">
                <Input
                  placeholder="Server name"
                  value={server.name}
                  onChange={(e) => {
                    const updated = [...servers]
                    updated[idx] = { ...updated[idx], name: e.target.value }
                    setServers(updated)
                  }}
                  disabled={disabled}
                  className="h-8 text-xs"
                />
                <button
                  type="button"
                  className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
                  onClick={() => setServers(servers.filter((_, i) => i !== idx))}
                  disabled={disabled}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                placeholder="URL (e.g., https://mcp.example.com/sse)"
                value={server.url}
                onChange={(e) => {
                  const updated = [...servers]
                  updated[idx] = { ...updated[idx], url: e.target.value }
                  setServers(updated)
                }}
                disabled={disabled}
                className="h-8 text-xs font-mono"
              />
              <Input
                type="password"
                placeholder="API Key (optional)"
                value={server.apiKey}
                onChange={(e) => {
                  const updated = [...servers]
                  updated[idx] = { ...updated[idx], apiKey: e.target.value }
                  setServers(updated)
                }}
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs"
            onClick={() => setServers([...servers, { name: '', url: '', apiKey: '' }])}
            disabled={disabled}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add MCP Server
          </Button>
        </div>
      )}
    </div>
  )

  const renderCustomInstructionsSection = (
    value: string,
    setValue: (s: string) => void,
    show: boolean,
    setShow: (s: boolean) => void,
    disabled: boolean
  ) => (
    <div className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShow(!show)}
      >
        <span>Custom Instructions (Optional)</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", !show && "-rotate-90")} />
      </button>
      {show && (
        <div className="px-3 pb-3">
          <Textarea
            placeholder="e.g., Always use dark-themed charts, our fiscal year starts in April..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled}
            className="text-xs min-h-[80px] resize-y"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            These instructions will be included in every prompt sent to Claude for this connection.
          </p>
        </div>
      )}
    </div>
  )

  // Helper to get clean MCP servers array for saving (filter out incomplete entries)
  const cleanMcpServers = (servers: Array<{ name: string; url: string; apiKey: string }>) => {
    const valid = servers.filter(s => s.name.trim() && s.url.trim())
    if (valid.length === 0) return undefined
    return valid.map(s => ({
      name: s.name.trim(),
      url: s.url.trim(),
      apiKey: s.apiKey.trim() || undefined
    }))
  }

  const renderConnectionForm = () => {
    switch (selectedSource) {
      case 'bigquery':
        return (
          <>
            {/* Project ID Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                GCP Project ID <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="e.g., my-project-123456"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            {/* Connection Name Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Name (optional)</label>
              <Input
                placeholder="e.g., Production, Analytics"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            {/* OAuth Option */}
            <button
              className="w-full p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left group disabled:opacity-50"
              onClick={handleBigQueryOAuthConnect}
              disabled={isConnecting || !projectId.trim()}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                  <User className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Sign in with Google</h3>
                  <p className="text-sm text-muted-foreground">
                    Use your Google account to access BigQuery.
                  </p>
                </div>
              </div>
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            {/* Service Account Option */}
            <button
              className="w-full p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left group disabled:opacity-50"
              onClick={handleBigQueryServiceAccountConnect}
              disabled={isConnecting}
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                  <FileKey className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Import Service Account Key</h3>
                  <p className="text-sm text-muted-foreground">
                    Use a JSON key file from Google Cloud Console.
                  </p>
                </div>
              </div>
            </button>

            {renderMcpSection(mcpServers, setMcpServers, showMcpSection, setShowMcpSection, isConnecting)}
            {renderCustomInstructionsSection(customInstructions, setCustomInstructions, showCustomInstructions, setShowCustomInstructions, isConnecting)}
          </>
        )

      case 'postgresql':
        return (
          <>
            {/* Toggle between fields and connection string */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setUseConnectionString(false)}
                disabled={isConnecting}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  !useConnectionString ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Fields
              </button>
              <button
                onClick={() => setUseConnectionString(true)}
                disabled={isConnecting}
                className={cn(
                  'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  useConnectionString ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                Connection String
              </button>
            </div>

            {useConnectionString ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Connection String <span className="text-destructive">*</span></label>
                  <Input
                    placeholder="postgresql://user:password@host:5432/database"
                    value={connectionString}
                    onChange={(e) => setConnectionString(e.target.value)}
                    disabled={isConnecting}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste the URI from your database provider (e.g. Supabase, Neon, Railway)
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Connection Name (optional)</label>
                  <Input
                    placeholder="e.g., Production DB"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Host <span className="text-destructive">*</span></label>
                    <Input
                      placeholder="localhost"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Port</label>
                    <Input
                      placeholder="5432"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Database <span className="text-destructive">*</span></label>
                  <Input
                    placeholder="postgres"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username <span className="text-destructive">*</span></label>
                    <Input
                      placeholder="postgres"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Connection Name (optional)</label>
                  <Input
                    placeholder="e.g., Production DB"
                    value={connectionName}
                    onChange={(e) => setConnectionName(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={useSSL}
                    onChange={(e) => setUseSSL(e.target.checked)}
                    disabled={isConnecting}
                    className="rounded"
                  />
                  Use SSL connection
                </label>
              </>
            )}

            {renderMcpSection(mcpServers, setMcpServers, showMcpSection, setShowMcpSection, isConnecting)}
            {renderCustomInstructionsSection(customInstructions, setCustomInstructions, showCustomInstructions, setShowCustomInstructions, isConnecting)}

            <Button
              className="w-full"
              onClick={handlePostgreSQLConnect}
              disabled={isConnecting || (useConnectionString ? !connectionString.trim() : !host || !database || !username)}
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
          </>
        )

      case 'snowflake':
        return (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account <span className="text-destructive">*</span></label>
              <Input
                placeholder="xy12345.us-east-1"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                disabled={isConnecting}
              />
              <p className="text-xs text-muted-foreground">
                Your Snowflake account identifier
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Warehouse <span className="text-destructive">*</span></label>
                <Input
                  placeholder="COMPUTE_WH"
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Database <span className="text-destructive">*</span></label>
                <Input
                  placeholder="MY_DATABASE"
                  value={sfDatabase}
                  onChange={(e) => setSfDatabase(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Schema (optional)</label>
              <Input
                placeholder="PUBLIC"
                value={sfSchema}
                onChange={(e) => setSfSchema(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Username <span className="text-destructive">*</span></label>
                <Input
                  placeholder="username"
                  value={sfUsername}
                  onChange={(e) => setSfUsername(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password <span className="text-destructive">*</span></label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={sfPassword}
                  onChange={(e) => setSfPassword(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Name (optional)</label>
              <Input
                placeholder="e.g., Snowflake Prod"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            {renderMcpSection(mcpServers, setMcpServers, showMcpSection, setShowMcpSection, isConnecting)}
            {renderCustomInstructionsSection(customInstructions, setCustomInstructions, showCustomInstructions, setShowCustomInstructions, isConnecting)}

            <Button
              className="w-full"
              onClick={handleSnowflakeConnect}
              disabled={isConnecting || !account || !warehouse || !sfDatabase || !sfUsername || !sfPassword}
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
          </>
        )

      case 'redshift':
        return (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Host <span className="text-destructive">*</span></label>
                <Input
                  placeholder="cluster.region.redshift.amazonaws.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Port</label>
                <Input
                  placeholder="5439"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Database <span className="text-destructive">*</span></label>
                <Input
                  placeholder="dev"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Region</label>
                <Input
                  placeholder="us-east-1"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Username <span className="text-destructive">*</span></label>
                <Input
                  placeholder="awsuser"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password <span className="text-destructive">*</span></label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isConnecting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Name (optional)</label>
              <Input
                placeholder="e.g., Redshift Analytics"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            {renderMcpSection(mcpServers, setMcpServers, showMcpSection, setShowMcpSection, isConnecting)}
            {renderCustomInstructionsSection(customInstructions, setCustomInstructions, showCustomInstructions, setShowCustomInstructions, isConnecting)}

            <Button
              className="w-full"
              onClick={handleRedshiftConnect}
              disabled={isConnecting || !host || !database || !username || !password}
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
          </>
        )

      case 'netsuite':
        return (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Account ID <span className="text-destructive">*</span></label>
              <Input
                placeholder="e.g., 1234567 or 1234567_SB1"
                value={nsAccountId}
                onChange={(e) => setNsAccountId(e.target.value)}
                disabled={isConnecting}
              />
              <p className="text-xs text-muted-foreground">Your NetSuite account ID. Use _SB1 suffix for sandbox.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Consumer Key <span className="text-destructive">*</span></label>
              <Input
                placeholder="Consumer key from integration record"
                value={nsConsumerKey}
                onChange={(e) => setNsConsumerKey(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Consumer Secret <span className="text-destructive">*</span></label>
              <Input
                type="password"
                placeholder="••••••••"
                value={nsConsumerSecret}
                onChange={(e) => setNsConsumerSecret(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Token ID <span className="text-destructive">*</span></label>
              <Input
                placeholder="Token ID from access token"
                value={nsTokenId}
                onChange={(e) => setNsTokenId(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Token Secret <span className="text-destructive">*</span></label>
              <Input
                type="password"
                placeholder="••••••••"
                value={nsTokenSecret}
                onChange={(e) => setNsTokenSecret(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Name (optional)</label>
              <Input
                placeholder="e.g., NetSuite Production"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            {renderMcpSection(mcpServers, setMcpServers, showMcpSection, setShowMcpSection, isConnecting)}
            {renderCustomInstructionsSection(customInstructions, setCustomInstructions, showCustomInstructions, setShowCustomInstructions, isConnecting)}

            <Button
              className="w-full"
              onClick={handleNetSuiteConnect}
              disabled={isConnecting || !nsAccountId || !nsConsumerKey || !nsConsumerSecret || !nsTokenId || !nsTokenSecret}
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
          </>
        )

      case 'odbc':
        return (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                className={cn('text-xs px-2.5 py-1 rounded-full transition-colors', odbcUseConnString ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                onClick={() => setOdbcUseConnString(true)}
                disabled={isConnecting}
              >
                Connection String
              </button>
              <button
                className={cn('text-xs px-2.5 py-1 rounded-full transition-colors', !odbcUseConnString ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80')}
                onClick={() => setOdbcUseConnString(false)}
                disabled={isConnecting}
              >
                Individual Fields
              </button>
            </div>

            {odbcUseConnString ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Connection String <span className="text-destructive">*</span></label>
                  <Textarea
                    placeholder={"DRIVER={SQL Server};SERVER=myserver;DATABASE=mydb;UID=user;PWD=pass\nDSN=MyOracleDB;UID=user;PWD=pass"}
                    value={odbcConnectionString}
                    onChange={(e) => setOdbcConnectionString(e.target.value)}
                    disabled={isConnecting}
                    rows={3}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Requires an ODBC driver from your database provider (e.g. Oracle, Microsoft, SAP).{' '}
                    Contact your IT team or database admin if you're unsure.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">DSN</label>
                    <Input
                      placeholder="Data Source Name"
                      value={odbcDsn}
                      onChange={(e) => setOdbcDsn(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Driver</label>
                    <Input
                      placeholder="e.g., SQL Server"
                      value={odbcDriver}
                      onChange={(e) => setOdbcDriver(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Host</label>
                    <Input
                      placeholder="hostname or IP"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Port</label>
                    <Input
                      placeholder="e.g., 1433"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Database</label>
                  <Input
                    placeholder="database name"
                    value={database}
                    onChange={(e) => setDatabase(e.target.value)}
                    disabled={isConnecting}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Username</label>
                    <Input
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isConnecting}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Name (optional)</label>
              <Input
                placeholder="e.g., SQL Server Analytics"
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
                disabled={isConnecting}
              />
            </div>

            {renderMcpSection(mcpServers, setMcpServers, showMcpSection, setShowMcpSection, isConnecting)}
            {renderCustomInstructionsSection(customInstructions, setCustomInstructions, showCustomInstructions, setShowCustomInstructions, isConnecting)}

            <Button
              className="w-full"
              onClick={handleODBCConnect}
              disabled={isConnecting || (odbcUseConnString ? !odbcConnectionString.trim() : (!odbcDsn && !odbcDriver))}
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Connect
            </Button>
          </>
        )

      case 'file':
        return (
          <div className="space-y-4">
            <div className="p-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400">
                  <FileSpreadsheet className="h-8 w-8" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
                    Work with Local Files Only
                  </h3>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Skip database connection and analyze CSV or Excel files directly.
                    Files can be added when creating dashboards.
                  </p>
                </div>
              </div>
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={handleLocalFilesConnect}
            >
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Continue with Local Files
            </Button>
          </div>
        )

      default:
        return null
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isConnecting ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        <Card className="shadow-2xl flex flex-col max-h-[90vh]">
          <CardHeader className="relative flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 h-8 w-8"
              onClick={onClose}
              disabled={isConnecting}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardTitle className="text-xl">
              {view === 'list' ? 'Connections' : view === 'edit' ? 'Edit Connection' : 'New Connection'}
            </CardTitle>
            <CardDescription>
              {view === 'list'
                ? 'Select a connection or add a new one'
                : view === 'edit'
                ? 'Update connection settings'
                : 'Connect to your data source'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 overflow-auto flex-1">
            {/* OAuth in progress overlay */}
            {isConnecting && authMethod === 'oauth' && !connectionStep && (
              <div className="p-6 rounded-lg bg-muted/50 border text-center space-y-4">
                <div className="flex justify-center">
                  <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div>
                  <p className="font-medium">Waiting for authentication...</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Complete the sign-in in your browser
                  </p>
                </div>
                <Button variant="outline" onClick={handleCancelOAuth}>
                  Cancel
                </Button>
              </div>
            )}

            {/* Connection step progress */}
            {connectionStep !== null && (
              <div className="p-6 rounded-lg bg-muted/50 border space-y-5">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Database className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Setting up connection</p>
                    <p className="text-xs text-muted-foreground">This may take a moment for large databases</p>
                  </div>
                </div>
                <div className="space-y-3 pl-1">
                  {([
                    { step: 'connecting' as const, label: 'Connecting to database...' },
                    { step: 'connected' as const, label: 'Connected' },
                    { step: 'loading_schema' as const, label: 'Loading schema...' },
                    { step: 'schema_loaded' as const, label: schemaTableCount !== null ? `Schema loaded (${schemaTableCount} tables)` : 'Schema loaded' },
                  ] as const).map(({ step, label }) => {
                    const steps: ConnectionStep[] = ['connecting', 'connected', 'loading_schema', 'schema_loaded']
                    const currentIdx = steps.indexOf(connectionStep)
                    const stepIdx = steps.indexOf(step)
                    const isComplete = stepIdx < currentIdx
                    const isActive = stepIdx === currentIdx
                    // Skip 'connected' as a visible step — it's just a brief transition
                    if (step === 'connected') return null
                    return (
                      <div key={step} className="flex items-center gap-3">
                        {isComplete ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                        ) : isActive ? (
                          <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                        )}
                        <span className={cn(
                          'text-sm',
                          isComplete && 'text-emerald-600 dark:text-emerald-400 font-medium',
                          isActive && 'text-foreground font-medium',
                          !isComplete && !isActive && 'text-muted-foreground/50'
                        )}>
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!(isConnecting && authMethod === 'oauth') && !connectionStep && view === 'list' ? (
              <>
                {/* Saved Connections List */}
                <div className="space-y-2 max-h-72 overflow-auto">
                  {savedConnections.map((conn) => {
                    const isActive = connection.connectionId === conn.id
                    return (
                      <div
                        key={conn.id}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          'w-full p-3 rounded-lg border transition-all text-left group cursor-pointer',
                          isActive
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/50 hover:bg-accent/50',
                          isConnecting && 'opacity-50 pointer-events-none'
                        )}
                        onClick={() => !isConnecting && handleSwitchConnection(conn)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !isConnecting) handleSwitchConnection(conn) }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn('p-2 rounded-lg', getSourceColor(conn.type || 'bigquery'))}>
                              {(conn.type || 'bigquery') === 'postgresql' ? (
                                <Server className="h-4 w-4" />
                              ) : conn.authType === 'oauth' ? (
                                <User className="h-4 w-4" />
                              ) : (
                                <FileKey className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium">{conn.name}</p>
                                {conn.isDefault && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded">
                                    DEFAULT
                                  </span>
                                )}
                                {isActive && (
                                  <Check className="h-4 w-4 text-green-500" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {conn.projectId || conn.database || ''} • {formatDate(conn.lastUsed)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {(conn.type || 'bigquery') === 'bigquery' && conn.authType === 'oauth' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-blue-500"
                                onClick={(e) => handleReconnect(e, conn.id)}
                                disabled={reconnectingId === conn.id}
                                title="Reconnect (re-authenticate)"
                              >
                                {reconnectingId === conn.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                              onClick={(e) => handleEditConnection(e, conn)}
                              title="Edit connection"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                'h-7 w-7 text-muted-foreground',
                                conn.isDefault
                                  ? 'text-yellow-500'
                                  : 'opacity-0 group-hover:opacity-100 hover:text-yellow-500'
                              )}
                              onClick={(e) => handleSetDefault(e, conn.id)}
                              title={conn.isDefault ? 'Default connection' : 'Set as default'}
                            >
                              <Star className={cn('h-4 w-4', conn.isDefault && 'fill-current')} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                              onClick={(e) => handleDeleteConnection(e, conn.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Add New Connection Button */}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setView('new')}
                  disabled={isConnecting}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Add New Connection
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Click the <Star className="h-3 w-3 inline" /> to set a default connection
                </p>
              </>
            ) : !(isConnecting && authMethod === 'oauth') && !connectionStep && view === 'edit' && editingConnection ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setView('list')
                    setEditingConnection(null)
                    setError(null)
                  }}
                  disabled={editSaving}
                  className="mb-2"
                >
                  ← Back to connections
                </Button>

                {/* Connection info header */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={cn('p-2 rounded-lg', getSourceColor(editingConnection.type || 'bigquery'))}>
                    {(editingConnection.type || 'bigquery') === 'postgresql' ? (
                      <Server className="h-4 w-4" />
                    ) : (editingConnection.type || 'bigquery') === 'snowflake' ? (
                      <Snowflake className="h-4 w-4" />
                    ) : (editingConnection.type || 'bigquery') === 'redshift' ? (
                      <Cloud className="h-4 w-4" />
                    ) : editingConnection.authType === 'oauth' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <FileKey className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {DATA_SOURCES.find(s => s.type === (editingConnection.type || 'bigquery'))?.name || 'BigQuery'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {editingConnection.projectId || editingConnection.database || ''}
                    </p>
                  </div>
                </div>

                {/* Edit form — type-specific */}
                {editLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (editingConnection.type || 'bigquery') === 'postgresql' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Connection Name</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g., Production DB"
                        disabled={editSaving}
                      />
                    </div>

                    {/* Toggle between fields and connection string */}
                    <div className="flex gap-1 p-1 bg-muted rounded-lg">
                      <button
                        onClick={() => setEditUseConnectionString(false)}
                        disabled={editSaving}
                        className={cn(
                          'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                          !editUseConnectionString ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Fields
                      </button>
                      <button
                        onClick={() => setEditUseConnectionString(true)}
                        disabled={editSaving}
                        className={cn(
                          'flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                          editUseConnectionString ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Connection String
                      </button>
                    </div>

                    {editUseConnectionString ? (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Connection String</label>
                        <Input
                          placeholder="postgresql://user:password@host:5432/database"
                          value={editConnectionString}
                          onChange={(e) => setEditConnectionString(e.target.value)}
                          disabled={editSaving}
                          className="font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          This will replace all connection fields
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Host</label>
                            <Input value={editHost} onChange={(e) => setEditHost(e.target.value)} disabled={editSaving} placeholder="localhost" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Port</label>
                            <Input value={editPort} onChange={(e) => setEditPort(e.target.value)} disabled={editSaving} placeholder="5432" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Database</label>
                          <Input value={editDatabase} onChange={(e) => setEditDatabase(e.target.value)} disabled={editSaving} placeholder="postgres" />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Username</label>
                            <Input value={editUsername} onChange={(e) => setEditUsername(e.target.value)} disabled={editSaving} placeholder="postgres" />
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Password</label>
                            <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} disabled={editSaving} placeholder="••••••••" />
                          </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editSSL}
                            onChange={(e) => setEditSSL(e.target.checked)}
                            disabled={editSaving}
                            className="rounded"
                          />
                          Use SSL connection
                        </label>
                      </>
                    )}

                    {renderMcpSection(editMcpServers, setEditMcpServers, showEditMcpSection, setShowEditMcpSection, editSaving)}
                    {renderCustomInstructionsSection(editCustomInstructions, setEditCustomInstructions, showEditCustomInstructions, setShowEditCustomInstructions, editSaving)}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setView('list')
                          setEditingConnection(null)
                          setError(null)
                        }}
                        disabled={editSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSaveEdit}
                        disabled={editSaving || !editName.trim() || (editUseConnectionString ? !editConnectionString.trim() : !editHost || !editDatabase || !editUsername)}
                      >
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Test & Save
                      </Button>
                    </div>
                  </>
                ) : (editingConnection.type || 'bigquery') === 'snowflake' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Connection Name</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g., Production Snowflake"
                        disabled={editSaving}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Account</label>
                        <Input value={editAccount} onChange={(e) => setEditAccount(e.target.value)} disabled={editSaving} placeholder="abc12345.us-east-1" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Warehouse</label>
                        <Input value={editWarehouse} onChange={(e) => setEditWarehouse(e.target.value)} disabled={editSaving} placeholder="COMPUTE_WH" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Database</label>
                        <Input value={editSfDatabase} onChange={(e) => setEditSfDatabase(e.target.value)} disabled={editSaving} placeholder="MY_DB" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Schema</label>
                        <Input value={editSfSchema} onChange={(e) => setEditSfSchema(e.target.value)} disabled={editSaving} placeholder="PUBLIC" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Role (optional)</label>
                      <Input value={editRole} onChange={(e) => setEditRole(e.target.value)} disabled={editSaving} placeholder="ACCOUNTADMIN" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Username</label>
                        <Input value={editSfUsername} onChange={(e) => setEditSfUsername(e.target.value)} disabled={editSaving} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Password</label>
                        <Input type="password" value={editSfPassword} onChange={(e) => setEditSfPassword(e.target.value)} disabled={editSaving} placeholder="••••••••" />
                      </div>
                    </div>

                    {renderMcpSection(editMcpServers, setEditMcpServers, showEditMcpSection, setShowEditMcpSection, editSaving)}
                    {renderCustomInstructionsSection(editCustomInstructions, setEditCustomInstructions, showEditCustomInstructions, setShowEditCustomInstructions, editSaving)}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setView('list')
                          setEditingConnection(null)
                          setError(null)
                        }}
                        disabled={editSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSaveEdit}
                        disabled={editSaving || !editName.trim() || !editAccount || !editWarehouse || !editSfDatabase || !editSfUsername}
                      >
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Test & Save
                      </Button>
                    </div>
                  </>
                ) : (editingConnection.type || 'bigquery') === 'redshift' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Connection Name</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g., Production Redshift"
                        disabled={editSaving}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Host</label>
                        <Input value={editRsHost} onChange={(e) => setEditRsHost(e.target.value)} disabled={editSaving} placeholder="cluster.region.redshift.amazonaws.com" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Port</label>
                        <Input value={editRsPort} onChange={(e) => setEditRsPort(e.target.value)} disabled={editSaving} placeholder="5439" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Database</label>
                        <Input value={editRsDatabase} onChange={(e) => setEditRsDatabase(e.target.value)} disabled={editSaving} placeholder="dev" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Region</label>
                        <Input value={editRegion} onChange={(e) => setEditRegion(e.target.value)} disabled={editSaving} placeholder="us-east-1" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Username</label>
                        <Input value={editRsUsername} onChange={(e) => setEditRsUsername(e.target.value)} disabled={editSaving} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Password</label>
                        <Input type="password" value={editRsPassword} onChange={(e) => setEditRsPassword(e.target.value)} disabled={editSaving} placeholder="••••••••" />
                      </div>
                    </div>

                    {renderMcpSection(editMcpServers, setEditMcpServers, showEditMcpSection, setShowEditMcpSection, editSaving)}
                    {renderCustomInstructionsSection(editCustomInstructions, setEditCustomInstructions, showEditCustomInstructions, setShowEditCustomInstructions, editSaving)}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setView('list')
                          setEditingConnection(null)
                          setError(null)
                        }}
                        disabled={editSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSaveEdit}
                        disabled={editSaving || !editName.trim() || !editRsHost || !editRsDatabase || !editRsUsername}
                      >
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Test & Save
                      </Button>
                    </div>
                  </>
                ) : (
                  /* BigQuery / NetSuite / ODBC edit form (name + credentials) */
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Connection Name</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="e.g., Production"
                        disabled={editSaving}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit() }}
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setView('list')
                          setEditingConnection(null)
                          setError(null)
                        }}
                        disabled={editSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={handleSaveEdit}
                        disabled={editSaving || !editName.trim()}
                      >
                        Save Name
                      </Button>
                    </div>

                    {/* BigQuery credential management — only shown for BigQuery connections */}
                    {(editingConnection.type || 'bigquery') === 'bigquery' && (
                      <>
                        <div className="relative my-2">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">Credentials</span>
                          </div>
                        </div>

                        {editingConnection.authType === 'oauth' ? (
                          <button
                            className="w-full p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left group disabled:opacity-50"
                            onClick={handleEditReconnect}
                            disabled={editSaving}
                          >
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                {editSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <RefreshCw className="h-6 w-6" />}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold mb-1">Re-authenticate</h3>
                                <p className="text-sm text-muted-foreground">
                                  Opens your browser to sign in with Google again. Use this if your token has expired.
                                </p>
                              </div>
                            </div>
                          </button>
                        ) : (
                          <button
                            className="w-full p-4 rounded-lg border-2 border-border hover:border-primary/50 hover:bg-accent/50 transition-all text-left group disabled:opacity-50"
                            onClick={handleUpdateServiceAccount}
                            disabled={editSaving}
                          >
                            <div className="flex items-start gap-4">
                              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                                {editSaving ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileKey className="h-6 w-6" />}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold mb-1">Upload New Key File</h3>
                                <p className="text-sm text-muted-foreground">
                                  Replace the service account JSON key file. The new key will be tested before saving.
                                </p>
                              </div>
                            </div>
                          </button>
                        )}
                      </>
                    )}

                    {renderMcpSection(editMcpServers, setEditMcpServers, showEditMcpSection, setShowEditMcpSection, editSaving)}
                    {renderCustomInstructionsSection(editCustomInstructions, setEditCustomInstructions, showEditCustomInstructions, setShowEditCustomInstructions, editSaving)}
                  </>
                )}
              </>
            ) : !(isConnecting && authMethod === 'oauth') && !connectionStep ? (
              <>
                {/* Back button if we have saved connections */}
                {savedConnections.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setView('list')
                      resetForm()
                    }}
                    disabled={isConnecting}
                    className="mb-2"
                  >
                    ← Back to connections
                  </Button>
                )}

                {/* Data Source Selector */}
                <div className="grid grid-cols-5 gap-1 p-1 bg-muted rounded-lg">
                  {DATA_SOURCES.map((source) => (
                    <button
                      key={source.type}
                      onClick={() => {
                        setSelectedSource(source.type)
                        setError(null)
                      }}
                      disabled={isConnecting}
                      title={source.name}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-md text-xs font-medium transition-all',
                        selectedSource === source.type
                          ? 'bg-background shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {source.icon}
                      <span className="truncate w-full text-center text-[10px]">{source.name}</span>
                    </button>
                  ))}
                </div>

                {/* Source Description */}
                <p className="text-sm text-muted-foreground text-center">
                  {DATA_SOURCES.find(s => s.type === selectedSource)?.description}
                </p>

                {/* Connection Form */}
                {renderConnectionForm()}
              </>
            ) : null}

            {/* Error Display */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body
  )
}
