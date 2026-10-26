// Initialize logging and crash reporting before anything else
import { appLogger, createLogger } from './logger.js'
import { initSentryMain, trackEvent, buildErrorContext } from './sentry.js'
initSentryMain()

import { config } from 'dotenv'
import { app, BrowserWindow, ipcMain, shell, dialog, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

// Load .env file - check multiple locations
const __dirname_main = path.dirname(fileURLToPath(import.meta.url))

// Try loading from different locations:
// 1. Project root (development)
// 2. Resources directory (packaged app)
// 3. User data directory (user-provided config)
const envPaths = [
  path.join(__dirname_main, '..', '.env'),                    // Development
  path.join(process.resourcesPath || '', 'resources', '.env'), // Packaged app resources
  path.join(app.getPath('userData'), '.env')                  // User config
]

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    config({ path: envPath, override: true })
    appLogger.info('Loaded .env configuration')
    break
  }
}
import {
  connectWithOAuth,
  connectWithServiceAccount,
  selectServiceAccountFile,
  getAuthStatus,
  getSchema,
  searchTables,
  getTableDetails,
  getTablePreview,
  runQuery,
  initBigQuery,
  disconnect,
  cleanup as cleanupBigQuery,
  switchConnection,
  getSavedConnections,
  cancelOAuth,
  startOAuthAndListProjects,
  completeOAuthConnection,
  cancelPendingOAuth,
  reconnectOAuth,
  updateBigQueryServiceAccount,
  type SchemaFetchOptions
} from './bigquery.js'
import archiver from 'archiver'
import unzipper from 'unzipper'
import { PythonManager } from './python-manager.js'
import { PackageManager } from './package-manager.js'
import {
  initializeSecureStores,
} from './store.js'
import { SecureKeyUnavailableError } from './secure-key.js'
import {
  saveDashboard,
  getDashboard,
  getAllDashboards,
  deleteDashboard as deleteDashboardFromStore,
  updateDashboard,
  getAllConnections,
  getConnection,
  getActiveConnectionId,
  setActiveConnectionId,
  deleteConnection as deleteConnectionFromStore,
  updateConnection as updateConnectionInStore,
  getDefaultConnectionId,
  setDefaultConnectionId,
  hasAnthropicApiKey,
  setAnthropicApiKey,
  clearAnthropicApiKey,
  getExecutionTimeout,
  setExecutionTimeout,
  getSelectedModel,
  getFilesByIds,
  setSelectedModel,
  getFile,
  saveFile as saveFileToStore,
  getMultiSourceCredentials,
  getCachedSchema,
  saveCachedSchema,
  deleteCachedSchema,
  type SavedDashboard,
  type ConversationMessage
} from './store.js'
import { validateApiKey } from './api-key.js'
import { runOpencodeDashboard } from './opencode/provider.js'
import { flushAnalytics, startAnalyticsFlush, stopAnalyticsFlush } from './analytics.js'
import { validateOpenExternalUrl } from './open-external.js'
import type { AgentRequest } from './agent-types.js'
import { initAutoUpdater } from './auto-updater.js'
import {
  uploadFile,
  deleteUploadedFile,
  getFilePreview,
  listFiles,
  getFilesDirectory
} from './file-manager.js'
import {
  connectPostgreSQL,
  switchPostgreSQLConnection,
  updatePostgreSQLConnection,
  getPostgreSQLConnectionDetails,
  getPostgreSQLSchema,
  runPostgreSQLQuery,
  disconnectPostgreSQL,
  cleanupPostgreSQL,
  getPostgreSQLEnvVars,
  getPostgreSQLTableDetails
} from './postgresql.js'
import {
  connectSnowflake,
  switchSnowflakeConnection,
  updateSnowflakeConnection,
  getSnowflakeConnectionDetails,
  getSnowflakeSchema,
  runSnowflakeQuery,
  disconnectSnowflake,
  cleanupSnowflake,
  getSnowflakeEnvVars,
  getSnowflakeTableDetails
} from './snowflake.js'
import {
  connectRedshift,
  switchRedshiftConnection,
  updateRedshiftConnection,
  getRedshiftConnectionDetails,
  getRedshiftSchema,
  runRedshiftQuery,
  disconnectRedshift,
  cleanupRedshift,
  getRedshiftEnvVars,
  getRedshiftTableDetails
} from './redshift.js'
import {
  connectNetSuite,
  switchNetSuiteConnection,
  updateNetSuiteConnection,
  getNetSuiteConnectionDetails,
  getNetSuiteSchema,
  runNetSuiteQuery,
  disconnectNetSuite,
  cleanupNetSuite,
  getNetSuiteEnvVars,
  getNetSuiteTableDetails
} from './netsuite.js'
import {
  connectODBC,
  switchODBCConnection,
  updateODBCConnection,
  getODBCConnectionDetails,
  getODBCSchema,
  runODBCQuery,
  disconnectODBC,
  cleanupODBC,
  getODBCEnvVars,
  getODBCTableDetails
} from './odbc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.DIST_ELECTRON = path.join(__dirname)
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '../public')
  : process.env.DIST

let mainWindow: BrowserWindow | null = null
let pythonManager: PythonManager | null = null
let packageManager: PackageManager | null = null
let pendingOpenFile: string | null = null

const mainLogger = createLogger('main')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

// macOS: handle .lmr file open
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('open-file', filePath)
  } else {
    pendingOpenFile = filePath
  }
})

