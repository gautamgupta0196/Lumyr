import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/app-store'
import { Button } from './ui/button'
import { RefreshCw, ExternalLink, X, RotateCcw } from 'lucide-react'

interface DashboardViewerProps {
  port: number
  isVisible: boolean
}

export function DashboardViewer({ port, isVisible }: DashboardViewerProps) {
  const streamlitError = useAppStore((state) => state.streamlit.error)
  const stopped = useAppStore((state) => state.streamlit.stopped)
  const generatedCode = useAppStore((state) => state.generation.generatedCode)
  const setStreamlit = useAppStore((state) => state.setStreamlit)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  const [isRestarting, setIsRestarting] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const resizeTimeoutsRef = useRef<NodeJS.Timeout[]>([])
  const hasLoadedRef = useRef(false)
  const hasAutoRefreshedRef = useRef(false)
  const autoRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const url = `http://localhost:${port}`

  const hasRenderableViewport = useCallback(() => {
    const container = containerRef.current
    return !!container && container.clientWidth > 0 && container.clientHeight > 0
  }, [])

  const dispatchResizePulse = useCallback(() => {
    resizeTimeoutsRef.current.forEach(clearTimeout)
    resizeTimeoutsRef.current = []

    const delays = [0, 120, 300, 700]
    delays.forEach((delay) => {
      const timeout = setTimeout(() => {
        try {
          const win = iframeRef.current?.contentWindow
          if (win) {
            win.dispatchEvent(new Event('resize'))
          }
        } catch {
          // cross-origin or destroyed — ignore
        }
      }, delay)

      resizeTimeoutsRef.current.push(timeout)
    })
  }, [])

  const scheduleVisibleAutoRefresh = useCallback(() => {
    if (hasAutoRefreshedRef.current || !isVisible || !hasRenderableViewport()) {
      return
    }

    if (autoRefreshTimeoutRef.current) {
      clearTimeout(autoRefreshTimeoutRef.current)
    }

    autoRefreshTimeoutRef.current = setTimeout(() => {
      if (hasAutoRefreshedRef.current || !isVisible || !hasRenderableViewport()) {
        return
      }

      hasAutoRefreshedRef.current = true
      hasLoadedRef.current = false
      setKey((k) => k + 1)
      // Keep the current dashboard visible while the iframe silently reloads.
    }, 250)
  }, [hasRenderableViewport, isVisible])

  useEffect(() => {
    if (stopped) return
    setIsLoading(true)
    setLoadError(null)
    hasLoadedRef.current = false
    hasAutoRefreshedRef.current = false

    // Clear any existing timeout
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }

    // Set a timeout to detect if iframe fails to load
    // Only show error if still loading after timeout
    loadTimeoutRef.current = setTimeout(() => {
      if (!hasLoadedRef.current) {
        setLoadError('Dashboard failed to load. Please check if Streamlit is running.')
        setIsLoading(false)
      }
    }, 15000) // 15 second timeout (increased from 10s)

    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current)
        loadTimeoutRef.current = null
      }
      if (autoRefreshTimeoutRef.current) {
        clearTimeout(autoRefreshTimeoutRef.current)
        autoRefreshTimeoutRef.current = null
      }
      resizeTimeoutsRef.current.forEach(clearTimeout)
      resizeTimeoutsRef.current = []
    }
  }, [port, stopped])

  // ResizeObserver on the iframe's parent container — when the container resizes
  // (sidebar toggle, layout shift), dispatch resize to the iframe so Plotly reflows.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      dispatchResizePulse()
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [dispatchResizePulse])

  useEffect(() => {
    if (!isVisible || stopped || !hasLoadedRef.current || !hasRenderableViewport()) {
      return
    }

    dispatchResizePulse()
    scheduleVisibleAutoRefresh()
  }, [dispatchResizePulse, hasRenderableViewport, isVisible, scheduleVisibleAutoRefresh, stopped])

  const handleRefresh = () => {
    // Clear timeouts and reset loaded state
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current)
      loadTimeoutRef.current = null
    }
    if (autoRefreshTimeoutRef.current) {
      clearTimeout(autoRefreshTimeoutRef.current)
      autoRefreshTimeoutRef.current = null
    }
    resizeTimeoutsRef.current.forEach(clearTimeout)
    resizeTimeoutsRef.current = []
    hasLoadedRef.current = false
    setKey((k) => k + 1)
    setIsLoading(true)
    setLoadError(null)
  }

  const handleOpenExternal = () => {
    window.electron.openExternal(url)
  }

  const handleClose = async () => {
    await window.electron.streamlit.stop()
    setStreamlit({
      isRunning: false,
      port: null,
      error: null,
      output: [],
      stopped: false
    })
  }

  const handleRestart = async () => {
    if (!generatedCode || isRestarting) return
    setIsRestarting(true)
    try {
      const result = await window.electron.streamlit.runCode(generatedCode)
      if (result.success && result.port) {
        setStreamlit({ isRunning: true, port: result.port, error: null })
        setKey((k) => k + 1)
      }
    } catch (error) {
      console.error('Failed to restart Streamlit:', error)
    } finally {
      setIsRestarting(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="h-9 border-b glass-toolbar flex items-center justify-between px-3">
        <div className="flex items-center gap-2">
          {stopped ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[11px] text-muted-foreground">
                Stopped
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_hsl(152_60%_42%)]" />
              <span className="text-[11px] text-muted-foreground">
                localhost:{port}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {stopped && generatedCode && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={handleRestart}
              disabled={isRestarting}
              title="Restart dashboard"
            >
              <RotateCcw className={`h-3 w-3 ${isRestarting ? 'animate-spin' : ''}`} />
              {isRestarting ? 'Restarting...' : 'Restart'}
            </Button>
          )}
          {!stopped && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                onClick={handleRefresh}
                title="Refresh"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                onClick={handleOpenExternal}
                title="Open in browser"
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground/60 hover:text-destructive"
                onClick={handleClose}
                title="Stop dashboard"
              >
                <X className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Iframe */}
      <div ref={containerRef} className="flex-1 relative">
        {stopped && (
          <div className="absolute inset-0 z-10 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <X className="h-5 w-5 text-red-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Dashboard stopped</p>
              <p className="text-xs text-muted-foreground mt-1">The Streamlit process exited unexpectedly</p>
            </div>
            {generatedCode && (
              <Button
                size="sm"
                onClick={handleRestart}
                disabled={isRestarting}
                className="gap-1.5"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${isRestarting ? 'animate-spin' : ''}`} />
                {isRestarting ? 'Restarting...' : 'Restart Dashboard'}
              </Button>
            )}
          </div>
        )}
        {isLoading && !stopped && (
          <div className="absolute inset-0 bg-background p-6">
            <div className="h-full w-full rounded-lg border bg-card p-5 space-y-4">
              <div className="h-3 w-1/4 rounded skeleton-shimmer" />
              <div className="h-2.5 w-1/3 rounded skeleton-shimmer" />
              <div className="flex gap-4 pt-2">
                <div className="flex-1 h-32 rounded-lg skeleton-shimmer" />
                <div className="flex-1 h-32 rounded-lg skeleton-shimmer" style={{ animationDelay: '200ms' }} />
                <div className="flex-1 h-32 rounded-lg skeleton-shimmer" style={{ animationDelay: '400ms' }} />
              </div>
              <div className="h-48 w-full rounded-lg skeleton-shimmer" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        {!stopped && (
          <iframe
            ref={iframeRef}
            key={key}
            src={url}
            className="w-full h-full dashboard-iframe"
            onLoad={() => {
              hasLoadedRef.current = true
              if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current)
                loadTimeoutRef.current = null
              }
              setIsLoading(false)
              setLoadError(null)
              dispatchResizePulse()

              // Auto-refresh only once the iframe is actually visible/measurable.
              // Hidden first-loads can autosize Plotly against a zero-sized viewport.
              scheduleVisibleAutoRefresh()
            }}
            onError={() => {
              hasLoadedRef.current = true
              if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current)
                loadTimeoutRef.current = null
              }
              setLoadError('Failed to load dashboard. Please check the console for errors.')
              setIsLoading(false)
            }}
            title="Streamlit Dashboard"
          />
        )}
      </div>

      {/* Error display */}
      {(streamlitError || loadError) && !stopped && (
        <div className="px-3 py-2 bg-destructive/8 border-t border-destructive/15 text-destructive text-[12px] flex items-center gap-2">
          <span className="font-medium">Error:</span> {streamlitError || loadError}
        </div>
      )}
    </div>
  )
}
