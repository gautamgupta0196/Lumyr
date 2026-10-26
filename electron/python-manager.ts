import { spawn, ChildProcess } from 'child_process'
import { BrowserWindow } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import net from 'net'
import http from 'http'
import {
  getActiveConnectionId,
  getConnection,
  getConnectionCredentials
} from './store.js'
import { getOAuthConfig } from './bigquery.js'

interface StreamlitResult {
  success: boolean
  error?: string
  port?: number
}

interface RunCodeOptions {
  triggerExecution?: boolean
}

export class PythonManager {
  private resourcesPath: string
  private projectRoot: string
  private mainWindow: BrowserWindow
  private isPackaged: boolean
  private allowUnbundledPython: boolean
  private streamlitProcess: ChildProcess | null = null
  private currentPort: number | null = null
  private tempDir: string
  private currentCodeFile: string | null = null
  private credentialsFile: string | null = null
  private lastError: string | null = null
  private errorBuffer: string[] = []
  private dashboardReady: boolean = false
  private extraPythonPaths: string[] = []
  private extraEnv: Record<string, string> = {}
  private stoppingIntentionally = false

  constructor(
    resourcesPath: string,
    mainWindow: BrowserWindow,
    projectRoot?: string,
    isPackaged: boolean = false
  ) {
    this.resourcesPath = resourcesPath
    this.projectRoot = projectRoot || path.resolve(resourcesPath, '..')
    this.mainWindow = mainWindow
    this.isPackaged = isPackaged
    this.allowUnbundledPython = process.env.LUMYR_ALLOW_UNBUNDLED_PYTHON === '1'
    this.tempDir = path.join(os.tmpdir(), 'lumyr-streamlit')

    console.log('PythonManager initialized with project root:', this.projectRoot)

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true })
    }
  }

  /**
   * Get the path to the Python executable
   * Priority:
   * 1. Bundled Python in resources (for packaged app - architecture-specific)
   * 2. Virtual environment in project directory (for development)
   */
  private getPythonPath(): string {
    const platform = process.platform

    // Check for bundled Python in resources first (works in both dev and packaged)
    // The build process bundles the correct architecture-specific Python as 'python-mac'
    if (platform === 'win32') {
      const embeddedPython = path.join(this.resourcesPath, 'resources', 'python-win', 'python.exe')
      if (fs.existsSync(embeddedPython)) {
        console.log('Using bundled Python:', embeddedPython)
        return embeddedPython
      }
      if (this.isPackaged) {
        throw new Error(`Bundled Python not found at ${embeddedPython}. App installation is invalid.`)
      }
      if (!this.allowUnbundledPython) {
        throw new Error(
          `Bundled Python not found at ${embeddedPython}. ` +
          'Run `npm run prepare:python:win` to generate it, ' +
          'or set LUMYR_ALLOW_UNBUNDLED_PYTHON=1 to use .venv/system Python.'
        )
      }
    } else if (platform === 'darwin') {
      if (this.isPackaged) {
        // The build bundles architecture-specific Python to 'resources/python-mac'
        // In packaged app: resourcesPath = .../Lumyr.app/Contents/Resources
        // Python is at: resourcesPath/resources/python-mac/bin/python3
        const bundledPython = path.join(this.resourcesPath, 'resources', 'python-mac', 'bin', 'python3')
        if (fs.existsSync(bundledPython)) {
          console.log('Using bundled Python:', bundledPython)
          return bundledPython
        }
        throw new Error(`Bundled Python not found at ${bundledPython}. App installation is invalid.`)
      }

      // For development, require architecture-specific bundled Python
      const arch = process.arch
      const devPython = path.join(this.resourcesPath, 'resources', `python-mac-${arch}`, 'bin', 'python3')
      if (fs.existsSync(devPython)) {
        console.log(`Using dev bundled Python (${arch}):`, devPython)
        return devPython
      }
      if (!this.allowUnbundledPython) {
        throw new Error(
          `Bundled Python not found at ${devPython}. ` +
          'Run `npm run prepare:python` to generate it, ' +
          'or set LUMYR_ALLOW_UNBUNDLED_PYTHON=1 to use .venv/system Python.'
        )
      }
    }

    // Fallback to virtual environment in project directory (development)
    const venvPython = platform === 'win32'
      ? path.join(this.projectRoot, '.venv', 'Scripts', 'python.exe')
      : path.join(this.projectRoot, '.venv', 'bin', 'python3')

    console.log('Looking for venv at:', venvPython)

    if (this.allowUnbundledPython && fs.existsSync(venvPython)) {
      console.log('Using venv Python:', venvPython)
      return venvPython
    }

    // No Python found - this will cause an error when trying to start
    console.error('No Python installation found!')
    throw new Error('Python not found. Please ensure the app is installed correctly.')
  }

  /**
   * Get the Python path (public accessor for PackageManager)
   */
  getPythonPathPublic(): string {
    return this.getPythonPath()
  }

  /**
   * Add extra paths to PYTHONPATH for user-installed packages
   */
  addPythonPath(p: string): void {
    if (!this.extraPythonPaths.includes(p)) {
      this.extraPythonPaths.push(p)
    }
  }

  /**
   * Set extra environment variables for the Streamlit process
   * (e.g., PostgreSQL connection vars: PGHOST, PGPORT, etc.)
   * Stops the running Streamlit process so the next runCode() picks up the new env.
   */
  async setExtraEnv(env: Record<string, string>): Promise<void> {
    // Skip restart if env vars haven't changed
    const envChanged = JSON.stringify(this.extraEnv) !== JSON.stringify(env)
    this.extraEnv = env
    // Restart Streamlit so it picks up the new env vars
    if (envChanged && this.streamlitProcess) {
      console.log('[PythonManager] Env changed, restarting Streamlit')
      await this.stop()
    }
  }

  /**
   * Prepare credentials for Python to use
   */
  private prepareCredentials(): { envVars: Record<string, string>; projectId: string | null } {
    const activeConnectionId = getActiveConnectionId()
    if (!activeConnectionId) {
      console.log('No active connection for Python credentials')
      return { envVars: {}, projectId: null }
    }

    const connection = getConnection(activeConnectionId)
    if (!connection) {
      console.log('Connection not found:', activeConnectionId)
      return { envVars: {}, projectId: null }
    }

    const credentials = getConnectionCredentials(activeConnectionId)
    const projectId = connection.projectId

    if (connection.authType === 'service_account' && credentials?.serviceAccount) {
      // Write service account to temp file
      const credPath = path.join(this.tempDir, 'credentials.json')
      fs.writeFileSync(credPath, JSON.stringify(credentials.serviceAccount, null, 2))
      this.credentialsFile = credPath
      console.log('Wrote service account credentials to:', credPath)

      return {
        envVars: {
          GOOGLE_APPLICATION_CREDENTIALS: credPath,
          GOOGLE_CLOUD_PROJECT: projectId || ''
        },
        projectId
      }
    }

    if (connection.authType === 'oauth' && credentials?.tokens) {
      // Write OAuth tokens as authorized_user credentials file
      // This format is recognized by Google's Python SDK
      const oauthConfig = getOAuthConfig()
      const oauthCreds = {
        type: 'authorized_user',
        client_id: oauthConfig.clientId,
        client_secret: oauthConfig.clientSecret,
        refresh_token: credentials.tokens.refresh_token
      }

      const credPath = path.join(this.tempDir, 'oauth_credentials.json')
      fs.writeFileSync(credPath, JSON.stringify(oauthCreds, null, 2))
      this.credentialsFile = credPath
      console.log('Wrote OAuth credentials to:', credPath)

      return {
        envVars: {
          GOOGLE_APPLICATION_CREDENTIALS: credPath,
          GOOGLE_CLOUD_PROJECT: projectId || ''
        },
        projectId
      }
    }

    // Fallback: just set project ID
    console.log('No credentials found, using project ID only')
    return {
      envVars: projectId ? { GOOGLE_CLOUD_PROJECT: projectId } : {},
      projectId
    }
  }

  /**
   * Find an available port
   */
  private async findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer()
      server.unref()
      server.on('error', reject)
      server.listen(0, () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          const port = address.port
          server.close(() => resolve(port))
        } else {
          reject(new Error('Failed to get port'))
        }
      })
    })
  }

  /**
   * Start the Streamlit server
   */
  async start(): Promise<StreamlitResult> {
    if (this.streamlitProcess) {
      return { success: true, port: this.currentPort! }
    }

    try {
      const port = await this.findAvailablePort()
      this.currentPort = port

      const pythonPath = this.getPythonPath()
      const { envVars } = this.prepareCredentials()

      console.log('[PythonManager] Starting Streamlit with extraEnv keys:', Object.keys(this.extraEnv))
      if (this.extraEnv.PGHOST) {
        console.log('[PythonManager] PGHOST:', this.extraEnv.PGHOST, 'PGDATABASE:', this.extraEnv.PGDATABASE)
      }

      // Create a simple placeholder script
      const placeholderCode = `
import streamlit as st

st.set_page_config(page_title="Lumyr Dashboard", layout="wide")
st.title("Ready for Analysis")
st.info("Enter a query above to generate a dashboard.")
`
      const codeFile = path.join(this.tempDir, 'dashboard.py')
      fs.writeFileSync(codeFile, placeholderCode)
      this.currentCodeFile = codeFile

      console.log('Starting Streamlit with credentials:', Object.keys(envVars))

      // Start Streamlit with credentials in environment
      this.streamlitProcess = spawn(pythonPath, [
        '-m', 'streamlit', 'run',
        codeFile,
        '--server.port', port.toString(),
        '--server.headless', 'true',
        '--server.runOnSave', 'true',
        '--browser.gatherUsageStats', 'false',
        '--theme.base', 'light',
        '--theme.primaryColor', '#2563eb',
        '--theme.backgroundColor', '#f8f9fb',
        '--theme.secondaryBackgroundColor', '#eef0f4',
        '--theme.textColor', '#151a23',
        '--theme.font', 'sans serif'
      ], {
        cwd: this.tempDir,
        env: {
          ...process.env,
          ...envVars,
          ...this.extraEnv,
          // Force TCP connection for PostgreSQL — 'localhost' causes psycopg2 to use Unix socket
          ...(this.extraEnv.PGHOST === 'localhost' ? { PGHOST: '127.0.0.1' } : {}),
          STREAMLIT_SERVER_PORT: port.toString(),
          STREAMLIT_SERVER_HEADLESS: 'true',
          PYTHONWARNINGS: 'ignore::FutureWarning',
          ...(this.extraPythonPaths.length > 0 ? {
            PYTHONPATH: this.extraPythonPaths.join(path.delimiter) +
              (process.env.PYTHONPATH ? path.delimiter + process.env.PYTHONPATH : '')
          } : {})
        }
      })

      // Handle stdout
      this.streamlitProcess.stdout?.on('data', (data) => {
        const output = data.toString()
        console.log('Streamlit:', output)
        // Check if window is still valid before sending
        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('streamlit:output', output)
        }
      })

      // Handle stderr
      this.streamlitProcess.stderr?.on('data', (data) => {
        const output = data.toString()
        // Filter out FutureWarning messages
        if (output.includes('FutureWarning')) {
          console.log('Streamlit warning (ignored):', output.substring(0, 100))
          return
        }

        // Streamlit auto-recovers from Arrow serialization errors by applying
        // automatic type coercion. The traceback printed in the middle of
        // recovery is not a real failure — skip it.
        if (
          output.includes('Serialization of dataframe to Arrow table was unsuccessful') &&
          output.includes('Applying automatic fixes')
        ) {
          console.log('Streamlit warning (ignored): Arrow serialization auto-recovery')
          return
        }

        // Check for DASHBOARD_READY signal (success marker)
        if (output.includes('DASHBOARD_READY')) {
          console.log('[PythonManager] Dashboard ready signal received')
          this.dashboardReady = true
          // Anything that printed to stderr before we reached the end of the
          // script was recoverable (Streamlit handled it and moved on — e.g.
          // pyarrow.lib.ArrowInvalid during dataframe serialization, which
          // Streamlit auto-fixes). Clear it so verification passes.
          if (this.lastError) {
            console.log('[PythonManager] Clearing pre-ready stderr; Streamlit recovered')
            this.lastError = null
            this.errorBuffer = []
          }
          return
        }

        console.error('Streamlit error:', output)

        // Check for DASHBOARD_ERROR (from our error handling pattern) or Python errors
        const isDashboardError = output.includes('DASHBOARD_ERROR')
        // Match only real error signatures — not any substring containing
        // "error" (which falsely flagged variable names like `errors_df`).
        // Matches: "ValueError:", "Exception:", "Traceback (most recent...".
        const isPythonError =
          /\b[A-Za-z]*(?:Error|Exception):/.test(output) ||
          /Traceback\s*\(most recent/i.test(output)

        // Capture errors for agent feedback
        if (isDashboardError || isPythonError) {
          // Extract clean error message for DASHBOARD_ERROR
          let errorMessage = output
          if (isDashboardError) {
            const match = output.match(/DASHBOARD_ERROR:\s*(.+)/s)
            if (match) {
              errorMessage = match[1].trim()
            }
          }

          console.log('[PythonManager] Captured error:', errorMessage.substring(0, 100))

          // If an error arrives after DASHBOARD_READY, the dashboard isn't actually ready
          if (this.dashboardReady) {
            console.log('[PythonManager] Error arrived after DASHBOARD_READY, resetting ready state')
            this.dashboardReady = false
          }

          // Add to error buffer
          this.errorBuffer.push(errorMessage)
          // Keep only last 5 errors
          if (this.errorBuffer.length > 5) {
            this.errorBuffer.shift()
          }
          // Set last error
          this.lastError = this.errorBuffer.join('\n')

          console.log('[PythonManager] lastError set, length:', this.lastError.length)

          // Check if window is still valid before sending
          if (!this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('streamlit:error', output)
          }
        }
      })

      // Handle process exit
      this.streamlitProcess.on('exit', (code, signal) => {
        if (signal) {
          console.log(`Streamlit exited via signal ${signal}`)
        } else {
          console.log('Streamlit exited with code:', code)
        }

        const wasIntentional = this.stoppingIntentionally
        this.stoppingIntentionally = false
        this.streamlitProcess = null
        this.currentPort = null

        // Notify renderer of unexpected exit
        if (!wasIntentional && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('streamlit:exited')
        }
      })

      // Wait for Streamlit to start
      await this.waitForStreamlit(port)

      return { success: true, port }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start Streamlit'
      return { success: false, error: message }
    }
  }

  /**
   * Wait for Streamlit to be ready
   */
  private async waitForStreamlit(port: number, timeout = 30000): Promise<void> {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      try {
        const isReady = await this.checkPort(port)
        if (isReady) {
          return
        }
      } catch {
        // Port not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    throw new Error('Streamlit failed to start within timeout')
  }

  /**
   * Check if a port is accepting connections
   */
  private checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket()
      socket.setTimeout(1000)

      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })

      socket.on('error', () => {
        socket.destroy()
        resolve(false)
      })

      socket.on('timeout', () => {
        socket.destroy()
        resolve(false)
      })

      socket.connect(port, 'localhost')
    })
  }

  /**
   * Stop the Streamlit server
   */
  async stop(): Promise<StreamlitResult> {
    if (!this.streamlitProcess) {
      return { success: true }
    }

    this.stoppingIntentionally = true

    return new Promise((resolve) => {
      this.streamlitProcess!.on('exit', () => {
        this.streamlitProcess = null
        this.currentPort = null

        // Clean up credentials file
        if (this.credentialsFile && fs.existsSync(this.credentialsFile)) {
          try {
            fs.unlinkSync(this.credentialsFile)
          } catch {
            // Ignore cleanup errors
          }
        }

        resolve({ success: true })
      })

      // Kill the process
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', this.streamlitProcess!.pid!.toString(), '/f', '/t'])
      } else {
        this.streamlitProcess!.kill('SIGTERM')
      }

      // Force kill after timeout
      setTimeout(() => {
        if (this.streamlitProcess) {
          this.streamlitProcess.kill('SIGKILL')
        }
      }, 5000)
    })
  }

  /**
   * Run generated Python code
   */
  async runCode(code: string, options: RunCodeOptions = {}): Promise<StreamlitResult> {
    try {
      // Clear any previous errors before running new code
      this.clearErrors()

      // Ensure Streamlit is running
      if (!this.streamlitProcess) {
        const startResult = await this.start()
        if (!startResult.success) {
          return startResult
        }
      }

      if (!this.currentPort) {
        return { success: false, error: 'Streamlit port not available' }
      }

      // Patch PostgreSQL host to force TCP (localhost causes psycopg2 to use Unix socket)
      code = code.replace(
        /os\.environ\.get\(['"]PGHOST['"]\)/g,
        "os.environ.get('PGHOST', '127.0.0.1')"
      )

      // Write the new code to the file
      if (this.currentCodeFile) {
        fs.writeFileSync(this.currentCodeFile, code, 'utf-8')
        console.log('[PythonManager] Updated dashboard code, file:', this.currentCodeFile)
        console.log('[PythonManager] Code length:', code.length, 'bytes')
        
        // Verify file was written
        if (!fs.existsSync(this.currentCodeFile)) {
          return { success: false, error: 'Failed to write code file' }
        }
        const writtenCode = fs.readFileSync(this.currentCodeFile, 'utf-8')
        if (writtenCode !== code) {
          console.warn('[PythonManager] Written code does not match original code')
        }
      } else {
        return { success: false, error: 'Code file path not set' }
      }

      // Streamlit's runOnSave will automatically reload when file changes
      // Wait a moment for the file system to sync
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Trigger execution to ensure code runs (Streamlit only executes when a client connects)
      if (options.triggerExecution !== false) {
        await this.triggerExecution()
      }

      // Wait for Streamlit to process the file change and be ready
      // Check that the port is still responding
      const maxWaitTime = 5000 // 5 seconds
      const checkInterval = 200
      const maxChecks = Math.ceil(maxWaitTime / checkInterval)

      for (let i = 0; i < maxChecks; i++) {
        // Check if port is still responding
        const isReady = await this.checkPort(this.currentPort)
        if (isReady) {
          // Port is responding, Streamlit should be ready
          console.log('[PythonManager] Streamlit is ready on port', this.currentPort)
          return { success: true, port: this.currentPort }
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval))
      }

      // If we get here, port check timed out but Streamlit might still be starting
      // Return success anyway since the port was valid before
      console.log('[PythonManager] Port check timed out, but returning success (Streamlit may still be loading)')
      return { success: true, port: this.currentPort }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run code'
      console.error('[PythonManager] runCode error:', message, error)
      return { success: false, error: message }
    }
  }

  /**
   * Get the current status
   */
  getStatus(): { isRunning: boolean; port: number | null } {
    return {
      isRunning: this.streamlitProcess !== null,
      port: this.currentPort
    }
  }

  /**
   * Get the last captured error (for agent feedback)
   * Does NOT clear the error - use clearErrors() for that
   */
  getLastError(): string | null {
    return this.lastError
  }

  /**
   * Clear the error buffer and ready state (call before running new code)
   */
  clearErrors(): void {
    this.lastError = null
    this.errorBuffer = []
    this.dashboardReady = false
  }

  /**
   * Check if dashboard is ready (successfully loaded)
   */
  isDashboardReady(): boolean {
    return this.dashboardReady
  }

  /**
   * Trigger Streamlit to execute the code by making an HTTP request
   * This is needed because Streamlit only runs code when a client connects
   */
  async triggerExecution(): Promise<void> {
    if (!this.currentPort) {
      console.log('[PythonManager] No port available for triggering execution')
      return
    }

    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: this.currentPort,
        path: '/',
        method: 'GET',
        timeout: 5000
      }, (res) => {
        // Consume the response to complete the request
        res.on('data', () => {})
        res.on('end', () => {
          console.log('[PythonManager] Triggered Streamlit execution')
          resolve()
        })
      })

      req.on('error', (err) => {
        console.log('[PythonManager] Error triggering execution:', err.message)
        resolve() // Don't fail, just continue
      })

      req.on('timeout', () => {
        console.log('[PythonManager] Timeout triggering execution')
        req.destroy()
        resolve()
      })

      req.end()
    })
  }
}
