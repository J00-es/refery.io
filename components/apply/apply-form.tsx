'use client'

import { useEffect, useRef, useState } from 'react'
import { CONSENT_TEXT, EMPTY_ANSWERS, validateAnswers, type ApplyAnswers } from '@/lib/apply/options'
import { INPUT, Q, RolesFields, WantsFields } from '@/components/apply/answer-fields'

/**
 * The candidate door: a landing and three steps, phone first, no login.
 * One request at the end carries the CV and the answers, so an abandoned
 * form never costs a parse.
 */

type Outcome = { state: 'created'; reviewDate: string | null } | { state: 'duplicate' } | { state: 'not_resume' }

const Btn = ({ children, onClick, disabled, secondary }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; secondary?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex min-h-[48px] w-full items-center justify-center rounded-full text-[14px] font-semibold transition-colors disabled:opacity-60 ${secondary ? 'border border-[#D2D1C7] bg-white text-[#161613] hover:border-[#1F3A2F]' : 'bg-[#1F3A2F] text-white hover:bg-[#142E24]'}`}>
    {children}
  </button>
)

function Progress({ n, label }: { n: number; label: string }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex gap-1">{[1, 2, 3].map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i <= n ? 'bg-[#1F3A2F]' : 'bg-[#E4E3DC]'}`} />)}</div>
      <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">{n} of 3 · {label}</p>
    </div>
  )
}

