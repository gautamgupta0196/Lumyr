import { useState, useCallback } from 'react'
import { useAppStore } from '../stores/app-store'
import { useShallow } from 'zustand/react/shallow'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import {
  FileSpreadsheet,
  Upload,
  Trash2,
  Eye,
  X,
  FileText,
  Table as TableIcon,
  AlertCircle,
  CheckCircle2
} from 'lucide-react'
import { cn } from '../lib/utils'

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Format date
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// File type icon
function FileIcon({ format }: { format: string }) {
  if (format === 'csv') {
    return <FileText className="h-5 w-5 text-green-500" />
  }
  return <FileSpreadsheet className="h-5 w-5 text-blue-500" />
}

export function FilesPanel() {
  const {
    dashboardFiles,
    isUploadingFile,
    addDashboardFile,
    removeDashboardFile,
    setIsUploadingFile
  } = useAppStore(useShallow((state) => ({
    dashboardFiles: state.dashboardFiles,
    isUploadingFile: state.isUploadingFile,
    addDashboardFile: state.addDashboardFile,
    removeDashboardFile: state.removeDashboardFile,
    setIsUploadingFile: state.setIsUploadingFile
  })))

  const [isDragOver, setIsDragOver] = useState(false)
  const [previewFile, setPreviewFile] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: Record<string, unknown>[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const formatActionableError = (action: string, details: string) =>
    `${action}. Check the file format and size, then try again. If it still fails, remove the file and re-add it from source. Details: ${details}`

  // Handle file upload
  const handleUpload = async (filePaths: string[]) => {
    setError(null)
    setIsUploadingFile(true)

    try {
      for (const filePath of filePaths) {
        const result = await window.electron.files.upload(filePath)
        if (result.success && result.file) {
          addDashboardFile(result.file)
          setSuccessMessage(`Uploaded ${result.file.name}`)
          setTimeout(() => setSuccessMessage(null), 3000)
        } else {
          setError(formatActionableError('Upload failed', result.error || 'Unable to upload this file'))
        }
      }
    } catch (err) {
      setError(formatActionableError('Upload failed', err instanceof Error ? err.message : 'Unexpected upload error'))
    } finally {
      setIsUploadingFile(false)
    }
  }

  // Handle file selection via dialog
  const handleSelectFiles = async () => {
    try {
      const result = await window.electron.files.selectFiles()
      if (result.success && result.filePaths) {
        await handleUpload(result.filePaths)
      }
    } catch (err) {
      setError(formatActionableError('Could not open the file picker', err instanceof Error ? err.message : 'Unexpected file picker error'))
    }
  }

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const validFiles = files.filter(f =>
      f.name.endsWith('.csv') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.pdf')
    )

    if (validFiles.length === 0) {
      setError('Only CSV, Excel, or PDF files are supported. Choose a supported file type, then try dropping it again.')
      return
    }

    // Note: In Electron, we need to get the file path differently
    // The DataTransfer object in Electron provides the path property
    const filePaths = validFiles.map(f => (f as unknown as { path: string }).path).filter(Boolean)
    if (filePaths.length > 0) {
      await handleUpload(filePaths)
    }
  }, [])

  // Handle file deletion
  const handleDelete = async (fileId: string) => {
    try {
      const result = await window.electron.files.delete(fileId)
      if (result.success) {
        removeDashboardFile(fileId)
      } else {
        setError(formatActionableError('Could not remove the file', result.error || 'Unable to delete this file'))
      }
    } catch (err) {
      setError(formatActionableError('Could not remove the file', err instanceof Error ? err.message : 'Unexpected delete error'))
    }
  }

  // Handle file preview
  const handlePreview = async (fileId: string) => {
    setPreviewLoading(true)
    setPreviewFile(fileId)

    try {
      const result = await window.electron.files.preview(fileId, 100)
      if (result.success) {
        setPreviewData({
          columns: result.columns || [],
          rows: result.rows || []
        })
      } else {
        setError(formatActionableError('Preview could not be loaded', result.error || 'Unable to load preview data'))
        setPreviewFile(null)
      }
    } catch (err) {
      setError(formatActionableError('Preview could not be loaded', err instanceof Error ? err.message : 'Unexpected preview error'))
      setPreviewFile(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  // Close preview
  const closePreview = () => {
    setPreviewFile(null)
    setPreviewData(null)
  }

  return (
    <div className="h-full flex flex-col p-5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight">Data Files</h2>
        <Button variant="outline" size="sm" onClick={handleSelectFiles} disabled={isUploadingFile} className="h-7 text-[12px]">
          <Upload className="h-3 w-3 mr-1.5" />
          Browse
        </Button>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-3 px-3 py-2 bg-destructive/8 border border-destructive/15 rounded-lg flex items-center gap-2 text-destructive slide-down">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-[12px] flex-1">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto hover:text-destructive/80">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="mb-3 px-3 py-2 bg-emerald-500/8 border border-emerald-500/15 rounded-lg flex items-center gap-2 text-emerald-600 dark:text-emerald-400 slide-down">
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="text-[12px]">{successMessage}</span>
        </div>
      )}

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 text-center transition-all duration-150 mb-4",
          isDragOver
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-border/60 hover:border-muted-foreground/40"
        )}
      >
        <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-[13px] font-medium">Drop files to upload</p>
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          .csv, .xlsx, .xls, .pdf — max 100 MB
        </p>
        <Button
          onClick={handleSelectFiles}
          disabled={isUploadingFile}
          size="sm"
          className="mt-3 h-8 text-[12px]"
        >
          <Upload className="h-3 w-3 mr-1.5" />
          Upload Files
        </Button>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-auto">
        {dashboardFiles.length === 0 ? (
          isUploadingFile ? (
            <div className="py-6 space-y-3 animate-pulse">
              <div className="h-5 w-40 rounded bg-muted mx-auto" />
              <div className="h-16 w-full rounded bg-muted/70" />
              <div className="h-16 w-full rounded bg-muted/60" />
            </div>
          ) : (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No files uploaded yet</p>
            <p className="text-sm">Click <strong>Upload Files</strong> to add your first dataset, then ask for a chart in the query box.</p>
          </div>
          )
        ) : (
          <div className="space-y-2">
            {dashboardFiles.map((file) => (
              <Card key={file.id} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <FileIcon format={file.format} />

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatFileSize(file.size)}</span>
                        <span>•</span>
                        <span>{file.rowCount.toLocaleString()} rows</span>
                        <span>•</span>
                        <span>{file.columns.length} columns</span>
                        <span>•</span>
                        <span>{formatDate(file.uploadedAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreview(file.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(file.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Column preview on hover */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {file.columns.slice(0, 6).map((col, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 bg-muted rounded text-xs"
                        title={`${col.name} (${col.type})`}
                      >
                        {col.name}
                      </span>
                    ))}
                    {file.columns.length > 6 && (
                      <span className="px-2 py-0.5 text-xs text-muted-foreground">
                        +{file.columns.length - 6} more
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closePreview} />

          <Card className="relative z-10 w-full max-w-4xl max-h-[80vh] mx-4 flex flex-col">
            <CardHeader className="flex-shrink-0 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TableIcon className="h-5 w-5" />
                Data Preview
              </CardTitle>
              <button onClick={closePreview}>
                <X className="h-5 w-5" />
              </button>
            </CardHeader>

            <CardContent className="flex-1 overflow-auto">
              {previewLoading ? (
                <div className="py-6 space-y-3 animate-pulse">
                  <div className="h-8 w-1/3 rounded bg-muted" />
                  <div className="h-8 w-full rounded bg-muted/70" />
                  <div className="h-8 w-full rounded bg-muted/60" />
                  <div className="h-8 w-5/6 rounded bg-muted/50" />
                </div>
              ) : previewData ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        {previewData.columns.map((col, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium bg-muted">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.rows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="border-b hover:bg-muted/50">
                          {previewData.columns.map((col, colIdx) => (
                            <td key={colIdx} className="px-3 py-2 truncate max-w-xs">
                              {row[col] === null ? (
                                <span className="text-muted-foreground italic">null</span>
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-muted-foreground">No data to display</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
