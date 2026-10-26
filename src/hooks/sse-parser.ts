export interface StreamParseResult {
  remainingBuffer: string
  done: boolean
}

export type ParsedEvent = {
  text?: string
  error?: string
}

export function parseSSEFrames(
  buffer: string,
  onEvent: (event: ParsedEvent) => void
): StreamParseResult {
  let remainingBuffer = buffer
  let done = false

  while (!done) {
    const frameDelimiter = remainingBuffer.match(/\r?\n\r?\n/)
    if (!frameDelimiter || frameDelimiter.index === undefined) {
      break
    }

    const frame = remainingBuffer.slice(0, frameDelimiter.index)
    remainingBuffer = remainingBuffer.slice(frameDelimiter.index + frameDelimiter[0].length)

    const dataLines: string[] = []

    for (const line of frame.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) {
        continue
      }

      const separatorIndex = line.indexOf(':')
      const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
      let value = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1)

      if (value.startsWith(' ')) {
        value = value.slice(1)
      }

      if (field === 'data') {
        dataLines.push(value)
      }
    }

    if (dataLines.length === 0) {
      continue
    }

    const eventData = dataLines.join('\n')
    if (eventData === '[DONE]') {
      done = true
      break
    }

    try {
      const parsed = JSON.parse(eventData) as ParsedEvent
      onEvent(parsed)
    } catch {
      // Skip invalid JSON payloads
    }
  }

  return {
    remainingBuffer,
    done
  }
}
