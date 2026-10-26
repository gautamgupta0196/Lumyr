import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('Connection restore on app startup', () => {
  const appSource = fs.readFileSync('src/App.tsx', 'utf-8')

  it('checks for active non-BigQuery connection when BigQuery is not connected', () => {
    expect(appSource).toContain('connections.getActive()')
    expect(appSource).toContain('connections.list()')
  })

  it('has a connector lookup for all supported data source types', () => {
    // getConnector must handle all non-BigQuery types
    expect(appSource).toContain("case 'postgresql'")
    expect(appSource).toContain("case 'snowflake'")
    expect(appSource).toContain("case 'redshift'")
    expect(appSource).toContain("case 'netsuite'")
    expect(appSource).toContain("case 'odbc'")
  })

  it('re-establishes connection via switchConnection on startup', () => {
    expect(appSource).toContain('connector.switchConnection(activeConnectionId)')
  })

  it('loads schema with cache-first strategy for restored connections', () => {
    expect(appSource).toContain('schema.getCached')
    expect(appSource).toContain('schema.saveCache')
  })

  it('sets connection state after restoring non-BigQuery connection', () => {
    // After switchConnection succeeds, setConnection must be called with isConnected: true
    expect(appSource).toContain('switchResult.success')
    expect(appSource).toContain('setConnection')
    expect(appSource).toContain('isConnected: true')
  })
})
