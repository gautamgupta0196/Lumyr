import { useCallback, useState } from 'react'
import { useAppStore } from '@/stores/app-store'
import { parseSSEFrames } from './sse-parser'

const BACKEND_URL = 'http://localhost:3001'

interface GenerateResult {
  success: boolean
  code?: string
  error?: string
}

export function useClaude() {
  const schema = useAppStore((state) => state.schema)
  const generation = useAppStore((state) => state.generation)
  const setGeneration = useAppStore((state) => state.setGeneration)
  const [isStreaming, setIsStreaming] = useState(false)

  const generateCode = useCallback(
    async (query: string, selectedTables?: string[]): Promise<GenerateResult> => {
      if (!schema) {
        return { success: false, error: 'No schema available' }
      }

      setGeneration({ isGenerating: true, error: null, generatedCode: null })

      try {
        const response = await fetch(`${BACKEND_URL}/api/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            schema,
            selectedTables
          })
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to generate code')
        }

        const data = await response.json()

        setGeneration({
          isGenerating: false,
          generatedCode: data.code,
          error: null
        })

        return { success: true, code: data.code }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Generation failed'
        setGeneration({
          isGenerating: false,
          error
        })
        return { success: false, error }
      }
    },
    [schema, setGeneration]
  )

  const generateCodeStreaming = useCallback(
    async (
      query: string,
      onChunk: (chunk: string) => void,
      selectedTables?: string[]
    ): Promise<GenerateResult> => {
      if (!schema) {
        return { success: false, error: 'No schema available' }
      }

      setGeneration({ isGenerating: true, error: null, generatedCode: null })
      setIsStreaming(true)

      try {
        const response = await fetch(`${BACKEND_URL}/api/generate/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            schema,
            selectedTables
          })
        })

        if (!response.ok) {
          throw new Error('Failed to start streaming')
        }

        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let fullCode = ''
        let streamBuffer = ''
        let isDone = false

        while (!isDone) {
          const { done, value } = await reader.read()
          if (done) {
            streamBuffer += decoder.decode()
            break
          }

          streamBuffer += decoder.decode(value, { stream: true })

          const parseResult = parseSSEFrames(streamBuffer, (event) => {
            if (event.text) {
              fullCode += event.text
              onChunk(event.text)
            }

            if (event.error) {
              throw new Error(event.error)
            }
          })

          streamBuffer = parseResult.remainingBuffer
          isDone = parseResult.done
        }

        setGeneration({
          isGenerating: false,
          generatedCode: fullCode,
          error: null
        })
        setIsStreaming(false)

        return { success: true, code: fullCode }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Generation failed'
        setGeneration({
          isGenerating: false,
          error
        })
        setIsStreaming(false)
        return { success: false, error }
      }
    },
    [schema, setGeneration]
  )

  return {
    generateCode,
    generateCodeStreaming,
    isGenerating: generation.isGenerating,
    isStreaming,
    generatedCode: generation.generatedCode,
    error: generation.error
  }
}
