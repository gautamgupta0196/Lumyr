import log from 'electron-log/main.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function normalizeLevel(value?: string | null): LogLevel | null {
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
  if (debugEnabled(process.env.DEBUG_LOGS)) {
    return 'debug'
  }

  const explicitLevel = normalizeLevel(process.env.LOG_LEVEL)
  if (explicitLevel) {
    return explicitLevel
  }

  return process.env.NODE_ENV === 'development' ? 'debug' : 'info'
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
    if (sensitiveFieldPattern.test(entryKey)) {
      sanitized[entryKey] = '[REDACTED]'
      continue
    }
    sanitized[entryKey] = sanitize(entryValue)
  }

  return sanitized
}

// Initialize electron-log: overrides console.log/warn/error globally
log.initialize()

// Set log file name
log.transports.file.fileName = 'main.log'
log.transports.file.maxSize = 5 * 1024 * 1024 // 5 MB

function write(scope: ElectronLog.ElectronLog, level: LogLevel, args: unknown[]) {
  if (!shouldLog(level)) {
    return
  }

  const sanitizedArgs = args.map(sanitize)
  scope[level](...sanitizedArgs)
}

// Create a tagged logger for structured logging
export function createLogger(tag: string) {
  const scope = log.scope(tag)
  return {
    debug: (...args: unknown[]) => write(scope, 'debug', args),
    info: (...args: unknown[]) => write(scope, 'info', args),
    warn: (...args: unknown[]) => write(scope, 'warn', args),
    error: (...args: unknown[]) => write(scope, 'error', args),
  }
}

export const appLogger = createLogger('App')

appLogger.info('Logger initialized', { level: globalLogLevel })

export default log
