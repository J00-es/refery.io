'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { GRADE_TO_VERDICT, VERDICT_GRADES } from '@/lib/candidate-ui'
import { FOCUS } from '@/lib/desk-ui'
import { SPOKEN_OPTIONS, WORK_AUTH_OPTIONS, workAuthFromVisaStatus } from '@/lib/partners'

/**
 * The "why them" step, shared by both routes into a submission: confirming a
 * candidate the matcher already found, and adding one yourself.
 *
 * Nothing on this screen is required. A partner who knows the person can press
 * Submit with the boxes empty and Refery asks for what is missing. What the
 * screen does is make the four things every client asks (authorisation, current
 * and target base, whether the candidate knows) two taps, and it remembers
 * them: anything already on the candidate record is pre-filled, and anything
 * typed here is written back, so the next submission of the same person starts
 * full.
 *
 * The two attestations that used to be checkboxes (I can introduce them; they
 * have not been introduced to this company another way) are stated once above
 * the button. Pressing Submit is the confirmation.
 */

export interface PitchTarget {
  id: string
  name: string | null
  grade?: string | null
  /** The matcher's reasoning, offered as a draft. */
  hint?: string | null
  /** What the candidate record already knows, for pre-filling. */
  visaStatus?: string | null
  currentBase?: number | null
  targetBase?: number | null
}

export interface PitchResult {
  submitted: number
  rejected: { candidate_id: string; reason: string }[]
}

const money = (n?: number | null) => (n ? `$${Math.round(n).toLocaleString('en-US')}` : '')

