export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function normalizeLevel(value?: string): LogLevel | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized
  }
  return null
}

function debugEnabled(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

function resolveDefaultLevel(): LogLevel {
  if (debugEnabled(import.meta.env.VITE_DEBUG_LOGS)) {
    return 'debug'
  }

  const explicitLevel = normalizeLevel(import.meta.env.VITE_LOG_LEVEL)
  if (explicitLevel) {
    return explicitLevel
  }

  return import.meta.env.DEV ? 'debug' : 'info'
}

const globalLogLevel = resolveDefaultLevel()

function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[globalLogLevel]
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitize)
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const sensitiveFieldPattern = /(token|secret|key|session|authorization|refresh|access)/i
  const sanitized: Record<string, unknown> = {}

  for (const [entryKey, entryValue] of Object.entries(value)) {
    sanitized[entryKey] = sensitiveFieldPattern.test(entryKey) ? '[REDACTED]' : sanitize(entryValue)
  }

  return sanitized
}

export function createRendererLogger(scope: string) {
  const write = (level: LogLevel, ...args: unknown[]) => {
    if (!shouldLog(level)) {
      return
    }

    const payload = [`[${scope}]`, ...args.map(sanitize)]

    if (window.electron?.log) {
      if (level === 'debug') {
        window.electron.log.debug(...payload)
      } else if (level === 'info') {
        window.electron.log.info(...payload)
      } else if (level === 'warn') {
        window.electron.log.warn(...payload)
      } else {
        window.electron.log.error(...payload)
      }
      return
    }

    if (level === 'debug') {
      console.debug(...payload)
    } else if (level === 'info') {
      console.info(...payload)
    } else if (level === 'warn') {
      console.warn(...payload)
    } else {
      console.error(...payload)
    }
  }

  return {
    debug: (...args: unknown[]) => write('debug', ...args),
    info: (...args: unknown[]) => write('info', ...args),
    warn: (...args: unknown[]) => write('warn', ...args),
    error: (...args: unknown[]) => write('error', ...args),
  }
}
