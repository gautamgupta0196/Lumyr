import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || ''

// Patterns for sensitive data that must never reach Sentry
const SENSITIVE_PATTERNS = [
  /sk-ant-[A-Za-z0-9_-]+/g,           // Anthropic API keys
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g, // JWTs
  /GOCSPX-[A-Za-z0-9_-]+/g,           // Google OAuth client secrets
  /ya29\.[A-Za-z0-9_-]+/g,            // Google access tokens
  /1\/\/[A-Za-z0-9_-]+/g,             // Google refresh tokens
  /github_pat_[A-Za-z0-9_]+/g,        // GitHub PATs
  /Bearer\s+[A-Za-z0-9._-]+/gi,       // Bearer authorization headers
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE\s+KEY-----/g, // Private keys
]

export function redactString(str: string): string {
  let redacted = str
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }
  return redacted
}

export function redactObject(obj: unknown): unknown {
  if (typeof obj === 'string') return redactString(obj)
  if (Array.isArray(obj)) return obj.map(redactObject)
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value)
    }
    return result
  }
  return obj
}

// Pattern to detect console breadcrumbs containing sensitive auth data
const SENSITIVE_BREADCRUMB_PATTERNS = [
  /access_token/i,
  /refresh_token/i,
  /Bearer /i,
  /sk-ant-/,
  /GOCSPX-/,
  /ya29\./,
  /-----BEGIN/,
]

function breadcrumbContainsSensitiveData(message: string): boolean {
  return SENSITIVE_BREADCRUMB_PATTERNS.some(p => p.test(message))
}

// Build a redacted error context object for analytics events
export function buildErrorContext(
  error: unknown,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {}

  if (error instanceof Error) {
    ctx.errorType = error.constructor.name
    ctx.message = redactString(error.message)

    if (error.stack) {
      const frames = error.stack.split('\n').slice(0, 6) // 1 message line + 5 frames
      ctx.stack = redactString(frames.join('\n'))
    }

    // Extract statusCode from API errors (Anthropic SDK pattern)
    if ('status' in error && typeof (error as { status: unknown }).status === 'number') {
      ctx.statusCode = (error as { status: number }).status
    }
  } else if (typeof error === 'string') {
    ctx.errorType = 'string'
    ctx.message = redactString(error)
  } else {
    ctx.errorType = 'unknown'
  }

  if (extra) {
    const redacted = redactObject(extra) as Record<string, unknown>
    Object.assign(ctx, redacted)
  }

  return ctx
}

export function initSentryMain() {
  if (!SENTRY_DSN) return

  Sentry.init({
    dsn: SENTRY_DSN,
    release: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development',
    sampleRate: 1.0,
    beforeSend(event) {
      // Scrub sensitive data from all event fields
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.value) {
            exception.value = redactString(exception.value)
          }
          if (exception.stacktrace?.frames) {
            for (const frame of exception.stacktrace.frames) {
              if (frame.vars) {
                frame.vars = redactObject(frame.vars) as Record<string, string>
              }
            }
          }
        }
      }

      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.filter(bc => {
          if (bc.category === 'console' && bc.message) {
            return !breadcrumbContainsSensitiveData(bc.message)
          }
          return true
        }).map(bc => {
          if (bc.message) bc.message = redactString(bc.message)
          if (bc.data) bc.data = redactObject(bc.data) as Record<string, unknown>
          return bc
        })
      }

      if (event.extra) {
        event.extra = redactObject(event.extra) as Record<string, unknown>
      }

      return event
    },
    beforeBreadcrumb(breadcrumb) {
      // Drop entire console breadcrumbs that match sensitive patterns
      if (breadcrumb.category === 'console' && breadcrumb.message) {
        if (breadcrumbContainsSensitiveData(breadcrumb.message)) {
          return null
        }
      }
      return breadcrumb
    },
  })
}

// Track usage events as Sentry breadcrumbs + the local analytics log
export function trackEvent(name: string, data?: Record<string, unknown>) {
  if (SENTRY_DSN) {
    Sentry.addBreadcrumb({
      category: 'analytics',
      message: name,
      data,
      level: 'info',
    })
  }

  // Also record locally (lazy import to avoid circular deps)
  import('./analytics.js').then(m => m.trackAnalytics(name, data)).catch(() => {})
}

// Track an error event AND capture the exception as a first-class Sentry issue.
// `trackEvent` only adds a breadcrumb, so caught errors never surface in the
// Sentry Issues view on their own. Use this for errors we want to triage.
export function captureError(name: string, error: unknown, extra?: Record<string, unknown>) {
  const ctx = buildErrorContext(error, extra)
  trackEvent(name, ctx)

  if (SENTRY_DSN) {
    const err = error instanceof Error ? error : new Error(String(error))
    Sentry.captureException(err, {
      tags: { event: name },
      extra: redactObject(extra || {}) as Record<string, unknown>,
    })
  }
}
