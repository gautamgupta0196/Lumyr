import * as Sentry from '@sentry/electron/renderer'

export function initSentryRenderer() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    sampleRate: 1.0,
  })
}

export { Sentry }
