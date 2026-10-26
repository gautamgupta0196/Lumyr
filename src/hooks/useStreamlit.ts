import { useCallback, useEffect } from 'react'
import { useAppStore } from '@/stores/app-store'

export function useStreamlit() {
  const streamlit = useAppStore((state) => state.streamlit)
  const setStreamlit = useAppStore((state) => state.setStreamlit)
  const addStreamlitOutput = useAppStore((state) => state.addStreamlitOutput)

  // Set up event listeners for Streamlit output
  useEffect(() => {
    const handleOutput = (output: string) => {
      addStreamlitOutput(output)
    }

    const handleError = (error: string) => {
      setStreamlit({ error })
    }

    const removeOutput = window.electron.streamlit.onOutput(handleOutput)
    const removeError = window.electron.streamlit.onError(handleError)

    return () => {
      removeOutput()
      removeError()
    }
  }, [addStreamlitOutput, setStreamlit])

  const start = useCallback(async () => {
    try {
      setStreamlit({ error: null })
      const result = await window.electron.streamlit.start()

      if (result.success) {
        setStreamlit({
          isRunning: true,
          port: result.port,
          error: null
        })
        return { success: true, port: result.port }
      } else {
        setStreamlit({ error: result.error })
        return { success: false, error: result.error }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start Streamlit'
      setStreamlit({ error })
      return { success: false, error }
    }
  }, [setStreamlit])

  const stop = useCallback(async () => {
    try {
      const result = await window.electron.streamlit.stop()

      if (result.success) {
        setStreamlit({
          isRunning: false,
          port: null,
          error: null,
          output: [],
          stopped: false
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to stop Streamlit'
      return { success: false, error }
    }
  }, [setStreamlit])

  const runCode = useCallback(
    async (code: string) => {
      try {
        setStreamlit({ error: null })
        const result = await window.electron.streamlit.runCode(code)

        if (result.success) {
          setStreamlit({
            isRunning: true,
            port: result.port,
            error: null
          })
          return { success: true, port: result.port }
        } else {
          setStreamlit({ error: result.error })
          return { success: false, error: result.error }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Failed to run code'
        setStreamlit({ error })
        return { success: false, error }
      }
    },
    [setStreamlit]
  )

  return {
    isRunning: streamlit.isRunning,
    port: streamlit.port,
    error: streamlit.error,
    output: streamlit.output,
    start,
    stop,
    runCode
  }
}
