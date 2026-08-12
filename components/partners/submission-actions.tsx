'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/desk-ui'
import { SUBMISSION_STATUSES, type SubmissionStatus } from '@/lib/partners'

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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function move(to: SubmissionStatus, withNote?: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/partners/submissions/${submissionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, note: withNote?.trim() || undefined }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Could not update that.')
        return
      }
      setOpen(false)
      setNext(null)
      setNote('')
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
        className={`inline-flex min-h-[34px] items-center gap-1 rounded-full border border-[#ECECE6] px-2.5 text-[12.5px] font-medium text-[#6E6E68] transition-colors hover:border-[#1F4D3A] hover:text-[#1F4D3A] ${FOCUS}`}
      >
        Move
        <ChevronDown className="h-3 w-3" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-[248px] rounded-[14px] border border-[#ECECE6] bg-white p-1.5 shadow-[0_12px_32px_rgba(22,22,19,0.1)]">
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
                placeholder="A line back to the scout — optional, but it is why they keep sourcing."
                className={`mt-2 w-full resize-none rounded-[10px] border border-[#ECECE6] px-2.5 py-2 text-[13px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
              />
              {error && <p className="mt-1 text-[12px] text-[#A3423A]">{error}</p>}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => move(next, note)}
                  className={`inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1F4D3A] px-3 text-[12.5px] font-semibold text-white disabled:opacity-60 ${FOCUS}`}
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
                    className={`flex w-full min-h-[38px] items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] text-[#161613] transition-colors hover:bg-[#F0F0EA] ${FOCUS}`}
                  >
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${option.dot}`} />
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
