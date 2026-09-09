'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The who-are-you step on a campaign page. Three fields, one button, and an
 * honest result: straight to account setup when the person is on the
 * campaign's list, otherwise a receipt and Lily reads it.
 */
export function WhoAreYou({ slug }: { slug: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [linkedin, setLinkedin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ state: string; reviewDate?: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !email.includes('@') || !/linkedin\.com\/in\//i.test(linkedin)) {
      setError('Your name, an email we can reach you on, and your LinkedIn profile URL.')
      return
    }
    setBusy(true)
    const res = await fetch('/api/go', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, name, email, linkedin }) })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) {
      setError(data.error ?? 'That did not go through. Try again in a moment.')
      return
    }
    if (data.state === 'matched' && data.next) {
      router.push(data.next)
      return
    }
    setResult(data)
  }

  if (result?.state === 'account') {
    return (
      <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
        <p className="text-[14px] font-semibold">You already have a Refery account.</p>
        <p className="mt-1 text-[13px] text-[#6E6E68]">Everything is inside it, including this search.</p>
        <a href="/auth/login" className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#1F3A2F] text-[13.5px] font-semibold text-white">Log in</a>
      </section>
    )
  }
  if (result?.state === 'applied') {
    return (
      <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
        <p className="text-[14px] font-semibold">You&rsquo;ve already applied, and it&rsquo;s with Lily.</p>
        <p className="mt-1 text-[13px] text-[#6E6E68]">Nothing else to do. You&rsquo;ll hear from her by email.</p>
      </section>
    )
  }
  if (result?.state === 'review') {
    return (
      <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
        <p className="text-[14px] font-semibold">Thanks, {name.trim().split(/\s+/)[0]}. Lily reads every application herself.</p>
        <p className="mt-1 text-[13px] text-[#6E6E68]">You&rsquo;ll hear by {result.reviewDate ?? 'the day after tomorrow'}. A copy of this is in your inbox from lily@refery.io.</p>
      </section>
    )
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-[14px] border border-[#1F3A2F] bg-white p-4">
      <p className="text-[13px] font-semibold">Who are you?</p>
      <p className="text-[12.5px] text-[#6E6E68]">So we can match you to the invitation and skip the application.</p>
      <div className="mt-3 grid gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name" className="h-11 rounded-[10px] border border-[#D2D1C7] px-3 text-[14px]" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" autoCapitalize="none" className="h-11 rounded-[10px] border border-[#D2D1C7] px-3 text-[14px]" />
        <input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="Your LinkedIn profile URL" autoCapitalize="none" autoCorrect="off" className="h-11 rounded-[10px] border border-[#D2D1C7] px-3 text-[14px]" />
      </div>
      {error && <p className="mt-2 text-[12.5px] text-[#A3423A]">{error}</p>}
      <button type="submit" disabled={busy} className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white disabled:opacity-60">
        {busy ? 'One moment' : 'Continue'}
      </button>
      <p className="mt-2 text-center text-[12px] text-[#9C9C95]">If the invitation was addressed to you, you go straight to account setup. If not, Lily reads it within two working days.</p>
    </form>
  )
}
