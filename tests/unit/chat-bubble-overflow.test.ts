import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('ChatMessage bubble overflow prevention', () => {
  const source = fs.readFileSync('src/components/ChatMessage.tsx', 'utf-8')

  it('constrains bubble width with max-w-full', () => {
    expect(source).toContain('max-w-full')
  })

  it('prevents horizontal overflow with overflow-hidden', () => {
    expect(source).toContain('overflow-hidden')
  })

  it('breaks long words in user messages with break-words', () => {
    expect(source).toContain('break-words')
  })

  it('preserves whitespace with whitespace-pre-wrap', () => {
    expect(source).toContain('whitespace-pre-wrap')
  })

  it('parent container constrains width with max-w-[85%]', () => {
    expect(source).toContain("max-w-[85%]")
  })

  it('parent container uses min-w-0 to allow shrinking in flex', () => {
    expect(source).toContain('min-w-0')
  })
})
