import { describe, it, expect } from 'vitest'
import fs from 'fs'

// =============================================================================
// NetSuite + ODBC Data Source Types
// =============================================================================

describe('DataSourceType includes netsuite and odbc', () => {
  const typesSource = fs.readFileSync('electron/data-sources/types.ts', 'utf-8')
  const storeSource = fs.readFileSync('electron/store.ts', 'utf-8')
  const appStoreSource = fs.readFileSync('src/stores/app-store.ts', 'utf-8')

  it('types.ts DataSourceType includes netsuite', () => {
    expect(typesSource).toContain("'netsuite'")
  })

  it('types.ts DataSourceType includes odbc', () => {
    expect(typesSource).toContain("'odbc'")
  })

  it('types.ts defines NetSuiteConnection interface', () => {
    expect(typesSource).toContain('export interface NetSuiteConnection extends DataSourceConnection')
  })

  it('types.ts defines ODBCConnection interface', () => {
    expect(typesSource).toContain('export interface ODBCConnection extends DataSourceConnection')
  })

  it('types.ts defines NetSuiteCredentials interface', () => {
    expect(typesSource).toContain('export interface NetSuiteCredentials')
  })

  it('types.ts defines ODBCCredentials interface', () => {
    expect(typesSource).toContain('export interface ODBCCredentials')
  })

  it('types.ts includes NetSuiteConnection in AnyConnection union', () => {
    expect(typesSource).toContain('| NetSuiteConnection')
  })

  it('types.ts includes ODBCConnection in AnyConnection union', () => {
    expect(typesSource).toContain('| ODBCConnection')
  })

  it('types.ts includes NetSuiteCredentials in DataSourceCredentials union', () => {
    expect(typesSource).toContain('| NetSuiteCredentials')
  })

  it('types.ts includes ODBCCredentials in DataSourceCredentials union', () => {
    expect(typesSource).toContain('| ODBCCredentials')
  })

  it('types.ts has type guard for NetSuite', () => {
    expect(typesSource).toContain('export function isNetSuiteConnection')
  })

  it('types.ts has type guard for ODBC', () => {
    expect(typesSource).toContain('export function isODBCConnection')
  })

  it('store.ts DataSourceType includes netsuite', () => {
    expect(storeSource).toContain("'netsuite'")
  })

  it('store.ts DataSourceType includes odbc', () => {
    expect(storeSource).toContain("'odbc'")
  })

  it('store.ts SavedConnection has accountId for NetSuite', () => {
    expect(storeSource).toContain('accountId?: string')
  })

  it('store.ts SavedConnection has connectionString for ODBC', () => {
    expect(storeSource).toContain('connectionString?: string')
  })

  it('store.ts ConnectionCredentials has NetSuite TBA fields', () => {
    expect(storeSource).toContain('consumerKey?: string')
    expect(storeSource).toContain('consumerSecret?: string')
    expect(storeSource).toContain('tokenId?: string')
    expect(storeSource).toContain('tokenSecret?: string')
  })

  it('app-store.ts DataSourceType includes netsuite and odbc', () => {
    expect(appStoreSource).toContain("'netsuite'")
    expect(appStoreSource).toContain("'odbc'")
  })
})

// =============================================================================
// NetSuite Client
// =============================================================================

describe('NetSuite client (electron/data-sources/netsuite-client.ts)', () => {
  const source = fs.readFileSync('electron/data-sources/netsuite-client.ts', 'utf-8')

  it('implements DataSourceClient interface', () => {
    expect(source).toContain('export class NetSuiteClient implements DataSourceClient')
  })

  it('uses SuiteQL REST endpoint', () => {
    expect(source).toContain('suitetalk.api.netsuite.com')
    expect(source).toContain('/services/rest/query/v1/suiteql')
  })

  it('implements OAuth 1.0 HMAC-SHA256 signing', () => {
    expect(source).toContain('HMAC-SHA256')
    expect(source).toContain("createHmac('sha256'")
  })

  it('queries OA_TABLES for schema introspection', () => {
    expect(source).toContain('OA_TABLES')
  })

  it('queries OA_COLUMNS for column introspection', () => {
    expect(source).toContain('OA_COLUMNS')
  })

  it('includes Prefer: transient header', () => {
    expect(source).toContain("'Prefer': 'transient'")
  })

  it('has connect method that tests with SELECT 1', () => {
    expect(source).toContain('SELECT 1 AS test')
  })

  it('returns correct driver info for Python', () => {
    expect(source).toContain('requests_oauthlib')
    expect(source).toContain('from requests_oauthlib import OAuth1')
  })

  it('normalizes NetSuite types', () => {
    expect(source).toContain('private normalizeType(nsType: string)')
  })
})

// =============================================================================
// ODBC Client
// =============================================================================

