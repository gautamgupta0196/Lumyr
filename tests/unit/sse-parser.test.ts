import { describe, expect, it } from 'vitest'
import { parseSSEFrames } from '../../src/hooks/sse-parser'

describe('parseSSEFrames', () => {
  it('handles JSON split across chunk boundaries', () => {
    const events: Array<{ text?: string; error?: string }> = []

    const partial = parseSSEFrames('data: {"text":"hel', (event) => {
      events.push(event)
    })

    expect(partial.done).toBe(false)
    expect(partial.remainingBuffer).toBe('data: {"text":"hel')
    expect(events).toEqual([])

    const complete = parseSSEFrames(`${partial.remainingBuffer}lo"}\n\n`, (event) => {
      events.push(event)
    })

    expect(complete.done).toBe(false)
    expect(complete.remainingBuffer).toBe('')
    expect(events).toEqual([{ text: 'hello' }])
  })

  it('handles multiple events in one chunk and preserves ordering', () => {
    const texts: string[] = []

    const result = parseSSEFrames('data: {"text":"a"}\n\ndata: {"text":"b"}\n\n', (event) => {
      if (event.text) {
        texts.push(event.text)
      }
    })

    expect(result.done).toBe(false)
    expect(result.remainingBuffer).toBe('')
    expect(texts).toEqual(['a', 'b'])
  })

  it('keeps trailing partial frame and completes on next chunk', () => {
    const texts: string[] = []

    const first = parseSSEFrames('data: {"text":"first"}\n\ndata: {"text":"se', (event) => {
      if (event.text) {
        texts.push(event.text)
      }
    })

    expect(first.done).toBe(false)
    expect(first.remainingBuffer).toBe('data: {"text":"se')
    expect(texts).toEqual(['first'])

    const second = parseSSEFrames(`${first.remainingBuffer}cond"}\n\ndata: [DONE]\n\n`, (event) => {
      if (event.text) {
        texts.push(event.text)
      }
    })

    expect(second.done).toBe(true)
    expect(second.remainingBuffer).toBe('')
    expect(texts).toEqual(['first', 'second'])
  })

  it('supports multi-line data frames and propagates error payloads', () => {
    const events: Array<{ text?: string; error?: string }> = []
    const payload = 'data: {\ndata:   "error": "stream failed"\ndata: }\n\n'

    const result = parseSSEFrames(payload, (event) => {
      events.push(event)
    })

    expect(result.done).toBe(false)
    expect(result.remainingBuffer).toBe('')
    expect(events).toEqual([{ error: 'stream failed' }])
  })
})
