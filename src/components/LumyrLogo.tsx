import { cn } from '@/lib/utils'

interface LumyrLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showText?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
}

const textSizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl'
}

export function LumyrLogo({ size = 'md', showText = false, className }: LumyrLogoProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 512 512"
        className={cn(sizeClasses[size], 'flex-shrink-0')}
      >
        <defs>
          <linearGradient id="lumyr-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0f1a2b" />
            <stop offset="100%" stopColor="#070c14" />
          </linearGradient>
          <linearGradient id="lumyr-left" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#5ba3d9" />
          </linearGradient>
          <linearGradient id="lumyr-right" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a8d8ff" />
            <stop offset="100%" stopColor="#2d6a9f" />
          </linearGradient>
          <linearGradient id="lumyr-bottom" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#7fc4f5" />
            <stop offset="100%" stopColor="#1e4a6d" />
          </linearGradient>
        </defs>
        <rect x="16" y="16" width="480" height="480" rx="107" ry="107" fill="url(#lumyr-bg)" />
        <path d="M256 65 L100 375 L256 310 Z" fill="url(#lumyr-left)" />
        <path d="M256 65 L412 375 L256 310 Z" fill="url(#lumyr-right)" />
        <path d="M100 375 L256 310 L412 375 L256 440 Z" fill="url(#lumyr-bottom)" />
      </svg>

      {showText && (
        <span className={cn(
          'font-semibold bg-gradient-to-r from-[#5ba3d9] to-[#a8d8ff] bg-clip-text text-transparent',
          textSizeClasses[size]
        )}>
          Lumyr
        </span>
      )}
    </div>
  )
}
