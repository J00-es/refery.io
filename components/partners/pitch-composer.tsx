'use client'

import { useState } from 'react'
import { MIN_RELATIONSHIP } from '@/lib/submission-claims'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { GRADE_TO_VERDICT, VERDICT_GRADES } from '@/lib/candidate-ui'
import { FOCUS } from '@/lib/desk-ui'
import { SPOKEN_OPTIONS, WORK_AUTH_OPTIONS } from '@/lib/partners'

/**
 * The "why them" step, shared by both routes into a submission — confirming a
 * candidate the matcher already found, and adding one yourself.
 *
 * The reason is mandatory and the button says how many are still missing one. A
 * submission with no stated why is worthless to the person reading it at the
 * other end, and a form that lets it through has only moved the problem.
 *
 * Where a machine match exists, its reasoning is offered as a starting point
 * behind an explicit button rather than pre-filled into the box. Pre-filling
 * would let an unedited AI sentence clear the length check, which is exactly the
 * lazy submission the field exists to prevent — but making the scout retype what
 * the matcher already worked out is just friction. So: offered, never assumed.
 */

const MIN_PITCH = 40

export interface PitchTarget {
  id: string
  name: string | null
  grade?: string | null
  /** The matcher's reasoning, offered as a draft. */
  hint?: string | null
}