describe('ODBC client (electron/data-sources/odbc-client.ts)', () => {
  const source = fs.readFileSync('electron/data-sources/odbc-client.ts', 'utf-8')

  it('implements DataSourceClient interface', () => {
    expect(source).toContain('export class ODBCClient implements DataSourceClient')
  })

  it('lazy-loads the odbc package', () => {
    expect(source).toContain("await import('odbc')")
  })

  it('has buildConnectionString helper', () => {
    expect(source).toContain('private buildConnectionString(): string')
  })

  it('builds connection string from DSN', () => {
    expect(source).toContain('DSN=${this.connection.dsn}')
  })

  it('builds connection string from driver', () => {
    expect(source).toContain('DRIVER={${this.connection.driver}}')
  })

  it('uses ODBC catalog functions for schema', () => {
    expect(source).toContain('conn.tables(')
    expect(source).toContain('conn.columns(')
  })

  it('handles multiple SQL dialects for table preview', () => {
    expect(source).toContain('FETCH FIRST')
    expect(source).toContain('LIMIT')
    expect(source).toContain('TOP')
  })

  it('returns correct driver info for Python pyodbc', () => {
    expect(source).toContain('pyodbc')
    expect(source).toContain("import pyodbc")
    expect(source).toContain('ODBC_CONNECTION_STRING')
  })

  it('skips system schemas in schema introspection', () => {
    expect(source).toContain('information_schema')
    expect(source).toContain('pg_')
  })
})

// =============================================================================
// Client Factory
// =============================================================================

describe('Client factory supports netsuite and odbc', () => {
  const source = fs.readFileSync('electron/data-sources/client-factory.ts', 'utf-8')

  it('imports NetSuiteClient', () => {
    expect(source).toContain("import { NetSuiteClient } from './netsuite-client.js'")
  })

  it('imports ODBCClient', () => {
    expect(source).toContain("import { ODBCClient } from './odbc-client.js'")
  })

  it('has netsuite case in create()', () => {
    expect(source).toContain("case 'netsuite':")
  })

  it('has odbc case in create()', () => {
    expect(source).toContain("case 'odbc':")
  })

  it('getDriverInfo handles netsuite', () => {
    expect(source).toContain("name: 'Oracle NetSuite'")
  })

  it('getDriverInfo handles odbc', () => {
    expect(source).toContain("name: 'ODBC'")
  })
})

// =============================================================================
// Module exports
// =============================================================================

describe('Data source index exports both clients', () => {
  const source = fs.readFileSync('electron/data-sources/index.ts', 'utf-8')

  it('exports NetSuiteClient', () => {
    expect(source).toContain("export { NetSuiteClient } from './netsuite-client.js'")
  })

  it('exports ODBCClient', () => {
    expect(source).toContain("export { ODBCClient } from './odbc-client.js'")
  })
})

// =============================================================================
// IPC Handlers (electron/main.ts)
// =============================================================================

describe('IPC handlers in main.ts', () => {
  const source = fs.readFileSync('electron/main.ts', 'utf-8')

  // NetSuite IPC
  it('handles netsuite:connect', () => {
    expect(source).toContain("ipcMain.handle('netsuite:connect'")
  })

  it('handles netsuite:switch-connection', () => {
    expect(source).toContain("ipcMain.handle('netsuite:switch-connection'")
  })

  it('handles netsuite:get-schema', () => {
    expect(source).toContain("ipcMain.handle('netsuite:get-schema'")
  })

  it('handles netsuite:run-query', () => {
    expect(source).toContain("ipcMain.handle('netsuite:run-query'")
  })

  it('handles netsuite:disconnect', () => {
    expect(source).toContain("ipcMain.handle('netsuite:disconnect'")
  })

  it('handles netsuite:update', () => {
    expect(source).toContain("ipcMain.handle('netsuite:update'")
  })

  it('handles netsuite:get-connection-details', () => {
    expect(source).toContain("ipcMain.handle('netsuite:get-connection-details'")
  })

  // ODBC IPC
  it('handles odbc:connect', () => {
    expect(source).toContain("ipcMain.handle('odbc:connect'")
  })

  it('handles odbc:switch-connection', () => {
    expect(source).toContain("ipcMain.handle('odbc:switch-connection'")
  })

  it('handles odbc:get-schema', () => {
    expect(source).toContain("ipcMain.handle('odbc:get-schema'")
  })

  it('handles odbc:run-query', () => {
    expect(source).toContain("ipcMain.handle('odbc:run-query'")
  })

  it('handles odbc:disconnect', () => {
    expect(source).toContain("ipcMain.handle('odbc:disconnect'")
  })

  it('handles odbc:update', () => {
    expect(source).toContain("ipcMain.handle('odbc:update'")
  })

  it('handles odbc:get-connection-details', () => {
    expect(source).toContain("ipcMain.handle('odbc:get-connection-details'")
  })

  // Agent delegation
  it('dispatches getTableDetailsFn to netsuite', () => {
    expect(source).toContain("connType === 'netsuite'")
    expect(source).toContain('getNetSuiteTableDetails(tableName)')
  })

  it('dispatches getTableDetailsFn to odbc', () => {
    expect(source).toContain("connType === 'odbc'")
    expect(source).toContain('getODBCTableDetails(tableName)')
  })

  it('dispatches runQueryFn to netsuite', () => {
    expect(source).toContain('runNetSuiteQuery(sql)')
  })

  it('dispatches runQueryFn to odbc', () => {
    expect(source).toContain('runODBCQuery(sql)')
  })

  it('passes accountId in connectionMeta', () => {
    expect(source).toContain('accountId: activeConn?.accountId')
  })

  it('cleans up netsuite on app quit', () => {
    expect(source).toContain('cleanupNetSuite()')
  })

  it('cleans up odbc on app quit', () => {
    expect(source).toContain('cleanupODBC()')
  })
})

