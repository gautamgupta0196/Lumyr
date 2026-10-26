const DEFAULT_ALLOWED_PROTOCOLS = ['https:', 'mailto:'] as const

export type OpenExternalErrorCode =
  | 'INVALID_URL'
  | 'DISALLOWED_PROTOCOL'

export interface OpenExternalResult {
  success: boolean
  error?: {
    code: OpenExternalErrorCode
    message: string
  }
}

export function validateOpenExternalUrl(
  rawUrl: string,
  allowedProtocols: readonly string[] = DEFAULT_ALLOWED_PROTOCOLS
): OpenExternalResult {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    return {
      success: false,
      error: {
        code: 'INVALID_URL',
        message: 'Malformed URL',
      },
    }
  }

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      success: false,
      error: {
        code: 'DISALLOWED_PROTOCOL',
        message: `URL protocol is not allowed: ${parsedUrl.protocol}`,
      },
    }
  }

  return { success: true }
}

