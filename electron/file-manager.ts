// File Manager
// Handles file uploads, storage, and on-demand preview for uploaded files

import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { spawn } from 'child_process'
import {
  saveFile,
  getFile,
  getAllFiles,
  deleteFile as deleteFileFromStore,
  type UploadedFile,
  type FileFormat
} from './store.js'

// Get the files storage directory
export function getFilesDirectory(): string {
  const filesDir = path.join(app.getPath('userData'), 'lumyr-files')

  // Ensure directory exists
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true })
  }

  return filesDir
}

// Get Python executable path
function getPythonPath(): string {
  const platform = process.platform
  const allowUnbundledPython = process.env.LUMYR_ALLOW_UNBUNDLED_PYTHON === '1'
  const baseResourcesPath = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..')

  // Check for bundled Python in resources first (packaged app)
  if (platform === 'darwin') {
    if (app.isPackaged) {
      const bundledPython = path.join(baseResourcesPath, 'resources', 'python-mac', 'bin', 'python3')
      console.log('[FileManager] Checking bundled Python:', bundledPython, 'exists:', fs.existsSync(bundledPython))
      if (fs.existsSync(bundledPython)) {
        return bundledPython
      }
      throw new Error(`Bundled Python not found at ${bundledPython}. App installation is invalid.`)
    }

    const arch = process.arch
    const devPython = path.join(baseResourcesPath, 'resources', `python-mac-${arch}`, 'bin', 'python3')
    console.log('[FileManager] Checking dev bundled Python:', devPython, 'exists:', fs.existsSync(devPython))
    if (fs.existsSync(devPython)) {
      return devPython
    }
    if (!allowUnbundledPython) {
      throw new Error(
        `Bundled Python not found at ${devPython}. ` +
        'Run `npm run prepare:python` to generate it, ' +
        'or set LUMYR_ALLOW_UNBUNDLED_PYTHON=1 to use .venv/system Python.'
      )
    }
  } else if (platform === 'win32') {
    const bundledPython = path.join(baseResourcesPath, 'resources', 'python-win', 'python.exe')
    console.log('[FileManager] Checking bundled Python:', bundledPython, 'exists:', fs.existsSync(bundledPython))
    if (fs.existsSync(bundledPython)) {
      return bundledPython
    }
    if (app.isPackaged) {
      throw new Error(`Bundled Python not found at ${bundledPython}. App installation is invalid.`)
    }
    if (!allowUnbundledPython) {
      throw new Error(
        `Bundled Python not found at ${bundledPython}. ` +
        'Run `npm run prepare:python:win` to generate it, ' +
        'or set LUMYR_ALLOW_UNBUNDLED_PYTHON=1 to use .venv/system Python.'
      )
    }
  }

  // Check for virtual environment (development)
  // __dirname is electron/ in dev, need to go up to project root
  const projectRoot = path.resolve(__dirname, '..')
  const venvPython = platform === 'win32'
    ? path.join(projectRoot, '.venv', 'Scripts', 'python.exe')
    : path.join(projectRoot, '.venv', 'bin', 'python3')

  console.log('[FileManager] Checking venv Python:', venvPython, 'exists:', fs.existsSync(venvPython))
  if (allowUnbundledPython && fs.existsSync(venvPython)) {
    return venvPython
  }

  // Fall back to system Python
  if (allowUnbundledPython) {
    console.log('[FileManager] Falling back to system python3')
    return 'python3'
  }

  throw new Error('Bundled Python not found. Run the prepare script to generate it.')
}

// Get project root directory (for setting cwd when running Python)
function getProjectRoot(): string {
  if (app.isPackaged) {
    // In packaged app, use resourcesPath as cwd (a real directory, not inside asar)
    return process.resourcesPath
  }
  return path.resolve(__dirname, '..')
}

// Get the schema inference script path
function getSchemaScriptPath(): string {
  // In packaged app with asarUnpack, python/ is extracted to app.asar.unpacked/
  // __dirname in packaged app = .../Resources/app.asar/dist-electron
  // Unpacked scripts are at .../Resources/app.asar.unpacked/python/

  if (app.isPackaged) {
    // Use the unpacked location (asarUnpack extracts to app.asar.unpacked/)
    const unpackedPath = path.join(__dirname, '..', 'python', 'file_schema.py')
      .replace('app.asar', 'app.asar.unpacked')
    console.log('[FileManager] Checking unpacked path:', unpackedPath, 'exists:', fs.existsSync(unpackedPath))
    if (fs.existsSync(unpackedPath)) {
      return unpackedPath
    }
  }

  // Development: check relative to __dirname
  const devPath = path.join(__dirname, '..', 'python', 'file_schema.py')
  console.log('[FileManager] Checking dev path:', devPath, 'exists:', fs.existsSync(devPath))
  if (fs.existsSync(devPath)) {
    return devPath
  }

  throw new Error('Schema inference script not found')
}

