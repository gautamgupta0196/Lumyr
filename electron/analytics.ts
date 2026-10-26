/**
 * Analytics — local only.
 *
 * Lumyr is standalone and sends no usage data anywhere. Events are kept as
 * debug breadcrumbs in the local log and never leave the machine. The exported
 * surface is unchanged so existing call sites keep working; if you fork this
 * and want telemetry, implement a sink in flushAnalytics().
 */
import { createLogger } from './logger.js'

const analyticsLogger = createLogger('Analytics')

export function trackAnalytics(event: string, data?: Record<string, unknown>) {
  analyticsLogger.debug('event', { event, ...(data ?? {}) })
}

export async function flushAnalytics(): Promise<void> {
  // No remote sink — nothing to flush.
}

export function startAnalyticsFlush() {
  // No-op: nothing is queued for upload.
}

export function stopAnalyticsFlush() {
  // No-op.
}
