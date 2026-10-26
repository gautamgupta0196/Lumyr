import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('Auto-updater error filter', () => {
  const source = fs.readFileSync('electron/auto-updater.ts', 'utf-8')

  it('silently ignores 404 errors', () => {
    expect(source).toContain("error.message.includes('404')")
  })

  it('silently ignores 502 errors', () => {
    expect(source).toContain("error.message.includes('502')")
  })

  it('silently ignores 503 errors', () => {
    expect(source).toContain("error.message.includes('503')")
  })

  it('silently ignores 504 errors', () => {
    expect(source).toContain("error.message.includes('504')")
  })

  it('silently ignores ECONNREFUSED errors', () => {
    expect(source).toContain("error.message.includes('ECONNREFUSED')")
  })

  it('silently ignores ETIMEDOUT errors', () => {
    expect(source).toContain("error.message.includes('ETIMEDOUT')")
  })

  it('does not send error status for transient failures', () => {
    // The handler returns early for server/network errors, skipping sendUpdateStatus
    const filterIdx = source.indexOf("error.message.includes('502')")
    const returnIdx = source.indexOf('return', filterIdx)
    expect(returnIdx).toBeGreaterThan(filterIdx)
  })

  it('still reports non-transient errors', () => {
    expect(source).toContain("sendUpdateStatus({ status: 'error', error: error.message })")
  })
})
