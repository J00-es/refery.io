'use client'

/** The candidate's two buttons. One tap, then a thank-you; nothing else to fill in. */

import { useState } from 'react'

export function ConsentAnswer({ token, partnerFirstName, initial }: { token: string; partnerFirstName: string; initial: 'requested' | 'agreed' | 'declined' }) {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function send(answer: 'agreed' | 'declined') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/c/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer }) })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that.')
      setStatus(answer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'agreed') {
    return <p className="mt-5 rounded-[12px] bg-[#E7EDE9] px-4 py-3 text-[15px] leading-relaxed text-[#1F3A2F]">Thank you. {partnerFirstName} has it and will come back to you with the company name and the next step. Nothing is shared without that yes; you can change your mind by replying to the email.</p>
  }
  if (status === 'declined') {
    return <p className="mt-5 rounded-[12px] bg-[#EAE9E1] px-4 py-3 text-[15px] leading-relaxed text-[#2A2A26]">Noted, and no problem. {partnerFirstName} will not put you forward for this one. Nothing about you goes anywhere.</p>
  }
  return (
    <div className="mt-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} onClick={() => void send('agreed')} className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full bg-[#1F3A2F] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50">
          {busy ? 'One moment…' : 'Yes, go ahead'}
        </button>
        <button type="button" disabled={busy} onClick={() => void send('declined')} className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-[#D2D1C7] bg-white px-6 text-[15px] font-semibold text-[#161613] transition-colors hover:border-[#1F3A2F] disabled:opacity-50">
          Not now
        </button>
      </div>
      {error && <p className="mt-2 text-[13.5px] text-[#A8564C]">{error}</p>}
    </div>
  )
}
