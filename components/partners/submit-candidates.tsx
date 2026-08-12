'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Loader2, Plus, Search, UserPlus } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { FOCUS, VERDICT_GRADES, GRADE_TO_VERDICT } from '@/lib/candidate-ui'

/**
 * Putting candidates forward for a mandate.
 *
 * Two steps, in this order on purpose. Choosing people is a browsing task and
 * writing the reason is a thinking task, and interleaving them produces five
 * half-written pitches. So: pick everyone first, then write one reason at a time
 * with the name in front of you.
 *
 * The reason is mandatory and the submit button says how many are still missing
 * one. A submission with no stated why is worthless to the person reading it at
 * the other end, and a form that lets it through has simply moved the problem.
 */

const MIN_PITCH = 40

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
}

interface Result {
  submitted: number
  rejected: { candidate_id: string; reason: string }[]
}

export function SubmitCandidates({
  jobId,
  roleTitle,
  slotsLeft,
  disabled,
  disabledReason,
}: {
  jobId: string
  roleTitle: string
  slotsLeft: number | null
  disabled?: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'pick' | 'why' | 'done'>('pick')
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<CandidateOption[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [pitches, setPitches] = useState<Record<string, string>>({})
  const [highlights, setHighlights] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)

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

  const byId = useMemo(
    () => new Map((candidates ?? []).map(c => [c.id, c])),
    [candidates],
  )
  const chosen = picked.map(id => byId.get(id)).filter((c): c is CandidateOption => Boolean(c))
  const incomplete = picked.filter(id => (pitches[id]?.trim().length ?? 0) < MIN_PITCH).length
  const overCap = slotsLeft !== null && picked.length > slotsLeft

  function reset() {
    setStep('pick')
    setPicked([])
    setPitches({})
    setHighlights({})
    setResult(null)
    setError(null)
    setQuery('')
    setCandidates(null)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          submissions: picked.map(id => ({
            candidate_id: id,
            pitch: pitches[id]?.trim() ?? '',
            highlights: (highlights[id] ?? '')
              .split('\n')
              .map(h => h.trim())
              .filter(Boolean),
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok && body.submitted === undefined) {
        setError(body.error ?? 'Could not submit.')
        return
      }
      setResult({ submitted: body.submitted ?? 0, rejected: body.rejected ?? [] })
      setStep('done')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return (
      <p className="text-[13px] text-[#9C9C95]">{disabledReason ?? 'Submissions are closed.'}</p>
    )
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
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#1F4D3A] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] ${FOCUS}`}
        >
          <UserPlus className="h-4 w-4" />
          Submit candidates
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[560px]">
        <SheetHeader className="border-b border-[#ECECE6] px-5 py-4">
          <SheetTitle className="text-left font-serif text-[19px] font-normal text-[#161613]">
            {step === 'done' ? 'Submitted' : step === 'why' ? 'Why them?' : 'Choose candidates'}
          </SheetTitle>
          <p className="text-left text-[13px] text-[#6E6E68]">{roleTitle}</p>
        </SheetHeader>

        {step === 'pick' && (
          <>
            <div className="border-b border-[#ECECE6] px-5 py-3">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B8B8B0]"
                  aria-hidden
                />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search your candidates by name"
                  className={`w-full rounded-full border border-[#ECECE6] bg-white py-2.5 pl-9 pr-3 text-[14px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                />
              </div>
              {slotsLeft !== null && (
                <p className="mt-2 text-[12.5px] text-[#6E6E68]">
                  {slotsLeft} submission {slotsLeft === 1 ? 'slot' : 'slots'} left on this role.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && <Bad>{error}</Bad>}
              {candidates === null || (loading && !candidates?.length) ? (
                <Loading />
              ) : candidates.length === 0 ? (
                <Empty>
                  {query
                    ? `No candidate of yours matches “${query}”.`
                    : 'You have no candidates yet. Add one from the Candidates page and they will show up here.'}
                </Empty>
              ) : (
                <ul className="divide-y divide-[#ECECE6] rounded-[14px] border border-[#ECECE6]">
                  {candidates.map(c => {
                    const taken = c.submitted
                    const isPicked = picked.includes(c.id)
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
                            checked={isPicked}
                            onChange={() =>
                              setPicked(prev =>
                                prev.includes(c.id) ? prev.filter(id => id !== c.id) : [...prev, c.id],
                              )
                            }
                            className="mt-1 h-4 w-4 shrink-0 accent-[#1F4D3A]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[14px] font-medium text-[#161613]">
                                {c.name || 'Unnamed candidate'}
                              </span>
                              <Grade grade={c.panel_grade} />
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
                                  : 'Already submitted to this role by another scout'}
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
                className={primaryBtn}
              >
                <Plus className="h-4 w-4" />
                {picked.length ? `Write the reasons (${picked.length})` : 'Choose at least one'}
              </button>
            </Footer>
          </>
        )}

        {step === 'why' && (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
                One honest paragraph each. This is what the hiring team reads first, and it is the
                difference between a profile they open and one they skim past.
              </p>
              {error && <Bad>{error}</Bad>}
              {chosen.map(c => {
                const value = pitches[c.id] ?? ''
                const short = value.trim().length < MIN_PITCH
                return (
                  <div key={c.id} className="rounded-[14px] border border-[#ECECE6] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-[#161613]">
                        {c.name || 'Unnamed candidate'}
                      </p>
                      <Grade grade={c.panel_grade} />
                    </div>
                    <label className="mt-3 block">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#6E6E68]">
                        Why they fit
                      </span>
                      <textarea
                        rows={4}
                        value={value}
                        onChange={e => setPitches(p => ({ ...p, [c.id]: e.target.value }))}
                        placeholder="What they have done that maps to this role, and the one thing that makes them unusual."
                        className={`mt-1.5 w-full resize-none rounded-[12px] border px-3 py-2.5 text-[14px] leading-relaxed text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS} ${
                          short && value.length > 0 ? 'border-[#E0BDB8]' : 'border-[#ECECE6]'
                        }`}
                      />
                      <span
                        className={`mt-1 block text-[11.5px] ${short ? 'text-[#9C9C95]' : 'text-[#1F4D3A]'}`}
                      >
                        {short
                          ? `${MIN_PITCH - value.trim().length} more characters needed`
                          : 'Good to go'}
                      </span>
                    </label>
                    <label className="mt-2 block">
                      <span className="text-[12px] font-semibold uppercase tracking-[0.07em] text-[#6E6E68]">
                        Highlights <span className="font-normal normal-case">— optional, one per line</span>
                      </span>
                      <textarea
                        rows={2}
                        value={highlights[c.id] ?? ''}
                        onChange={e => setHighlights(h => ({ ...h, [c.id]: e.target.value }))}
                        placeholder={'Shipped the payments rewrite at Stripe\nOpen to London from October'}
                        className={`mt-1.5 w-full resize-none rounded-[12px] border border-[#ECECE6] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                      />
                    </label>
                  </div>
                )
              })}
            </div>

            <Footer>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('pick')}
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[#D8D8D0] px-4 text-[14px] font-semibold text-[#161613] transition-colors hover:border-[#1F4D3A] ${FOCUS}`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  type="button"
                  disabled={busy || incomplete > 0}
                  onClick={submit}
                  className={`${primaryBtn} flex-1`}
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {incomplete > 0
                    ? `${incomplete} still need a reason`
                    : `Submit ${picked.length} candidate${picked.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </Footer>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
              {result.submitted > 0 && (
                <p className="flex items-start gap-2 rounded-[12px] bg-[#E9F0EC] px-4 py-3 text-[14px] text-[#1F4D3A]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {result.submitted} {result.submitted === 1 ? 'candidate' : 'candidates'} submitted.
                    Refery reviews them next — you will see the status move on this page.
                  </span>
                </p>
              )}
              {result.rejected.length > 0 && (
                <div className="rounded-[12px] border border-[#E4D9BC] bg-[#FBF6E9] px-4 py-3">
                  <p className="text-[13px] font-semibold text-[#8A6A1F]">
                    {result.rejected.length} did not go through
                  </p>
                  <ul className="mt-2 space-y-1">
                    {result.rejected.map(r => (
                      <li key={r.candidate_id} className="text-[13px] text-[#8A6A1F]">
                        {byId.get(r.candidate_id)?.name ?? 'A candidate'} — {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <Footer>
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
                className={primaryBtn}
              >
                Done
              </button>
            </Footer>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

const primaryBtn = `inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#1F4D3A] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] disabled:opacity-60 ${FOCUS}`

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[#ECECE6] bg-white px-5 py-4">{children}</div>
}

function Grade({ grade }: { grade: string | null }) {
  if (!grade) return null
  const verdict = VERDICT_GRADES[GRADE_TO_VERDICT[grade] ?? '']
  if (!verdict) return null
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold ${verdict.className}`}
      title={verdict.label}
    >
      {verdict.grade}
    </span>
  )
}

function Loading() {
  return (
    <p className="flex items-center gap-2 py-6 text-[13.5px] text-[#9C9C95]">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading your candidates…
    </p>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[14px] border border-dashed border-[#D8D8D0] bg-[#FAFAF6] px-4 py-8 text-center text-[13.5px] leading-relaxed text-[#6E6E68]">
      {children}
    </p>
  )
}

function Bad({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 rounded-[10px] bg-[#FBEDEB] px-3 py-2 text-[13px] text-[#A3423A]">{children}</p>
  )
}