// Windows/Linux: single-instance lock (also forwards .lmr file associations)
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Check for .lmr file in args (Windows file association)
    const lmrFile = commandLine.find(arg => arg.endsWith('.lmr'))
    if (lmrFile && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-file', lmrFile)
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    },
    // macOS: hidden inset title bar with traffic lights
    ...(isMac ? {
      titleBarStyle: 'hiddenInset' as const,
      trafficLightPosition: { x: 15, y: 15 },
    } : {}),
    // Windows: custom title bar with native overlay controls (min/max/close)
    ...(isWindows ? {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        color: '#ffffff',
        symbolColor: '#1a1a2e',
        height: 48,
      },
    } : {}),
    show: false
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Keep Windows titlebar overlay colors in sync with the system theme
  if (isWindows) {
    const updateOverlay = () => {
      if (!mainWindow) return
      const isDark = nativeTheme.shouldUseDarkColors
      mainWindow.setTitleBarOverlay({
        color: isDark ? '#131720' : '#ffffff',
        symbolColor: isDark ? '#e8eaed' : '#1a1a2e',
      })
    }
    nativeTheme.on('updated', updateOverlay)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Flush pending callbacks and check process.argv when window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    // Flush pending open-file
    if (pendingOpenFile) {
      mainWindow?.webContents.send('open-file', pendingOpenFile)
      pendingOpenFile = null
    }

    // Windows: check process.argv for .lmr file passed on launch
    if (process.platform === 'win32') {
      const lmrArg = process.argv.find(arg => arg.endsWith('.lmr'))
      if (lmrArg) {
        mainWindow?.webContents.send('open-file', lmrArg)
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  // Initialize Python manager
  // resourcesPath should be the base Resources directory
  // PythonManager will look for resources/python-mac inside this
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '..')

  // Project root for finding .venv
  const projectRoot = app.isPackaged
    ? path.join(process.resourcesPath)
    : path.join(__dirname, '..')

  pythonManager = new PythonManager(resourcesPath, mainWindow, projectRoot, app.isPackaged)

  // Initialize PackageManager for auto-installing allowed Python packages
  try {
    const pythonPath = pythonManager.getPythonPathPublic()
    packageManager = new PackageManager(pythonPath, app.getPath('userData'), mainWindow)
    // Add user packages path to PythonManager so Streamlit can find installed packages
    pythonManager.addPythonPath(packageManager.getUserPackagesPath())
  } catch (err) {
    console.error('Failed to initialize PackageManager:', err)
  }
}

// Global error handlers
const rendererLogger = createLogger('Renderer')

process.on('uncaughtException', (error) => {
  appLogger.error('Uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  appLogger.error('Unhandled rejection', reason)
})

// IPC listeners for renderer process logging
ipcMain.on('log:debug', (_, ...args: unknown[]) => rendererLogger.debug(...args))
ipcMain.on('log:info', (_, ...args: unknown[]) => rendererLogger.info(...args))
ipcMain.on('log:warn', (_, ...args: unknown[]) => rendererLogger.warn(...args))
ipcMain.on('log:error', (_, ...args: unknown[]) => rendererLogger.error(...args))

app.whenReady().then(async () => {
  try {
    await initializeSecureStores()
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown error'
    const secureStoreMessage = error instanceof SecureKeyUnavailableError
      ? 'Lumyr could not access your OS credential storage backend. Please ensure Keychain (macOS), Credential Manager (Windows), or libsecret (Linux) is available and try again.'
      : 'Lumyr could not initialize encrypted storage.'

    console.error('[Security] Failed to initialize secure stores:', error)
    dialog.showErrorBox('Secure storage initialization failed', `${secureStoreMessage}

${detail}`)
    app.quit()
    return
  }

  trackEvent('app_launched', { version: app.getVersion() })
  startAnalyticsFlush()

  // Initialize BigQuery if credentials exist
  await initBigQuery()

  createWindow()

  // Initialize auto-updater (only in production)
  if (app.isPackaged && mainWindow) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', async () => {
  // Clean up all resources before quitting
  await cleanupAllResources()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async (event) => {
  // Prevent immediate quit to allow cleanup
  if (pythonManager?.getStatus().isRunning) {
    event.preventDefault()
    await cleanupAllResources()
    app.quit()
  }
})

// Ensure clean shutdown
async function cleanupAllResources() {
  console.log('Cleaning up resources...')

  // Flush pending analytics events before quitting
  stopAnalyticsFlush()
  await flushAnalytics().catch(() => {})

  // Stop Python/Streamlit process
  if (pythonManager) {
    try {
      await pythonManager.stop()
    } catch (error) {
      console.error('Error stopping Python:', error)
    }
  }

  // Cleanup BigQuery connections
  cleanupBigQuery()

  // Cleanup PostgreSQL connections
  cleanupPostgreSQL()

  // Cleanup Snowflake connections
  cleanupSnowflake()

  // Cleanup Redshift connections
  cleanupRedshift()

  // Cleanup NetSuite connections
  cleanupNetSuite()

  // Cleanup ODBC connections
  cleanupODBC()

  // Small delay to ensure file handles are released
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('Cleanup complete')
}

// IPC Handlers

// Get app paths
ipcMain.handle('get-app-path', (_, name: 'home' | 'appData' | 'userData' | 'temp') => {
  return app.getPath(name)
})

// Get platform info
ipcMain.handle('get-platform', () => {
  return process.platform
})

// Open external URL
ipcMain.handle('open-external', async (_, url: string) => {
  const validation = validateOpenExternalUrl(url)

  if (!validation.success) {
    mainLogger.warn('Blocked open-external URL request', {
      url,
      reason: validation.error?.code,
    })

    return validation
  }

  await shell.openExternal(url)
  return { success: true }
})

// BigQuery handlers
ipcMain.handle('bigquery:get-auth-status', () => {
  return getAuthStatus()
})

ipcMain.handle('bigquery:connect-oauth', async (_, projectId: string, connectionName?: string) => {
  const result = await connectWithOAuth(projectId, connectionName)
  if (result.success) trackEvent('connection_added', { authType: 'oauth' })
  else if (result.error) trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'bigquery', authType: 'oauth' }))
  return result
})

