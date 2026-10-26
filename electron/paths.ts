// Path resolution utilities for Electron main process
// These pure functions make path logic testable without requiring Electron context

import path from 'path'
import fs from 'fs'

export interface PathConfig {
  isPackaged: boolean
  resourcesPath: string
  dirname: string
  platform: NodeJS.Platform
  arch: string
  allowVenvFallback?: boolean
}

/**
 * Compute the path to the Python executable
 * Handles bundled Python (packaged), dev Python (architecture-specific), and venv fallback
 */
export function computePythonPath(
  config: PathConfig,
  checkExists: (path: string) => boolean = fs.existsSync
): string | null {
  const { isPackaged, resourcesPath, dirname, platform, arch, allowVenvFallback = false } = config

  if (platform === 'darwin') {
    if (isPackaged) {
      // Packaged app: Python is in Resources/resources/python-mac/
      const bundledPath = path.join(resourcesPath, 'resources', 'python-mac', 'bin', 'python3')
      if (checkExists(bundledPath)) return bundledPath
    } else {
      // Dev mode: architecture-specific Python
      const devPath = path.join(resourcesPath, 'resources', `python-mac-${arch}`, 'bin', 'python3')
      if (checkExists(devPath)) return devPath
    }
  } else if (platform === 'win32') {
    const bundledPath = path.join(resourcesPath, 'resources', 'python-win', 'python.exe')
    if (checkExists(bundledPath)) return bundledPath
  }

  if (!allowVenvFallback) return null

  // Optional fallback to virtual environment
  const projectRoot = isPackaged ? resourcesPath : path.resolve(dirname, '..')
  const venvPath = platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python3')

  if (checkExists(venvPath)) return venvPath
  return null
}

/**
 * Compute the path to Python schema inference script
 * In packaged app, scripts are in app.asar.unpacked (not inside asar)
 */
export function computeSchemaScriptPath(
  config: PathConfig,
  checkExists: (path: string) => boolean = fs.existsSync
): string | null {
  const { isPackaged, dirname } = config

  if (isPackaged) {
    // Packaged app: use app.asar.unpacked path (subprocess can't read from inside asar)
    const unpackedPath = path.join(dirname, '..', 'python', 'file_schema.py')
      .replace('app.asar', 'app.asar.unpacked')
    if (checkExists(unpackedPath)) return unpackedPath
  }

  // Dev mode: python folder is at project root
  const devPath = path.join(dirname, '..', 'python', 'file_schema.py')
  if (checkExists(devPath)) return devPath
  return null
}

/**
 * Compute project root for use as subprocess cwd
 * CRITICAL: Must return a real directory path, not inside asar archive
 */
export function computeProjectRoot(config: PathConfig): string {
  const { isPackaged, resourcesPath, dirname } = config
  if (isPackaged) {
    // In packaged app, use resourcesPath (a real directory)
    // Using asar path would cause ENOTDIR error
    return resourcesPath
  }
  return path.resolve(dirname, '..')
}

/**
 * Compute the path to the Streamlit runner script
 */
export function computeRunnerScriptPath(
  config: PathConfig,
  checkExists: (path: string) => boolean = fs.existsSync
): string | null {
  const { isPackaged, dirname } = config

  if (isPackaged) {
    const unpackedPath = path.join(dirname, '..', 'python', 'runner.py')
      .replace('app.asar', 'app.asar.unpacked')
    if (checkExists(unpackedPath)) return unpackedPath
  }

  const devPath = path.join(dirname, '..', 'python', 'runner.py')
  if (checkExists(devPath)) return devPath
  return null
}
