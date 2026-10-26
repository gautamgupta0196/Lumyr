import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Mock electron
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

// Mock child_process - we control spawnSync and spawn behavior
const mockSpawnSync = vi.fn()
const mockSpawnOn = vi.fn()
const mockSpawnStdout = { on: vi.fn() }
const mockSpawnStderr = { on: vi.fn() }
const mockSpawnProcess = {
  stdout: mockSpawnStdout,
  stderr: mockSpawnStderr,
  on: mockSpawnOn
}
const mockSpawn = vi.fn(() => mockSpawnProcess)

vi.mock('child_process', () => ({
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
  spawn: (...args: unknown[]) => mockSpawn(...args)
}))

describe('PackageManager', () => {
  let PackageManager: typeof import('../../electron/package-manager').PackageManager
  let tmpDir: string
  let userDataPath: string

  beforeEach(async () => {
    vi.clearAllMocks()

    // Create temp directory for test isolation
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumyr-test-'))
    userDataPath = path.join(tmpDir, 'userData')
    fs.mkdirSync(userDataPath, { recursive: true })

    // Reset module to get fresh import
    vi.resetModules()
    const mod = await import('../../electron/package-manager')
    PackageManager = mod.PackageManager
  })

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('extractImports', () => {
    it('extracts simple import statements', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `import networkx\nimport pandas`
      const imports = pm.extractImports(code)
      expect(imports).toContain('networkx')
      expect(imports).toContain('pandas')
    })

    it('extracts from-import statements', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `from networkx import Graph\nfrom sklearn.metrics import accuracy_score`
      const imports = pm.extractImports(code)
      expect(imports).toContain('networkx')
      expect(imports).toContain('sklearn')
    })

    it('extracts aliased imports', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `import networkx as nx\nimport pandas as pd`
      const imports = pm.extractImports(code)
      expect(imports).toContain('networkx')
      expect(imports).toContain('pandas')
    })

    it('extracts multi-module imports', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `import os, sys, json`
      const imports = pm.extractImports(code)
      expect(imports).toContain('os')
      expect(imports).toContain('sys')
      expect(imports).toContain('json')
    })

    it('extracts top-level package from dotted imports', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `from google.cloud import bigquery\nimport plotly.express`
      const imports = pm.extractImports(code)
      expect(imports).toContain('google')
      expect(imports).toContain('plotly')
    })

    it('deduplicates imports', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `import networkx\nfrom networkx import Graph\nimport networkx as nx`
      const imports = pm.extractImports(code)
      const nxCount = imports.filter(i => i === 'networkx').length
      expect(nxCount).toBe(1)
    })

    it('ignores comments containing import', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `# import fakepkg\nimport networkx`
      const imports = pm.extractImports(code)
      expect(imports).not.toContain('fakepkg')
      expect(imports).toContain('networkx')
    })

    it('handles indented imports', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `try:\n    import networkx\nexcept ImportError:\n    pass`
      const imports = pm.extractImports(code)
      expect(imports).toContain('networkx')
    })

    it('returns empty array for code with no imports', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `x = 1\nprint(x)`
      const imports = pm.extractImports(code)
      expect(imports).toEqual([])
    })

    it('handles a realistic Streamlit dashboard code snippet', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `
import streamlit as st
import pandas as pd
import numpy as np
from google.cloud import bigquery
import plotly.express as px
import networkx as nx
from statsmodels.tsa.seasonal import seasonal_decompose

st.set_page_config(page_title="Dashboard", layout="wide")
client = bigquery.Client()
`
      const imports = pm.extractImports(code)
      expect(imports).toContain('streamlit')
      expect(imports).toContain('pandas')
      expect(imports).toContain('numpy')
      expect(imports).toContain('google')
      expect(imports).toContain('plotly')
      expect(imports).toContain('networkx')
      expect(imports).toContain('statsmodels')
    })
  })

  describe('checkAllowlist', () => {
    it('identifies allowed packages for installation', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = pm.checkAllowlist(['networkx', 'statsmodels'])
      expect(result.toInstall).toHaveLength(2)
      expect(result.toInstall.map(p => p.pip_name)).toContain('networkx')
      expect(result.toInstall.map(p => p.pip_name)).toContain('statsmodels')
      expect(result.blocked).toHaveLength(0)
    })

    it('blocks packages not in allowlist', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = pm.checkAllowlist(['networkx', 'some_unknown_package'])
      expect(result.toInstall).toHaveLength(1)
      expect(result.toInstall[0].pip_name).toBe('networkx')
      expect(result.blocked).toEqual(['some_unknown_package'])
    })

    it('returns all blocked when none are allowed', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = pm.checkAllowlist(['hack_tool', 'malware_lib'])
      expect(result.toInstall).toHaveLength(0)
      expect(result.blocked).toEqual(['hack_tool', 'malware_lib'])
    })

    it('skips packages already in the installed manifest', () => {
      // Pre-populate installed manifest
      const pkgDir = path.join(userDataPath, 'python-packages')
      fs.mkdirSync(pkgDir, { recursive: true })
      fs.writeFileSync(path.join(pkgDir, 'installed.json'), JSON.stringify({
        packages: {
          networkx: { pip_name: 'networkx', installed_at: '2024-01-01T00:00:00Z' }
        }
      }))

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = pm.checkAllowlist(['networkx', 'statsmodels'])
      // networkx already installed, only statsmodels should be in toInstall
      expect(result.toInstall).toHaveLength(1)
      expect(result.toInstall[0].pip_name).toBe('statsmodels')
      expect(result.blocked).toHaveLength(0)
    })

    it('maps bs4 import to beautifulsoup4 pip name', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = pm.checkAllowlist(['bs4'])
      expect(result.toInstall).toHaveLength(1)
      expect(result.toInstall[0].import_name).toBe('bs4')
      expect(result.toInstall[0].pip_name).toBe('beautifulsoup4')
    })
  })

  describe('findMissingImports', () => {
    it('skips stdlib modules', async () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      mockSpawnSync.mockClear() // clear constructor's version-check call
      const missing = await pm.findMissingImports(['os', 'sys', 'json', 'math', 'datetime'])
      expect(missing).toHaveLength(0)
      // spawnSync should not have been called for any stdlib module
      expect(mockSpawnSync).not.toHaveBeenCalled()
    })

    it('skips pre-installed packages', async () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      mockSpawnSync.mockClear() // clear constructor's version-check call
      const missing = await pm.findMissingImports(['streamlit', 'pandas', 'numpy', 'plotly', 'scipy'])
      expect(missing).toHaveLength(0)
      expect(mockSpawnSync).not.toHaveBeenCalled()
    })

    it('detects truly missing packages via spawnSync', async () => {
      mockSpawnSync.mockReturnValue({ status: 1 })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const missing = await pm.findMissingImports(['networkx'])
      expect(missing).toEqual(['networkx'])
      expect(mockSpawnSync).toHaveBeenCalledWith(
        '/usr/bin/python3',
        ['-c', 'import networkx'],
        expect.objectContaining({ timeout: 10000 })
      )
    })

    it('does not mark importable packages as missing', async () => {
      mockSpawnSync.mockReturnValue({ status: 0 })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const missing = await pm.findMissingImports(['networkx'])
      expect(missing).toHaveLength(0)
    })

    it('sets PYTHONPATH to user packages dir when checking imports', async () => {
      mockSpawnSync.mockReturnValue({ status: 0 })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      await pm.findMissingImports(['networkx'])
      expect(mockSpawnSync).toHaveBeenCalledWith(
        '/usr/bin/python3',
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            PYTHONPATH: path.join(userDataPath, 'python-packages')
          })
        })
      )
    })
  })

  describe('getUserPackagesPath', () => {
    it('returns the correct user packages directory', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      expect(pm.getUserPackagesPath()).toBe(path.join(userDataPath, 'python-packages'))
    })

    it('creates the user packages directory if it does not exist', () => {
      const freshUserData = path.join(tmpDir, 'fresh-userData')
      // Don't create it - let PackageManager do it
      const pm = new PackageManager('/usr/bin/python3', freshUserData, null)
      expect(fs.existsSync(pm.getUserPackagesPath())).toBe(true)
    })
  })

  describe('getAllowlistForPrompt', () => {
    it('includes pre-installed packages', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const { preInstalled } = pm.getAllowlistForPrompt()
      expect(preInstalled).toContain('streamlit')
      expect(preInstalled).toContain('pandas')
      expect(preInstalled).toContain('numpy')
      expect(preInstalled).toContain('plotly')
      expect(preInstalled).toContain('scipy')
      expect(preInstalled).toContain('scikit-learn')
    })

    it('includes installable packages from allowlist', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const { installable } = pm.getAllowlistForPrompt()
      const names = installable.map(p => p.name)
      expect(names).toContain('networkx')
      expect(names).toContain('statsmodels')
      expect(names).toContain('beautifulsoup4')
      expect(names).toContain('xgboost')
    })

    it('includes category information for installable packages', () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const { installable } = pm.getAllowlistForPrompt()
      const networkx = installable.find(p => p.name === 'networkx')
      expect(networkx?.category).toBe('graph')
    })
  })

  describe('installPackages', () => {
    it('calls pip install with correct arguments', async () => {
      // Make spawn simulate a successful install
      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = await pm.installPackages([
        { import_name: 'networkx', pip_name: 'networkx', category: 'graph' }
      ])

      expect(result.installed).toEqual(['networkx'])
      expect(result.failed).toHaveLength(0)

      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/bin/python3',
        ['-m', 'pip', 'install', '--target', path.join(userDataPath, 'python-packages'), '--no-input', '--disable-pip-version-check', 'networkx'],
        expect.objectContaining({ timeout: 120000 })
      )
    })

    it('records installed packages in manifest', async () => {
      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      await pm.installPackages([
        { import_name: 'networkx', pip_name: 'networkx', category: 'graph' }
      ])

      const manifestPath = path.join(userDataPath, 'python-packages', 'installed.json')
      expect(fs.existsSync(manifestPath)).toBe(true)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
      expect(manifest.packages.networkx).toBeDefined()
      expect(manifest.packages.networkx.pip_name).toBe('networkx')
    })

    it('handles pip install failures gracefully', async () => {
      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(1), 0)
        }
      })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const result = await pm.installPackages([
        { import_name: 'networkx', pip_name: 'networkx', category: 'graph' }
      ])

      expect(result.installed).toHaveLength(0)
      expect(result.failed).toEqual(['networkx'])
    })

    it('sends IPC status events during installation', async () => {
      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      })

      const mockSend = vi.fn()
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send: mockSend }
      } as unknown as import('electron').BrowserWindow

      const pm = new PackageManager('/usr/bin/python3', userDataPath, mockWindow)
      await pm.installPackages([
        { import_name: 'networkx', pip_name: 'networkx', category: 'graph' }
      ])

      expect(mockSend).toHaveBeenCalledWith('packages:status', {
        phase: 'installing',
        package: 'networkx',
        total: 1,
        current: 1
      })
    })
  })

  describe('duplicate cleanup after install', () => {
    it('removes packages from userPackagesDir that exist in bundled site-packages', async () => {
      // Create a fake bundled Python directory structure
      const fakePythonRoot = path.join(tmpDir, 'python-root')
      const fakeBin = path.join(fakePythonRoot, 'bin')
      const fakeSitePackages = path.join(fakePythonRoot, 'lib', 'python3.11', 'site-packages')
      fs.mkdirSync(fakeBin, { recursive: true })
      fs.mkdirSync(fakeSitePackages, { recursive: true })

      // Create a fake python3 executable
      const fakePython = path.join(fakeBin, 'python3')
      fs.writeFileSync(fakePython, '#!/bin/sh\n')

      // Create a "bundled" numpy in site-packages
      fs.mkdirSync(path.join(fakeSitePackages, 'numpy'))
      fs.writeFileSync(path.join(fakeSitePackages, 'numpy', '__init__.py'), '')
      // Create a "bundled" pandas in site-packages
      fs.mkdirSync(path.join(fakeSitePackages, 'pandas'))
      fs.writeFileSync(path.join(fakeSitePackages, 'pandas', '__init__.py'), '')

      // Create PackageManager with the fake Python path
      const pm = new PackageManager(fakePython, userDataPath, null)
      const pkgDir = pm.getUserPackagesPath()

      // Simulate pip having installed duplicates of numpy and pandas into user packages dir
      fs.mkdirSync(path.join(pkgDir, 'numpy'), { recursive: true })
      fs.writeFileSync(path.join(pkgDir, 'numpy', '__init__.py'), 'duplicate')
      fs.mkdirSync(path.join(pkgDir, 'pandas'), { recursive: true })
      fs.writeFileSync(path.join(pkgDir, 'pandas', '__init__.py'), 'duplicate')
      // Also create a package that is NOT in bundled (should be kept)
      fs.mkdirSync(path.join(pkgDir, 'geopandas'), { recursive: true })
      fs.writeFileSync(path.join(pkgDir, 'geopandas', '__init__.py'), 'new package')

      // Simulate a successful pip install (which triggers cleanup)
      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      })

      await pm.installPackages([
        { import_name: 'geopandas', pip_name: 'geopandas', category: 'geospatial' }
      ])

      // numpy and pandas duplicates should be removed
      expect(fs.existsSync(path.join(pkgDir, 'numpy'))).toBe(false)
      expect(fs.existsSync(path.join(pkgDir, 'pandas'))).toBe(false)
      // geopandas should still be there (not in bundled)
      expect(fs.existsSync(path.join(pkgDir, 'geopandas'))).toBe(true)
    })

    it('removes bin and __pycache__ artifacts', async () => {
      // Need a fake Python dir so bundledSitePackages is found (cleanup only runs when it exists)
      const fakePythonRoot = path.join(tmpDir, 'python-root2')
      const fakeBin = path.join(fakePythonRoot, 'bin')
      const fakeSitePackages = path.join(fakePythonRoot, 'lib', 'python3.11', 'site-packages')
      fs.mkdirSync(fakeBin, { recursive: true })
      fs.mkdirSync(fakeSitePackages, { recursive: true })
      const fakePython = path.join(fakeBin, 'python3')
      fs.writeFileSync(fakePython, '#!/bin/sh\n')

      const pm = new PackageManager(fakePython, userDataPath, null)
      const pkgDir = pm.getUserPackagesPath()

      // Create artifacts pip leaves behind
      fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true })
      fs.mkdirSync(path.join(pkgDir, '__pycache__'), { recursive: true })

      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      })

      await pm.installPackages([
        { import_name: 'networkx', pip_name: 'networkx', category: 'graph' }
      ])

      expect(fs.existsSync(path.join(pkgDir, 'bin'))).toBe(false)
      expect(fs.existsSync(path.join(pkgDir, '__pycache__'))).toBe(false)
    })

    it('preserves installed.json during cleanup', async () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const pkgDir = pm.getUserPackagesPath()

      mockSpawnOn.mockImplementation((event: string, cb: (code: number) => void) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      })

      await pm.installPackages([
        { import_name: 'networkx', pip_name: 'networkx', category: 'graph' }
      ])

      // installed.json should survive cleanup
      expect(fs.existsSync(path.join(pkgDir, 'installed.json'))).toBe(true)
    })
  })

  describe('ensurePackages', () => {
    it('returns empty results when all imports are pre-installed or stdlib', async () => {
      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `import os\nimport sys\nimport streamlit as st\nimport pandas as pd`
      const result = await pm.ensurePackages(code)
      expect(result.installed).toHaveLength(0)
      expect(result.failed).toHaveLength(0)
      expect(result.blocked).toHaveLength(0)
    })

    it('reports blocked packages not in allowlist', async () => {
      // Make spawnSync indicate the package is missing
      mockSpawnSync.mockReturnValue({ status: 1 })

      const pm = new PackageManager('/usr/bin/python3', userDataPath, null)
      const code = `import unknown_dangerous_pkg`
      const result = await pm.ensurePackages(code)
      expect(result.blocked).toContain('unknown_dangerous_pkg')
      expect(result.installed).toHaveLength(0)
    })
  })
})

