'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * What a partner sees on someone Lily asked them to introduce: the intro kit
 * (email, LinkedIn, a forwardable three-line intro) and the three things they
 * can do. The same kit is in the email; this is where the link in it lands.
 */
export function PartnerIntroButtons({
  candidateId,
  first,
  email,
  phone,
  linkedin,
  forwardable,
  mailto,
  preview = false,
}: {
  candidateId: string
  first: string
  email: string | null
  phone: string | null
  linkedin: string | null
  forwardable: string
  mailto: string | null
  /** Lily's view of what the partner sees. Nothing here acts. */
  preview?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function act(action: 'made' | 'send_for_me') {
    if (preview) {
      setMsg({ ok: true, text: 'Preview only. The partner presses this on their side.' })
      return
    }
    setBusy(action)
    setMsg(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/intro`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
      setMsg({ ok: res.ok, text: data.message ?? data.error ?? (res.ok ? 'Done.' : 'Something went wrong.') })
      if (res.ok) router.refresh()
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(forwardable)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setMsg({ ok: false, text: 'Could not copy. Select the text and copy it by hand.' })
    }
  }

  const btn = (cls: string) => `inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors disabled:opacity-50 ${FOCUS} ${cls}`

  return (
    <div className="mt-4 rounded-[12px] border border-[#1F3A2F]/30 bg-[#E7EDE9] p-4">
      {preview && <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[#9C9C95]">What the partner sees on this page</p>}
      <p className="text-[13.5px] font-semibold text-[#1F3A2F]">Lily asked you for a warm intro</p>
      <p className="mt-1 text-[12.5px] text-[#2A2A26]">An email with the two of them on it is perfect. Or have Lily write to {first} and say it came from you.</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {mailto ? (
          <a href={mailto} className={btn('bg-[#1F3A2F] text-white hover:bg-[#142E24]')}>
            Open a pre-filled intro email
          </a>
        ) : null}
        <button type="button" disabled={!!busy} className={btn('border border-[#1F3A2F] bg-white text-[#1F3A2F] hover:bg-[#F7F7F3]')} onClick={() => act('send_for_me')}>
          {busy === 'send_for_me' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Have Lily reach out
        </button>
        <button type="button" disabled={!!busy} className={btn('border border-[#D2D1C7] bg-white text-[#6E6E68] hover:text-[#161613]')} onClick={() => act('made')}>
          {busy === 'made' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}I made the intro
        </button>
      </div>
      {msg && <p className={`mt-2 text-[12.5px] ${msg.ok ? 'text-[#1F3A2F]' : 'text-[#8A3B2B]'}`}>{msg.text}</p>}

      <div className="relative mt-3 rounded-[10px] border border-dashed border-[#D2D1C7] bg-white/70 px-3 py-2.5 pr-20 text-[13px] leading-relaxed text-[#2A2A26]">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#9C9C95]">Forward this to {first}, with lily@refery.io in copy</p>
        {forwardable}
        <button type="button" onClick={copy} className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-[#1F3A2F] bg-white px-2.5 py-0.5 text-[11.5px] font-semibold text-[#1F3A2F] ${FOCUS}`}>
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-[84px_1fr] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-[#9C9C95]">Email</dt>
        <dd className="min-w-0 break-words text-[#161613]">{email ? <a className="underline underline-offset-2" href={`mailto:${email}`}>{email}</a> : 'not on record'}</dd>
        {linkedin && (
          <>
            <dt className="text-[#9C9C95]">LinkedIn</dt>
            <dd className="min-w-0 break-words text-[#161613]"><a className="underline underline-offset-2" href={linkedin} target="_blank" rel="noreferrer">{linkedin.replace(/^https?:\/\/(www\.)?/, '')}</a></dd>
          </>
        )}
        {phone && (
          <>
            <dt className="text-[#9C9C95]">Phone</dt>
            <dd className="text-[#161613]">{phone}</dd>
          </>
        )}
      </dl>
      <p className="mt-2 text-[12px] text-[#9C9C95]">Made the intro from your own inbox? Lily sees it within half an hour, or press &ldquo;I made the intro&rdquo;.</p>
    </div>
  )
}
