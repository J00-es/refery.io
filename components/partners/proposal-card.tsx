'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { BTN_PRIMARY, BTN_QUIET, FIELD, FOCUS, META } from '@/lib/desk-ui'
import { shortAge } from '@/lib/job-ui'

/**
 * Refery's offer of a search, and the partner's one-tap answer.
 *
 * Two buttons and nothing else, because the decision is binary and the brief
 * is one click away. A decline asks for one line: "no SF supply" and "comp too
 * low" send Refery looking in different places, and a silent no teaches
 * nothing. Unanswered, the proposal lapses after seven days and the search
 * drops back to "on request".
 */
export function ProposalActions({
  assignmentId,
  why,
  proposedAt,
  expiresAt,
  compact = false,
}: {
  assignmentId: string
  why: string | null
  proposedAt: string
  expiresAt: string | null
  compact?: boolean
}) {
  const router = useRouter()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<'working' | 'declined' | null>(null)
  const [done, setDone] = useState<'working' | 'declined' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function answer(status: 'working' | 'declined') {
    setBusy(status)
    setError(null)
    const res = await fetch(`/api/partners/search-assignments/${assignmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, reason: reason.trim() || undefined }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) {
      setError(body.error ?? 'That did not go through.')
      return
    }
    setDone(status)
    router.refresh()
  }

  if (done === 'working') {
    return (
      <p className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#1F3A2F]">
        <Check className="h-4 w-4" />
        You are working this search
      </p>
    )
  }
  if (done === 'declined') {
    return <p className={META}>Noted. It stays open to you on request.</p>
  }

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
    : null

  return (
    <div className="flex flex-col gap-3">
      {why && !compact && (
        <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-[#6E6E68]">
          <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-[#1F3A2F]" aria-hidden />
          <span>
            <span className="font-semibold text-[#161613]">Why you: </span>
            {why}
          </span>
        </p>
      )}

      {declining ? (
        <div className="flex flex-col gap-2">
          <label className="block text-[13px] font-medium text-[#2A2A26]">
            Not for you. Say why in one line, so we know where to look next.
            <input
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="No supply in SF right now / comp too low for this profile / not my lane"
              className={FIELD}
            />
          </label>
          {error && <p className="text-[12.5px] text-[#A3423A]">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null || reason.trim().length < 3}
              onClick={() => answer('declined')}
              className={`${BTN_QUIET} min-h-[38px] px-4 text-[13px]`}
            >
              {busy === 'declined' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Send and decline
            </button>
            <button
              type="button"
              onClick={() => setDeclining(false)}
              className={`min-h-[38px] px-2 text-[13px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => answer('working')}
            className={`${BTN_PRIMARY} min-h-[38px] px-4 text-[13px]`}
          >
            {busy === 'working' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            I&rsquo;ll work this
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => setDeclining(true)}
            className={`${BTN_QUIET} min-h-[38px] px-4 text-[13px]`}
          >
            Not for me
          </button>
          <span className={`${META} ml-auto`}>
            {`Proposed ${shortAge(proposedAt)}`}
            {daysLeft !== null && ` · ${daysLeft === 0 ? 'expires today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} to answer`}`}
          </span>
          {error && <p className="w-full text-[12.5px] text-[#A3423A]">{error}</p>}
        </div>
      )}
    </div>
  )
}
