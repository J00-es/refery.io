'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FOCUS } from '@/lib/candidate-ui'
import {
  JOURNEY_STAGES,
  JOURNEY_STRIP,
  journeyConfig,
  stripIndexOf,
  type JourneyStage,
} from '@/lib/journey'

interface JourneyStripProps {
  candidateId: string
  stage: JourneyStage
  /** When the person has been off the market, the strip says so rather than implying progress. */
  offMarket?: boolean
  canEdit: boolean
  /** post_committee_not_fit is a decision about a call, so it is admin-only. */
  canRecordCommitteeDecision: boolean
}

/**
 * Where we are with a person, as a path rather than a badge.
 *
 * A badge answers "what is the value of a field". A path answers the question
 * someone actually opens this page with: how far along is this, and what is the
 * next thing that happens. The steps that have happened are filled, the current
 * one is named in full, and the rest stay faint — so the page reads as progress
 * without needing a legend.
 */
export function JourneyStrip({
  candidateId,
  stage,
  offMarket = false,
  canEdit,
  canRecordCommitteeDecision,
}: JourneyStripProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = journeyConfig(stage)
  const currentIndex = stripIndexOf(stage)
  const isClosed = current.category === 'closed'

  async function move(next: JourneyStage) {
    if (next === stage) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/journey`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || 'That did not save. Try again.')
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError('That did not save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  const busy = saving || pending

  const changeable = JOURNEY_STAGES.filter(s =>
    s.value === 'post_committee_not_fit' ? canRecordCommitteeDecision : true
  )
  const open = changeable.filter(s => s.category !== 'closed')
  const closed = changeable.filter(s => s.category === 'closed')

  return (
    <div className="rounded-[18px] border border-[#E4E3DC] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-[#161613]">{current.label}</h2>
            {offMarket && (
              <span className="rounded-full bg-[#EAE9E1] px-2 py-0.5 text-[11px] font-medium text-[#6E6E68]">
                Off market
              </span>
            )}
          </div>
          <p className="mt-0.5 max-w-[46ch] text-[13px] leading-snug text-[#6E6E68]">
            {current.blurb}
          </p>
        </div>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={busy}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#D2D1C7] px-3.5 py-2 text-[13px] font-semibold text-[#161613] transition-colors hover:border-[#9C9C95] disabled:opacity-50 ${FOCUS}`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Change
              <ChevronDown className="h-3.5 w-3.5 text-[#9C9C95]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-[#9C9C95]">
                Move to
              </DropdownMenuLabel>
              {open.map(s => (
                <DropdownMenuItem
                  key={s.value}
                  onSelect={() => move(s.value)}
                  className="flex items-start gap-2 text-[13.5px]"
                >
                  <span className="w-4 shrink-0 pt-0.5">
                    {s.value === stage && <Check className="h-3.5 w-3.5 text-[#1F3A2F]" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-[#161613]">{s.label}</span>
                    <span className="block text-[12px] leading-snug text-[#9C9C95]">{s.blurb}</span>
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {closed.map(s => (
                <DropdownMenuItem
                  key={s.value}
                  onSelect={() => move(s.value)}
                  className="flex items-start gap-2 text-[13.5px]"
                >
                  <span className="w-4 shrink-0 pt-0.5">
                    {s.value === stage && <Check className="h-3.5 w-3.5 text-[#9C4038]" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-[#9C4038]">
                      {s.value === 'post_committee_not_fit' ? 'Not a fit — after our call' : s.label}
                    </span>
                    <span className="block text-[12px] leading-snug text-[#9C9C95]">{s.blurb}</span>
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* The path. Hidden once a candidate is closed, because a progress bar
          under a closed outcome reads as though they are still moving. */}
      {!isClosed && (
        <ol className="mt-4 flex items-center gap-1.5" aria-label="Progress">
          {JOURNEY_STRIP.map((s, i) => {
            const done = i < currentIndex
            const here = i === currentIndex
            return (
              <li key={s.value} className="flex min-w-0 flex-1 flex-col gap-1.5" title={s.label}>
                <span
                  aria-hidden
                  className={`h-1 rounded-full ${
                    done ? 'bg-[#1F3A2F]' : here ? 'bg-[#1F3A2F]' : 'bg-[#E4E3DC]'
                  } ${here ? 'opacity-100' : done ? 'opacity-45' : ''}`}
                />
                {/* Six labels across a 360px screen leaves ~55px each, which
                    turns "Ready for intro" into "Read…". The bars still carry
                    the progress, and the current step is named in full above. */}
                <span
                  className={`hidden truncate text-[10.5px] leading-none sm:block ${
                    here ? 'font-semibold text-[#1F3A2F]' : 'text-[#9C9C95]'
                  }`}
                >
                  {s.label}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[12.5px] text-[#9C4038]">
          {error}
        </p>
      )}
    </div>
  )
}
