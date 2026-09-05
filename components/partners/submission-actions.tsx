'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/desk-ui'
import { HM_RATINGS, SUBMISSION_STATUSES, type SubmissionStatus } from '@/lib/partners'

/**
 * Moving a submission, or pulling it back.
 *
 * Admins get the full ladder with a note box, because "declined" without a
 * reason is the thing that makes a scout stop sourcing for you. A scout gets one
 * action — withdraw — and only on their own submission; letting them mark their
 * own candidate placed would make every payout figure in the product fiction.
 */
export function SubmissionActions({
  submissionId,
  status,
  canManage,
  canWithdraw,
}: {
  submissionId: string
  status: SubmissionStatus
  canManage: boolean
  canWithdraw: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState<SubmissionStatus | null>(null)
  const [note, setNote] = useState('')
  const [hmRating, setHmRating] = useState<number | null>(null)
  const [hmNote, setHmNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)

  /** Post the Slack card again, for when it did not land or has since improved. */
  async function resendCard() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/partners/submissions/${submissionId}/announce`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not post the card.')
        return
      }
      setResent(true)
      setTimeout(() => {
        setResent(false)
        setOpen(false)
      }, 1200)
    } finally {
      setBusy(false)
    }
  }

  async function move(to: SubmissionStatus, withNote?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/partners/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: to,
          note: withNote?.trim() || undefined,
          hm_rating: hmRating ?? undefined,
          hm_note: hmNote.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not update that.')
        return
      }
      setOpen(false)
      setNext(null)
      setNote('')
      setHmRating(null)
      setHmNote('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!canManage) {
    if (!canWithdraw) return null
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => move('withdrawn')}
          className={`min-h-[34px] text-[12.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#A3423A] disabled:opacity-60 ${FOCUS}`}
        >
          {busy ? 'Withdrawing…' : 'Withdraw'}
        </button>
        {error && <p className="text-[12px] text-[#A3423A]">{error}</p>}
      </div>
    )
  }

  const options = SUBMISSION_STATUSES.filter(s => s.value !== status && s.value !== 'withdrawn')

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#E4E3DC] px-2.5 text-[12.5px] font-medium text-[#6E6E68] transition-colors hover:border-[#1F3A2F] hover:text-[#1F3A2F] ${FOCUS}`}
      >
        Move
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-[248px] rounded-[14px] border border-[#E4E3DC] bg-white p-1.5 shadow-[0_12px_32px_rgba(22,22,19,0.1)]">
          {next ? (
            <div className="p-2">
              <p className="text-[12.5px] font-semibold text-[#161613]">
                {SUBMISSION_STATUSES.find(s => s.value === next)?.label}
              </p>
              <textarea
                autoFocus
                rows={3}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={
                  next === 'declined'
                    ? 'Why, in one line. The partner reads this, and it is required.'
                    : 'A line back to the partner. Optional, but it is why they keep sourcing.'
                }
                className={`mt-2 w-full resize-none rounded-[10px] border border-[#E4E3DC] px-2.5 py-2 text-[13px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
              />
              {['sent_to_client', 'client_interview', 'offer', 'placed', 'declined'].includes(next) && (
                <div className="mt-2.5">
                  <p className="text-[12px] font-medium text-[#6E6E68]">The hiring manager&rsquo;s read, if you have it</p>
                  <div className="mt-1.5 flex gap-1">
                    {HM_RATINGS.map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setHmRating(hmRating === r.value ? null : r.value)}
                        className={`flex-1 rounded-full border px-1 py-1.5 text-[11.5px] font-semibold transition-colors ${FOCUS} ${
                          hmRating === r.value
                            ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white'
                            : 'border-[#E4E3DC] bg-white text-[#6E6E68] hover:border-[#1F3A2F]'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={hmNote}
                    onChange={e => setHmNote(e.target.value)}
                    placeholder="Their words, lightly edited. Relayed to the partner."
                    className={`mt-1.5 w-full resize-none rounded-[10px] border border-[#E4E3DC] px-2.5 py-2 text-[13px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
                  />
                </div>
              )}
              {error && <p className="mt-1 text-[12px] text-[#A3423A]">{error}</p>}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy || (next === 'declined' && !note.trim())}
                  onClick={() => move(next, note)}
                  className={`inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1F3A2F] px-3 text-[12.5px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setNext(null)}
                  className={`min-h-[34px] px-2 text-[12.5px] text-[#6E6E68] ${FOCUS}`}
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <ul>
              {options.map(option => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => setNext(option.value)}
                    className={`flex w-full min-h-[38px] items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] text-[#161613] transition-colors hover:bg-[#EAE9E1] ${FOCUS}`}
                  >
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.dot}`} />
                    {option.label}
                  </button>
                </li>
              ))}
              <li className="mt-1 border-t border-[#E4E3DC] pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={resendCard}
                  className={`flex w-full min-h-[38px] items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] text-[#6E6E68] transition-colors hover:bg-[#EAE9E1] hover:text-[#161613] disabled:opacity-60 ${FOCUS}`}
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  {resent ? 'Posted to Slack' : 'Resend the Slack card'}
                </button>
                {error && <p className="px-2.5 pb-1 text-[12px] text-[#A3423A]">{error}</p>}
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