export function PitchComposer({
  jobId,
  people,
  onBack,
  onClose,
  backLabel = 'Back',
}: {
  jobId: string
  people: PitchTarget[]
  onBack?: () => void
  onClose: () => void
  backLabel?: string
}) {
  const router = useRouter()
  const [pitches, setPitches] = useState<Record<string, string>>({})
  const [highlights, setHighlights] = useState<Record<string, string>>({})
  const [relationships, setRelationships] = useState<Record<string, string>>({})
  const [workAuth, setWorkAuth] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map(p => [p.id, workAuthFromVisaStatus(p.visaStatus) ?? ''])),
  )
  const [currentBase, setCurrentBase] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map(p => [p.id, money(p.currentBase)])),
  )
  const [targetBase, setTargetBase] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map(p => [p.id, money(p.targetBase)])),
  )
  const [spoken, setSpoken] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PitchResult | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/partners/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: jobId,
          submissions: people.map(p => ({
            candidate_id: p.id,
            pitch: pitches[p.id]?.trim() ?? '',
            relationship: relationships[p.id]?.trim() ?? '',
            // Pressing Submit is the attestation. Stated above the button.
            can_introduce: true,
            fresh_introduction: true,
            work_authorization: workAuth[p.id] || null,
            current_base: currentBase[p.id] || null,
            target_base: targetBase[p.id] || null,
            spoken_to_candidate: spoken[p.id] || null,
            highlights: (highlights[p.id] ?? '')
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
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-6">
          {result.submitted > 0 && (
            <p className="flex items-start gap-2 rounded-[12px] bg-[#E7EDE9] px-4 py-3 text-[14px] text-[#1F3A2F]">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {result.submitted} {result.submitted === 1 ? 'candidate' : 'candidates'} submitted.
                Refery reviews next; the stage moves on this page.
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
                    {people.find(p => p.id === r.candidate_id)?.name ?? 'A candidate'}: {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Footer>
          <button type="button" onClick={onClose} className={PRIMARY}>
            Done
          </button>
        </Footer>
      </>
    )
  }

  const pill = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${FOCUS} ${
      on ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white' : 'border-[#D2D1C7] bg-white text-[#2A2A26] hover:border-[#1F3A2F]'
    }`
  const field = `mt-1.5 w-full rounded-[12px] border border-[#E4E3DC] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#161613] placeholder:text-[#9C9C95] ${FOCUS}`
  const label = 'text-[13px] font-medium text-[#2A2A26]'
  const optional = <span className="font-normal text-[#9C9C95]"> · optional</span>

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
          Nothing here is required. A line on why, and the four things every client asks, get a
          candidate read faster. Anything the record already knows is filled in; anything you add is
          remembered for next time.
        </p>
        {error && (
          <p className="rounded-[10px] bg-[#FBEDEB] px-3 py-2 text-[13px] text-[#A3423A]">{error}</p>
        )}

        {people.map(person => {
          const verdict = VERDICT_GRADES[GRADE_TO_VERDICT[person.grade ?? ''] ?? '']
          const knownAuth = workAuthFromVisaStatus(person.visaStatus)

          return (
            <div key={person.id} className="rounded-[14px] border border-[#E4E3DC] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14px] font-semibold text-[#161613]">
                  {person.name || 'Unnamed candidate'}
                </p>
                {verdict && (
                  <span
                    className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold ${verdict.className}`}
                    title={verdict.label}
                  >
                    {verdict.grade}
                  </span>
                )}
              </div>

              {person.hint && (
                <div className="mt-2.5 rounded-[10px] bg-[#FAF9F5] px-3 py-2.5">
                  <p className="text-[12.5px] font-medium text-[#9C9C95]">Why the matcher picked them</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E68]">{person.hint}</p>
                  <button
                    type="button"
                    onClick={() => setPitches(p => ({ ...p, [person.id]: person.hint ?? '' }))}
                    className={`mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1F3A2F] transition-colors hover:text-[#142E24] ${FOCUS}`}
                  >
                    <Sparkles className="h-3 w-3" />
                    Use as a starting point
                  </button>
                </div>
              )}

              <label className="mt-3 block">
                <span className={label}>Why they fit{optional}</span>
                <textarea
                  rows={3}
                  value={pitches[person.id] ?? ''}
                  onChange={e => setPitches(p => ({ ...p, [person.id]: e.target.value }))}
                  placeholder="What they have done that maps to this role, and the one thing that makes them unusual. Three lines is plenty."
                  className={`${field} resize-none`}
                />
              </label>

              <label className="mt-2 block">
                <span className={label}>How do you know them?{optional}</span>
                <textarea
                  rows={2}
                  value={relationships[person.id] ?? ''}
                  onChange={e => setRelationships(r => ({ ...r, [person.id]: e.target.value }))}
                  placeholder="If you worked together, or a strong way to vouch. For example: I'm a founder, and he was my first founding engineer."
                  className={`${field} resize-none`}
                />
              </label>

              <div className="mt-3">
                <span className={label}>
                  US work authorisation{optional}
                  {knownAuth && <span className="font-normal text-[#9C9C95]"> · from their record</span>}
                </span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WORK_AUTH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWorkAuth(w => ({ ...w, [person.id]: w[person.id] === opt.value ? '' : opt.value }))}
                      className={pill(workAuth[person.id] === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {!knownAuth && person.visaStatus && (
                  <p className="mt-1.5 text-[12px] text-[#9C9C95]">On their record: “{person.visaStatus}”. Pick the closest option and it is saved.</p>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={label}>Current base{optional}</span>
                  <input
                    inputMode="numeric"
                    value={currentBase[person.id] ?? ''}
                    onChange={e => setCurrentBase(c => ({ ...c, [person.id]: e.target.value }))}
                    placeholder="$195,000"
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className={label}>Target base{optional}</span>
                  <input
                    inputMode="numeric"
                    value={targetBase[person.id] ?? ''}
                    onChange={e => setTargetBase(t => ({ ...t, [person.id]: e.target.value }))}
                    placeholder="$210,000"
                    className={field}
                  />
                </label>
              </div>

              <div className="mt-3">
                <span className={label}>Have you spoken to them about this search?{optional}</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SPOKEN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSpoken(s => ({ ...s, [person.id]: s[person.id] === opt.value ? '' : opt.value }))}
                      className={pill(spoken[person.id] === opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-3 block">
                <span className={label}>Highlights{optional}<span className="font-normal text-[#9C9C95]">, one per line</span></span>
                <textarea
                  rows={2}
                  value={highlights[person.id] ?? ''}
                  onChange={e => setHighlights(h => ({ ...h, [person.id]: e.target.value }))}
                  placeholder={'Shipped the payments rewrite at Stripe\nOpen to New York from October'}
                  className={`${field} resize-none`}
                />
              </label>
            </div>
          )
        })}
      </div>

      <Footer>
        <p className="mb-3 text-[12.5px] leading-relaxed text-[#6E6E68]">
          By submitting you confirm that you can introduce {people.length === 1 ? 'this person' : 'these people'} to
          Refery now, and that as far as you know they have not applied to or been contacted by this company
          another way.
        </p>
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className={`inline-flex min-h-[44px] items-center rounded-full border border-[#D2D1C7] px-4 text-[14px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] ${FOCUS}`}
            >
              {backLabel}
            </button>
          )}
          <button type="button" disabled={busy} onClick={submit} className={`${PRIMARY} flex-1`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit {people.length} candidate{people.length === 1 ? '' : 's'}
          </button>
        </div>
      </Footer>
    </>
  )
}

export const PRIMARY = `inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-60 ${FOCUS}`

export function Footer({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-[#E4E3DC] bg-white px-5 py-4">{children}</div>
}
