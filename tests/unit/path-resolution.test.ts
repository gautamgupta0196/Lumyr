import { describe, it, expect } from 'vitest'
import {
  computePythonPath,
  computeSchemaScriptPath,
  computeProjectRoot,
  computeRunnerScriptPath,
  type PathConfig
} from '../../electron/paths'

// Mock configurations for different environments
const mockPackagedMac: PathConfig = {
  isPackaged: true,
  resourcesPath: '/Applications/Lumyr.app/Contents/Resources',
  dirname: '/Applications/Lumyr.app/Contents/Resources/app.asar/dist-electron',
  platform: 'darwin',
  arch: 'arm64'
}

const mockPackagedMacX64: PathConfig = {
  ...mockPackagedMac,
  arch: 'x64'
}

const mockPackagedWin: PathConfig = {
  isPackaged: true,
  resourcesPath: 'C:\\Program Files\\Lumyr\\resources',
  dirname: 'C:\\Program Files\\Lumyr\\resources\\app.asar\\dist-electron',
  platform: 'win32',
  arch: 'x64'
}

const mockDevMac: PathConfig = {
  isPackaged: false,
  resourcesPath: '/Users/dev/Lumyr',
  dirname: '/Users/dev/Lumyr/dist-electron',
  platform: 'darwin',
  arch: 'arm64'
}

const mockDevWin: PathConfig = {
  isPackaged: false,
  resourcesPath: 'C:\\Users\\dev\\Lumyr',
  dirname: 'C:\\Users\\dev\\Lumyr\\dist-electron',
  platform: 'win32',
  arch: 'x64'
}

describe('Path Resolution - Packaged App (macOS)', () => {
  describe('computePythonPath', () => {
    it('finds bundled Python at correct path', () => {
      const mockExists = (p: string) => p.includes('python-mac/bin/python3')
      const result = computePythonPath(mockPackagedMac, mockExists)

      expect(result).toBe('/Applications/Lumyr.app/Contents/Resources/resources/python-mac/bin/python3')
    })

    it('should NOT have double /resources in path (regression test)', () => {
      const mockExists = (p: string) => p.includes('python-mac/bin/python3')
      const result = computePythonPath(mockPackagedMac, mockExists)

      // This was the bug: path ended up as .../Resources/resources/resources/...
      expect(result).not.toContain('/resources/resources/')
    })

    it('works for both arm64 and x64 architectures', () => {
      const mockExists = (p: string) => p.includes('python-mac/bin/python3')

      const arm64Result = computePythonPath(mockPackagedMac, mockExists)
      const x64Result = computePythonPath(mockPackagedMacX64, mockExists)

      // Both should use the unified python-mac directory in packaged app
      expect(arm64Result).toContain('python-mac/bin/python3')
      expect(x64Result).toContain('python-mac/bin/python3')
    })
  })

  describe('computeSchemaScriptPath', () => {
    it('uses app.asar.unpacked path for subprocess access', () => {
      const mockExists = () => true
      const result = computeSchemaScriptPath(mockPackagedMac, mockExists)

      expect(result).toContain('app.asar.unpacked')
    })

    it('should NOT be inside app.asar (subprocess cannot read it)', () => {
      const mockExists = () => true
      const result = computeSchemaScriptPath(mockPackagedMac, mockExists)

      // Path should have app.asar.unpacked, not just app.asar/
      expect(result).not.toMatch(/app\.asar\//)
    })
  })

  describe('computeProjectRoot', () => {
    it('uses resourcesPath (real directory, not asar)', () => {
      const result = computeProjectRoot(mockPackagedMac)

      expect(result).toBe('/Applications/Lumyr.app/Contents/Resources')
    })

    it('should NOT contain app.asar (would cause ENOTDIR)', () => {
      const result = computeProjectRoot(mockPackagedMac)

      // Using asar path as cwd causes ENOTDIR error
      expect(result).not.toContain('app.asar')
    })
  })

  describe('computeRunnerScriptPath', () => {
    it('uses app.asar.unpacked for runner script', () => {
      const mockExists = () => true
      const result = computeRunnerScriptPath(mockPackagedMac, mockExists)

      expect(result).toContain('app.asar.unpacked')
      expect(result).toContain('runner.py')
    })
  })
})

describe('Path Resolution - Packaged App (Windows)', () => {
  describe('computePythonPath', () => {
    it('finds bundled Python with .exe extension', () => {
      const mockExists = (p: string) => p.includes('python-win\\python.exe') || p.includes('python-win/python.exe')
      const result = computePythonPath(mockPackagedWin, mockExists)

      expect(result).toContain('python-win')
      expect(result).toContain('python.exe')
    })
  })
})

describe('Path Resolution - Development Mode', () => {
  describe('computePythonPath (macOS)', () => {
    it('finds architecture-specific bundled Python first', () => {
      const mockExists = (p: string) => p.includes('python-mac-arm64')
      const result = computePythonPath(mockDevMac, mockExists)

      expect(result).toContain('python-mac-arm64')
    })

    it('falls back to .venv if no bundled Python', () => {
      const mockExists = (p: string) => p.includes('.venv')
      const result = computePythonPath({ ...mockDevMac, allowVenvFallback: true }, mockExists)

      expect(result).toBe('/Users/dev/Lumyr/.venv/bin/python3')
    })

    it('returns null if no Python found', () => {
      const mockExists = () => false
      const result = computePythonPath(mockDevMac, mockExists)

      expect(result).toBeNull()
    })

    it('returns null when venv fallback is disabled', () => {
      const mockExists = (p: string) => p.includes('.venv')
      const result = computePythonPath(mockDevMac, mockExists)

      expect(result).toBeNull()
    })
  })

  describe('computePythonPath (Windows)', () => {
    it('falls back to .venv with Scripts path', () => {
      const mockExists = (p: string) => p.includes('.venv')
      const result = computePythonPath({ ...mockDevWin, allowVenvFallback: true }, mockExists)

      expect(result).toContain('.venv')
      expect(result).toContain('Scripts')
      expect(result).toContain('python.exe')
    })
  })

  describe('computeSchemaScriptPath', () => {
    it('uses direct path without asar manipulation in dev', () => {
      const mockExists = () => true
      const result = computeSchemaScriptPath(mockDevMac, mockExists)

      expect(result).not.toContain('asar')
      expect(result).toBe('/Users/dev/Lumyr/python/file_schema.py')
    })
  })

  describe('computeProjectRoot', () => {
    it('resolves to project root from dirname', () => {
      const result = computeProjectRoot(mockDevMac)

      expect(result).toBe('/Users/dev/Lumyr')
    })
  })
})
