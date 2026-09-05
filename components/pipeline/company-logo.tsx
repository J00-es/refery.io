'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface CompanyLogoProps {
  companyName: string
  logoUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function CompanyLogo({ companyName, logoUrl, size = 'md', className }: CompanyLogoProps) {
  const [hasError, setHasError] = useState(false)
  const initial = companyName?.charAt(0)?.toUpperCase() || '?'

  const sizeClasses = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  }

  // Generate a consistent background color based on company name
  const getColorFromName = (name: string) => {
    const colors = [
      'bg-blue-100 text-blue-600',
      'bg-emerald-100 text-emerald-600',
      'bg-amber-100 text-amber-600',
      'bg-purple-100 text-purple-600',
      'bg-rose-100 text-rose-600',
      'bg-cyan-100 text-cyan-600',
      'bg-indigo-100 text-indigo-600',
      'bg-teal-100 text-teal-600',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const colorClasses = getColorFromName(companyName || '')

  // Show initials if no logo URL or if logo failed to load
  if (!logoUrl || hasError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md font-semibold shrink-0',
          colorClasses,
          sizeClasses[size],
          className
        )}
      >
        {initial}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md border border-[rgba(22,22,19,0.06)] bg-white p-0.5 overflow-hidden shrink-0',
        sizeClasses[size],
        className
      )}
    >
      <img
        src={logoUrl}
        alt={companyName}
        className="w-full h-full object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  )
}
