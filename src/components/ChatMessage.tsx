import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Button } from './ui/button'
import { ChevronDown, ChevronRight, Copy, Check, FileText, Play } from 'lucide-react'
import type { ConversationMessage, UploadedFile } from '@/stores/app-store'

interface ChatMessageProps {
  message: ConversationMessage
  onQuickAction?: (action: string) => void
}

export function ChatMessage({ message, onQuickAction }: ChatMessageProps) {
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const [attachedFiles, setAttachedFiles] = useState<UploadedFile[]>([])

  const isUser = message.role === 'user'
  
  // Load file information for attachments
  useEffect(() => {
    if (message.fileIds && message.fileIds.length > 0) {
      window.electron.files.list().then((result) => {
        if (result.success) {
          const files = result.files.filter(f => message.fileIds!.includes(f.id))
          setAttachedFiles(files)
        }
      }).catch(() => {
        // Ignore errors
      })
    } else {
      setAttachedFiles([])
    }
  }, [message.fileIds])

  const handleCopyCode = async () => {
    if (message.code) {
      await navigator.clipboard.writeText(message.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={cn(
        'flex gap-2 view-enter',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Content */}
      <div
        className={cn(
          'min-w-0 flex flex-col',
          isUser ? 'items-end max-w-[85%]' : 'items-start flex-1'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-3 py-2 max-w-full overflow-hidden',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted/60 border border-border/40'
          )}
        >
          {isUser ? (
            <>
              <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed text-left">{message.content}</p>
              {attachedFiles.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {attachedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-primary-foreground/15 rounded text-[11px]"
                    >
                      <FileText className="h-2.5 w-2.5" />
                      <span className="truncate max-w-[100px]">{file.originalName}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="text-[13px] prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&_code]:text-[12px] [&_code]:bg-muted [&_code]:text-foreground [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-zinc-900 [&_pre]:text-zinc-300 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:text-[12px] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit [&_table]:text-[12px] [&_table]:border-collapse [&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/50 [&_th]:font-medium [&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Quick action buttons */}
        {!isUser && message.quickActions && message.quickActions.length > 0 && onQuickAction && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.quickActions.map((action) => {
              const isPlanAccept = action === 'Accept plan and build'
              return (
                <Button
                  key={action}
                  variant={isPlanAccept ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-7 px-3 text-[12px]',
                    isPlanAccept && 'gap-1.5'
                  )}
                  onClick={() => onQuickAction(action)}
                >
                  {isPlanAccept && <Play className="h-3 w-3" />}
                  {action}
                </Button>
              )
            })}
          </div>
        )}

        {/* Error display */}
        {message.error && (
          <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-destructive/8 border border-destructive/15 text-destructive text-[12px] max-h-20 overflow-y-auto" style={{ overflowWrap: 'anywhere' }}>
            {message.error}
          </div>
        )}

        {/* Code block (for assistant messages) */}
        {!isUser && message.code && (
          <div className="mt-1.5">
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
              onClick={() => setShowCode(!showCode)}
            >
              {showCode ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {showCode ? 'Hide editable Python code' : 'View editable Python code'}
            </button>

            {showCode && (
              <div className="mt-1.5 relative scale-in">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1.5 right-1.5 h-6 w-6 text-zinc-400 hover:text-zinc-200"
                  onClick={handleCopyCode}
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <pre className="p-3 pr-10 rounded-lg bg-zinc-900 text-zinc-300 text-[11px] leading-relaxed overflow-auto max-h-56 border border-zinc-800">
                  <code>{message.code}</code>
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Timestamp */}
        <p className="text-[10px] text-muted-foreground/40 mt-1 select-none">
          {formatTime(message.timestamp)}
        </p>
      </div>

    </div>
  )
}
