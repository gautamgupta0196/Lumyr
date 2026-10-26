import { beforeEach, describe, expect, it, vi } from 'vitest'

const addStreamlitOutput = vi.fn()
const setStreamlit = vi.fn()

let cleanup: (() => void) | undefined
const useEffectMock = vi.fn((effect: () => void | (() => void)) => {
  cleanup = effect() as (() => void) | undefined
})

vi.mock('react', () => ({
  useEffect: useEffectMock,
  useCallback: <T extends (...args: never[]) => unknown>(fn: T) => fn
}))

vi.mock('@/stores/app-store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) => {
    const mockState = {
      streamlit: {
        isRunning: false,
        port: null,
        error: null,
        output: []
      },
      setStreamlit,
      addStreamlitOutput
    }
    return selector(mockState as never)
  }
}))

describe('useStreamlit listener cleanup', () => {
  const outputListeners = new Set<(output: string) => void>()
  const errorListeners = new Set<(error: string) => void>()

  beforeEach(() => {
    cleanup = undefined
    useEffectMock.mockClear()
    addStreamlitOutput.mockClear()
    setStreamlit.mockClear()
    outputListeners.clear()
    errorListeners.clear()

    ;(globalThis as { window: unknown }).window = {
      electron: {
        streamlit: {
          start: vi.fn(),
          stop: vi.fn(),
          runCode: vi.fn(),
          onOutput: (callback: (output: string) => void) => {
            outputListeners.add(callback)
            return () => { outputListeners.delete(callback) }
          },
          onError: (callback: (error: string) => void) => {
            errorListeners.add(callback)
            return () => { errorListeners.delete(callback) }
          }
        }
      }
    }
  })

  it('removes hook listeners on unmount so remount does not duplicate callbacks', async () => {
    const { useStreamlit } = await import('../../src/hooks/useStreamlit')

    useStreamlit()

    for (const listener of outputListeners) {
      listener('first')
    }

    expect(addStreamlitOutput).toHaveBeenCalledTimes(1)

    expect(cleanup).toBeTypeOf('function')
    cleanup?.()

    useStreamlit()

    for (const listener of outputListeners) {
      listener('second')
    }

    for (const listener of errorListeners) {
      listener('boom')
    }

    expect(addStreamlitOutput).toHaveBeenCalledTimes(2)
    expect(setStreamlit).toHaveBeenCalledWith({ error: 'boom' })
    expect(setStreamlit).toHaveBeenCalledTimes(1)
  })
})
