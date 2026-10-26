import { useState } from 'react'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { X, Upload, Loader2, FileText } from 'lucide-react'

interface ImportDashboardModalProps {
  isOpen: boolean
  manifest: {
    name: string
    query: string
    files?: Array<{ originalName: string; format: string }>
  } | null
  zipPath: string
  connections: Array<{ id: string; name: string; projectId?: string }>
  onClose: () => void
  onImported: () => void
}

export function ImportDashboardModal({
  isOpen,
  manifest,
  zipPath,
  connections,
  onClose,
  onImported
}: ImportDashboardModalProps) {
  const [name, setName] = useState(manifest?.name || '')
  const [connectionId, setConnectionId] = useState(connections[0]?.id || 'local-files')
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen || !manifest) return null

  const handleImport = async () => {
    if (!connectionId) {
      setError('Please select a connection')
      return
    }

    setIsImporting(true)
    setError(null)

    try {
      const result = await window.electron.dashboards.importConfirm({
        zipPath,
        connectionId,
        name: name.trim() || undefined
      })

      if (result.success) {
        onImported()
      } else {
        setError(result.error || 'Failed to import dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import dashboard')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isImporting ? undefined : onClose}
      />
      <div className="relative z-10 w-full max-w-md mx-4">
        <Card className="shadow-2xl">
          <CardHeader className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 h-8 w-8"
              onClick={onClose}
              disabled={isImporting}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardTitle className="text-xl flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Dashboard
            </CardTitle>
            <CardDescription>
              Import a dashboard from a ZIP archive
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Dashboard Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={manifest.name}
                disabled={isImporting}
              />
            </div>

            {manifest.files && manifest.files.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Included Files
                </label>
                <div className="space-y-1">
                  {manifest.files.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{file.originalName}</span>
                      <span className="text-xs uppercase text-muted-foreground/70">({file.format})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-2 block">
                Connection <span className="text-destructive">*</span>
              </label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                disabled={isImporting}
              >
                <option value="local-files">Local Files (no database connection)</option>
                {connections.map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.name}{conn.projectId ? ` (${conn.projectId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || !connectionId}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
