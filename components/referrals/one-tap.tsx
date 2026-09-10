'use client'

import { useState } from 'react'

/**
 * The two answers, from the email link. "Yes" shows the two optional lines
 * before confirming; "No" confirms and then offers a three-minute undo.
 */
const BTN = 'inline-flex min-h-[44px] items-center justify-center rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-60'
const FIELD = 'mt-1.5 w-full rounded-[12px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14.5px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]'

export function OneTap({ token, first, initial, pageUrl }: { token: string; first: string; initial: 'yes' | 'no' | 'disowned'; pageUrl: string }) {
  const [mode, setMode] = useState<'yes' | 'no' | 'disowned' | 'confirmed'>(initial)
  const [relationship, setRelationship] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function send(action: 'confirm' | 'disown' | 'undo') {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/rf/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, relationship, why }) })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.message ?? json.error ?? 'That did not go through. Try again.')
        return
      }
      setMessage(json.message ?? null)
      setMode(action === 'confirm' ? 'confirmed' : action === 'disown' ? 'disowned' : 'yes')
    } catch {
      setError('That did not go through. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'confirmed') {
    return (
      <div className="grid gap-3">
        <p>{message ?? `Confirmed. ${first} is yours; Lily reads them against every live search.`}</p>
        <a href={pageUrl} className={`${BTN} bg-[#1F3A2F] text-white`}>Open {first}&apos;s page</a>
      </div>
    )
  }
  if (mode === 'disowned') {
    return (
      <div className="grid gap-3">
        <p>{message ?? `Understood. ${first} is off your list and nothing is credited to you.`}</p>
        <p className="text-[13px] text-[#6E6E68]">If your link is being passed around, get a fresh one from your Start page; the old one stops working the same minute.</p>
        <button type="button" disabled={busy} onClick={() => void send('undo')} className={`${BTN} border border-[#D2D1C7] bg-white text-[#161613]`}>Undo, that was a mistake</button>
        <p className="text-[12.5px] text-[#9C9C95]">Undo works for three minutes.</p>
        {error && <p className="text-[13px] text-[#A3423A]">{error}</p>}
      </div>
    )
  }
  if (mode === 'no') {
    return (
      <div className="grid gap-3">
        <p>{first} came through your link, but not from you. Say so and they never reach your list, nothing is credited to you, and Lily decides what to do with the profile.</p>
        <button type="button" disabled={busy} onClick={() => void send('disown')} className={`${BTN} bg-[#1F3A2F] text-white`}>{busy ? 'One moment' : `Not from me`}</button>
        <button type="button" disabled={busy} onClick={() => setMode('yes')} className={`${BTN} border border-[#D2D1C7] bg-white text-[#161613]`}>Actually, yes, I referred {first}</button>
        {error && <p className="text-[13px] text-[#A3423A]">{error}</p>}
      </div>
    )
  }
  return (
    <div className="grid gap-4">
      <p>Say yes and {first} is yours: Lily reads them against every live search and you can put them forward. Two optional lines help her read them first.</p>
      <label className="block">
        <span className="text-[13px] font-medium text-[#2A2A26]">How do you know {first}? <span className="font-normal text-[#9C9C95]">optional, the strong version</span></span>
        <textarea value={relationship} onChange={e => setRelationship(e.target.value)} rows={3} maxLength={600} className={FIELD} />
      </label>
      <label className="block">
        <span className="text-[13px] font-medium text-[#2A2A26]">Why them, and for what? <span className="font-normal text-[#9C9C95]">optional</span></span>
        <textarea value={why} onChange={e => setWhy(e.target.value)} rows={3} maxLength={600} className={FIELD} placeholder="The seat you have in mind, or what they are best at." />
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" disabled={busy} onClick={() => void send('confirm')} className={`${BTN} bg-[#1F3A2F] text-white`}>{busy ? 'One moment' : `Yes, I referred ${first}`}</button>
        <button type="button" disabled={busy} onClick={() => setMode('no')} className={`${BTN} border border-[#D2D1C7] bg-white text-[#161613]`}>Not from me</button>
      </div>
      <p className="text-[12.5px] text-[#9C9C95]">These two lines pre-fill the pitch when you submit {first}, so you never write them twice.</p>
      {error && <p className="text-[13px] text-[#A3423A]">{error}</p>}
    </div>
  )
}
