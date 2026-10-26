import { autoUpdater, UpdateInfo } from 'electron-updater'
import { BrowserWindow, ipcMain } from 'electron'

// Standalone builds update straight from GitHub Releases — no update server.
const GITHUB_OWNER = 'gautamgupta0196'
const GITHUB_REPO = 'Lumyr'

export interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: UpdateInfo
  progress?: {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
  }
  error?: string
}

let mainWindow: BrowserWindow | null = null
let lastCheckTime = 0
const CHECK_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const FOCUS_COOLDOWN_MS = 2 * 60 * 1000  // 2-minute cooldown after focus check

/**
 * Initialize the auto-updater
 */
export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window

  // Configure auto-updater
  autoUpdater.autoDownload = false // Don't auto-download, let user decide
  autoUpdater.autoInstallOnAppQuit = true

  // Use backend as update proxy — GitHub token stays server-side
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  })

  // Enable logging for debugging
  autoUpdater.logger = {
    info: (message: string) => console.log('[AutoUpdater]', message),
    warn: (message: string) => console.warn('[AutoUpdater]', message),
    error: (message: string) => console.error('[AutoUpdater]', message),
    debug: (message: string) => console.log('[AutoUpdater Debug]', message)
  }

  // Event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...')
    sendUpdateStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('Update available:', info.version)
    sendUpdateStatus({ status: 'available', info })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('No update available, current version:', info.version)
    sendUpdateStatus({ status: 'not-available', info })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus({
      status: 'downloading',
      progress: {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      }
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('Update downloaded:', info.version)
    sendUpdateStatus({ status: 'downloaded', info })
  })

  autoUpdater.on('error', (error: Error) => {
    console.error('Auto-updater error:', error.message)
    // Silently ignore transient server/network errors — not actionable by the user
    if (
      error.message.includes('404') ||
      error.message.includes('Not Found') ||
      error.message.includes('502') ||
      error.message.includes('503') ||
      error.message.includes('504') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    ) {
      console.log('Update check failed (server/network error) — will retry later')
      return
    }
    sendUpdateStatus({ status: 'error', error: error.message })
  })

  // Register IPC handlers
  registerIpcHandlers()

  // Check for updates on startup (after a short delay)
  setTimeout(() => {
    checkForUpdates()
  }, 5000)

  // Re-check periodically (every 10 minutes)
  setInterval(() => {
    checkForUpdates()
  }, CHECK_INTERVAL_MS)

  // Check when app window regains focus (with cooldown to avoid hammering)
  window.on('focus', () => {
    const now = Date.now()
    if (now - lastCheckTime >= FOCUS_COOLDOWN_MS) {
      checkForUpdates()
    }
  })
}

/**
 * Send update status to renderer
 */
function sendUpdateStatus(status: UpdateStatus) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', status)
  }
}

/**
 * Check for updates
 */
export async function checkForUpdates(): Promise<void> {
  try {
    lastCheckTime = Date.now()
    await autoUpdater.checkForUpdates()
  } catch (error) {
    console.error('Error checking for updates:', error)
  }
}

/**
 * Download the update
 */
export async function downloadUpdate(): Promise<void> {
  try {
    await autoUpdater.downloadUpdate()
  } catch (error) {
    console.error('Error downloading update:', error)
  }
}

/**
 * Quit and install the update
 */
export function quitAndInstall(): void {
  autoUpdater.quitAndInstall(false, true)
}

/**
 * Register IPC handlers for update operations
 */
function registerIpcHandlers() {
  ipcMain.handle('updater:check', async () => {
    await checkForUpdates()
  })

  ipcMain.handle('updater:download', async () => {
    await downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    quitAndInstall()
  })
}
