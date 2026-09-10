'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BTN_PRIMARY, BTN_QUIET, BTN_TEXT, FIELD, FIELD_LABEL, META } from '@/lib/desk-ui'

/**
 * On a candidate's page: "came through your link, was this you?" for the
 * referrer, and the answer once given. The same two actions live in the
 * email and in the list; this is the one with the two optional lines.
 */
export interface ReferralView {
  id: string
  status: 'pending' | 'confirmed' | 'disowned' | 'escalated' | 'duplicate'
  code: string
  source: 'link' | 'jd'
  created_at: string
  confirmed_at: string | null
  disowned_at: string | null
  relationship: string | null
  why: string | null
  candidate_note: string | null
}

const UNDO_MS = 3 * 60 * 1000

export function ReferralBanner({ referral, candidateFirst, referrerFirst, viewerIsReferrer, viewerIsSuperAdmin }: { referral: ReferralView; candidateFirst: string; referrerFirst: string; viewerIsReferrer: boolean; viewerIsSuperAdmin: boolean }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [r, setR] = useState(referral)
  const [relationship, setRelationship] = useState(referral.relationship ?? '')
  const [why, setWhy] = useState(referral.why ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (r.status !== 'disowned') return
    const t = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(t)
  }, [r.status])

  async function act(action: 'confirm' | 'disown' | 'undo' | 'rescue') {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/referrals/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, relationship, why, by: 'page' }) })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; rotated?: string | null }
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? 'That did not go through.')
        return
      }
      setMessage(json.message ?? null)
      const at = new Date().toISOString()
      setR(prev => ({ ...prev, status: action === 'confirm' ? 'confirmed' : action === 'disown' ? 'disowned' : action === 'undo' ? 'pending' : 'escalated', confirmed_at: action === 'confirm' ? at : prev.confirmed_at, disowned_at: action === 'disown' ? at : null, relationship: relationship || prev.relationship, why: why || prev.why }))
      start(() => router.refresh())
    } catch {
      setError('That did not go through.')
    } finally {
      setBusy(null)
    }
  }

  const arrived = new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const doorLabel = r.source === 'jd' ? 'a search page you shared' : 'your link'

  if (r.status === 'duplicate') return null

  if (r.status === 'confirmed') {
    return (
      <div className="rounded-[16px] border border-[#E4E3DC] bg-white px-4 py-3">
        <p className="text-[13.5px] text-[#2A2A26]">
          <span className="font-semibold">{viewerIsReferrer ? 'Referred by you' : `Referred by ${referrerFirst}`}</span> · came through {viewerIsReferrer ? doorLabel : r.source === 'jd' ? 'a search page' : 'their link'} on {arrived}{r.confirmed_at ? `, confirmed ${new Date(r.confirmed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}.
        </p>
        {(r.relationship || r.why) && (
          <p className={`mt-1 ${META}`}>{[r.relationship ? `How they know ${candidateFirst}: ${r.relationship}` : null, r.why ? `Why: ${r.why}` : null].filter(Boolean).join(' · ')}</p>
        )}
        {r.candidate_note && <p className={`mt-1 ${META}`}>{candidateFirst} wrote: &ldquo;{r.candidate_note}&rdquo;</p>}
      </div>
    )
  }

  if (r.status === 'disowned') {
    const undoOpen = r.disowned_at ? now - new Date(r.disowned_at).getTime() < UNDO_MS : false
    return (
      <div className="rounded-[16px] border border-[#E4E3DC] bg-white px-4 py-3">
        <p className="text-[13.5px] text-[#2A2A26]"><span className="font-semibold">Not from {viewerIsReferrer ? 'you' : referrerFirst}.</span> {message ?? 'Parked: not matched, not on the desk, no emails.'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {viewerIsReferrer && undoOpen && <button type="button" disabled={!!busy} onClick={() => act('undo')} className={BTN_TEXT}>Undo, that was a mistake</button>}
          {viewerIsSuperAdmin && <button type="button" disabled={!!busy} onClick={() => act('rescue')} className={BTN_TEXT}>Keep as a self-submission owned by me</button>}
        </div>
        {error && <p className="mt-2 text-[13px] text-[#A3423A]">{error}</p>}
      </div>
    )
  }

  // pending or escalated
  if (!viewerIsReferrer) {
    return (
      <div className="rounded-[16px] border border-[#E4D9B8] bg-[#FFFDF7] px-4 py-3">
        <p className="text-[13.5px] text-[#2A2A26]"><span className="font-semibold">Came through {referrerFirst}&rsquo;s {r.source === 'jd' ? 'search page' : 'link'}</span> on {arrived}. {r.status === 'escalated' ? `${referrerFirst} has not answered in a week; the card posted flagged.` : `Waiting for ${referrerFirst} to confirm.`}</p>
        {r.candidate_note && <p className={`mt-1 ${META}`}>{candidateFirst} wrote: &ldquo;{r.candidate_note}&rdquo;</p>}
      </div>
    )
  }
  return (
    <div className="rounded-[16px] border border-[#E4D9B8] bg-[#FFFDF7] p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-[560px]">
          <p className="text-[17px] font-semibold leading-snug text-[#161613]">{candidateFirst} came through {doorLabel}. Was this you?</p>
          <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6E6E68]">Say yes and {candidateFirst} is yours: Lily reads them against every live search and you can put them forward. Say no and they never reach your list, and nothing is credited to you.</p>
          {r.candidate_note && <p className={`mt-2 ${META}`}>{candidateFirst} wrote: &ldquo;{r.candidate_note}&rdquo;</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => act('confirm')} className={`${BTN_PRIMARY} min-h-[40px] px-4 text-[13.5px]`}>{busy === 'confirm' ? 'One moment' : `Yes, I referred ${candidateFirst}`}</button>
          <button type="button" disabled={!!busy} onClick={() => act('disown')} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>Not from me</button>
        </div>
      </div>
      <div className="mt-4 grid gap-4 border-t border-[#EFE6CC] pt-4 sm:grid-cols-2">
        <label className="block"><span className={FIELD_LABEL}>How do you know {candidateFirst}? <span className="font-normal text-[#9C9C95]">optional, the strong version</span></span><textarea value={relationship} onChange={e => setRelationship(e.target.value)} rows={3} maxLength={600} className={FIELD} /></label>
        <label className="block"><span className={FIELD_LABEL}>Why them, and for what? <span className="font-normal text-[#9C9C95]">optional</span></span><textarea value={why} onChange={e => setWhy(e.target.value)} rows={3} maxLength={600} placeholder="The seat you have in mind, or what they are best at. Lily reads this first." className={FIELD} /></label>
      </div>
      <p className={`mt-2 ${META}`}>These two lines pre-fill the pitch when you submit {candidateFirst}, so you never write them twice. {candidateFirst} has already said we may keep their profile for 24 months.</p>
      {error && <p className="mt-2 text-[13px] text-[#A3423A]">{error}</p>}
    </div>
  )
}
