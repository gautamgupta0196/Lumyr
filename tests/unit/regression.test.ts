import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('Regression Tests - Packaging Configuration', () => {
  describe('Python Dependencies', () => {
    it('requirements.txt includes openpyxl for Excel support', () => {
      const requirements = fs.readFileSync('python/requirements.txt', 'utf-8')
      expect(requirements).toContain('openpyxl')
    })

    it('requirements.txt includes pdfplumber for PDF support', () => {
      const requirements = fs.readFileSync('python/requirements.txt', 'utf-8')
      expect(requirements).toContain('pdfplumber')
    })

    it('requirements.txt includes streamlit', () => {
      const requirements = fs.readFileSync('python/requirements.txt', 'utf-8')
      expect(requirements).toContain('streamlit')
    })

    it('requirements.txt includes pandas', () => {
      const requirements = fs.readFileSync('python/requirements.txt', 'utf-8')
      expect(requirements).toContain('pandas')
    })
  })

  describe('Electron Builder Configuration', () => {
    it('has asarUnpack for python scripts', () => {
      const config = fs.readFileSync('electron-builder.yml', 'utf-8')
      expect(config).toContain('asarUnpack')
      expect(config).toContain('python/**/*')
    })

    it('has extraResources for bundled Python', () => {
      const config = fs.readFileSync('electron-builder.yml', 'utf-8')
      expect(config).toContain('extraResources')
      expect(config).toContain('python-mac')
    })
  })

  describe('Python Preparation Script', () => {
    it('prepare-python.sh verifies openpyxl', () => {
      const script = fs.readFileSync('scripts/prepare-python.sh', 'utf-8')
      expect(script).toContain('openpyxl')
    })

    it('prepare-python.sh verifies pdfplumber', () => {
      const script = fs.readFileSync('scripts/prepare-python.sh', 'utf-8')
      expect(script).toContain('pdfplumber')
    })

    it('prepare-python.sh verifies streamlit', () => {
      const script = fs.readFileSync('scripts/prepare-python.sh', 'utf-8')
      expect(script).toContain('streamlit')
    })
  })

  describe('Main Process Path Configuration', () => {
    it('main.ts should not have double /resources in resourcesPath', () => {
      const mainTs = fs.readFileSync('electron/main.ts', 'utf-8')

      // The bug was: path.join(process.resourcesPath, 'resources')
      // which produced .../Resources/resources when it should just be process.resourcesPath
      // Then python-manager adds 'resources' again, causing double resources
      const hasDoubleResourcesBug = mainTs.includes("path.join(process.resourcesPath, 'resources')")

      expect(hasDoubleResourcesBug).toBe(false)
    })

    it('main.ts uses process.resourcesPath directly for packaged app', () => {
      const mainTs = fs.readFileSync('electron/main.ts', 'utf-8')

      // Should have: resourcesPath = app.isPackaged ? process.resourcesPath : ...
      expect(mainTs).toMatch(/app\.isPackaged\s*\?\s*process\.resourcesPath/)
    })
  })

  describe('File Manager Configuration', () => {
    it('file-manager.ts uses app.isPackaged for path detection', () => {
      const fileManager = fs.readFileSync('electron/file-manager.ts', 'utf-8')
      expect(fileManager).toContain('app.isPackaged')
    })

    it('file-manager.ts uses app.asar.unpacked for script path', () => {
      const fileManager = fs.readFileSync('electron/file-manager.ts', 'utf-8')
      expect(fileManager).toContain('app.asar.unpacked')
    })
  })
})
