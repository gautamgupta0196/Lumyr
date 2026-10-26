import { describe, expect, it } from 'vitest'
import { validateOpenExternalUrl } from '../../electron/open-external'

describe('validateOpenExternalUrl', () => {
  it('accepts https URLs', () => {
    const result = validateOpenExternalUrl('https://example.com/path?q=1')
    expect(result).toEqual({ success: true })
  })

  it('accepts mailto URLs', () => {
    const result = validateOpenExternalUrl('mailto:support@example.com')
    expect(result).toEqual({ success: true })
  })

  it('rejects malformed URLs', () => {
    const result = validateOpenExternalUrl('not a valid url')
    expect(result).toEqual({
      success: false,
      error: {
        code: 'INVALID_URL',
        message: 'Malformed URL',
      },
    })
  })

  it('rejects file URLs', () => {
    const result = validateOpenExternalUrl('file:///etc/passwd')
    expect(result).toEqual({
      success: false,
      error: {
        code: 'DISALLOWED_PROTOCOL',
        message: 'URL protocol is not allowed: file:',
      },
    })
  })

  it('rejects javascript URLs', () => {
    const result = validateOpenExternalUrl('javascript:alert(1)')
    expect(result).toEqual({
      success: false,
      error: {
        code: 'DISALLOWED_PROTOCOL',
        message: 'URL protocol is not allowed: javascript:',
      },
    })
  })

  it('rejects custom schemes', () => {
    const result = validateOpenExternalUrl('lumyr://open')
    expect(result).toEqual({
      success: false,
      error: {
        code: 'DISALLOWED_PROTOCOL',
        message: 'URL protocol is not allowed: lumyr:',
      },
    })
  })
})