// =============================================================================
// Preload Bridge
// =============================================================================

describe('Preload bridge (electron/preload.ts)', () => {
  const source = fs.readFileSync('electron/preload.ts', 'utf-8')

  it('has netsuite section with all 7 methods', () => {
    expect(source).toContain("ipcRenderer.invoke('netsuite:connect'")
    expect(source).toContain("ipcRenderer.invoke('netsuite:switch-connection'")
    expect(source).toContain("ipcRenderer.invoke('netsuite:update'")
    expect(source).toContain("ipcRenderer.invoke('netsuite:get-connection-details'")
    expect(source).toContain("ipcRenderer.invoke('netsuite:get-schema'")
    expect(source).toContain("ipcRenderer.invoke('netsuite:run-query'")
    expect(source).toContain("ipcRenderer.invoke('netsuite:disconnect'")
  })

  it('has odbc section with all 7 methods', () => {
    expect(source).toContain("ipcRenderer.invoke('odbc:connect'")
    expect(source).toContain("ipcRenderer.invoke('odbc:switch-connection'")
    expect(source).toContain("ipcRenderer.invoke('odbc:update'")
    expect(source).toContain("ipcRenderer.invoke('odbc:get-connection-details'")
    expect(source).toContain("ipcRenderer.invoke('odbc:get-schema'")
    expect(source).toContain("ipcRenderer.invoke('odbc:run-query'")
    expect(source).toContain("ipcRenderer.invoke('odbc:disconnect'")
  })
})

// =============================================================================
// Frontend Types (src/types/electron.d.ts)
// =============================================================================

describe('Agent types (electron/agent-types.ts)', () => {
  const source = fs.readFileSync('electron/agent-types.ts', 'utf-8')

  it('sourceType includes netsuite and odbc', () => {
    expect(source).toContain("'netsuite'")
    expect(source).toContain("'odbc'")
  })

  it('connectionMeta includes accountId', () => {
    expect(source).toContain('accountId?: string')
  })

  it('connectionMeta includes dsn and driver', () => {
    expect(source).toContain('dsn?: string')
    expect(source).toContain('driver?: string')
  })
})

// =============================================================================
// NetSuite Module (electron/netsuite.ts)
// =============================================================================

describe('NetSuite module (electron/netsuite.ts)', () => {
  const source = fs.readFileSync('electron/netsuite.ts', 'utf-8')

  it('exports connectNetSuite function', () => {
    expect(source).toContain('export async function connectNetSuite')
  })

  it('exports switchNetSuiteConnection function', () => {
    expect(source).toContain('export async function switchNetSuiteConnection')
  })

  it('exports getNetSuiteSchema function', () => {
    expect(source).toContain('export async function getNetSuiteSchema')
  })

  it('exports runNetSuiteQuery function', () => {
    expect(source).toContain('export async function runNetSuiteQuery')
  })

  it('exports getNetSuiteEnvVars function', () => {
    expect(source).toContain('export function getNetSuiteEnvVars')
  })

  it('sets all 5 NetSuite env vars', () => {
    expect(source).toContain('NETSUITE_ACCOUNT_ID')
    expect(source).toContain('NETSUITE_CONSUMER_KEY')
    expect(source).toContain('NETSUITE_CONSUMER_SECRET')
    expect(source).toContain('NETSUITE_TOKEN_ID')
    expect(source).toContain('NETSUITE_TOKEN_SECRET')
  })

  it('exports getNetSuiteTableDetails function', () => {
    expect(source).toContain('export async function getNetSuiteTableDetails')
  })

  it('exports cleanupNetSuite function', () => {
    expect(source).toContain('export function cleanupNetSuite')
  })
})

