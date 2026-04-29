'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface CompanyLogoProps {
  companyName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function getDomainFromName(name: string): string {
  // Common company name to domain mappings
  const knownDomains: Record<string, string> = {
    'stripe': 'stripe.com',
    'anthropic': 'anthropic.com',
    'cursor': 'cursor.com',
    'mintlify': 'mintlify.com',
    'artisan': 'artisan.co',
    'vercel': 'vercel.com',
    'google': 'google.com',
    'meta': 'meta.com',
    'microsoft': 'microsoft.com',
    'apple': 'apple.com',
    'amazon': 'amazon.com',
    'netflix': 'netflix.com',
    'openai': 'openai.com',
    'coinbase': 'coinbase.com',
    'square': 'squareup.com',
  }

  const lowerName = name.toLowerCase().trim()
  if (knownDomains[lowerName]) {
    return knownDomains[lowerName]
  }

  // Try to construct a domain from the company name
  const cleanName = lowerName.replace(/[^a-z0-9]/g, '')
  return `${cleanName}.com`
}

export function CompanyLogo({ companyName, size = 'md', className }: CompanyLogoProps) {
  const [hasError, setHasError] = useState(false)
  const domain = getDomainFromName(companyName)
  const initial = companyName.charAt(0).toUpperCase()

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }

  if (hasError) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-md border border-[rgba(16,15,15,0.06)] bg-[#F0F0EA] font-serif italic text-[rgba(16,15,15,0.64)]',
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
        'flex items-center justify-center rounded-md border border-[rgba(16,15,15,0.06)] bg-white p-0.5 overflow-hidden',
        sizeClasses[size],
        className
      )}
    >
      <img
        src={`https://logo.clearbit.com/${domain}`}
        alt={companyName}
        className="w-full h-full object-contain"
        onError={() => setHasError(true)}
      />
    </div>
  )
}
