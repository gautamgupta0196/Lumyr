import fs from 'fs'
import { describe, it, expect } from 'vitest'

describe('QueryPanel intent routing', () => {
  const source = fs.readFileSync('src/hooks/useGeneration.ts', 'utf-8')

  it('uses responseMode to steer the agent instead of classifyIntent', () => {
    expect(source).toContain("useState<ResponseMode>('auto')")
    expect(source).not.toContain('classifyIntent')
    expect(source).toContain('window.electron.claude.generateAgent(')
  })

  it('prepends dashboard vs answer hints to the agent query', () => {
    expect(source).toContain("[User wants a dashboard/visualization]")
    expect(source).toContain("[User wants a text answer, NOT a dashboard]")
  })

  it('supports plan-only mode with a structured prompt and generateAgent', () => {
    expect(source).toContain('[User wants a PLAN ONLY')
    expect(source).toContain('window.electron.claude.generateAgent({')
  })
})