// Determine file format from extension
function getFileFormat(filePath: string): FileFormat | null {
  const ext = path.extname(filePath).toLowerCase()

  switch (ext) {
    case '.csv':
      return 'csv'
    case '.xlsx':
      return 'xlsx'
    case '.xls':
      return 'xls'
    case '.pdf':
      return 'pdf'
    default:
      return null
  }
}

// Interface for schema inference result
interface SchemaInferenceResult {
  success: boolean
  error?: string
  columns?: {
    name: string
    type: string
    originalType: string
    nullable: boolean
  }[]
  rowCount?: number
  preview?: Record<string, unknown>[]
}

// Infer schema using Python
async function inferSchema(filePath: string): Promise<SchemaInferenceResult> {
  return new Promise((resolve) => {
    try {
      const pythonPath = getPythonPath()
      const scriptPath = getSchemaScriptPath()
      const projectRoot = getProjectRoot()

      const pyProcess = spawn(pythonPath, [scriptPath, filePath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: projectRoot,  // Set working directory to avoid numpy source tree issues
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
      })

      let stdout = ''
      let stderr = ''

      pyProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pyProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      pyProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error: stderr || `Schema inference failed with code ${code}`
          })
          return
        }

        try {
          const result = JSON.parse(stdout)
          resolve({
            success: true,
            columns: result.columns,
            rowCount: result.rowCount,
            preview: result.preview
          })
        } catch (parseError) {
          resolve({
            success: false,
            error: `Failed to parse schema result: ${stdout}`
          })
        }
      })

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to run Python: ${err.message}`
        })
      })

      // Timeout after 30 seconds
      setTimeout(() => {
        pyProcess.kill()
        resolve({
          success: false,
          error: 'Schema inference timed out'
        })
      }, 30000)
    } catch (error) {
      resolve({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
}

// Upload a file
export async function uploadFile(sourcePath: string, displayName?: string): Promise<{
  success: boolean
  file?: UploadedFile
  error?: string
}> {
  try {
    // Check if file exists
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'File not found' }
    }

    // Check file format
    const format = getFileFormat(sourcePath)
    if (!format) {
      return { success: false, error: 'Unsupported file format. Only CSV and Excel files are supported.' }
    }

    // Get file stats
    const stats = fs.statSync(sourcePath)

    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024
    if (stats.size > maxSize) {
      return { success: false, error: 'File too large. Maximum size is 100MB.' }
    }

    // Generate unique ID and destination path
    const fileId = crypto.randomUUID()
    const originalName = path.basename(sourcePath)
    const ext = path.extname(originalName)
    const destPath = path.join(getFilesDirectory(), `${fileId}${ext}`)

    // Copy file to storage directory
    fs.copyFileSync(sourcePath, destPath)

    // Create file record
    const file: UploadedFile = {
      id: fileId,
      name: displayName || originalName.replace(ext, ''),
      originalName,
      format,
      size: stats.size,
      // File parsing happens on demand when AI/tools request a preview.
      // Upload should only store the file to keep ingestion fast and robust.
      rowCount: 0,
      uploadedAt: Date.now(),
      filePath: destPath,
      columns: []
    }

    // Save to store
    saveFile(file)

    return { success: true, file }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload file'
    return { success: false, error: message }
  }
}

// Delete a file
export async function deleteUploadedFile(fileId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const file = getFile(fileId)
    if (!file) {
      return { success: false, error: 'File not found' }
    }

    // Delete physical file
    if (fs.existsSync(file.filePath)) {
      fs.unlinkSync(file.filePath)
    }

    // Delete from store
    deleteFileFromStore(fileId)

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete file'
    return { success: false, error: message }
  }
}

// Sheet preview data for multi-sheet Excel files
export interface SheetPreview {
  name: string
  columns: string[]
  rowCount: number
  rows: Record<string, unknown>[]
}

// Get file preview
export async function getFilePreview(fileId: string, limit = 100): Promise<{
  success: boolean
  columns?: string[]
  rows?: Record<string, unknown>[]
  sheets?: SheetPreview[]
  sheetNames?: string[]
  error?: string
}> {
  try {
    const file = getFile(fileId)
    if (!file) {
      return { success: false, error: 'File not found' }
    }

    if (!fs.existsSync(file.filePath)) {
      return { success: false, error: 'File not found on disk' }
    }

    // Use Python to read preview
    return new Promise((resolve) => {
      const pythonPath = getPythonPath()
      const scriptPath = getSchemaScriptPath()
      const projectRoot = getProjectRoot()

      const pyProcess = spawn(pythonPath, [scriptPath, file.filePath, '--preview', String(limit)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: projectRoot,  // Set working directory to avoid numpy source tree issues
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
      })

      let stdout = ''
      let stderr = ''

      pyProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pyProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      pyProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error: stderr || `Preview failed with code ${code}`
          })
          return
        }

        try {
          const result = JSON.parse(stdout)
          const response: {
            success: boolean
            columns: string[]
            rows: Record<string, unknown>[]
            sheets?: SheetPreview[]
            sheetNames?: string[]
          } = {
            success: true,
            columns: result.columns?.map((c: { name: string }) => c.name) || [],
            rows: result.preview || []
          }

          // Pass through multi-sheet data for Excel files
          if (result.sheets && result.sheetNames) {
            response.sheets = result.sheets.map((s: { name: string; columns: { name: string }[]; rowCount: number; preview: Record<string, unknown>[] }) => ({
              name: s.name,
              columns: s.columns.map(c => c.name),
              rowCount: s.rowCount,
              rows: s.preview || []
            }))
            response.sheetNames = result.sheetNames
          }

          resolve(response)
        } catch {
          resolve({
            success: false,
            error: 'Failed to parse preview result'
          })
        }
      })

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to run Python: ${err.message}`
        })
      })
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get preview'
    return { success: false, error: message }
  }
}

