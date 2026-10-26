import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../../src/stores/app-store'

describe('Agent run isolation', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
  })

  it('ignores agent steps from previous runs', () => {
    const store = useAppStore.getState()

    store.startAgentRun('run-1')
    store.addAgentStep({
      id: 's1',
      runId: 'run-1',
      type: 'thinking',
      timestamp: 1,
      thinking: 'first'
    })
    expect(useAppStore.getState().agentState.steps).toHaveLength(1)

    store.startAgentRun('run-2')
    expect(useAppStore.getState().agentState.steps).toHaveLength(0)

    // Late/stray step from old run should not show up in the new run UI.
    store.addAgentStep({
      id: 's2',
      runId: 'run-1',
      type: 'complete',
      timestamp: 2,
      thinking: 'late complete'
    })
    expect(useAppStore.getState().agentState.steps).toHaveLength(0)

    store.addAgentStep({
      id: 's3',
      runId: 'run-2',
      type: 'thinking',
      timestamp: 3,
      thinking: 'second'
    })
    expect(useAppStore.getState().agentState.steps).toHaveLength(1)
  })

  it('drops agent steps when no run is active', () => {
    const store = useAppStore.getState()

    store.resetAgentState()
    store.addAgentStep({
      id: 's1',
      runId: 'run-1',
      type: 'thinking',
      timestamp: 1,
      thinking: 'should be ignored'
    })

    expect(useAppStore.getState().agentState.steps).toHaveLength(0)
  })
})

