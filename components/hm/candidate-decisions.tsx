'use client'

/**
 * The founder's two buttons on a candidate, and the reason that follows a no.
 *
 * Interview is one tap. Not a fit asks for a reason: one of six taps or a
 * line, because the reason is what the partner reads and what makes the next
 * candidate sharper. Later parks it without closing it. After any decision
 * the page refreshes from the server, so the card shows the recorded state.
 *
 * `?decide=interview&c=<id>` from a Slack or email button pre-opens the
 * matching action so the tap the founder already made counts as the tap.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const NAME_KEY = 'refery.brief.author'

export const REASONS: { code: string; label: string }[] = [
  { code: 'too_senior', label: 'Too senior' },
  { code: 'too_junior', label: 'Not enough experience' },
  { code: 'depth', label: 'Not enough depth where it matters' },
  { code: 'comp', label: 'Compensation' },
  { code: 'location', label: 'Location or pattern' },
  { code: 'already_knew', label: 'Already in touch' },
  { code: 'other', label: 'Something else' },
]

export function CandidateDecision({
  slug,
  submissionId,
  candidateFirstName,
  preset,
  hasBookingLink,
}: {
  slug: string
  submissionId: string
  candidateFirstName: string
  preset: 'interview' | 'not_a_fit' | null
  hasBookingLink: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'reason' | 'done_interview' | 'done_no' | 'done_later'>('idle')
  const [code, setCode] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState('')
  const [bookingSaved, setBookingSaved] = useState(false)

  useEffect(() => {
    try {
      setName(window.localStorage.getItem(NAME_KEY) ?? '')
    } catch {
      /* nothing to restore */
    }
    if (preset === 'not_a_fit') setMode('reason')
  }, [preset])

  function remember(v: string) {
    setName(v)
    try {
      if (v.trim()) window.localStorage.setItem(NAME_KEY, v.trim())
    } catch {
      /* fine */
    }
  }

  async function send(decision: 'interview' | 'not_a_fit' | 'later') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/b/${slug}/candidates/${submissionId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reasonCode: code, reason: note.trim() || null, decidedBy: name.trim() || null }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that.')
      setMode(decision === 'interview' ? 'done_interview' : decision === 'not_a_fit' ? 'done_no' : 'done_later')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  async function saveBooking() {
    if (!booking.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/b/${slug}/booking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: booking.trim() }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that.')
      setBookingSaved(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  const BTN = 'inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50'

  if (mode === 'done_interview') {
    return (
      <div className="mt-3 rounded-[12px] bg-[#E7EDE9] px-4 py-3 text-[14px] leading-relaxed text-[#1F3A2F]">
        <p className="font-semibold">Interview requested. Lily has it and the partner is told.</p>
        {!hasBookingLink && !bookingSaved && (
          <div className="mt-3">
            <p className="text-[13px] text-[#2A2A26]">Paste a booking link once and every future yes sends the candidate straight to your calendar.</p>
            <form
              className="mt-2 flex flex-col gap-2 sm:flex-row"
              onSubmit={e => {
                e.preventDefault()
                void saveBooking()
              }}
            >
              <input
                type="url"
                value={booking}
                onChange={e => setBooking(e.target.value)}
                placeholder="https://calendly.com/…"
                className="min-h-[44px] flex-1 rounded-full border border-[#D2D1C7] bg-white px-4 text-[14px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]"
              />
              <button type="submit" disabled={busy || !booking.trim()} className={`${BTN} bg-[#1F3A2F] text-white`}>
                Save link
              </button>
            </form>
          </div>
        )}
        {bookingSaved && <p className="mt-2 text-[13px]">Booking link saved.</p>}
        {error && <p className="mt-2 text-[13px] text-[#A8564C]">{error}</p>}
      </div>
    )
  }
  if (mode === 'done_no') {
    return <div className="mt-3 rounded-[12px] bg-[#EAE9E1] px-4 py-3 text-[14px] text-[#2A2A26]">Noted. The partner gets your reason in Lily's words; {candidateFirstName} is told by the person who introduced them.</div>
  }
  if (mode === 'done_later') {
    return <div className="mt-3 rounded-[12px] bg-[#EAE9E1] px-4 py-3 text-[14px] text-[#2A2A26]">Parked. Still yours to decide; Lily will check in.</div>
  }

  return (
    <div className="mt-3">
      {mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void send('interview')} className={`${BTN} bg-[#1F3A2F] text-white hover:bg-[#142E24]`}>
            {busy ? 'Saving…' : 'Interview'}
          </button>
          <button type="button" disabled={busy} onClick={() => setMode('reason')} className={`${BTN} border border-[#D2D1C7] bg-white text-[#161613] hover:border-[#1F3A2F]`}>
            Not a fit
          </button>
          <button type="button" disabled={busy} onClick={() => void send('later')} className="min-h-[44px] px-2 text-[13.5px] font-semibold text-[#6E6E68] hover:text-[#1F3A2F]">
            Later
          </button>
        </div>
      )}

      {mode === 'reason' && (
        <div className="rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
          <p className="text-[13.5px] font-semibold text-[#161613]">Why not? One tap, or a line. It goes to the partner, never to {candidateFirstName}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {REASONS.map(r => (
              <button
                key={r.code}
                type="button"
                onClick={() => setCode(code === r.code ? null : r.code)}
                className={`min-h-[36px] rounded-full border px-3 text-[13px] font-medium transition-colors ${code === r.code ? 'border-[#1F3A2F] bg-[#E7EDE9] text-[#1F3A2F]' : 'border-[#D2D1C7] bg-white text-[#2A2A26] hover:border-[#1F3A2F]'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="A line helps, optional"
            className="mt-2 w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2 text-[14px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || (!code && !note.trim())} onClick={() => void send('not_a_fit')} className={`${BTN} bg-[#1F3A2F] text-white`}>
              {busy ? 'Saving…' : 'Confirm not a fit'}
            </button>
            <button type="button" onClick={() => setMode('idle')} className="min-h-[44px] px-2 text-[13.5px] font-medium text-[#6E6E68]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={name}
          onChange={e => remember(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={80}
          className="w-full max-w-[240px] rounded-full border border-[#E4E3DC] bg-white px-3 py-1.5 text-[13px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]"
        />
        {error && <span className="text-[13px] text-[#A8564C]">{error}</span>}
      </div>
    </div>
  )
}
