import { spawnSync, spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Python 3.11 stdlib modules (subset covering common imports)
const PYTHON_STDLIB = new Set([
  'abc', 'aifc', 'argparse', 'array', 'ast', 'asynchat', 'asyncio', 'asyncore',
  'atexit', 'base64', 'bdb', 'binascii', 'binhex', 'bisect', 'builtins',
  'bz2', 'calendar', 'cgi', 'cgitb', 'chunk', 'cmath', 'cmd', 'code',
  'codecs', 'codeop', 'collections', 'colorsys', 'compileall', 'concurrent',
  'configparser', 'contextlib', 'contextvars', 'copy', 'copyreg', 'cProfile',
  'crypt', 'csv', 'ctypes', 'curses', 'dataclasses', 'datetime', 'dbm',
  'decimal', 'difflib', 'dis', 'distutils', 'doctest', 'email', 'encodings',
  'enum', 'errno', 'faulthandler', 'fcntl', 'filecmp', 'fileinput', 'fnmatch',
  'fractions', 'ftplib', 'functools', 'gc', 'getopt', 'getpass', 'gettext',
  'glob', 'gzip', 'hashlib', 'heapq', 'hmac', 'html', 'http', 'idlelib',
  'imaplib', 'imghdr', 'imp', 'importlib', 'inspect', 'io', 'ipaddress',
  'itertools', 'json', 'keyword', 'lib2to3', 'linecache', 'locale', 'logging',
  'lzma', 'mailbox', 'mailcap', 'marshal', 'math', 'mimetypes', 'mmap',
  'modulefinder', 'multiprocessing', 'netrc', 'nis', 'nntplib', 'numbers',
  'operator', 'optparse', 'os', 'ossaudiodev', 'pathlib', 'pdb', 'pickle',
  'pickletools', 'pipes', 'pkgutil', 'platform', 'plistlib', 'poplib',
  'posix', 'posixpath', 'pprint', 'profile', 'pstats', 'pty', 'pwd',
  'py_compile', 'pyclbr', 'pydoc', 'queue', 'quopri', 'random', 're',
  'readline', 'reprlib', 'resource', 'rlcompleter', 'runpy', 'sched',
  'secrets', 'select', 'selectors', 'shelve', 'shlex', 'shutil', 'signal',
  'site', 'smtpd', 'smtplib', 'sndhdr', 'socket', 'socketserver', 'sqlite3',
  'ssl', 'stat', 'statistics', 'string', 'stringprep', 'struct', 'subprocess',
  'sunau', 'symtable', 'sys', 'sysconfig', 'syslog', 'tabnanny', 'tarfile',
  'telnetlib', 'tempfile', 'termios', 'test', 'textwrap', 'threading', 'time',
  'timeit', 'tkinter', 'token', 'tokenize', 'tomllib', 'trace', 'traceback',
  'tracemalloc', 'tty', 'turtle', 'turtledemo', 'types', 'typing',
  'unicodedata', 'unittest', 'urllib', 'uu', 'uuid', 'venv', 'warnings',
  'wave', 'weakref', 'webbrowser', 'winreg', 'winsound', 'wsgiref',
  'xdrlib', 'xml', 'xmlrpc', 'zipapp', 'zipfile', 'zipimport', 'zlib',
  '_thread', '__future__'
])

// Import names for packages in requirements.txt (already pre-installed)
const PRE_INSTALLED_IMPORTS = new Set([
  'streamlit', 'st',
  'pandas', 'pd',
  'numpy', 'np',
  'plotly', 'altair', 'matplotlib', 'mpl', 'seaborn', 'sns',
  'google', 'google.cloud', 'google.cloud.bigquery', 'google.oauth2',
  'pandas_gbq', 'pyarrow', 'db_dtypes',
  'psycopg2',
  'snowflake', 'snowflake.connector',
  'redshift_connector',
  'openpyxl', 'xlrd', 'pdfplumber',
  'scipy', 'sklearn', 'scikit_learn', 'statsmodels',
  'xgboost', 'lightgbm', 'shapely',
  'dateutil', 'python_dateutil'
])

export interface AllowedPackage {
  import_name: string
  pip_name: string
  category: string
}

export interface PackageInstallResult {
  installed: string[]
  failed: string[]
  blocked: string[]
  alreadyInstalled: string[]
}

export interface PackageStatusEvent {
  phase: 'detecting' | 'installing' | 'complete' | 'error'
  package?: string
  total?: number
  current?: number
  error?: string
}

interface InstalledManifest {
  pythonVersion?: string
  packages: Record<string, { pip_name: string; installed_at: string }>
}

interface AllowlistFile {
  packages: Record<string, { pip_name: string; category: string }>
}

export class PackageManager {
  private pythonPath: string
  private userPackagesDir: string
  private bundledSitePackages: string | null
  private mainWindow: BrowserWindow | null
  private allowlist: Map<string, AllowedPackage> = new Map()
  private manifestPath: string
  private manifest: InstalledManifest = { packages: {} }

  constructor(pythonPath: string, userDataPath: string, mainWindow: BrowserWindow | null) {
    this.pythonPath = pythonPath
    this.mainWindow = mainWindow
    this.userPackagesDir = path.join(userDataPath, 'python-packages')
    this.manifestPath = path.join(this.userPackagesDir, 'installed.json')

    // Derive bundled site-packages path from the Python executable
    // e.g. .../python-mac-arm64/bin/python3 → .../python-mac-arm64/lib/python3.11/site-packages
    this.bundledSitePackages = this.findBundledSitePackages()

    // Ensure user packages directory exists
    if (!fs.existsSync(this.userPackagesDir)) {
      fs.mkdirSync(this.userPackagesDir, { recursive: true })
    }

    // Load allowlist
    this.loadAllowlist()

    // Load installed manifest
    this.loadManifest()

    // Invalidate cached packages if Python version changed
    // (e.g. app upgrade, or switching between dev .venv and bundled Python).
    // Compiled .so files are tied to the CPython ABI tag and won't load
    // under a different Python version.
    this.invalidateOnVersionChange()
  }

  /**
   * Detect the current Python version and wipe user packages if it differs
   * from the version that installed them.
   */
  private invalidateOnVersionChange(): void {
    try {
      const result = spawnSync(this.pythonPath, ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'], {
        timeout: 5000
      })
      if (result.status !== 0) return
      const currentVersion = result.stdout.toString().trim()
      if (!currentVersion) return

      if (this.manifest.pythonVersion && this.manifest.pythonVersion !== currentVersion) {
        console.log(`[PackageManager] Python version changed (${this.manifest.pythonVersion} → ${currentVersion}), clearing cached packages`)
        // Remove all installed package files
        const entries = fs.readdirSync(this.userPackagesDir)
        for (const entry of entries) {
          const fullPath = path.join(this.userPackagesDir, entry)
          fs.rmSync(fullPath, { recursive: true, force: true })
        }
        // Reset manifest with new version
        this.manifest = { pythonVersion: currentVersion, packages: {} }
        this.saveManifest()
      } else if (!this.manifest.pythonVersion) {
        // First run or legacy manifest — stamp the version
        this.manifest.pythonVersion = currentVersion
        this.saveManifest()
      }
    } catch (err) {
      console.error('[PackageManager] Version check failed:', err)
    }
  }

  /**
   * Find the bundled site-packages directory from the Python executable path
   */
  private findBundledSitePackages(): string | null {
    try {
      // pythonPath is like .../python-mac-arm64/bin/python3
      // site-packages is at .../python-mac-arm64/lib/python3.XX/site-packages
      const binDir = path.dirname(this.pythonPath)
      const pythonRoot = path.dirname(binDir)
      const libDir = path.join(pythonRoot, 'lib')
      if (!fs.existsSync(libDir)) return null

      // Find the python3.XX directory
      const entries = fs.readdirSync(libDir)
      const pyDir = entries.find(e => e.startsWith('python3.'))
      if (!pyDir) return null

      const sitePackages = path.join(libDir, pyDir, 'site-packages')
      if (fs.existsSync(sitePackages)) {
        console.log('[PackageManager] Bundled site-packages:', sitePackages)
        return sitePackages
      }
      return null
    } catch {
      return null
    }
  }

  private loadAllowlist(): void {
    // Try multiple locations for the allowlist
    const candidates = [
      path.join(__dirname, '..', 'python', 'allowed-packages.json'),           // Development
      path.join(process.resourcesPath || '', 'resources', 'allowed-packages.json'), // Packaged
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        try {
          const data: AllowlistFile = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
          for (const [importName, info] of Object.entries(data.packages)) {
            this.allowlist.set(importName, {
              import_name: importName,
              pip_name: info.pip_name,
              category: info.category
            })
          }
          console.log(`[PackageManager] Loaded ${this.allowlist.size} allowed packages from ${candidate}`)
          return
        } catch (err) {
          console.error('[PackageManager] Failed to parse allowlist:', err)
        }
      }
    }

    console.warn('[PackageManager] No allowlist file found')
  }

  private loadManifest(): void {
    if (fs.existsSync(this.manifestPath)) {
      try {
        this.manifest = JSON.parse(fs.readFileSync(this.manifestPath, 'utf-8'))
      } catch {
        this.manifest = { packages: {} }
      }
    }
  }

  private saveManifest(): void {
    fs.writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2))
  }

  private sendStatus(event: PackageStatusEvent): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('packages:status', event)
    }
  }

  /**
   * Parse Python code for import statements
   */
  extractImports(code: string): string[] {
    const imports = new Set<string>()

    // Match "import X", "import X as Y", "import X, Y"
    const importRegex = /^\s*import\s+(.+)/gm
    // Match "from X import ..."
    const fromImportRegex = /^\s*from\s+(\S+)\s+import/gm

    let match: RegExpExecArray | null

    while ((match = importRegex.exec(code)) !== null) {
      // Handle "import X, Y, Z" and "import X as Y"
      const modules = match[1].split(',')
      for (const mod of modules) {
        const name = mod.trim().split(/\s+as\s+/)[0].trim()
        // Get top-level package name
        const topLevel = name.split('.')[0]
        if (topLevel) imports.add(topLevel)
      }
    }

    while ((match = fromImportRegex.exec(code)) !== null) {
      const topLevel = match[1].split('.')[0]
      if (topLevel) imports.add(topLevel)
    }

    return Array.from(imports)
  }

  /**
   * Check which imports are missing (not stdlib, not pre-installed, not user-installed)
   */
  async findMissingImports(imports: string[]): Promise<string[]> {
    const missing: string[] = []

    for (const imp of imports) {
      // Skip stdlib
      if (PYTHON_STDLIB.has(imp)) continue
      // Skip pre-installed packages
      if (PRE_INSTALLED_IMPORTS.has(imp)) continue

      // Check if it's importable (includes user-installed packages)
      const result = spawnSync(this.pythonPath, ['-c', `import ${imp}`], {
        timeout: 10000,
        env: {
          ...process.env,
          PYTHONPATH: this.userPackagesDir
        }
      })

      if (result.status !== 0) {
        missing.push(imp)
      }
    }

    return missing
  }

  /**
   * Filter missing imports against the allowlist
   */
  checkAllowlist(missing: string[]): { toInstall: AllowedPackage[]; blocked: string[] } {
    const toInstall: AllowedPackage[] = []
    const blocked: string[] = []

    for (const imp of missing) {
      const allowed = this.allowlist.get(imp)
      if (allowed) {
        // Check if already in manifest (installed previously)
        if (!this.manifest.packages[imp]) {
          toInstall.push(allowed)
        }
      } else {
        blocked.push(imp)
      }
    }

    return { toInstall, blocked }
  }

  /**
   * Install packages via pip into the user packages directory
   */
  async installPackages(packages: AllowedPackage[]): Promise<{ installed: string[]; failed: string[] }> {
    const installed: string[] = []
    const failed: string[] = []

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i]
      this.sendStatus({
        phase: 'installing',
        package: pkg.pip_name,
        total: packages.length,
        current: i + 1
      })

      console.log(`[PackageManager] Installing ${pkg.pip_name}...`)

      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(this.pythonPath, [
            '-m', 'pip', 'install',
            '--target', this.userPackagesDir,
            '--no-input',
            '--disable-pip-version-check',
            pkg.pip_name
          ], {
            timeout: 120000, // 2 min timeout
            env: { ...process.env }
          })

          let stderr = ''
          proc.stderr?.on('data', (data) => { stderr += data.toString() })
          proc.stdout?.on('data', (data) => {
            console.log(`[PackageManager] pip: ${data.toString().trim()}`)
          })

          proc.on('close', (code) => {
            if (code === 0) {
              resolve()
            } else {
              reject(new Error(`pip install failed for ${pkg.pip_name}: ${stderr}`))
            }
          })

          proc.on('error', (err) => {
            reject(err)
          })
        })

        // Remove duplicate packages that are already in bundled site-packages
        // pip --target installs ALL transitive deps (numpy, pandas, etc.) which
        // conflict with the bundled copies and cause "cannot load module twice" errors
        this.cleanupDuplicatePackages()

        // Record in manifest
        this.manifest.packages[pkg.import_name] = {
          pip_name: pkg.pip_name,
          installed_at: new Date().toISOString()
        }
        this.saveManifest()
        installed.push(pkg.pip_name)
        console.log(`[PackageManager] Installed ${pkg.pip_name}`)
      } catch (err) {
        console.error(`[PackageManager] Failed to install ${pkg.pip_name}:`, err)
        failed.push(pkg.pip_name)
      }
    }

    return { installed, failed }
  }

  /**
   * Remove packages from userPackagesDir that already exist in bundled site-packages.
   * pip --target always installs all transitive dependencies, creating duplicates
   * of numpy, pandas, etc. that conflict with the bundled versions at runtime.
   */
  private cleanupDuplicatePackages(): void {
    if (!this.bundledSitePackages) return

    let bundledEntries: Set<string>
    try {
      bundledEntries = new Set(fs.readdirSync(this.bundledSitePackages))
    } catch {
      return
    }

    let userEntries: string[]
    try {
      userEntries = fs.readdirSync(this.userPackagesDir)
    } catch {
      return
    }

    for (const entry of userEntries) {
      // Skip our manifest and .dist-info for packages we intentionally installed
      if (entry === 'installed.json') continue

      // If this entry also exists in bundled site-packages, it's a duplicate
      if (bundledEntries.has(entry)) {
        const fullPath = path.join(this.userPackagesDir, entry)
        try {
          const stat = fs.statSync(fullPath)
          if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true })
          } else {
            fs.unlinkSync(fullPath)
          }
          console.log(`[PackageManager] Removed duplicate: ${entry}`)
        } catch (err) {
          console.error(`[PackageManager] Failed to remove duplicate ${entry}:`, err)
        }
      }
    }

    // Also remove common pip artifacts that aren't needed
    for (const artifact of ['bin', '__pycache__']) {
      const fullPath = path.join(this.userPackagesDir, artifact)
      if (fs.existsSync(fullPath)) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true })
        } catch { /* ignore */ }
      }
    }
  }

  /**
   * Full pipeline: extract imports → find missing → check allowlist → install
   */
  async ensurePackages(code: string): Promise<PackageInstallResult> {
    this.sendStatus({ phase: 'detecting' })

    const imports = this.extractImports(code)
    console.log('[PackageManager] Extracted imports:', imports)

    const missing = await this.findMissingImports(imports)
    console.log('[PackageManager] Missing imports:', missing)

    if (missing.length === 0) {
      this.sendStatus({ phase: 'complete' })
      return { installed: [], failed: [], blocked: [], alreadyInstalled: [] }
    }

    const { toInstall, blocked } = this.checkAllowlist(missing)
    console.log('[PackageManager] To install:', toInstall.map(p => p.pip_name))
    console.log('[PackageManager] Blocked:', blocked)

    if (toInstall.length === 0) {
      this.sendStatus({ phase: 'complete' })
      return { installed: [], failed: [], blocked, alreadyInstalled: [] }
    }

    const { installed, failed } = await this.installPackages(toInstall)

    this.sendStatus({
      phase: failed.length > 0 ? 'error' : 'complete',
      error: failed.length > 0 ? `Failed to install: ${failed.join(', ')}` : undefined
    })

    return { installed, failed, blocked, alreadyInstalled: [] }
  }

  /**
   * Returns the user packages dir for PYTHONPATH injection
   */
  getUserPackagesPath(): string {
    return this.userPackagesDir
  }

  /**
   * Returns package lists formatted for the Claude system prompt
   */
  getAllowlistForPrompt(): { preInstalled: string[]; installable: { name: string; category: string }[] } {
    const preInstalled = [
      'streamlit', 'pandas', 'numpy', 'plotly', 'altair', 'matplotlib', 'seaborn',
      'google-cloud-bigquery', 'google-cloud-bigquery-storage', 'pandas-gbq',
      'pyarrow', 'db-dtypes', 'google-auth', 'google-auth-oauthlib',
      'psycopg2-binary', 'snowflake-connector-python', 'redshift_connector',
      'openpyxl', 'xlrd', 'pdfplumber', 'scipy', 'scikit-learn', 'python-dateutil'
    ]

    const installable: { name: string; category: string }[] = []
    for (const [, pkg] of this.allowlist) {
      installable.push({ name: pkg.pip_name, category: pkg.category })
    }

    return { preInstalled, installable }
  }
}
