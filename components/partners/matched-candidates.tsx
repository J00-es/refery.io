'use client'

import { useState } from 'react'
import { Send, Sparkles } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { GRADE_TO_VERDICT, VERDICT_GRADES, stageDot, stageLabel } from '@/lib/candidate-ui'
import { CARD, FOCUS, H3, LEDE, META, detailLine } from '@/lib/desk-ui'
import { PitchComposer, type PitchTarget } from './pitch-composer'

/**
 * The candidates already paired with this role, waiting to be confirmed.
 *
 * This is the difference between the desk and a blank form. Most of these rows
 * were written by the nightly matcher — 8,170 sit at `auto_matched` across the
 * board — and a match is a suggestion, not a submission: nobody has read it and
 * nobody has put their name to it. So the list shows the machine's reasoning and
 * asks the person who owns the candidate to either stand behind it or ignore it.
 *
 * Multi-select, because confirming four matches for one search is one sitting,
 * not four.
 */

export interface MatchRow {
  candidateId: string
  name: string | null
  grade: string | null
  location: string | null
  experienceYears: number | null
  stage: string
  matchScore: number | null
  matchTier: string | null
  matchReason: string | null
  /** True when the row belongs to someone else — super-admin view only. */
  ownerName: string | null
}

export function MatchedCandidates({
  jobId,
  roleTitle,
  matches,
  disabled,
  disabledReason,
}: {
  jobId: string
  roleTitle: string
  matches: MatchRow[]
  disabled?: boolean
  disabledReason?: string
}) {
  const [picked, setPicked] = useState<string[]>([])
  const [open, setOpen] = useState(false)

  if (!matches.length) {
    return (
      <p className={`py-6 ${LEDE}`}>
        Nothing has been matched to this search yet. Add someone from your own candidates instead — a
        match is only a suggestion, and your own read is worth more.
      </p>
    )
  }

  const chosen: PitchTarget[] = picked
    .map(id => matches.find(m => m.candidateId === id))
    .filter((m): m is MatchRow => Boolean(m))
    .map(m => ({ id: m.candidateId, name: m.name, grade: m.grade, hint: m.matchReason }))

  return (
    <>
      <ul className="space-y-2.5">
        {matches.map(match => {
          const verdict = VERDICT_GRADES[GRADE_TO_VERDICT[match.grade ?? ''] ?? '']
          const isPicked = picked.includes(match.candidateId)

          return (
            <li key={match.candidateId} className={`p-4 sm:p-5 ${CARD}`}>
              <label
                className={`flex items-start gap-3 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
              >
                {!disabled && (
                  <input
                    type="checkbox"
                    checked={isPicked}
                    onChange={() =>
                      setPicked(prev =>
                        prev.includes(match.candidateId)
                          ? prev.filter(id => id !== match.candidateId)
                          : [...prev, match.candidateId],
                      )
                    }
                    className="mt-1 h-4 w-4 shrink-0 accent-[#1F4D3A]"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`truncate ${H3}`}>{match.name || 'Unnamed candidate'}</span>
                    {verdict && (
                      <span
                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold ${verdict.className}`}
                        title={verdict.label}
                      >
                        {verdict.grade}
                      </span>
                    )}
                    {match.matchScore != null && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F0F0EA] px-2 py-0.5 text-[10.5px] font-semibold text-[#6E6E68]">
                        <Sparkles className="h-2.5 w-2.5" />
                        {Math.round(Number(match.matchScore))}
                        {match.matchTier ? ` · ${match.matchTier}` : ''}
                      </span>
                    )}
                  </span>

                  <span className={`mt-1 flex items-center gap-1.5 ${META}`}>
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${stageDot(match.stage)}`} />
                    {detailLine(
                      stageLabel(match.stage),
                      match.location,
                      match.experienceYears ? `${match.experienceYears} yrs` : null,
                      match.ownerName,
                    )}
                  </span>

                  {match.matchReason && (
                    <span className={`mt-2 block ${LEDE}`}>{match.matchReason}</span>
                  )}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {disabled ? (
        <p className={`mt-3 ${META}`}>{disabledReason}</p>
      ) : (
        /* Sticky so the action stays reachable on a phone with eight matches on
           screen. Only appears once something is selected, so it never covers
           content the reader still needs. */
        picked.length > 0 && (
          <div className="sticky bottom-3 z-10 mt-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-[#1F4D3A] px-5 text-[14px] font-semibold text-white shadow-[0_8px_24px_rgba(31,77,58,0.24)] transition-colors hover:bg-[#173D2E] ${FOCUS}`}
            >
              <Send className="h-4 w-4" />
              Submit {picked.length} {picked.length === 1 ? 'candidate' : 'candidates'} officially
            </button>
          </div>
        )
      )}

      <Sheet
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) setPicked([])
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
          <SheetHeader className="border-b border-[#ECECE6] px-5 py-4">
            <SheetTitle className="text-left font-serif text-[19px] font-normal text-[#161613]">
              Why them?
            </SheetTitle>
            <p className="text-left text-[13px] text-[#6E6E68]">{roleTitle}</p>
          </SheetHeader>
          <PitchComposer
            jobId={jobId}
            people={chosen}
            onClose={() => {
              setOpen(false)
              setPicked([])
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
