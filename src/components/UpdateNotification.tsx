import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Download, RefreshCw, X, Loader2, CheckCircle } from 'lucide-react'
import type { UpdateStatus } from '@/types/electron'

export function UpdateNotification() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isInstalling, setIsInstalling] = useState(false)

  useEffect(() => {
    // Listen for update status events
    window.electron.updater.onStatus((status) => {
      setUpdateStatus(status)
      // Reset dismissed when a new update becomes available
      if (status.status === 'available') {
        setDismissed(false)
        setIsDownloading(false)
      }
      // Clear loading states when status changes
      if (status.status === 'downloading') {
        setIsDownloading(false)
      }
      if (status.status === 'downloaded') {
        setIsInstalling(false)
      }
    })
  }, [])

  // Don't show anything if dismissed or no relevant status
  if (dismissed) return null
  if (!updateStatus) return null
  if (updateStatus.status === 'checking' || updateStatus.status === 'not-available') return null

  const handleDownload = () => {
    setIsDownloading(true)
    window.electron.updater.download()
  }

  const handleInstall = () => {
    setIsInstalling(true)
    window.electron.updater.install()
  }

  const handleDismiss = () => {
    setDismissed(true)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-background border rounded-lg shadow-lg p-4">
        {/* Update available */}
        {updateStatus.status === 'available' && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium text-sm">Update Available</p>
                  <p className="text-xs text-muted-foreground">
                    Version {updateStatus.info?.version} is ready to download
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleDownload} disabled={isDownloading} className="flex-1">
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Download'
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDismiss} disabled={isDownloading}>
                Later
              </Button>
            </div>
          </>
        )}

        {/* Downloading */}
        {updateStatus.status === 'downloading' && (
          <>
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <div className="flex-1">
                <p className="font-medium text-sm">Downloading Update</p>
                <p className="text-xs text-muted-foreground">
                  {updateStatus.progress ? `${Math.round(updateStatus.progress.percent)}%` : 'Starting...'}
                </p>
              </div>
            </div>
            {updateStatus.progress && (
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${updateStatus.progress.percent}%` }}
                />
              </div>
            )}
          </>
        )}

        {/* Downloaded - ready to install */}
        {updateStatus.status === 'downloaded' && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium text-sm">Update Ready</p>
                  <p className="text-xs text-muted-foreground">
                    Restart to install version {updateStatus.info?.version}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall} disabled={isInstalling} className="flex-1">
                {isInstalling ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Installing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Restart Now
                  </>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDismiss} disabled={isInstalling}>
                Later
              </Button>
            </div>
          </>
        )}

        {/* Error */}
        {updateStatus.status === 'error' && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm text-destructive">Update Error</p>
                <p className="text-xs text-muted-foreground">
                  {updateStatus.error || 'Failed to check for updates'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleDismiss}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