ipcMain.handle('bigquery:select-service-account', async () => {
  return await selectServiceAccountFile()
})

ipcMain.handle('bigquery:connect-service-account', async (_, filePath: string, connectionName?: string) => {
  const result = await connectWithServiceAccount(filePath, connectionName)
  if (result.success) trackEvent('connection_added', { authType: 'service_account' })
  else if (result.error) trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'bigquery', authType: 'service_account' }))
  return result
})

ipcMain.handle('bigquery:switch-connection', async (_, connectionId: string) => {
  return await switchConnection(connectionId)
})

ipcMain.handle('bigquery:get-saved-connections', () => {
  return { success: true, connections: getSavedConnections() }
})

ipcMain.handle('bigquery:disconnect', () => {
  disconnect()
  return { success: true }
})

ipcMain.handle('bigquery:cancel-oauth', () => {
  return cancelOAuth()
})

ipcMain.handle('bigquery:start-oauth-and-list-projects', async () => {
  return await startOAuthAndListProjects()
})

ipcMain.handle('bigquery:complete-oauth-connection', async (_, projectId: string, connectionName?: string) => {
  return await completeOAuthConnection(projectId, connectionName)
})

ipcMain.handle('bigquery:reconnect', async (_, connectionId: string) => {
  return await reconnectOAuth(connectionId)
})

ipcMain.handle('bigquery:cancel-pending-oauth', () => {
  cancelPendingOAuth()
  return { success: true }
})

ipcMain.handle('bigquery:get-schema', async (_, options?: SchemaFetchOptions) => {
  return await getSchema(options)
})

ipcMain.handle('bigquery:run-query', async (_, query: string) => {
  return await runQuery(query)
})

// PostgreSQL handlers
ipcMain.handle('postgresql:connect', async (_, params: {
  host: string; port: number; database: string; username: string; password: string; ssl: boolean; connectionName?: string
}) => {
  const result = await connectPostgreSQL(params)
  if (result.success) {
    trackEvent('connection_added', { authType: 'password' })
    // Set PG env vars for Streamlit (await to ensure old process is stopped)
    if (pythonManager) {
      const pgEnv = getPostgreSQLEnvVars()
      console.log('[PostgreSQL] Setting env vars for Streamlit:', Object.keys(pgEnv), 'PGHOST:', pgEnv.PGHOST)
      await pythonManager.setExtraEnv(pgEnv)
    }
  } else if (result.error) {
    trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'postgresql' }))
  }
  return result
})

ipcMain.handle('postgresql:switch-connection', async (_, connectionId: string) => {
  console.log('[PostgreSQL] switch-connection called with:', connectionId)
  const result = await switchPostgreSQLConnection(connectionId)
  console.log('[PostgreSQL] switch-connection result:', JSON.stringify(result))
  if (result.success && pythonManager) {
    try {
      const pgEnv = getPostgreSQLEnvVars()
      console.log('[PostgreSQL] Setting env vars for Streamlit:', Object.keys(pgEnv), 'PGHOST:', pgEnv.PGHOST)
      await pythonManager.setExtraEnv(pgEnv)
    } catch (envErr) {
      console.error('[PostgreSQL] Failed to set env vars (non-fatal):', envErr)
    }
  }
  return result
})

ipcMain.handle('postgresql:get-schema', async (_, options?: SchemaFetchOptions) => {
  return await getPostgreSQLSchema(options)
})

ipcMain.handle('postgresql:run-query', async (_, query: string) => {
  return await runPostgreSQLQuery(query)
})

ipcMain.handle('postgresql:update', async (_, connectionId: string, params: {
  host?: string; port?: number; database?: string; username?: string; password?: string; ssl?: boolean; connectionName?: string; connectionString?: string
}) => {
  const result = await updatePostgreSQLConnection(connectionId, params)
  if (result.success && pythonManager) {
    const pgEnv = getPostgreSQLEnvVars()
    if (Object.keys(pgEnv).length > 0) {
      await pythonManager.setExtraEnv(pgEnv)
    }
  }
  return result
})

ipcMain.handle('postgresql:get-connection-details', (_, connectionId: string) => {
  return getPostgreSQLConnectionDetails(connectionId)
})

ipcMain.handle('bigquery:update-service-account', async (_, connectionId: string, filePath: string, connectionName?: string) => {
  return await updateBigQueryServiceAccount(connectionId, filePath, connectionName)
})

ipcMain.handle('postgresql:disconnect', async () => {
  disconnectPostgreSQL()
  if (pythonManager) {
    await pythonManager.setExtraEnv({})
  }
  return { success: true }
})

// Snowflake handlers
ipcMain.handle('snowflake:connect', async (_, params: {
  account: string; warehouse: string; database: string; schema?: string; role?: string; username: string; password?: string; connectionName?: string
}) => {
  const result = await connectSnowflake(params)
  if (result.success && pythonManager) {
    const env = getSnowflakeEnvVars()
    await pythonManager.setExtraEnv(env)
  } else if (!result.success && result.error) {
    trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'snowflake' }))
  }
  return result
})

ipcMain.handle('snowflake:switch-connection', async (_, connectionId: string) => {
  const result = await switchSnowflakeConnection(connectionId)
  if (result.success && pythonManager) {
    const env = getSnowflakeEnvVars()
    await pythonManager.setExtraEnv(env)
  }
  return result
})

