import { describe, it, expect } from 'vitest'
import fs from 'fs'

// =============================================================================
// =============================================================================

describe('mcpServers on SavedConnection types', () => {
  it('app-store.ts has mcpServers on SavedConnection', () => {
    const source = fs.readFileSync('src/stores/app-store.ts', 'utf-8')
    expect(source).toContain('mcpServers?:')
  })

  it('electron store.ts has mcpServers on SavedConnection', () => {
    const source = fs.readFileSync('electron/store.ts', 'utf-8')
    expect(source).toContain('mcpServers?:')
  })

  it('preload.ts has mcpServers on SavedConnection', () => {
    const source = fs.readFileSync('electron/preload.ts', 'utf-8')
    expect(source).toContain('mcpServers?:')
  })

  it('electron.d.ts has mcpServers on connections.update', () => {
    const source = fs.readFileSync('src/types/electron.d.ts', 'utf-8')
    expect(source).toContain('mcpServers?: Array<{ name: string; url: string; apiKey?: string }>')
  })
})

// =============================================================================
// MCP config in AgentRequest
// =============================================================================

describe('mcpServers in AgentRequest', () => {
  it('agent-types.ts includes mcpServers', () => {
    const source = fs.readFileSync('electron/agent-types.ts', 'utf-8')
    expect(source).toContain('mcpServers')
  })

  it('electron.d.ts AgentRequest includes mcpServers', () => {
    const source = fs.readFileSync('src/types/electron.d.ts', 'utf-8')
    expect(source).toContain('interface AgentRequest')
    // mcpServers should appear after AgentRequest definition
    const agentReqIdx = source.indexOf('interface AgentRequest')
    const mcpIdx = source.indexOf('mcpServers', agentReqIdx)
    expect(mcpIdx).toBeGreaterThan(agentReqIdx)
  })

  it('preload.ts AgentRequest includes mcpServers', () => {
    const source = fs.readFileSync('electron/preload.ts', 'utf-8')
    expect(source).toContain('interface AgentRequest')
    const agentReqIdx = source.indexOf('interface AgentRequest')
    const mcpIdx = source.indexOf('mcpServers', agentReqIdx)
    // mcpServers should be within ~600 chars of the interface start
    expect(mcpIdx).toBeGreaterThan(agentReqIdx)
    expect(mcpIdx - agentReqIdx).toBeLessThan(600)
  })
})

// =============================================================================
// MCP UI in ConnectionModal
// =============================================================================

describe('MCP server config UI in ConnectionModal', () => {
  const source = fs.readFileSync('src/components/ConnectionModal.tsx', 'utf-8')

  it('has renderMcpSection helper', () => {
    expect(source).toContain('renderMcpSection')
  })

  it('has cleanMcpServers helper to sanitize MCP config', () => {
    expect(source).toContain('cleanMcpServers')
  })

  it('renders MCP section in connection forms', () => {
    const count = (source.match(/renderMcpSection\(/g) || []).length
    // At least one per form type (BigQuery, PostgreSQL, Snowflake, Redshift) + edit forms
    expect(count).toBeGreaterThanOrEqual(5)
  })

  it('saves MCP servers after connection creation', () => {
    expect(source).toContain("connections.update(result.connectionId, { mcpServers: mcpConfig })")
  })

  it('saves MCP servers during edit', () => {
    expect(source).toContain("connections.update(editingConnection.id,")
  })

  it('loads existing MCP servers when editing', () => {
    expect(source).toContain('setEditMcpServers')
  })
})

// =============================================================================
// Frontend passes MCP config to agent
// =============================================================================

describe('QueryPanel passes MCP config to agent', () => {
  const source = fs.readFileSync('src/hooks/useGeneration.ts', 'utf-8')

  it('reads savedConnections from store', () => {
    expect(source).toContain('savedConnections: state.savedConnections')
  })

  it('finds active connection for MCP servers', () => {
    expect(source).toContain('savedConnections.find(c => c.id === connection.connectionId)')
  })

  it('passes mcpServers to generateAgent call', () => {
    expect(source).toContain('mcpServers:')
  })
})
