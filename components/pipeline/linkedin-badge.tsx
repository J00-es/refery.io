'use client'

import { cn } from '@/lib/utils'

interface LinkedInBadgeProps {
  url: string
  className?: string
  size?: 'sm' | 'md'
}

export function LinkedInBadge({ url, className, size = 'md' }: LinkedInBadgeProps) {
  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-[11px]',
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center justify-center bg-[#0A66C2] text-white font-bold rounded transition-all hover:opacity-85 hover:-translate-y-0.5',
        sizeClasses[size],
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      in
    </a>
  )
}
