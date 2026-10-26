import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '@/stores/app-store'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { X, Save, Loader2 } from 'lucide-react'

interface SaveDashboardModalProps {
  isOpen: boolean
  onClose: () => void
  onSaved?: () => void
}

export function SaveDashboardModal({ isOpen, onClose, onSaved }: SaveDashboardModalProps) {
  const { generation, conversation, connection, query, loadSavedDashboards, setActiveDashboard, dashboardFiles } = useAppStore()
  const [name, setName] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a name for the dashboard')
      return
    }

    if (!generation.generatedCode) {
      setError('No dashboard code to save')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const fileIds = dashboardFiles.map(f => f.id)
      const result = await window.electron.dashboards.save({
        name: name.trim(),
        query: query || conversation[0]?.content || 'Dashboard',
        code: generation.generatedCode,
        connectionId: connection.connectionId || 'unknown',
        conversation: conversation,
        fileIds: fileIds.length > 0 ? fileIds : undefined
      })

      if (result.success && result.dashboard) {
        setActiveDashboard(result.dashboard.id)
        await loadSavedDashboards()
        setName('')
        onSaved?.()
        onClose()
      } else if (!result.success) {
        setError(result.error || 'Failed to save dashboard')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save dashboard')
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isSaving ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4">
        <Card className="shadow-2xl">
          <CardHeader className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 h-8 w-8"
              onClick={onClose}
              disabled={isSaving}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardTitle className="text-xl flex items-center gap-2">
              <Save className="h-5 w-5" />
              Save Dashboard
            </CardTitle>
            <CardDescription>
              Save this dashboard to access it later
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Dashboard Name
              </label>
              <Input
                placeholder="e.g., Monthly Sales Report"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSaving}
                autoFocus
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving || !name.trim()}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body
  )
}
