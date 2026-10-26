import { describe, it, expect } from 'vitest'
import fs from 'fs'

// =============================================================================
// Change 1: SchemaFetchOptions type has `mode` field
// =============================================================================

describe('SchemaFetchOptions mode field', () => {
  it('types.ts includes mode in SchemaFetchOptions', () => {
    const source = fs.readFileSync('electron/data-sources/types.ts', 'utf-8')
    expect(source).toContain("mode?: 'tables_only' | 'full'")
  })

  it('bigquery.ts includes mode in its local SchemaFetchOptions', () => {
    const source = fs.readFileSync('electron/bigquery.ts', 'utf-8')
    expect(source).toContain("mode?: 'tables_only' | 'full'")
  })

  it('electron.d.ts includes mode in frontend SchemaFetchOptions', () => {
    const source = fs.readFileSync('src/types/electron.d.ts', 'utf-8')
    expect(source).toContain("mode?: 'tables_only' | 'full'")
  })
})

// =============================================================================
// Change 2: tables_only mode in all 4 DB clients
// =============================================================================

describe('BigQuery tables_only mode', () => {
  const source = fs.readFileSync('electron/bigquery.ts', 'utf-8')

  it('checks for tables_only mode before fetching metadata', () => {
    expect(source).toContain("options?.mode === 'tables_only'")
  })

  it('returns empty columns array in tables_only mode', () => {
    expect(source).toContain('datasetSchema.tables.push({ id: table.id!, columns: [] })')
  })

  it('still fetches metadata when mode is not tables_only', () => {
    // The else branch should still call getMetadata
    expect(source).toContain('const [metadata] = await table.getMetadata()')
  })
})

describe('PostgreSQL tables_only mode', () => {
  const source = fs.readFileSync('electron/data-sources/postgresql-client.ts', 'utf-8')

  it('checks for tables_only mode', () => {
    expect(source).toContain("const isTablesOnly = options?.mode === 'tables_only'")
  })

  it('skips column queries in tables_only mode', () => {
    // In tables_only mode, tables get empty columns
    expect(source).toContain('columns: [],')
  })

  it('uses batched column query in full mode', () => {
    // Should fetch all columns for the schema in one query
    expect(source).toContain('FROM information_schema.columns')
    expect(source).toContain('WHERE table_schema = $1')
    expect(source).toContain('ORDER BY table_name, ordinal_position')
  })

  it('groups batched columns by table name using Map', () => {
    expect(source).toContain('const columnsByTable = new Map<string, Column[]>()')
    expect(source).toContain("columnsByTable.get(tName)")
  })

  it('falls back to empty columns when table is not in batch result', () => {
    expect(source).toContain("columnsByTable.get(tableName) || []")
  })
})

describe('Snowflake tables_only mode', () => {
  const source = fs.readFileSync('electron/data-sources/snowflake-client.ts', 'utf-8')

  it('checks for tables_only mode', () => {
    expect(source).toContain("const isTablesOnly = options?.mode === 'tables_only'")
  })

  it('skips column queries in tables_only mode', () => {
    expect(source).toContain('columns: [],')
  })

  it('uses batched column query in full mode', () => {
    expect(source).toContain('INFORMATION_SCHEMA.COLUMNS')
    expect(source).toContain('ORDER BY TABLE_NAME, ORDINAL_POSITION')
  })

  it('groups batched columns by table name using Map', () => {
    expect(source).toContain('const columnsByTable = new Map<string, Column[]>()')
  })
})

describe('Redshift tables_only mode', () => {
  const source = fs.readFileSync('electron/data-sources/redshift-client.ts', 'utf-8')

  it('checks for tables_only mode', () => {
    expect(source).toContain("const isTablesOnly = options?.mode === 'tables_only'")
  })

  it('skips column queries in tables_only mode', () => {
    expect(source).toContain('columns: [],')
  })

  it('uses batched svv_columns query in full mode', () => {
    expect(source).toContain('FROM svv_columns')
    expect(source).toContain('WHERE table_schema = $1')
    expect(source).toContain('ORDER BY table_name, ordinal_position')
  })

  it('groups batched columns by table name using Map', () => {
    expect(source).toContain('const columnsByTable = new Map<string, Column[]>()')
  })
})

// =============================================================================
// Change 3: Cache-first schema loading (replaced two-phase with disk cache)
// =============================================================================

