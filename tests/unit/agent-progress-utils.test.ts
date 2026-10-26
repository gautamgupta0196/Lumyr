import { describe, expect, it } from 'vitest'
import { getCollapsedStatusLabel, getStepDescription } from '../../src/components/agent-progress-utils'
import type { AgentStep } from '../../src/stores/app-store'

const step = (fields: Partial<AgentStep>): AgentStep => ({
  id: 's',
  type: 'tool_call',
  timestamp: 0,
  ...fields,
})

describe('AgentProgress collapsed labels', () => {
  it('describes normalized bridge tools in plain words', () => {
    expect(getCollapsedStatusLabel([step({ toolName: 'run_sql' })], 'exploring', false))
      .toBe('Checking a query against your data...')
    expect(getCollapsedStatusLabel([step({ toolName: 'write_dashboard' })], 'generating', false))
      .toBe('Writing the dashboard...')
  })

  it('names opencode built-in tools instead of echoing the raw tool id', () => {
    expect(getCollapsedStatusLabel([step({ toolName: 'bash' })], 'exploring', false))
      .toBe('Running a command...')
  })

  it('reports row counts from parsed run_sql results', () => {
    const result = step({ type: 'tool_result', toolName: 'run_sql', toolResult: { rowCount: 5 } })
    expect(getStepDescription(result)).toBe('Query returned 5 rows')
  })

  it('does not crash on a tool error with no result payload', () => {
    const failed = step({ type: 'tool_result', toolName: 'bash', isError: true, errorMessage: 'boom' })
    expect(getCollapsedStatusLabel([failed], 'exploring', false)).toBe('Error: boom')
  })
})
