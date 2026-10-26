import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('Dashboard edit UX cues', () => {
  it('shows contextual editing banner and helper in QueryPanel when dashboard is active', () => {
    const source = fs.readFileSync('src/components/EditPanel.tsx', 'utf-8')
    expect(source).toContain('{activeDashboardName}')
    expect(source).toContain('Describe updates to iterate on this dashboard.')
    expect(source).toContain('activeDashboardId')
  })

  it('uses editable code wording in ChatMessage', () => {
    const source = fs.readFileSync('src/components/ChatMessage.tsx', 'utf-8')
    expect(source).toContain("View editable Python code")
    expect(source).toContain("Hide editable Python code")
  })

  it('shows chat-edit hint in QueryPanel empty state when editing a saved dashboard', () => {
    const source = fs.readFileSync('src/components/EditPanel.tsx', 'utf-8')
    expect(source).toContain('Describe updates to iterate on this dashboard.')
    expect(source).toContain('emptyConversationPrompt')
    expect(source).toContain('activeDashboardId')
  })
})
