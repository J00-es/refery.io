'use client'

import { useState } from 'react'

export function IntroConfirm({ token, first, ownerFirst, pageUrl, candidateEmail }: { token: string; first: string; ownerFirst: string; pageUrl: string; candidateEmail: string | null }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  async function go() {
    setBusy(true)
    try {
      const res = await fetch(`/api/intro/${token}`, { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
      setResult({ ok: res.ok && data.ok === true, message: data.message ?? data.error ?? (res.ok ? 'Done.' : 'Something went wrong.') })
    } catch {
      setResult({ ok: false, message: 'Could not reach Refery. Try again in a minute, or use the button on the candidate page.' })
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    return (
      <div>
        <p className={result.ok ? 'text-[#1F3A2F]' : 'text-[#8A3B2B]'}>{result.message}</p>
        <p className="mt-4 text-[13.5px] text-[#6E6E68]">
          <a className="underline" href={pageUrl}>Open {first}&apos;s page in Refery</a> to follow along.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p>
        Lily writes to {first} today at <b>{candidateEmail ?? 'their email on record'}</b>, says the introduction came from {ownerFirst === 'you' ? 'you' : ownerFirst}, and puts you in copy. {first} gets Lily&apos;s calendar link, and you hear from Lily at each step after that.
      </p>
      <p className="mt-3 text-[13.5px] text-[#6E6E68]">Prefer to make the intro yourself? Close this and send {first} an email with lily@refery.io in copy. Lily sees it within half an hour.</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={go}
          className="inline-flex min-h-[44px] items-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1F3A2F]"
        >
          {busy ? 'Sending…' : `Yes, have Lily reach out to ${first}`}
        </button>
        <a className="text-[13.5px] underline" href={pageUrl}>Open {first}&apos;s page instead</a>
      </div>
    </div>
  )
}
