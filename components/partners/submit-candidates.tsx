'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Search, UserPlus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { GRADE_TO_VERDICT, VERDICT_GRADES } from '@/lib/candidate-ui'
import { FOCUS } from '@/lib/desk-ui'
import { Footer, PitchComposer, PRIMARY, type PitchTarget } from './pitch-composer'

/**
 * Adding candidates to a mandate who the matcher never paired with it.
 *
 * Two steps, in this order on purpose. Choosing people is a browsing task and
 * writing the reason is a thinking task, and interleaving them produces five
 * half-written pitches. So: pick everyone first, then write one reason at a time
 * with the name in front of you.
 *
 * The list is the scout's own book, searchable, multi-select. A candidate someone
 * else has already submitted for this role comes back disabled and unnamed —
 * enough to stop a wasted evening on a duplicate, not enough to turn the desk
 * into a view of each other's pipelines.
 */

interface CandidateOption {
  id: string
  name: string | null
  location: string | null
  panel_grade: string | null
  availability_status: string | null
  journey_stage: string | null
  experience_years: number | null
  skills: string[] | null
  submitted: boolean
  submitted_by_me: boolean
  submitted_status: string | null
  visa_status: string | null
  current_base: number | null
  salary_expectation_min: number | null
  salary_expectation_max: number | null
}

export function SubmitCandidates({
  jobId,
  roleTitle,
  slotsLeft,
  disabled,
  disabledReason,
  /** Wording changes when this is the only way in versus the secondary one. */
  label = 'Add candidates',
}: {
  jobId: string
  roleTitle: string
  slotsLeft: number | null
  disabled?: boolean
  disabledReason?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'pick' | 'why'>('pick')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<CandidateOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (q: string) => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/partners/candidates?job_id=${jobId}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(body.error ?? 'Could not load your candidates.')
          return
        }
        setCandidates(body.candidates ?? [])
      } finally {
        setLoading(false)
      }
    },
    [jobId],
  )

  useEffect(() => {
    if (open && candidates === null) load('')
  }, [open, candidates, load])

  // Debounced search. Without this every keystroke is a round trip and the list
  // flickers between stale results.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!open) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => load(query.trim()), 260)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query, open, load])

  const byId = useMemo(() => new Map((candidates ?? []).map(c => [c.id, c])), [candidates])
  const chosen: PitchTarget[] = picked
    .map(id => byId.get(id))
    .filter((c): c is CandidateOption => Boolean(c))
    .map(c => ({
      id: c.id,
      name: c.name,
      grade: c.panel_grade,
      visaStatus: c.visa_status,
      currentBase: c.current_base,
      targetBase: c.salary_expectation_min ?? c.salary_expectation_max,
    }))

  const overCap = slotsLeft !== null && picked.length > slotsLeft

  function reset() {
    setStep('pick')
    setPicked([])
    setQuery('')
    setCandidates(null)
    setError(null)
  }

  if (disabled) {
    return <p className="text-[13px] text-[#9C9C95]">{disabledReason ?? 'Submissions are closed.'}</p>
  }

  return (
    <Sheet
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#1F3A2F] px-4 text-[14px] font-semibold text-[#1F3A2F] transition-colors hover:bg-[#E7EDE9] ${FOCUS}`}
        >
          <UserPlus className="h-4 w-4" />
          {label}
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-[#E4E3DC] px-5 py-4">
          <SheetTitle className="text-left text-[19px] font-semibold text-[#161613]">
            {step === 'why' ? 'Why them?' : 'Choose from your candidates'}
          </SheetTitle>
          <p className="text-left text-[13px] text-[#6E6E68]">{roleTitle}</p>
        </SheetHeader>

        {step === 'pick' ? (
          <>
            <div className="border-b border-[#E4E3DC] px-5 py-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B8B8B0]"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search your candidates by name"
                  className={`w-full rounded-full border border-[#E4E3DC] bg-white py-2.5 pl-9 pr-3 text-[14px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                />
              </div>
              {slotsLeft !== null && (
                <p className="mt-2 text-[12.5px] text-[#6E6E68]">
                  {slotsLeft} submission {slotsLeft === 1 ? 'slot' : 'slots'} left on this role.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-[12.5px] text-[#6E6E68]">
                Someone new? <a href="/candidates/new" className="font-semibold text-[#1F3A2F] underline-offset-2 hover:underline">Add them from a PDF CV</a> and they appear here.
              </p>
              {error && (
                <p className="mb-3 rounded-[10px] bg-[#FBEDEB] px-3 py-2 text-[13px] text-[#A3423A]">
                  {error}
                </p>
              )}
              {candidates === null || (loading && !candidates?.length) ? (
                <p className="flex items-center gap-2 py-6 text-[13.5px] text-[#9C9C95]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading your candidates…
                </p>
              ) : candidates.length === 0 ? (
                <p className="py-8 text-[13.5px] leading-relaxed text-[#5F5F58]">
                  {query
                    ? `No candidate of yours matches “${query}”.`
                    : 'You have no candidates yet. Add one from the Candidates page and they will show up here.'}
                </p>
              ) : (
                <ul className="divide-y divide-[#E4E3DC] rounded-[14px] border border-[#E4E3DC]">
                  {candidates.map(c => {
                    const taken = c.submitted
                    const verdict = VERDICT_GRADES[GRADE_TO_VERDICT[c.panel_grade ?? ''] ?? '']
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex min-h-[60px] items-start gap-3 px-3.5 py-3 ${
                            taken ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={taken}
                            checked={picked.includes(c.id)}
                            onChange={() =>
                              setPicked(prev =>
                                prev.includes(c.id)
                                  ? prev.filter(id => id !== c.id)
                                  : [...prev, c.id],
                              )
                            }
                            className="mt-1 h-4 w-4 shrink-0 accent-[#1F3A2F]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[14px] font-medium text-[#161613]">
                                {c.name || 'Unnamed candidate'}
                              </span>
                              {verdict && (
                                <span
                                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold ${verdict.className}`}
                                  title={verdict.label}
                                >
                                  {verdict.grade}
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block truncate text-[12.5px] text-[#9C9C95]">
                              {[
                                c.location,
                                c.experience_years ? `${c.experience_years} yrs` : null,
                                c.skills?.slice(0, 2).join(', ') || null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No details recorded'}
                            </span>
                            {taken && (
                              <span className="mt-1 block text-[12px] font-medium text-[#8A6A1F]">
                                {c.submitted_by_me
                                  ? `Already yours on this role — ${c.submitted_status}`
                                  : 'Already submitted to this search. The first confirmed submission holds the protection.'}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <Footer>
              {overCap && (
                <p className="mb-2 text-[12.5px] text-[#A3423A]">
                  Only {slotsLeft} will be accepted — the role is nearly full.
                </p>
              )}
              <button
                type="button"
                disabled={!picked.length}
                onClick={() => setStep('why')}
                className={PRIMARY}
              >
                <Plus className="h-4 w-4" />
                {picked.length ? `Write the reasons (${picked.length})` : 'Choose at least one'}
              </button>
            </Footer>
          </>
        ) : (
          <PitchComposer
            jobId={jobId}
            people={chosen}
            onBack={() => setStep('pick')}
            onClose={() => {
              setOpen(false)
              reset()
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
