import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { X, Loader2, Check, Eye, EyeOff, Key, Trash2, Clock, ExternalLink } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Execution timeout settings
  const [executionTimeout, setExecutionTimeout] = useState(600)
  const [timeoutSaving, setTimeoutSaving] = useState(false)

  // Check if API key exists and load settings on open
  useEffect(() => {
    if (isOpen) {
      checkApiKey()
      loadSettings()
      setApiKey('')
      setError(null)
      setSuccess(null)
      setShowKey(false)
    }
  }, [isOpen])

  const checkApiKey = async () => {
    try {
      const hasKey = await window.electron.settings.hasApiKey()
      setHasExistingKey(hasKey)
    } catch (err) {
      console.error('Failed to check API key:', err)
    }
  }

  const loadSettings = async () => {
    try {
      const timeout = await window.electron.settings.getExecutionTimeout()
      setExecutionTimeout(timeout)
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }

  const handleTimeoutChange = async (value: number) => {
    // Clamp between 10 seconds and 10 minutes (600 seconds)
    const clamped = Math.max(10, Math.min(600, value))
    setExecutionTimeout(clamped)
    setTimeoutSaving(true)
    try {
      await window.electron.settings.setExecutionTimeout(clamped)
    } catch (err) {
      console.error('Failed to save timeout:', err)
    } finally {
      setTimeoutSaving(false)
    }
  }

  if (!isOpen) return null

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key')
      return
    }

    setIsValidating(true)
    setError(null)
    setSuccess(null)

    try {
      // Validate the API key
      const isValid = await window.electron.claude.validateKey(apiKey.trim())

      if (!isValid) {
        setError('Invalid API key. Please check and try again.')
        setIsValidating(false)
        return
      }

      setIsValidating(false)
      setIsSaving(true)

      // Save the API key
      await window.electron.settings.setApiKey(apiKey.trim())
      setHasExistingKey(true)
      setApiKey('')
      setSuccess('API key saved successfully!')

      // Close after a short delay
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key')
    } finally {
      setIsValidating(false)
      setIsSaving(false)
    }
  }

  const handleClear = async () => {
    if (!confirm('Are you sure you want to remove your API key?')) {
      return
    }

    try {
      await window.electron.settings.clearApiKey()
      setHasExistingKey(false)
      setSuccess('API key removed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear API key')
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={isValidating || isSaving ? undefined : onClose}
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
              disabled={isValidating || isSaving}
            >
              <X className="h-4 w-4" />
            </Button>
            <CardTitle className="text-xl">Settings</CardTitle>
            <CardDescription>
              Manage your Anthropic API key and execution settings
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* BYOK explainer */}
            <div className="p-3 rounded-lg bg-muted/50 border space-y-1">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Bring your own key</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Lumyr runs entirely on your machine. Your key is stored encrypted locally and
                used to call the Anthropic API directly — nothing is sent to any Lumyr server.
                You are billed by Anthropic for your own usage.
              </p>
            </div>

            {/* API Key Section */}
            <>
              {/* API Key Status */}
              {hasExistingKey && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <Check className="h-4 w-4" />
                    <span className="text-sm font-medium">Anthropic API key configured</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleClear}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              )}

              {/* API Key Input */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {hasExistingKey ? 'Update API key' : 'Anthropic API key'}
                </label>
                <div className="relative">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-ant-..."
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value)
                      setError(null)
                    }}
                    disabled={isValidating || isSaving}
                    className="pr-10"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowKey(!showKey)}
                    disabled={isValidating || isSaving}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a key at{' '}
                  <button
                    type="button"
                    className="text-primary hover:underline inline-flex items-center gap-0.5"
                    onClick={() => window.electron.openExternal('https://console.anthropic.com/settings/keys')}
                  >
                    console.anthropic.com
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </p>
              </div>

              {/* Save Button */}
              <Button
                className="w-full"
                onClick={handleSave}
                disabled={isValidating || isSaving || !apiKey.trim()}
              >
                {isValidating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Validating...
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    {hasExistingKey ? 'Update API Key' : 'Save API Key'}
                  </>
                )}
              </Button>
            </>

            {/* Divider */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Code Execution Settings
              </h3>

              {/* Execution Timeout */}
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">
                  Execution Timeout (seconds)
                </label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={10}
                    max={600}
                    value={executionTimeout}
                    onChange={(e) => handleTimeoutChange(parseInt(e.target.value) || 60)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">
                    {executionTimeout >= 60
                      ? `${Math.floor(executionTimeout / 60)}m ${executionTimeout % 60}s`
                      : `${executionTimeout}s`}
                  </span>
                  {timeoutSaving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  How long to wait for dashboard execution and final verification to finish (10s - 10min)
                </p>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Success Display */}
            {success && (
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm flex items-center gap-2">
                <Check className="h-4 w-4" />
                {success}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>,
    document.body
  )
}