ipcMain.handle('snowflake:get-schema', async (_, options?: SchemaFetchOptions) => {
  return await getSnowflakeSchema(options)
})

ipcMain.handle('snowflake:run-query', async (_, query: string) => {
  return await runSnowflakeQuery(query)
})

ipcMain.handle('snowflake:disconnect', async () => {
  disconnectSnowflake()
  if (pythonManager) {
    await pythonManager.setExtraEnv({})
  }
  return { success: true }
})

ipcMain.handle('snowflake:update', async (_, connectionId: string, params: {
  account?: string; warehouse?: string; database?: string; schema?: string; role?: string; username?: string; password?: string; connectionName?: string
}) => {
  const result = await updateSnowflakeConnection(connectionId, params)
  if (result.success && pythonManager) {
    await pythonManager.setExtraEnv(getSnowflakeEnvVars())
  }
  return result
})

ipcMain.handle('snowflake:get-connection-details', (_, connectionId: string) => {
  return getSnowflakeConnectionDetails(connectionId)
})

// Redshift handlers
ipcMain.handle('redshift:connect', async (_, params: {
  host: string; port?: number; database: string; region: string; username: string; password?: string; connectionName?: string
}) => {
  const result = await connectRedshift(params)
  if (result.success && pythonManager) {
    const env = getRedshiftEnvVars()
    await pythonManager.setExtraEnv(env)
  } else if (!result.success && result.error) {
    trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'redshift' }))
  }
  return result
})

ipcMain.handle('redshift:switch-connection', async (_, connectionId: string) => {
  const result = await switchRedshiftConnection(connectionId)
  if (result.success && pythonManager) {
    const env = getRedshiftEnvVars()
    await pythonManager.setExtraEnv(env)
  }
  return result
})

ipcMain.handle('redshift:get-schema', async (_, options?: SchemaFetchOptions) => {
  return await getRedshiftSchema(options)
})

ipcMain.handle('redshift:run-query', async (_, query: string) => {
  return await runRedshiftQuery(query)
})

ipcMain.handle('redshift:disconnect', async () => {
  disconnectRedshift()
  if (pythonManager) {
    await pythonManager.setExtraEnv({})
  }
  return { success: true }
})

ipcMain.handle('redshift:update', async (_, connectionId: string, params: {
  host?: string; port?: number; database?: string; region?: string; username?: string; password?: string; connectionName?: string
}) => {
  const result = await updateRedshiftConnection(connectionId, params)
  if (result.success && pythonManager) {
    await pythonManager.setExtraEnv(getRedshiftEnvVars())
  }
  return result
})

ipcMain.handle('redshift:get-connection-details', (_, connectionId: string) => {
  return getRedshiftConnectionDetails(connectionId)
})

// NetSuite handlers
ipcMain.handle('netsuite:connect', async (_, params: {
  accountId: string; consumerKey: string; consumerSecret: string; tokenId: string; tokenSecret: string; connectionName?: string
}) => {
  const result = await connectNetSuite(params)
  if (result.success && pythonManager) {
    const env = getNetSuiteEnvVars()
    await pythonManager.setExtraEnv(env)
  } else if (!result.success && result.error) {
    trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'netsuite' }))
  }
  return result
})

ipcMain.handle('netsuite:switch-connection', async (_, connectionId: string) => {
  const result = await switchNetSuiteConnection(connectionId)
  if (result.success && pythonManager) {
    const env = getNetSuiteEnvVars()
    await pythonManager.setExtraEnv(env)
  }
  return result
})

ipcMain.handle('netsuite:get-schema', async (_, options?: SchemaFetchOptions) => {
  return await getNetSuiteSchema(options)
})

ipcMain.handle('netsuite:run-query', async (_, query: string) => {
  return await runNetSuiteQuery(query)
})

ipcMain.handle('netsuite:disconnect', async () => {
  disconnectNetSuite()
  if (pythonManager) {
    await pythonManager.setExtraEnv({})
  }
  return { success: true }
})

ipcMain.handle('netsuite:update', async (_, connectionId: string, params: {
  accountId?: string; consumerKey?: string; consumerSecret?: string; tokenId?: string; tokenSecret?: string; connectionName?: string
}) => {
  const result = await updateNetSuiteConnection(connectionId, params)
  if (result.success && pythonManager) {
    await pythonManager.setExtraEnv(getNetSuiteEnvVars())
  }
  return result
})

ipcMain.handle('netsuite:get-connection-details', (_, connectionId: string) => {
  return getNetSuiteConnectionDetails(connectionId)
})

// ODBC handlers
ipcMain.handle('odbc:connect', async (_, params: {
  connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username?: string; password?: string; connectionName?: string
}) => {
  const result = await connectODBC(params)
  if (result.success && pythonManager) {
    const env = getODBCEnvVars()
    await pythonManager.setExtraEnv(env)
  } else if (!result.success && result.error) {
    trackEvent('connection_error', buildErrorContext(new Error(result.error), { source: 'odbc' }))
  }
  return result
})

ipcMain.handle('odbc:switch-connection', async (_, connectionId: string) => {
  const result = await switchODBCConnection(connectionId)
  if (result.success && pythonManager) {
    const env = getODBCEnvVars()
    await pythonManager.setExtraEnv(env)
  }
  return result
})

ipcMain.handle('odbc:get-schema', async (_, options?: SchemaFetchOptions) => {
  return await getODBCSchema(options)
})

ipcMain.handle('odbc:run-query', async (_, query: string) => {
  return await runODBCQuery(query)
})

