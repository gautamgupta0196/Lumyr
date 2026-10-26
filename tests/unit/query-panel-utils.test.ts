import fs from 'fs'
import { describe, expect, it } from 'vitest'
import { shouldFallbackStreamlitRun } from '../../src/components/query-panel-utils'

describe('QueryPanel Streamlit fallback handoff', () => {
  it('does not request a renderer-side rerun when the agent already left Streamlit running', () => {
    expect(shouldFallbackStreamlitRun({ isRunning: true, port: 8501 })).toBe(false)
  })

  it('falls back to renderer-side runCode when no active Streamlit port is available', () => {
    expect(shouldFallbackStreamlitRun({ isRunning: false, port: null })).toBe(true)
    expect(shouldFallbackStreamlitRun({ isRunning: true, port: null })).toBe(true)
  })

  it('QueryPanel gates the fallback runCode call behind the helper', () => {
    const source = fs.readFileSync('src/hooks/useGeneration.ts', 'utf-8')

    expect(source).toContain('if (shouldFallbackStreamlitRun(currentStreamlit))')
    expect(source).toContain('window.electron.streamlit.runCode(result.code)')
  })
})