// Result type for Excel-to-CSV conversion
export interface ExcelCSVSheet {
  name: string
  csv: string
  rowCount: number
}

export interface ExcelCSVResult {
  success: boolean
  sheets?: ExcelCSVSheet[]
  error?: string
}

// Convert Excel file to CSV text (all sheets)
export async function getExcelAsCSV(fileId: string): Promise<ExcelCSVResult> {
  try {
    const file = getFile(fileId)
    if (!file) {
      return { success: false, error: 'File not found' }
    }

    if (!fs.existsSync(file.filePath)) {
      return { success: false, error: 'File not found on disk' }
    }

    return new Promise((resolve) => {
      const pythonPath = getPythonPath()
      const scriptPath = getSchemaScriptPath()
      const projectRoot = getProjectRoot()

      const pyProcess = spawn(pythonPath, [scriptPath, file.filePath, '--as-csv'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: projectRoot,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }
      })

      let stdout = ''
      let stderr = ''

      pyProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pyProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      pyProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error: stderr || `CSV conversion failed with code ${code}`
          })
          return
        }

        try {
          const result = JSON.parse(stdout)
          resolve({
            success: true,
            sheets: result.sheets
          })
        } catch {
          resolve({
            success: false,
            error: 'Failed to parse CSV conversion result'
          })
        }
      })

      pyProcess.on('error', (err) => {
        resolve({
          success: false,
          error: `Failed to run Python: ${err.message}`
        })
      })

      // Timeout after 60 seconds (longer than schema inference since full data is read)
      setTimeout(() => {
        pyProcess.kill()
        resolve({
          success: false,
          error: 'CSV conversion timed out'
        })
      }, 60000)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to convert Excel to CSV'
    return { success: false, error: message }
  }
}

// List all uploaded files
export function listFiles(): UploadedFile[] {
  return getAllFiles()
}

// Get a single file
export function getUploadedFile(fileId: string): UploadedFile | undefined {
  return getFile(fileId)
}

// Clean up orphaned files (files on disk not in store)
export function cleanupOrphanedFiles(): void {
  const filesDir = getFilesDirectory()
  const storedFiles = getAllFiles()
  const storedPaths = new Set(storedFiles.map(f => f.filePath))

  try {
    const files = fs.readdirSync(filesDir)
    for (const file of files) {
      const filePath = path.join(filesDir, file)
      if (!storedPaths.has(filePath)) {
        fs.unlinkSync(filePath)
        console.log(`Cleaned up orphaned file: ${file}`)
      }
    }
  } catch (error) {
    console.error('Error cleaning up orphaned files:', error)
  }
}