ipcMain.handle('odbc:disconnect', async () => {
  disconnectODBC()
  if (pythonManager) {
    await pythonManager.setExtraEnv({})
  }
  return { success: true }
})

ipcMain.handle('odbc:update', async (_, connectionId: string, params: {
  connectionString?: string; dsn?: string; driver?: string; host?: string; port?: number; database?: string; username?: string; password?: string; connectionName?: string
}) => {
  const result = await updateODBCConnection(connectionId, params)
  if (result.success && pythonManager) {
    await pythonManager.setExtraEnv(getODBCEnvVars())
  }
  return result
})

ipcMain.handle('odbc:get-connection-details', (_, connectionId: string) => {
  return getODBCConnectionDetails(connectionId)
})

// Schema search and detail handlers (for large warehouses)
ipcMain.handle('schema:search', async (_, query: string, limit?: number) => {
  return await searchTables(query, limit)
})

ipcMain.handle('schema:get-table-details', async (_, tableName: string) => {
  return await getTableDetails(tableName)
})

ipcMain.handle('schema:get-table-preview', async (_, tableName: string, limit?: number) => {
  return await getTablePreview(tableName, limit)
})

// Schema cache handlers (disk persistence)
ipcMain.handle('schema:get-cached', (_, connectionId: string) => {
  return getCachedSchema(connectionId) ?? null
})

ipcMain.handle('schema:save-cache', (_, connectionId: string, schema: unknown) => {
  saveCachedSchema(connectionId, schema as Parameters<typeof saveCachedSchema>[1])
})

ipcMain.handle('schema:clear-cache', (_, connectionId: string) => {
  deleteCachedSchema(connectionId)
})

// Streamlit handlers
ipcMain.handle('streamlit:start', async () => {
  if (!pythonManager) {
    return { success: false, error: 'Python manager not initialized' }
  }
  return await pythonManager.start()
})

ipcMain.handle('streamlit:stop', async () => {
  if (!pythonManager) {
    return { success: false, error: 'Python manager not initialized' }
  }
  return await pythonManager.stop()
})

ipcMain.handle('streamlit:run-code', async (_, code: string) => {
  if (!pythonManager) {
    return { success: false, error: 'Python manager not initialized' }
  }

  // Ensure active connection env vars are set before running code.
  // Build env directly from the store — the in-memory client may not be connected
  // (e.g. after app restart when the connection was restored from a saved session).
  const activeConnId = getActiveConnectionId()
  if (activeConnId) {
    const conn = getConnection(activeConnId)
    const creds = getMultiSourceCredentials(activeConnId)
    if (conn && !creds) {
      console.warn('[streamlit:run-code] Credentials missing for active connection — user may need to reconnect')
    }
    if (conn && creds) {
      let env: Record<string, string> = {}
      if (conn.type === 'postgresql' && creds.type === 'postgresql') {
        const host = conn.host || '127.0.0.1'
        env = {
          PGHOST: host === 'localhost' ? '127.0.0.1' : host,
          PGPORT: String(conn.port || 5432),
          PGDATABASE: conn.database || '',
          PGUSER: creds.username || '',
          PGPASSWORD: creds.password || ''
        }
      } else if (conn.type === 'snowflake' && creds.type === 'snowflake') {
        env = getSnowflakeEnvVars()
      } else if (conn.type === 'redshift' && creds.type === 'redshift') {
        env = getRedshiftEnvVars()
      }
      if (Object.keys(env).length > 0) {
        await pythonManager.setExtraEnv(env)
      }
    }
  }

  // Auto-install missing allowlisted packages before running code
  if (packageManager) {
    try {
      const pkgResult = await packageManager.ensurePackages(code)
      if (pkgResult.installed.length > 0) {
        console.log('[streamlit:run-code] Installed packages:', pkgResult.installed, '- restarting Streamlit')
        await pythonManager.stop()
      }
    } catch (err) {
      console.warn('[streamlit:run-code] Package check failed:', err)
    }
  }

  return await pythonManager.runCode(code)
})

// Dashboard handlers
const getDashboardsDir = () => {
  const userDataPath = app.getPath('userData')
  const dashboardsDir = path.join(userDataPath, 'lumyr-dashboards')
  if (!fs.existsSync(dashboardsDir)) {
    fs.mkdirSync(dashboardsDir, { recursive: true })
  }
  return dashboardsDir
}

ipcMain.handle('dashboard:list', () => {
  return { success: true, dashboards: getAllDashboards() }
})

ipcMain.handle('dashboard:save', async (_, params: {
  name: string
  query: string
  code: string
  connectionId: string
  conversation?: ConversationMessage[]
  fileIds?: string[]
}) => {
  try {
    const id = crypto.randomUUID()
    const dashboardsDir = getDashboardsDir()
    const filePath = path.join(dashboardsDir, `${id}.py`)

    // Write Python code to file
    fs.writeFileSync(filePath, params.code, 'utf-8')

    const dashboard: SavedDashboard = {
      id,
      name: params.name,
      query: params.query,
      connectionId: params.connectionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conversation: params.conversation,
      fileIds: params.fileIds
    }

    saveDashboard(dashboard)
    trackEvent('dashboard_saved')
    return { success: true, dashboard }
  } catch (error) {
    trackEvent('dashboard_error', buildErrorContext(error, { operation: 'save' }))
    return { success: false, error: error instanceof Error ? error.message : 'Failed to save dashboard' }
  }
})

ipcMain.handle('dashboard:load', async (_, id: string) => {
  try {
    const dashboard = getDashboard(id)
    if (!dashboard) {
      return { success: false, error: 'Dashboard not found' }
    }

    const dashboardsDir = getDashboardsDir()
    const filePath = path.join(dashboardsDir, `${id}.py`)

    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'Dashboard code file not found' }
    }

    const code = fs.readFileSync(filePath, 'utf-8')
    trackEvent('dashboard_viewed')
    return { success: true, dashboard, code }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to load dashboard' }
  }
})

