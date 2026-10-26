/**
 * API key validation.
 *
 * Lumyr is standalone: the user's Anthropic key is the only credential the AI
 * path needs. This checks it with the cheapest possible real request rather
 * than trusting the string's shape.
 */
import Anthropic from '@anthropic-ai/sdk'

export async function validateApiKey(apiKey: string): Promise<boolean> {
  const key = apiKey?.trim()
  if (!key) return false

  try {
    const client = new Anthropic({ apiKey: key })
    await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4,
      messages: [{ role: 'user', content: 'Hi' }],
    })
    return true
  } catch {
    return false
  }
}
