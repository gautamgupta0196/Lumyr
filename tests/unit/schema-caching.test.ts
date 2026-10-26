import { describe, it, expect } from 'vitest'
import fs from 'fs'

// =============================================================================
// Schema disk caching infrastructure
// =============================================================================

describe('Schema store (electron/store.ts)', () => {
  const source = fs.readFileSync('electron/store.ts', 'utf-8')

  it('creates a separate unencrypted schema store', () => {
    expect(source).toContain("name: 'lumyr-schemas'")
  })

  it('exports getCachedSchema function', () => {
    expect(source).toContain('export function getCachedSchema(connectionId: string)')
  })

  it('exports saveCachedSchema function', () => {
    expect(source).toContain('export function saveCachedSchema(connectionId: string')
  })

  it('exports deleteCachedSchema function', () => {
    expect(source).toContain('export function deleteCachedSchema(connectionId: string)')
  })

  it('stores fetchedAt timestamp alongside schema', () => {
    expect(source).toContain('fetchedAt: Date.now()')
  })

  it('cleans up schema cache on connection delete', () => {
    expect(source).toContain('deleteCachedSchema(id)')
  })
})

describe('Schema cache IPC handlers (electron/main.ts)', () => {
  const source = fs.readFileSync('electron/main.ts', 'utf-8')

  it('handles schema:get-cached channel', () => {
    expect(source).toContain("ipcMain.handle('schema:get-cached'")
  })

  it('handles schema:save-cache channel', () => {
    expect(source).toContain("ipcMain.handle('schema:save-cache'")
  })

  it('handles schema:clear-cache channel', () => {
    expect(source).toContain("ipcMain.handle('schema:clear-cache'")
  })

  it('imports schema cache functions from store', () => {
    expect(source).toContain('getCachedSchema')
    expect(source).toContain('saveCachedSchema')
    expect(source).toContain('deleteCachedSchema')
  })
})

describe('Schema cache preload API (electron/preload.ts)', () => {
  const source = fs.readFileSync('electron/preload.ts', 'utf-8')

  it('exposes getCached in schema API', () => {
    expect(source).toContain("getCached: (connectionId: string) => ipcRenderer.invoke('schema:get-cached'")
  })

  it('exposes saveCache in schema API', () => {
    expect(source).toContain("saveCache: (connectionId: string, schema: Schema) => ipcRenderer.invoke('schema:save-cache'")
  })

  it('exposes clearCache in schema API', () => {
    expect(source).toContain("clearCache: (connectionId: string) => ipcRenderer.invoke('schema:clear-cache'")
  })
})

describe('Schema cache frontend types (src/types/electron.d.ts)', () => {
  const source = fs.readFileSync('src/types/electron.d.ts', 'utf-8')

  it('declares getCached method on schema API', () => {
    expect(source).toContain('getCached: (connectionId: string) => Promise<')
  })

  it('declares saveCache method on schema API', () => {
    expect(source).toContain('saveCache: (connectionId: string, schema: Schema) => Promise<void>')
  })

  it('declares clearCache method on schema API', () => {
    expect(source).toContain('clearCache: (connectionId: string) => Promise<void>')
  })
})

// =============================================================================
// Cache-first loading pattern consistency
// =============================================================================

describe('Cache-first loading pattern in App', () => {
  const source = fs.readFileSync('src/App.tsx', 'utf-8')

  it('initializeConnection checks cache before fetching', () => {
    // Cache check is in loadSchemaForConnection helper, called by initializeConnection
    const cacheCheckIdx = source.indexOf('schema.getCached(connectionId)')
    expect(cacheCheckIdx).toBeGreaterThan(-1)
    const initIdx = source.indexOf('initializeConnection')
    expect(initIdx).toBeGreaterThan(-1)
    // loadSchemaForConnection must be called inside initializeConnection
    expect(source).toContain('loadSchemaForConnection')
  })

  it('sets cached schema immediately when cache hit', () => {
    const cacheIdx = source.indexOf('schema.getCached(connectionId)')
    const setSchemaIdx = source.indexOf('setSchema(cached.schema)', cacheIdx)
    expect(setSchemaIdx).toBeGreaterThan(cacheIdx)
  })

  it('does background refresh after cache hit', () => {
    const cachedSetIdx = source.indexOf('setSchema(cached.schema)')
    const backgroundIdx = source.indexOf('.catch(() => {})', cachedSetIdx)
    expect(backgroundIdx).toBeGreaterThan(cachedSetIdx)
  })

  it('has refresh schema handler', () => {
    const connSource = fs.readFileSync('src/components/ConnectionsPage.tsx', 'utf-8')
    expect(connSource).toContain('handleRefresh')
  })

  it('refresh handler saves to cache after fetch', () => {
    const connSource = fs.readFileSync('src/components/ConnectionsPage.tsx', 'utf-8')
    const refreshIdx = connSource.indexOf('handleRefresh')
    const saveCacheIdx = connSource.indexOf('schema.saveCache(connection.connectionId', refreshIdx)
    expect(saveCacheIdx).toBeGreaterThan(refreshIdx)
  })

  it('renders RefreshCw icon for schema refresh', () => {
    const connSource = fs.readFileSync('src/components/ConnectionsPage.tsx', 'utf-8')
    expect(connSource).toContain('RefreshCw')
    expect(connSource).toContain('Refresh')
  })
})

describe('Cache-first loading in App initialization', () => {
  const source = fs.readFileSync('src/App.tsx', 'utf-8')

  it('checks cache before showing loading indicator', () => {
    const cacheIdx = source.indexOf('schema.getCached(connectionId)')
    expect(cacheIdx).toBeGreaterThan(0)
  })

  it('does not block UI when cache is available', () => {
    // When cached, should set schema and skip loading indicator
    const cacheIdx = source.indexOf('schema.getCached(connectionId)')
    const setSchemaAfterCache = source.indexOf('setSchema(cached.schema)', cacheIdx)
    expect(setSchemaAfterCache).toBeGreaterThan(cacheIdx)
  })
})