ipcMain.handle('dashboard:update', async (_, params: {
  id: string
  name?: string
  code?: string
  conversation?: ConversationMessage[]
  fileIds?: string[]
  isFavorite?: boolean
}) => {
  try {
    const dashboard = getDashboard(params.id)
    if (!dashboard) {
      return { success: false, error: 'Dashboard not found' }
    }

    // Update code file if provided
    if (params.code) {
      const dashboardsDir = getDashboardsDir()
      const filePath = path.join(dashboardsDir, `${params.id}.py`)
      fs.writeFileSync(filePath, params.code, 'utf-8')
    }

    // Update metadata - only include defined fields to avoid overwriting with undefined
    const updates: Partial<SavedDashboard> = {}
    if (params.name !== undefined) updates.name = params.name
    if (params.conversation !== undefined) updates.conversation = params.conversation
    if (params.fileIds !== undefined) updates.fileIds = params.fileIds
    if (params.isFavorite !== undefined) updates.isFavorite = params.isFavorite
    updateDashboard(params.id, updates)

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update dashboard' }
  }
})

ipcMain.handle('dashboard:delete', async (_, id: string) => {
  try {
    // Get dashboard to find its fileIds before deleting
    const dashboard = getDashboard(id)
    const dashboardsDir = getDashboardsDir()
    const filePath = path.join(dashboardsDir, `${id}.py`)

    // Delete code file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // Delete associated files that aren't used by other dashboards
    if (dashboard?.fileIds && dashboard.fileIds.length > 0) {
      // Collect fileIds used by other dashboards
      const allDashboards = getAllDashboards()
      const fileIdsInUse = new Set<string>()
      for (const d of allDashboards) {
        if (d.id !== id && d.fileIds) {
          for (const fid of d.fileIds) {
            fileIdsInUse.add(fid)
          }
        }
      }

      // Delete files unique to this dashboard
      for (const fileId of dashboard.fileIds) {
        if (!fileIdsInUse.has(fileId)) {
          await deleteUploadedFile(fileId)
        }
      }
    }

    // Delete from store
    deleteDashboardFromStore(id)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete dashboard' }
  }
})