export interface PitchResult {
  submitted: number
  rejected: { candidate_id: string; reason: string }[]
}

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
  const [canIntro, setCanIntro] = useState<Record<string, boolean>>({})
  const [workAuth, setWorkAuth] = useState<Record<string, string>>({})
  const [currentBase, setCurrentBase] = useState<Record<string, string>>({})
  const [targetBase, setTargetBase] = useState<Record<string, string>>({})
  const [spoken, setSpoken] = useState<Record<string, string>>({})
  const [fresh, setFresh] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PitchResult | null>(null)

  // A submission is only a submission if you can put this person in front of us.
  // The server enforces all three; the button just stops people submitting into
  // a rejection they could have seen coming.
  const incomplete = people.filter(
    p =>
      (pitches[p.id]?.trim().length ?? 0) < MIN_PITCH ||
      (relationships[p.id]?.trim().length ?? 0) < MIN_RELATIONSHIP ||
      !canIntro[p.id],
  ).length

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
            can_introduce: canIntro[p.id] === true,
            work_authorization: workAuth[p.id] || null,
            current_base: currentBase[p.id] || null,
            target_base: targetBase[p.id] || null,
            spoken_to_candidate: spoken[p.id] || null,
            fresh_introduction: fresh[p.id] === true,
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
                Refery reviews them next — the status will move on this page.
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
                    {people.find(p => p.id === r.candidate_id)?.name ?? 'A candidate'} — {r.reason}
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

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-[13.5px] leading-relaxed text-[#6E6E68]">
          One honest paragraph each. This is what the hiring team reads first, and it is the
          difference between a profile they open and one they skim past.
        </p>
        {error && (
          <p className="rounded-[10px] bg-[#FBEDEB] px-3 py-2 text-[13px] text-[#A3423A]">{error}</p>
        )}

        {people.map(person => {
          const value = pitches[person.id] ?? ''
          const short = value.trim().length < MIN_PITCH
          const verdict = VERDICT_GRADES[GRADE_TO_VERDICT[person.grade ?? ''] ?? '']

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
                  <p className="text-[12.5px] font-medium text-[#8A8A82]">
                    Why the matcher picked them
                  </p>
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
                <span className="text-[13px] font-medium text-[#3F3F3A]">Why they fit</span>
                <textarea
                  rows={4}
                  value={value}
                  onChange={e => setPitches(p => ({ ...p, [person.id]: e.target.value }))}
                  placeholder="What they have done that maps to this role, and the one thing that makes them unusual."
                  className={`mt-1.5 w-full resize-none rounded-[12px] border px-3 py-2.5 text-[14px] leading-relaxed text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS} ${
                    short && value.length > 0 ? 'border-[#E0BDB8]' : 'border-[#E4E3DC]'
                  }`}
                />
                <span
                  className={`mt-1 block text-[11.5px] ${short ? 'text-[#9C9C95]' : 'text-[#1F3A2F]'}`}
                >
                  {short
                    ? `${MIN_PITCH - value.trim().length} more characters needed`
                    : 'Good to go'}
                </span>
              </label>

              <label className="mt-2 block">
                <span className="text-[13px] font-medium text-[#3F3F3A]">
                  How do you know them?
                </span>
                <textarea
                  rows={2}
                  value={relationships[person.id] ?? ''}
                  onChange={e =>
                    setRelationships(r => ({ ...r, [person.id]: e.target.value }))
                  }
                  placeholder="Worked together at Monzo for two years, still speak monthly"
                  className={`mt-1.5 w-full resize-none rounded-[12px] border border-[#E4E3DC] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                />
              </label>

              <label className="mt-2.5 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={canIntro[person.id] === true}
                  onChange={e =>
                    setCanIntro(c => ({ ...c, [person.id]: e.target.checked }))
                  }
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border-[#D2D1C7] text-[#1F3A2F] ${FOCUS}`}
                />
                <span className="text-[13px] leading-[1.5] text-[#3F3F3A]">
                  I can introduce {person.name?.split(' ')[0] ?? 'them'} to the Refery team now.
                  <span className="block text-[12.5px] text-[#8A8A82]">
                    Only submit people you actually know. Profiles nobody can introduce do
                    not hold their place.
                  </span>
                </span>
              </label>

              {/* The four things every client asks on the first read. Two taps
                  and two numbers here save a round trip on every submission. */}
              <div className="mt-3">
                <span className="text-[13px] font-medium text-[#2A2A26]">US work authorisation</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {WORK_AUTH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWorkAuth(w => ({ ...w, [person.id]: opt.value }))}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${FOCUS} ${
                        workAuth[person.id] === opt.value
                          ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white'
                          : 'border-[#D2D1C7] bg-white text-[#2A2A26] hover:border-[#1F3A2F]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[13px] font-medium text-[#2A2A26]">Current base</span>
                  <input
                    inputMode="numeric"
                    value={currentBase[person.id] ?? ''}
                    onChange={e => setCurrentBase(c => ({ ...c, [person.id]: e.target.value }))}
                    placeholder="$195,000"
                    className={`mt-1.5 w-full rounded-[12px] border border-[#E4E3DC] px-3 py-2.5 text-[13.5px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-[#2A2A26]">Target base</span>
                  <input
                    inputMode="numeric"
                    value={targetBase[person.id] ?? ''}
                    onChange={e => setTargetBase(t => ({ ...t, [person.id]: e.target.value }))}
                    placeholder="$210,000"
                    className={`mt-1.5 w-full rounded-[12px] border border-[#E4E3DC] px-3 py-2.5 text-[13.5px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                  />
                </label>
              </div>

              <div className="mt-3">
                <span className="text-[13px] font-medium text-[#2A2A26]">Have you spoken to them about this search?</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SPOKEN_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSpoken(s => ({ ...s, [person.id]: opt.value }))}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${FOCUS} ${
                        spoken[person.id] === opt.value
                          ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white'
                          : 'border-[#D2D1C7] bg-white text-[#2A2A26] hover:border-[#1F3A2F]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mt-2.5 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={fresh[person.id] === true}
                  onChange={e => setFresh(f => ({ ...f, [person.id]: e.target.checked }))}
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded border-[#D2D1C7] text-[#1F3A2F] ${FOCUS}`}
                />
                <span className="text-[13px] leading-[1.5] text-[#2A2A26]">
                  They have not applied to or been contacted by this company another way.
                  <span className="block text-[12.5px] text-[#9C9C95]">
                    Only fresh introductions are attributable. Asking now protects your referral.
                  </span>
                </span>
              </label>

              <label className="mt-2 block">
                <span className="text-[13px] font-medium text-[#3F3F3A]">
                  Highlights <span className="font-normal text-[#8A8A82]">— optional, one per line</span>
                </span>
                <textarea
                  rows={2}
                  value={highlights[person.id] ?? ''}
                  onChange={e => setHighlights(h => ({ ...h, [person.id]: e.target.value }))}
                  placeholder={'Shipped the payments rewrite at Stripe\nOpen to London from October'}
                  className={`mt-1.5 w-full resize-none rounded-[12px] border border-[#E4E3DC] px-3 py-2.5 text-[13.5px] leading-relaxed text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                />
              </label>
            </div>
          )
        })}
      </div>

      <Footer>
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
          <button
            type="button"
            disabled={busy || incomplete > 0}
            onClick={submit}
            className={`${PRIMARY} flex-1`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {incomplete > 0
              ? `${incomplete} still need a reason`
              : `Submit ${people.length} candidate${people.length === 1 ? '' : 's'}`}
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
