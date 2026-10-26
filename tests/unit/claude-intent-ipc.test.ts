import fs from 'fs'
import { describe, it, expect } from 'vitest'

describe('claude intent IPC handlers', () => {
  const source = fs.readFileSync('electron/main.ts', 'utf-8')

  it('registers agent generation IPC handler', () => {
    expect(source).toContain("ipcMain.handle('claude:generate-agent'")
  })

  it('registers agent cancellation IPC handler', () => {
    expect(source).toContain("ipcMain.handle('claude:cancel-agent'")
  })
})
