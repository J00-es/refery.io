'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Star, StarHalf, ThumbsUp, ThumbsDown, Minus, X, Check } from 'lucide-react'

type Verdict = 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null

interface CandidateVerdictProps {
  candidateId: string
  type: 'recruiter' | 'lily'
  currentVerdict: Verdict
  canEdit?: boolean
  size?: 'sm' | 'md'
  onUpdate?: (verdict: Verdict) => void
}

const verdictConfig = {
  very_strong: {
    label: 'Very Strong',
    shortLabel: 'V.Strong',
    color: 'bg-emerald-500 text-white border-emerald-500',
    hoverColor: 'hover:bg-emerald-100 hover:border-emerald-300 hover:text-emerald-700',
    dotColor: 'bg-emerald-500',
    icon: Star,
  },
  strong: {
    label: 'Strong',
    shortLabel: 'Strong',
    color: 'bg-green-500 text-white border-green-500',
    hoverColor: 'hover:bg-green-100 hover:border-green-300 hover:text-green-700',
    dotColor: 'bg-green-500',
    icon: ThumbsUp,
  },
  moderate: {
    label: 'Moderate',
    shortLabel: 'Moderate',
    color: 'bg-yellow-500 text-white border-yellow-500',
    hoverColor: 'hover:bg-yellow-100 hover:border-yellow-300 hover:text-yellow-700',
    dotColor: 'bg-yellow-500',
    icon: Minus,
  },
  weak: {
    label: 'Weak',
    shortLabel: 'Weak',
    color: 'bg-orange-500 text-white border-orange-500',
    hoverColor: 'hover:bg-orange-100 hover:border-orange-300 hover:text-orange-700',
    dotColor: 'bg-orange-500',
    icon: ThumbsDown,
  },
  pass: {
    label: 'Pass',
    shortLabel: 'Pass',
    color: 'bg-red-500 text-white border-red-500',
    hoverColor: 'hover:bg-red-100 hover:border-red-300 hover:text-red-700',
    dotColor: 'bg-red-500',
    icon: X,
  },
}

const verdictOrder: Verdict[] = ['very_strong', 'strong', 'moderate', 'weak', 'pass']

export function CandidateVerdict({
  candidateId,
  type,
  currentVerdict,
  canEdit = true,
  size = 'md',
  onUpdate,
}: CandidateVerdictProps) {
  const [verdict, setVerdict] = useState<Verdict>(currentVerdict)
  const [saving, setSaving] = useState(false)

  const handleVerdictChange = async (newVerdict: Verdict) => {
    if (!canEdit || saving) return
    
    // Toggle off if clicking the same verdict
    const finalVerdict = verdict === newVerdict ? null : newVerdict
    
    setSaving(true)
    setVerdict(finalVerdict)

    try {
      const res = await fetch(`/api/candidates/${candidateId}/verdict`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          verdict: finalVerdict,
        }),
      })

      if (!res.ok) {
        // Revert on error
        setVerdict(verdict)
        const data = await res.json()
        console.error('Failed to update verdict:', data.error)
      } else {
        onUpdate?.(finalVerdict)
      }
    } catch (error) {
      setVerdict(verdict)
      console.error('Failed to update verdict:', error)
    } finally {
      setSaving(false)
    }
  }

  const isSmall = size === 'sm'

  return (
    <div className={cn(
      "flex flex-wrap gap-1.5",
      isSmall ? "gap-1" : "gap-1.5 sm:gap-2"
    )}>
      {verdictOrder.map((v) => {
        const config = verdictConfig[v]
        const isSelected = verdict === v
        const Icon = config.icon

        return (
          <button
            key={v}
            onClick={() => handleVerdictChange(v)}
            disabled={!canEdit || saving}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-full border-2 font-medium transition-all",
              isSmall ? "px-2 py-0.5 text-[10px]" : "px-2.5 sm:px-3 py-1 text-xs sm:text-sm",
              isSelected
                ? config.color
                : cn("bg-background border-border text-muted-foreground", canEdit && config.hoverColor),
              !canEdit && "cursor-default opacity-75",
              saving && "opacity-50"
            )}
          >
            <Icon className={cn(
              isSmall ? "h-2.5 w-2.5" : "h-3 w-3 sm:h-3.5 sm:w-3.5"
            )} />
            <span className={isSmall ? "" : "hidden sm:inline"}>{isSmall ? config.shortLabel : config.label}</span>
            <span className={cn(isSmall ? "hidden" : "sm:hidden")}>{config.shortLabel}</span>
          </button>
        )
      })}
    </div>
  )
}

// Compact display for lists/cards
export function VerdictBadge({ 
  verdict, 
  type,
  size = 'sm' 
}: { 
  verdict: Verdict
  type: 'recruiter' | 'lily'
  size?: 'xs' | 'sm' 
}) {
  if (!verdict) return null

  const config = verdictConfig[verdict]
  if (!config) return null // Handle unknown verdict values
  
  const Icon = config.icon
  const isXs = size === 'xs'

  return (
    <div className={cn(
      "inline-flex items-center gap-1 rounded-full",
      isXs ? "px-1.5 py-0.5" : "px-2 py-0.5",
      config.color
    )}>
      <Icon className={cn(isXs ? "h-2 w-2" : "h-2.5 w-2.5")} />
      <span className={cn(
        "font-medium",
        isXs ? "text-[8px]" : "text-[10px]"
      )}>
        {type === 'lily' ? 'L' : 'R'}: {config.shortLabel}
      </span>
    </div>
  )
}

// Combined display showing both verdicts
export function VerdictDisplay({
  recruiterVerdict,
  lilyVerdict,
  size = 'sm',
}: {
  recruiterVerdict: Verdict
  lilyVerdict: Verdict
  size?: 'xs' | 'sm'
}) {
  if (!recruiterVerdict && !lilyVerdict) return null

  return (
    <div className="flex flex-wrap gap-1">
      {recruiterVerdict && <VerdictBadge verdict={recruiterVerdict} type="recruiter" size={size} />}
      {lilyVerdict && <VerdictBadge verdict={lilyVerdict} type="lily" size={size} />}
    </div>
  )
}