export function ApplyForm({ from, siteKey }: { from: string | null; siteKey: string | null }) {
  const [step, setStep] = useState(0)
  const [a, setA] = useState<ApplyAnswers>(EMPTY_ANSWERS)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Outcome | null>(null)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkSent, setLinkSent] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!siteKey || document.querySelector('script[data-turnstile]')) return
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
    s.async = true
    s.setAttribute('data-turnstile', '1')
    document.head.appendChild(s)
  }, [siteKey])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step, done])

  function go(n: number) {
    setError(null)
    setStep(n)
  }

  function next(n: number) {
    if (n === 2 && !file) return setError('Your CV as a PDF, please.')
    const problem = validateAnswers(a, { needsConsent: false })
    if (problem && problem.step < n) return setError(problem.message)
    go(n)
  }

  async function submit() {
    setError(null)
    if (!file) return setError('Your CV as a PDF, please.')
    const problem = validateAnswers(a, { needsConsent: true })
    if (problem) {
      setStep(problem.step)
      return setError(problem.message)
    }
    setBusy(true)
    const fd = new FormData()
    fd.set('cv', file)
    fd.set('answers', JSON.stringify(a))
    fd.set('source', from ? 'go' : 'apply')
    if (from) fd.set('campaign', from)
    const hp = formRef.current?.querySelector<HTMLInputElement>('input[name=website]')
    if (hp) fd.set('website', hp.value)
    const ts = formRef.current?.querySelector<HTMLInputElement>('input[name=cf-turnstile-response]')
    if (ts) fd.set('cf-turnstile-response', ts.value)
    try {
      const res = await fetch('/api/apply', { method: 'POST', body: fd })
      const json = (await res.json().catch(() => ({}))) as Outcome & { error?: string; step?: number }
      if (!res.ok) {
        if (json.step) setStep(json.step)
        setError(json.error ?? 'That did not go through. Try again in a moment.')
        return
      }
      setDone(json)
    } catch {
      setError('That did not go through. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  async function requestLink() {
    if (!linkEmail.includes('@')) return
    await fetch('/api/apply/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: linkEmail }) }).catch(() => null)
    setLinkSent(true)
  }

  const first = a.fullName.trim().split(/\s+/)[0] || 'there'

  if (done?.state === 'created') {
    return (
      <div className="grid gap-3">
        <section className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7EDE9]"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1F3A2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 9.5l3.5 3.5 7.5-8" /></svg></span>
          <h1 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.02em]">Your profile is in.</h1>
          <p className="mt-2 text-[14px] text-[#2A2A26]">Thanks, {first}. Lily reads every profile herself, and you&rsquo;ll hear by <b>{done.reviewDate ?? 'the day after tomorrow'}</b>, either way.</p>
          <div className="mt-4 grid gap-2 rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3 text-[13px]">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">What happens next</p>
            <p>1. Lily reads your CV and what you told us.</p>
            <p>2. If a live search fits: a 15-minute call with Lily, then you decide role by role.</p>
            <p>3. If not yet: we keep you in mind, and you get one email when a search fits.</p>
          </div>
          <p className="mt-3 text-[12.5px] text-[#6E6E68]">A private link to your profile is in your inbox from lily@refery.io. Use it to update, pause or delete.</p>
        </section>
      </div>
    )
  }
  if (done?.state === 'duplicate') {
    return (
      <section className="rounded-[16px] border border-[#E4D9B8] bg-white p-5">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">We already have your profile.</h1>
        <p className="mt-2 text-[13.5px] text-[#6E6E68]">Nothing was created twice. We&rsquo;ve emailed a private link to {a.email.trim()} so you can update what you&rsquo;re looking for.</p>
      </section>
    )
  }
  if (done?.state === 'not_resume') {
    return (
      <section className="rounded-[16px] border border-[#E9C9C5] bg-white p-5">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">That file doesn&rsquo;t read as a CV.</h1>
        <p className="mt-2 text-[13.5px] text-[#6E6E68]">We kept nothing. Try a PDF with your roles and dates on it, or email it to lily@refery.io.</p>
        <div className="mt-4"><Btn secondary onClick={() => { setDone(null); setFile(null); go(1) }}>Try another file</Btn></div>
      </section>
    )
  }

  if (step === 0) {
    return (
      <div className="grid gap-4">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#1F3A2F]">For people open to a move</p>
          <h1 className="mt-1 text-[27px] font-semibold leading-[1.12] tracking-[-0.02em]">Tell us once. Hear from us only when something fits.</h1>
          <p className="mt-2 text-[14px] text-[#6E6E68]">Refery introduces senior people to seed to Series B startups in SF, New York and a few other hubs. No job board, no applications. Lily reads every profile herself.</p>
        </div>
        <section className="grid gap-3 rounded-[14px] border border-[#E4E3DC] bg-white p-4 text-[13px]">
          {[
            ['Nothing shared without your yes.', 'Your name and CV reach a company only after you say yes to that specific role.'],
            ['You hear either way.', 'Within two working days: a short call if a search fits, a note that we are keeping you in mind, or a candid no.'],
            ['Nudged, not spammed.', 'When a search fits what you told us, one email from Lily. Never a newsletter.'],
          ].map(([t, d], i) => (
            <div key={t} className="grid grid-cols-[26px_1fr] gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E7EDE9] text-[12px] font-bold text-[#1F3A2F]">{i + 1}</span>
              <p><span className="font-semibold">{t}</span> <span className="text-[#6E6E68]">{d}</span></p>
            </div>
          ))}
        </section>
        <Btn onClick={() => go(1)}>Share my CV</Btn>
        <p className="text-center text-[12px] text-[#9C9C95]">About three minutes. Your CV as a PDF does most of the work.</p>
        <section className="rounded-[14px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
          {linkSent ? (
            <p className="text-[12.5px] text-[#2A2A26]">If we have a profile under that email, the private link is on its way.</p>
          ) : (
            <div className="grid gap-2">
              <p className="text-[12.5px] font-semibold">Already with us? Update what you&rsquo;re looking for.</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input value={linkEmail} onChange={e => setLinkEmail(e.target.value)} type="email" placeholder="Your email" className={INPUT} />
                <button type="button" onClick={requestLink} className="min-h-[44px] rounded-full border border-[#D2D1C7] bg-white px-4 text-[12.5px] font-semibold">Send link</button>
              </div>
            </div>
          )}
        </section>
        <p className="text-[11.5px] text-[#9C9C95]">Free for you, always. Companies pay Refery when they hire. Your profile is kept for 24 months unless you pause or delete it, which you can do any time from your private link.</p>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={e => e.preventDefault()} className="grid gap-4">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      {step === 1 && (
        <>
          <Progress n={1} label="Your CV" />
          <label className={`grid cursor-pointer place-items-center gap-1 rounded-[14px] border-[1.5px] border-dashed bg-white px-4 py-6 text-center ${file ? 'border-[#1F3A2F]' : 'border-[#1F3A2F]/60'}`}>
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0] ?? null; if (f && f.size > 10 * 1024 * 1024) { setError('That file is over 10 MB.'); return } setError(null); setFile(f) }} />
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E7EDE9]"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#1F3A2F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12V3M5 7l4-4 4 4M3 14v1h12v-1" /></svg></span>
            <span className="text-[14px] font-semibold">{file ? file.name : 'Tap to choose your CV'}</span>
            <span className="text-[12px] text-[#9C9C95]">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · tap to change` : 'PDF only, up to 10 MB. LinkedIn exports are fine.'}</span>
          </label>
          <Q title="Your name"><input value={a.fullName} onChange={e => setA({ ...a, fullName: e.target.value })} autoComplete="name" className={INPUT} /></Q>
          <Q title="Email" hint="Where the receipt and any follow-up go."><input value={a.email} onChange={e => setA({ ...a, email: e.target.value })} type="email" autoComplete="email" autoCapitalize="none" className={INPUT} /></Q>
          <Q title="LinkedIn" hint="Optional. Helps us avoid duplicates."><input value={a.linkedin} onChange={e => setA({ ...a, linkedin: e.target.value })} placeholder="linkedin.com/in/…" autoCapitalize="none" className={INPUT} /></Q>
          <Q title="Where you are now" hint="City, and country if not the US."><input value={a.currentLocation} onChange={e => setA({ ...a, currentLocation: e.target.value })} placeholder="San Francisco, CA" className={INPUT} /></Q>
          {error && <p className="text-[12.5px] text-[#A3423A]">{error}</p>}
          <Btn onClick={() => next(2)}>Next: what you&rsquo;re looking for</Btn>
          <p className="text-[11.5px] text-[#9C9C95]">The CV is read once by our system so you don&rsquo;t retype it, stored privately, and shown to a company only after your yes.</p>
        </>
      )}
      {step === 2 && (
        <>
          <Progress n={2} label="What you're looking for" />
          <WantsFields value={a} onChange={setA} />
          {error && <p className="text-[12.5px] text-[#A3423A]">{error}</p>}
          <Btn onClick={() => next(3)}>Next: two more things</Btn>
          <Btn secondary onClick={() => go(1)}>Back</Btn>
        </>
      )}
      {step === 3 && (
        <>
          <Progress n={3} label="Two more things" />
          <RolesFields value={a} onChange={setA} />
          <label className="grid gap-1.5 rounded-[14px] border border-[#1F3A2F] bg-white p-4">
            <span className="flex items-start gap-2.5">
              <input type="checkbox" checked={a.consent} onChange={e => setA({ ...a, consent: e.target.checked })} className="mt-0.5 h-5 w-5 accent-[#1F3A2F]" />
              <span className="text-[13px]">{CONSENT_TEXT}</span>
            </span>
            <span className="pl-[30px] text-[12px] text-[#6E6E68]">Unticked on purpose. <a href="https://refery.io/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F3A2F] underline underline-offset-2">How we handle your data</a></span>
          </label>
          {siteKey && <div className="cf-turnstile" data-sitekey={siteKey} data-size="flexible" />}
          {error && <p className="text-[12.5px] text-[#A3423A]">{error}</p>}
          <Btn onClick={submit} disabled={busy}>{busy ? 'Reading your CV…' : 'Send my profile'}</Btn>
          <Btn secondary onClick={() => go(2)} disabled={busy}>Back</Btn>
          <p className="text-center text-[11.5px] text-[#9C9C95]">You&rsquo;ll get a receipt from lily@refery.io the same minute, with a private link to update, pause or delete.</p>
        </>
      )}
    </form>
  )
}