// =============================================================================
// ODBC Module (electron/odbc.ts)
// =============================================================================

describe('ODBC module (electron/odbc.ts)', () => {
  const source = fs.readFileSync('electron/odbc.ts', 'utf-8')

  it('exports connectODBC function', () => {
    expect(source).toContain('export async function connectODBC')
  })

  it('exports switchODBCConnection function', () => {
    expect(source).toContain('export async function switchODBCConnection')
  })

  it('exports getODBCSchema function', () => {
    expect(source).toContain('export async function getODBCSchema')
  })

  it('exports runODBCQuery function', () => {
    expect(source).toContain('export async function runODBCQuery')
  })

  it('exports getODBCEnvVars which builds ODBC_CONNECTION_STRING', () => {
    expect(source).toContain('export function getODBCEnvVars')
    expect(source).toContain('ODBC_CONNECTION_STRING')
  })

  it('builds connection string from parts when no raw string provided', () => {
    expect(source).toContain('DSN=')
    expect(source).toContain('DRIVER={')
    expect(source).toContain('SERVER=')
  })

  it('exports getODBCTableDetails function', () => {
    expect(source).toContain('export async function getODBCTableDetails')
  })

  it('exports cleanupODBC function', () => {
    expect(source).toContain('export function cleanupODBC')
  })
})

// =============================================================================
// ConnectionModal Frontend
// =============================================================================

describe('ConnectionModal includes netsuite and odbc', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  it('DATA_SOURCES array includes Oracle NetSuite', () => {
    expect(source).toContain("name: 'Oracle NetSuite'")
    expect(source).toContain("description: 'NetSuite WMS / ERP via SuiteQL'")
  })

  it('DATA_SOURCES array includes ODBC', () => {
    expect(source).toContain("name: 'ODBC'")
    expect(source).toContain("description: 'Any ODBC-compatible database'")
  })

  it('has NetSuite form fields', () => {
    expect(source).toContain('nsAccountId')
    expect(source).toContain('nsConsumerKey')
    expect(source).toContain('nsConsumerSecret')
    expect(source).toContain('nsTokenId')
    expect(source).toContain('nsTokenSecret')
  })

  it('has ODBC connection string mode toggle', () => {
    expect(source).toContain('odbcUseConnString')
    expect(source).toContain('odbcConnectionString')
  })

  it('has handleNetSuiteConnect handler', () => {
    expect(source).toContain('handleNetSuiteConnect')
    expect(source).toContain('window.electron.netsuite.connect')
  })

  it('has handleODBCConnect handler', () => {
    expect(source).toContain('handleODBCConnect')
    expect(source).toContain('window.electron.odbc.connect')
  })

  it('renders netsuite case in form switch', () => {
    expect(source).toContain("case 'netsuite':")
  })

  it('renders odbc case in form switch', () => {
    expect(source).toContain("case 'odbc':")
  })
})

// =============================================================================
// ConnectionsPage dispatch
// =============================================================================

describe('ConnectionsPage dispatch (src/components/ConnectionsPage.tsx)', () => {
  const source = fs.readFileSync('src/components/ConnectionsPage.tsx', 'utf-8')

  it('dispatches to netsuite connector', () => {
    expect(source).toContain("case 'netsuite': return window.electron.netsuite")
  })

  it('dispatches to odbc connector', () => {
    expect(source).toContain("case 'odbc': return window.electron.odbc")
  })
})

// =============================================================================
// AppSidebar switch connection
// =============================================================================

describe('AppSidebar switch connection (src/components/AppSidebar.tsx)', () => {
  const source = fs.readFileSync('src/components/AppSidebar.tsx', 'utf-8')

  it('handles netsuite switch', () => {
    expect(source).toContain("connType === 'netsuite'")
    expect(source).toContain('window.electron.netsuite.switchConnection')
    expect(source).toContain('window.electron.netsuite.getSchema')
  })

  it('handles odbc switch', () => {
    expect(source).toContain("connType === 'odbc'")
    expect(source).toContain('window.electron.odbc.switchConnection')
    expect(source).toContain('window.electron.odbc.getSchema')
  })
})

// =============================================================================
// Python Requirements
// =============================================================================

describe('Python requirements', () => {
  const source = fs.readFileSync('python/requirements.txt', 'utf-8')

  it('includes requests_oauthlib for NetSuite', () => {
    expect(source).toContain('requests_oauthlib')
  })

  it('includes pyodbc for ODBC', () => {
    expect(source).toContain('pyodbc')
  })
})

// =============================================================================
// Vite config externals
// =============================================================================

describe('Vite config (vite.config.ts)', () => {
  const source = fs.readFileSync('vite.config.ts', 'utf-8')

  it('marks odbc as external (native addon)', () => {
    expect(source).toContain("'odbc'")
  })
})