describe('Cache-first schema loading in App.tsx', () => {
  const source = fs.readFileSync('src/App.tsx', 'utf-8')

  it('checks disk cache before fetching schema', () => {
    expect(source).toContain('schema.getCached(connectionId)')
  })

  it('fetches schema with tables_only mode on cache miss', () => {
    expect(source).toContain("getSchema({ mode: 'tables_only' })")
  })

  it('saves fetched schema to disk cache', () => {
    expect(source).toContain('schema.saveCache(connectionId')
  })

  it('sets schema from tables-only result before unblocking UI', () => {
    const tablesOnlyIdx = source.indexOf("mode: 'tables_only'")
    const setSchemaIdx = source.indexOf('setSchema(tablesResult.schema)', tablesOnlyIdx)
    const unblockIdx = source.indexOf('setLoadingSchema(false)', tablesOnlyIdx)
    expect(tablesOnlyIdx).toBeGreaterThan(0)
    expect(setSchemaIdx).toBeGreaterThan(tablesOnlyIdx)
    expect(unblockIdx).toBeGreaterThan(setSchemaIdx)
  })
})

describe('Cache-first schema loading in useBigQuery.ts', () => {
  const source = fs.readFileSync('src/hooks/useBigQuery.ts', 'utf-8')

  it('fetches with tables_only mode', () => {
    expect(source).toContain("getSchema({ mode: 'tables_only' })")
  })

  it('saves schema to disk cache after fetch', () => {
    expect(source).toContain('schema.saveCache(')
  })

  it('unblocks UI after fetch (setLoadingSchema(false))', () => {
    const phase1Idx = source.indexOf("mode: 'tables_only'")
    const unblockIdx = source.indexOf('setLoadingSchema(false)', phase1Idx)
    expect(unblockIdx).toBeGreaterThan(phase1Idx)
  })
})

describe('Cache-first schema loading in AppSidebar.tsx', () => {
  const source = fs.readFileSync('src/components/AppSidebar.tsx', 'utf-8')

  it('uses handleSwitchConnection with inline schema loading', () => {
    expect(source).toContain('handleSwitchConnection')
  })

  it('fetches schema with tables_only mode', () => {
    expect(source).toContain("getSchema({ mode: 'tables_only' })")
  })

  it('fetches tables_only on connection switch', () => {
    expect(source).toContain("mode: 'tables_only'")
  })

  it('saves schema to disk cache', () => {
    expect(source).toContain('schema.saveCache(conn.id')
  })

  it('fetches schema for PostgreSQL connections', () => {
    expect(source).toContain('window.electron.postgresql.getSchema(')
  })

  it('fetches schema for BigQuery connections', () => {
    expect(source).toContain('window.electron.bigquery.getSchema(')
  })

  it('fetches schema for Snowflake connections', () => {
    expect(source).toContain('window.electron.snowflake.getSchema(')
  })

  it('fetches schema for Redshift connections', () => {
    expect(source).toContain('window.electron.redshift.getSchema(')
  })
})

describe('Cache-first schema loading in ConnectionModal.tsx', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  it('defines loadSchemaTwoPhase helper function', () => {
    expect(source).toContain('const loadSchemaTwoPhase = async')
  })

  it('helper fetches tables_only first', () => {
    expect(source).toContain("mode: 'tables_only'")
  })

  it('helper saves schema to disk cache', () => {
    expect(source).toContain('schema.saveCache(connectionId')
  })

  it('uses loadSchemaTwoPhase for PostgreSQL connections', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.postgresql.getSchema')
  })

  it('uses loadSchemaTwoPhase for BigQuery connections', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.bigquery.getSchema')
  })

  it('uses loadSchemaTwoPhase for Snowflake connections', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.snowflake.getSchema')
  })

  it('uses loadSchemaTwoPhase for Redshift connections', () => {
    expect(source).toContain('loadSchemaTwoPhase(window.electron.redshift.getSchema')
  })

  it('has NO remaining bare getSchema() calls (all use helper)', () => {
    const lines = source.split('\n')
    for (const line of lines) {
      if (line.includes('getSchemaFn(') || line.includes('getSchemaFn({')) continue
      if (line.includes('.then(')) continue
      if (line.includes('loadSchemaTwoPhase')) continue
      if (line.includes('await') && line.match(/\.getSchema\(\)/)) {
        throw new Error(`Found bare blocking getSchema() call: ${line.trim()}`)
      }
    }
  })
})

// =============================================================================
// Change 4: On-demand column fetching in agent tools
// =============================================================================

describe('PostgreSQL getTableDetails wrapper', () => {
  const source = fs.readFileSync('electron/postgresql.ts', 'utf-8')

  it('exports getPostgreSQLTableDetails function', () => {
    expect(source).toContain('export async function getPostgreSQLTableDetails')
  })

  it('returns columns from pgClient.getTableDetails', () => {
    expect(source).toContain('pgClient.getTableDetails(tableName)')
  })

  it('returns null-compatible result on failure', () => {
    expect(source).toContain("success: false, error: 'Not connected to PostgreSQL'")
  })
})

