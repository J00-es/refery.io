'use client'

import { useEffect, useRef, useState } from 'react'
import { BASE_BANDS, WORK_AUTH_US } from '@/lib/apply/options'

/**
 * "I'm interested": short on purpose. The desk needs a CV, a way to reach
 * the person, work authorisation and a base; the partner answers the rest in
 * the pitch, and the person can complete preferences later from the private
 * link in their receipt. Same vocabulary as /apply, so nothing is asked twice.
 */
type Outcome = { state: 'created'; reviewDate: string | null } | { state: 'duplicate' } | { state: 'not_resume' }

const INPUT = 'h-11 w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 text-[14px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]'
const PILL = (on: boolean) => `inline-flex min-h-[40px] items-center rounded-full border px-3.5 text-[13px] font-medium transition-colors ${on ? 'border-[#1F3A2F] bg-[#E7EDE9] text-[#1F3A2F]' : 'border-[#D2D1C7] bg-white text-[#161613]'}`

export function InterestedForm({ slug, via, referrerFirst, headline, siteKey, shareHref }: { slug: string; via: string | null; referrerFirst: string | null; headline: string; siteKey: string | null; shareHref: string }) {
  const who = referrerFirst ?? 'Lily'
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [location, setLocation] = useState('')
  const [auth, setAuth] = useState<string | null>(null)
  const [band, setBand] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Outcome | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!siteKey || document.querySelector('script[data-turnstile]')) return
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    s.async = true
    s.setAttribute('data-turnstile', '1')
    document.head.appendChild(s)
  }, [siteKey])

  async function submit() {
    setError(null)
    if (!file) return setError('Your CV as a PDF, please.')
    if (name.trim().length < 2) return setError('Your name, please.')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError('An email that works, please.')
    if (linkedin.trim() && !/linkedin\.com\/in\//i.test(linkedin)) return setError('That does not look like a LinkedIn profile link.')
    if (!consent) return setError('Tick the consent line so we may keep your profile.')
    setBusy(true)
    const fd = new FormData()
    fd.set('cv', file)
    fd.set('name', name)
    fd.set('email', email)
    fd.set('linkedin', linkedin)
    fd.set('location', location)
    if (auth) fd.set('workAuthUs', auth)
    if (band) fd.set('base', band)
    fd.set('note', note)
    fd.set('consent', '1')
    if (via) fd.set('via', via)
    const hp = formRef.current?.querySelector<HTMLInputElement>('input[name=website]')
    if (hp) fd.set('website', hp.value)
    const ts = formRef.current?.querySelector<HTMLInputElement>('input[name=cf-turnstile-response]')
    if (ts) fd.set('cf-turnstile-response', ts.value)
    try {
      const res = await fetch(`/api/j/${slug}/interested`, { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({}))) as Outcome & { error?: string }
      if (!res.ok) {
        setError(json.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      setDone(json)
      window.scrollTo({ top: (document.getElementById('interested')?.offsetTop ?? 0) - 24 })
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  const first = name.trim().split(/\s+/)[0] || 'there'
  if (done?.state === 'created') {
    return (
      <section className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7EDE9]"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1F3A2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 9.5l3.5 3.5 7.5-8" /></svg></span>
        <h2 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.02em]">Your profile is in.</h2>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#2A2A26]">
          Thanks, {first}. {referrerFirst ? `${referrerFirst} has it this minute. Once ${referrerFirst} confirms the introduction, Lily reads it herself, by ` : 'Lily reads every profile herself, and you hear by '}<b>{done.reviewDate ?? 'the day after tomorrow'}</b>{referrerFirst ? ' at the latest' : ''}, either way.
        </p>
        <p className="mt-3 text-[12.5px] text-[#6E6E68]">A private link to your profile is in your inbox from lily@refery.io. Use it to add what you are looking for, pause, or delete.</p>
      </section>
    )
  }
  if (done?.state === 'duplicate') {
    return (
      <section className="rounded-[16px] border border-[#E4D9B8] bg-white p-5">
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">We already have your profile.</h2>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-[#6E6E68]">Nothing was created twice. We have emailed a private link to {email.trim()} so you can say you are interested in this one.</p>
      </section>
    )
  }
  if (done?.state === 'not_resume') {
    return (
      <section className="rounded-[16px] border border-[#E9C9C5] bg-white p-5">
        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">That file does not read as a CV.</h2>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-[#6E6E68]">We kept nothing. Try a PDF with your roles and dates on it, or email it to lily@refery.io.</p>
        <button type="button" onClick={() => { setDone(null); setFile(null) }} className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#D2D1C7] bg-white px-5 text-[14px] font-semibold">Try another file</button>
      </section>
    )
  }

  return (
    <form ref={formRef} onSubmit={e => { e.preventDefault(); void submit() }} className="rounded-[16px] border border-[#E4E3DC] bg-white p-5 sm:p-6">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      <h2 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">Two minutes, then {who} takes it from here.</h2>
      <p className="mt-2 text-[13.5px] leading-[1.6] text-[#6E6E68]">Your CV goes to {referrerFirst ? `${referrerFirst} and to Lily at Refery` : 'Lily at Refery'}. It goes to the company only after you say yes to that conversation.</p>

      <label className={`mt-5 grid cursor-pointer place-items-center gap-1 rounded-[14px] border-[1.5px] border-dashed bg-[#FAF9F5] px-4 py-6 text-center ${file ? 'border-[#1F3A2F]' : 'border-[#1F3A2F]/60'}`}>
        <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 10 * 1024 * 1024) { setError('That file is over 10 MB.'); return } setError(null); setFile(f) }} />
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7EDE9]"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1F3A2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12V3M5 7l4-4 4 4M3 14v1h12v-1" /></svg></span>
        <span className="text-[14px] font-semibold">{file ? file.name : 'Tap to choose your CV'}</span>
        <span className="text-[12px] text-[#9C9C95]">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to change` : 'PDF only, up to 10 MB. LinkedIn exports are fine.'}</span>
      </label>

      <div className="mt-4 grid gap-4">
        <label className="grid gap-1.5"><span className="text-[13px] font-medium text-[#2A2A26]">Your name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" className={INPUT} /></label>
        <label className="grid gap-1.5"><span className="text-[13px] font-medium text-[#2A2A26]">Email</span><input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" autoCapitalize="none" className={INPUT} /><span className="text-[12px] text-[#9C9C95]">Where the receipt and any follow-up go.</span></label>
        <label className="grid gap-1.5"><span className="text-[13px] font-medium text-[#2A2A26]">LinkedIn <span className="font-normal text-[#9C9C95]">optional</span></span><input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="linkedin.com/in/…" autoCapitalize="none" className={INPUT} /></label>
        <label className="grid gap-1.5"><span className="text-[13px] font-medium text-[#2A2A26]">Where you are now</span><input value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco, CA" className={INPUT} /></label>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#2A2A26]">US work authorisation</span>
          <div className="flex flex-wrap gap-1.5">{WORK_AUTH_US.map(o => <button key={o} type="button" onClick={() => setAuth(auth === o ? null : o)} className={PILL(auth === o)}>{o}</button>)}</div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-[13px] font-medium text-[#2A2A26]">Base you would move for</span>
          <div className="flex flex-wrap gap-1.5">{BASE_BANDS.USD.map(b => <button key={b.label} type="button" onClick={() => setBand(band === b.label ? null : b.label)} className={PILL(band === b.label)}>{b.label}</button>)}</div>
        </div>
        <label className="grid gap-1.5"><span className="text-[13px] font-medium text-[#2A2A26]">Anything for {referrerFirst ? `${referrerFirst} or Lily` : 'Lily'} <span className="font-normal text-[#9C9C95]">optional</span></span><textarea value={note} onChange={e => setNote(e.target.value.slice(0, 280))} rows={3} placeholder="Why this one, or what you would need to know first." className="w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]" /></label>
      </div>

      <label className="mt-5 flex items-start gap-2.5 rounded-[14px] border border-[#1F3A2F] bg-white p-4">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1F3A2F]" />
        <span className="text-[13px] leading-[1.55]">Keep my profile for matching for 24 months. {referrerFirst ? `${referrerFirst} and Refery` : 'Refery'} can see it; a company sees it only after I say yes to that role. I can pause or delete it any time.</span>
      </label>
      {siteKey && <div className="cf-turnstile mt-4" data-sitekey={siteKey} data-size="flexible" />}
      {error && <p className="mt-3 text-[12.5px] text-[#A3423A]">{error}</p>}
      <button type="submit" disabled={busy} className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-60">{busy ? 'Reading your CV…' : `Send to ${who}`}</button>
      <p className="mt-3 text-center text-[11.5px] text-[#9C9C95]">You get a private link by email to change or delete this later. Know someone better suited? <a href={shareHref} className="font-semibold text-[#1F3A2F] underline underline-offset-2">Send them the door</a>.</p>
      <p className="mt-1 text-center text-[11.5px] text-[#9C9C95]">{headline}</p>
    </form>
  )
}