// Dashboard export handler
ipcMain.handle('dashboard:export', async (_, dashboardId: string) => {
  try {
    const dashboard = getDashboard(dashboardId)
    if (!dashboard) {
      return { success: false, error: 'Dashboard not found' }
    }

    const dashboardsDir = getDashboardsDir()
    const codeFilePath = path.join(dashboardsDir, `${dashboardId}.py`)
    if (!fs.existsSync(codeFilePath)) {
      return { success: false, error: 'Dashboard code file not found' }
    }

    const result = await dialog.showSaveDialog({
      title: 'Export Dashboard',
      defaultPath: `${dashboard.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.lmr`,
      filters: [{ name: 'Lumyr Dashboard', extensions: ['lmr'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, error: 'Export cancelled' }
    }

    const manifest = {
      version: 1,
      name: dashboard.name,
      query: dashboard.query,
      createdAt: dashboard.createdAt,
      conversation: dashboard.conversation || [],
      files: [] as Array<{ originalName: string; format: string; columns: unknown[] }>
    }

    const output = fs.createWriteStream(result.filePath)
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.pipe(output)

    // Add dashboard code
    archive.file(codeFilePath, { name: 'dashboard.py' })

    // Add uploaded files if any
    if (dashboard.fileIds && dashboard.fileIds.length > 0) {
      for (const fileId of dashboard.fileIds) {
        const fileMeta = getFile(fileId)
        if (fileMeta && fs.existsSync(fileMeta.filePath)) {
          archive.file(fileMeta.filePath, { name: `files/${fileMeta.originalName}` })
          manifest.files.push({
            originalName: fileMeta.originalName,
            format: fileMeta.format,
            columns: fileMeta.columns
          })
        }
      }
    }

    // Add manifest (no connectionId, no credentials)
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })

    await archive.finalize()
    await new Promise<void>((resolve, reject) => {
      output.on('close', resolve)
      output.on('error', reject)
    })

    trackEvent('dashboard_exported')
    return { success: true }
  } catch (error) {
    trackEvent('dashboard_error', buildErrorContext(error, { operation: 'export' }))
    return { success: false, error: error instanceof Error ? error.message : 'Failed to export dashboard' }
  }
})

// Dashboard import handler - opens file picker, validates, returns manifest
ipcMain.handle('dashboard:import', async (_, filePath?: string) => {
  try {
    let zipPath: string

    if (filePath) {
      // Direct file path provided (e.g., from open-file event)
      zipPath = filePath
    } else {
      const result = await dialog.showOpenDialog({
        title: 'Import Dashboard',
        filters: [
          { name: 'Lumyr Dashboard', extensions: ['lmr'] },
          { name: 'ZIP Archive (Legacy)', extensions: ['zip'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Import cancelled' }
      }

      zipPath = result.filePaths[0]
    }
    const directory = await unzipper.Open.file(zipPath)

    const manifestEntry = directory.files.find(f => f.path === 'manifest.json')
    const codeEntry = directory.files.find(f => f.path === 'dashboard.py')

    if (!manifestEntry || !codeEntry) {
      return { success: false, error: 'Invalid dashboard archive: missing manifest.json or dashboard.py' }
    }

    const manifestContent = await manifestEntry.buffer()
    const manifest = JSON.parse(manifestContent.toString('utf-8'))

    return { success: true, manifest, zipPath }
  } catch (error) {
    trackEvent('dashboard_error', buildErrorContext(error, { operation: 'import' }))
    return { success: false, error: error instanceof Error ? error.message : 'Failed to import dashboard' }
  }
})

// Dashboard import confirm - saves the imported dashboard
ipcMain.handle('dashboard:import-confirm', async (_, params: {
  zipPath: string
  connectionId: string
  name?: string
}) => {
  try {
    const directory = await unzipper.Open.file(params.zipPath)
    const manifestEntry = directory.files.find(f => f.path === 'manifest.json')
    const codeEntry = directory.files.find(f => f.path === 'dashboard.py')

    if (!manifestEntry || !codeEntry) {
      return { success: false, error: 'Invalid dashboard archive' }
    }

    const manifestContent = await manifestEntry.buffer()
    const manifest = JSON.parse(manifestContent.toString('utf-8'))
    const codeContent = await codeEntry.buffer()

    const newId = crypto.randomUUID()
    const dashboardsDir = getDashboardsDir()
    const newCodePath = path.join(dashboardsDir, `${newId}.py`)

    // Write dashboard code
    fs.writeFileSync(newCodePath, codeContent.toString('utf-8'), 'utf-8')

    // Import files
    const newFileIds: string[] = []
    const filesDir = getFilesDirectory()
    const fileEntries = directory.files.filter(f => f.path.startsWith('files/') && !f.path.endsWith('/'))

    for (const fileEntry of fileEntries) {
      const fileName = path.basename(fileEntry.path)
      const ext = path.extname(fileName).slice(1).toLowerCase()
      const newFileId = crypto.randomUUID()
      const newFilePath = path.join(filesDir, `${newFileId}.${ext}`)

      const fileBuffer = await fileEntry.buffer()
      fs.writeFileSync(newFilePath, fileBuffer)

      // Find file metadata from manifest
      const fileMeta = manifest.files?.find((f: { originalName: string }) => f.originalName === fileName)

      saveFileToStore({
        id: newFileId,
        name: `${newFileId}.${ext}`,
        originalName: fileName,
        format: (ext as 'csv' | 'xlsx' | 'xls') || 'csv',
        size: fileBuffer.length,
        rowCount: 0,
        uploadedAt: Date.now(),
        filePath: newFilePath,
        columns: fileMeta?.columns || []
      })

      newFileIds.push(newFileId)
    }

    const dashboard: SavedDashboard = {
      id: newId,
      name: params.name || manifest.name || 'Imported Dashboard',
      query: manifest.query || '',
      connectionId: params.connectionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      conversation: manifest.conversation || [],
      fileIds: newFileIds.length > 0 ? newFileIds : undefined
    }

    saveDashboard(dashboard)
    trackEvent('dashboard_imported')
    return { success: true, dashboard }
  } catch (error) {
    trackEvent('dashboard_error', buildErrorContext(error, { operation: 'import_confirm' }))
    return { success: false, error: error instanceof Error ? error.message : 'Failed to confirm import' }
  }
})

// Connection management handlers
ipcMain.handle('connections:list', () => {
  return { success: true, connections: getAllConnections() }
})

ipcMain.handle('connections:get-active', () => {
  return { success: true, activeConnectionId: getActiveConnectionId() }
})

ipcMain.handle('connections:set-active', (_, connectionId: string | null) => {
  setActiveConnectionId(connectionId)
  return { success: true }
})

ipcMain.handle('connections:delete', async (_, connectionId: string) => {
  try {
    // If deleting the default connection, clear it
    if (getDefaultConnectionId() === connectionId) {
      setDefaultConnectionId(null)
    }

    // If deleting the active connection, disconnect first (before removing from store)
    if (getActiveConnectionId() === connectionId) {
      const conn = getConnection(connectionId)
      setActiveConnectionId(null)
      if (conn?.type === 'postgresql') {
        disconnectPostgreSQL()
        if (pythonManager) await pythonManager.setExtraEnv({})
      } else {
        disconnect()
      }
    }

    deleteConnectionFromStore(connectionId)

    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to delete connection' }
  }
})

ipcMain.handle('connections:get-default', () => {
  return { success: true, defaultConnectionId: getDefaultConnectionId() }
})

ipcMain.handle('connections:set-default', (_, connectionId: string | null) => {
  setDefaultConnectionId(connectionId)
  return { success: true }
})

ipcMain.handle('connections:update', (_, connectionId: string, updates: { name?: string; mcpServers?: Array<{ name: string; url: string; apiKey?: string }>; customInstructions?: string }) => {
  try {
    updateConnectionInStore(connectionId, updates)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to update connection' }
  }
})

// File handlers
ipcMain.handle('files:upload', async (_, filePath: string) => {
  const result = await uploadFile(filePath)
  if (result.success && result.file) trackEvent('file_uploaded', { format: result.file.format })
  return result
})

ipcMain.handle('files:list', () => {
  return { success: true, files: listFiles() }
})

ipcMain.handle('files:delete', async (_, fileId: string) => {
  return await deleteUploadedFile(fileId)
})

ipcMain.handle('files:preview', async (_, fileId: string, limit?: number) => {
  return await getFilePreview(fileId, limit)
})

ipcMain.handle('files:select', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Select Data Files',
      filters: [
        { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls', 'pdf'] },
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'PDF Files', extensions: ['pdf'] }
      ],
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: 'No files selected' }
    }

    return { success: true, filePaths: result.filePaths }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to select files'
    return { success: false, error: message }
  }
})

// Claude AI handlers (legacy generate endpoint removed — use agent-based generation)
ipcMain.handle('claude:generate', async () => {
  return { success: false, error: 'Please use the agent-based generation instead' }
})

// In-flight generations, so claude:cancel-agent can abort them.
const activeRuns = new Map<string, AbortController>()

ipcMain.handle('claude:generate-agent', async (_, request: AgentRequest) => {
  if (!pythonManager) {
    return { success: false, error: 'Python manager not initialized', steps: [] }
  }

  // Build getTableDetailsFn based on active connection type
  const activeConnId = getActiveConnectionId()
  const activeConn = activeConnId ? getConnection(activeConnId) : null
  const connType = activeConn?.type || 'bigquery'

  // Inject source type and connection metadata for source-aware prompt
  request.sourceType = connType as AgentRequest['sourceType']
  request.connectionMeta = {
    warehouse: activeConn?.warehouse,
    account: activeConn?.account,
    host: activeConn?.host,
    region: activeConn?.region,
    database: activeConn?.database,
    schema: activeConn?.schema,
    accountId: activeConn?.accountId,
    dsn: activeConn?.dsn,
    driver: activeConn?.driver
  }

  // Inject custom instructions from the active connection
  if (activeConn?.customInstructions) {
    request.customInstructions = activeConn.customInstructions
  }

  const getTableDetailsFn = async (tableName: string) => {
    let result: { success: boolean; error?: string; table?: { columns: { name: string; type: string; description?: string }[] } }

    if (connType === 'postgresql') {
      result = await getPostgreSQLTableDetails(tableName)
    } else if (connType === 'snowflake') {
      result = await getSnowflakeTableDetails(tableName)
    } else if (connType === 'redshift') {
      result = await getRedshiftTableDetails(tableName)
    } else if (connType === 'netsuite') {
      result = await getNetSuiteTableDetails(tableName)
    } else if (connType === 'odbc') {
      result = await getODBCTableDetails(tableName)
    } else {
      // BigQuery
      const bqResult = await getTableDetails(tableName)
      if (bqResult.success && bqResult.table) {
        result = {
          success: true,
          table: {
            columns: bqResult.table.columns.map(c => ({ name: c.name, type: c.type, description: c.description }))
          }
        }
      } else {
        result = { success: false, error: bqResult.error }
      }
    }

    if (result.success && result.table) {
      return { columns: result.table.columns }
    }
    return null
  }

  const runQueryFn = async (sql: string) => {
    if (connType === 'postgresql') return await runPostgreSQLQuery(sql)
    if (connType === 'snowflake') return await runSnowflakeQuery(sql)
    if (connType === 'redshift') return await runRedshiftQuery(sql)
    if (connType === 'netsuite') return await runNetSuiteQuery(sql)
    if (connType === 'odbc') return await runODBCQuery(sql)
    return await runQuery(sql)
  }

  // Each run gets its own workspace so concurrent or repeated generations
  // cannot overwrite one another's files.
  const runId = request.runId || `run-${Date.now()}`
  const workspaceDir = path.join(app.getPath('userData'), 'workspaces', runId)

  const controller = new AbortController()
  activeRuns.set(runId, controller)

  try {
    const result = await runOpencodeDashboard({
      workspaceDir,
      prompt: request.query,
      model: getSelectedModel(),
      conversationHistory: request.conversationHistory?.map(m => ({
        role: m.role,
        content: m.content,
      })),
      mcpServers: request.mcpServers,
      customInstructions: request.customInstructions,
      sourceType: request.sourceType,
      connectionMeta: request.connectionMeta,
      files: request.fileIds?.length ? getFilesByIds(request.fileIds) : [],
      currentCode: request.currentCode,
      data: {
        schema: request.schema,
        getTableDetails: getTableDetailsFn,
        runQuery: runQueryFn,
      },
      onStep: step => {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
          mainWindow.webContents.send('agent:step', { ...step, runId })
        }
      },
      signal: controller.signal,
    })

    if (result.success) trackEvent('dashboard_generated', { model: getSelectedModel() })
    return result
  } finally {
    activeRuns.delete(runId)
  }
})

