'use client'

/**
 * "Type your email and we invite you to Slack with Lily."
 *
 * One field, one button. The server tries to send a Slack Connect invitation
 * and, when it cannot, hands the email to Lily; the message under the field
 * says which of the two happened, because "check your inbox" is only true in
 * the first case. Teammates can be added one after another.
 */

import { useState } from 'react'
import type { InviteBlock } from '@/lib/brief'
import { useBriefComments } from './comments-provider'

export interface BriefInvite {
  email: string
  status: 'requested' | 'invited' | 'manual' | 'failed'
}

export function BriefInviteForm({
  slug,
  block,
  initial,
}: {
  slug: string
  block: InviteBlock
  initial: BriefInvite[]
}) {
  const { authorName } = useBriefComments()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<BriefInvite[]>(initial)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const value = email.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/b/${slug}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value, authorName }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not send that.')
      const invite = json.invite as BriefInvite
      setSent(prev => [...prev.filter(i => i.email !== invite.email), invite])
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="my-5 rounded-[12px] border border-[#E4E3DC] bg-white px-5 py-4 sm:px-6">
      <p className="text-[14.5px] font-semibold leading-relaxed text-[#161613]">{block.prompt}</p>
      {block.note && <p className="mt-1 text-[13px] leading-relaxed text-[#6E6E68]">{block.note}</p>}

      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={e => {
          e.preventDefault()
          void submit()
        }}
      >
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={block.placeholder ?? 'you@company.com'}
          maxLength={200}
          className="min-h-[44px] w-full flex-1 rounded-full border border-[#D2D1C7] bg-white px-4 text-[14.5px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50"
        >
          {busy ? 'Sending…' : block.button ?? 'Invite me to Slack'}
        </button>
      </form>
      {error && <p className="mt-2 text-[13px] text-[#A8564C]">{error}</p>}

      {sent.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {sent.map(i => (
            <li key={i.email} className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] leading-snug">
              <span className="font-medium text-[#161613]">{i.email}</span>
              <span className="text-[#6E6E68]">
                {i.status === 'invited'
                  ? 'Invitation sent. Check your inbox for the Slack email.'
                  : i.status === 'failed'
                    ? 'Could not send. Lily has been told.'
                    : 'Lily has it and will send the Slack invitation shortly.'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {sent.length > 0 && (
        <p className="mt-2 text-[12.5px] text-[#9C9C95]">Add a teammate by entering another address.</p>
      )}
    </div>
  )
}