describe('Snowflake getTableDetails wrapper', () => {
  const source = fs.readFileSync('electron/snowflake.ts', 'utf-8')

  it('exports getSnowflakeTableDetails function', () => {
    expect(source).toContain('export async function getSnowflakeTableDetails')
  })

  it('delegates to snowflakeClient.getTableDetails', () => {
    expect(source).toContain('snowflakeClient.getTableDetails(tableName)')
  })
})

describe('Redshift getTableDetails wrapper', () => {
  const source = fs.readFileSync('electron/redshift.ts', 'utf-8')

  it('exports getRedshiftTableDetails function', () => {
    expect(source).toContain('export async function getRedshiftTableDetails')
  })

  it('delegates to redshiftClient.getTableDetails', () => {
    expect(source).toContain('redshiftClient.getTableDetails(tableName)')
  })
})

// =============================================================================
// Change 4 (plumbing): main.ts passes getTableDetailsFn to the engine
// =============================================================================

describe('main.ts getTableDetailsFn plumbing', () => {
  const source = fs.readFileSync('electron/main.ts', 'utf-8')

  it('imports getPostgreSQLTableDetails', () => {
    expect(source).toContain('getPostgreSQLTableDetails')
  })

  it('imports getSnowflakeTableDetails', () => {
    expect(source).toContain('getSnowflakeTableDetails')
  })

  it('imports getRedshiftTableDetails', () => {
    expect(source).toContain('getRedshiftTableDetails')
  })

  it('builds getTableDetailsFn based on connection type', () => {
    expect(source).toContain('const getTableDetailsFn = async (tableName: string)')
  })

  it('dispatches to PostgreSQL for postgresql connections', () => {
    expect(source).toContain("connType === 'postgresql'")
    expect(source).toContain('getPostgreSQLTableDetails(tableName)')
  })

  it('dispatches to Snowflake for snowflake connections', () => {
    expect(source).toContain("connType === 'snowflake'")
    expect(source).toContain('getSnowflakeTableDetails(tableName)')
  })

  it('dispatches to Redshift for redshift connections', () => {
    expect(source).toContain("connType === 'redshift'")
    expect(source).toContain('getRedshiftTableDetails(tableName)')
  })

  it('dispatches to BigQuery getTableDetails for bigquery connections', () => {
    expect(source).toContain('getTableDetails(tableName)')
  })

  it('passes getTableDetailsFn to the opencode engine', () => {
    expect(source).toContain('getTableDetails: getTableDetailsFn')
    expect(source).toContain('runQuery: runQueryFn')
  })
})

// =============================================================================
// Change 5: Disk-based schema caching (replaced Phase 2 auto-detection)
// =============================================================================

describe('Schema disk caching across all frontend files', () => {
  it('App.tsx uses schema.getCached for cache-first loading', () => {
    const source = fs.readFileSync('src/App.tsx', 'utf-8')
    expect(source).toContain('schema.getCached(')
  })

  it('useBigQuery.ts saves schema to disk cache', () => {
    const source = fs.readFileSync('src/hooks/useBigQuery.ts', 'utf-8')
    expect(source).toContain('schema.saveCache(')
  })

  it('ConnectionModal.tsx saves schema to disk cache', () => {
    const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')
    expect(source).toContain('schema.saveCache(')
  })

  it('AppSidebar.tsx uses schema.saveCache and App.tsx uses getCached', () => {
    const sidebarSource = fs.readFileSync('src/components/AppSidebar.tsx', 'utf-8')
    const appSource = fs.readFileSync('src/App.tsx', 'utf-8')
    expect(appSource).toContain('schema.getCached(')
    expect(sidebarSource).toContain('schema.saveCache(')
  })
})

// =============================================================================
// DataSourceClient interface still requires getTableDetails
// =============================================================================

describe('DataSourceClient interface compatibility', () => {
  const source = fs.readFileSync('electron/data-sources/types.ts', 'utf-8')

  it('interface still requires getTableDetails method', () => {
    expect(source).toContain('getTableDetails(tableName: string): Promise<Table | null>')
  })

  it('interface still requires getSchema method', () => {
    expect(source).toContain('getSchema(options?: SchemaFetchOptions): Promise<SchemaResult>')
  })
})

// =============================================================================
// Consistency checks: No regressions
// =============================================================================