ipcMain.handle('claude:validate-key', async (_, apiKey: string) => {
  return await validateApiKey(apiKey)
})

ipcMain.handle('claude:cancel-agent', (_, runId: string) => {
  activeRuns.get(runId)?.abort()
  activeRuns.delete(runId)
  return { success: true }
})

// Settings handlers
ipcMain.handle('settings:has-api-key', () => {
  return hasAnthropicApiKey()
})

ipcMain.handle('settings:set-api-key', (_, apiKey: string) => {
  setAnthropicApiKey(apiKey)
  return { success: true }
})

ipcMain.handle('settings:clear-api-key', () => {
  clearAnthropicApiKey()
  return { success: true }
})

ipcMain.handle('settings:get-execution-timeout', () => {
  return getExecutionTimeout()
})

ipcMain.handle('settings:set-execution-timeout', (_, seconds: number) => {
  setExecutionTimeout(seconds)
  return { success: true }
})

ipcMain.handle('settings:get-model', () => {
  return getSelectedModel()
})

ipcMain.handle('settings:set-model', (_, model: string) => {
  setSelectedModel(model)
  return { success: true }
})

ipcMain.handle('settings:get-available-models', () => {
  // Lumyr is standalone: models are a static list of Anthropic model IDs the
  // user's own API key can address. 'auto' is resolved by the opencode provider.
  return {
    models: [
      { id: 'claude-opus-5', name: 'Claude Opus 5', provider: 'anthropic', description: 'Most capable' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', provider: 'anthropic', description: 'Fast and capable' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'anthropic', description: 'Fastest and cheapest' },
    ],
    default: 'auto'
  }
})

