import { createPortal } from 'react-dom'
import { useAppStore } from '@/stores/app-store'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Database, Loader2, CheckCircle2, Circle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type DashboardLoadingStep = 'switching_connection' | 'loading_schema' | 'loading_dashboard' | 'starting_streamlit'

const STEPS: { step: DashboardLoadingStep; label: string }[] = [
  { step: 'switching_connection', label: 'Switching connection' },
  { step: 'loading_schema', label: 'Loading schema' },
  { step: 'loading_dashboard', label: 'Loading dashboard' },
  { step: 'starting_streamlit', label: 'Starting dashboard' },
]

export function DashboardLoadingOverlay() {
  const dashboardLoadingState = useAppStore((s) => s.dashboardLoadingState)
  const setDashboardLoading = useAppStore((s) => s.setDashboardLoading)

  if (!dashboardLoadingState) return null

  const { isLoading, connectionName, step, error } = dashboardLoadingState

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-sm mx-4">
        <Card className="shadow-2xl">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Loading Dashboard</CardTitle>
                {connectionName && (
                  <p className="text-xs text-muted-foreground mt-0.5">{connectionName}</p>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {error ? (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setDashboardLoading(null)}
                >
                  Dismiss
                </Button>
              </div>
            ) : (
              <div className="space-y-3 pl-1">
                {STEPS.map(({ step: s, label }) => {
                  const currentIdx = step ? STEPS.findIndex(x => x.step === step) : -1
                  const stepIdx = STEPS.findIndex(x => x.step === s)
                  const isComplete = stepIdx < currentIdx
                  const isActive = stepIdx === currentIdx && isLoading

                  return (
                    <div key={s} className="flex items-center gap-3">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                      )}
                      <span className={cn(
                        'text-sm',
                        isComplete && 'text-emerald-600 dark:text-emerald-400 font-medium',
                        isActive && 'text-foreground font-medium',
                        !isComplete && !isActive && 'text-muted-foreground/50'
                      )}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body
  )
}