describe('PackageManager - Allowlist File', () => {
  it('allowed-packages.json is valid JSON with correct structure', () => {
    const content = fs.readFileSync('python/allowed-packages.json', 'utf-8')
    const data = JSON.parse(content)
    expect(data.packages).toBeDefined()
    expect(typeof data.packages).toBe('object')

    for (const [importName, info] of Object.entries(data.packages)) {
      expect(typeof importName).toBe('string')
      const pkg = info as { pip_name: string; category: string }
      expect(typeof pkg.pip_name).toBe('string')
      expect(typeof pkg.category).toBe('string')
    }
  })

  it('has at least 10 packages in the allowlist', () => {
    const data = JSON.parse(fs.readFileSync('python/allowed-packages.json', 'utf-8'))
    expect(Object.keys(data.packages).length).toBeGreaterThanOrEqual(10)
  })

  it('maps bs4 to beautifulsoup4', () => {
    const data = JSON.parse(fs.readFileSync('python/allowed-packages.json', 'utf-8'))
    expect(data.packages.bs4).toBeDefined()
    expect(data.packages.bs4.pip_name).toBe('beautifulsoup4')
  })

  it('does not include any pre-installed packages', () => {
    const data = JSON.parse(fs.readFileSync('python/allowed-packages.json', 'utf-8'))
    const preInstalled = ['streamlit', 'pandas', 'numpy', 'plotly', 'matplotlib', 'seaborn', 'scipy', 'sklearn']
    for (const pkg of preInstalled) {
      expect(data.packages[pkg]).toBeUndefined()
    }
  })
})
