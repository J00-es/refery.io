'use client'

/**
 * The one field on refery.xyz/slack.
 *
 * A partner types the address their Refery account is under. The server tries
 * to send a Slack Connect invitation and, when it cannot, hands the address to
 * Lily; the line under the field says which happened, because "check your
 * inbox" is only true in the first case.
 */

import { useState } from 'react'

type Status = 'invited' | 'manual' | 'unknown' | 'failed'

export function SlackConnectForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ email: string; status: Status } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const value = email.trim()
    if (!value || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/slack/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not send that.')
      setDone(json.invite as { email: string; status: Status })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    const line =
      done.status === 'invited'
        ? 'Invitation sent. Check your inbox for the Slack email, accept it, and you land in a private room with Lily.'
        : done.status === 'unknown'
          ? 'That address is not on a Refery partner account, so Lily has it as a note. If your account is under another email, try that one.'
          : 'Lily has your address and will send the Slack invitation shortly.'
    return (
      <div className="rounded-[14px] border border-[#E4E3DC] bg-white px-5 py-5 sm:px-6">
        <p className="text-[15px] font-semibold text-[#161613]">{done.email}</p>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#6E6E68]">{line}</p>
        {done.status === 'unknown' && (
          <button
            type="button"
            onClick={() => {
              setDone(null)
              setEmail('')
            }}
            className="mt-3 text-[14px] font-semibold text-[#1F3A2F] underline underline-offset-4"
          >
            Try another address
          </button>
        )}
      </div>
    )
  }

  return (
    <form
      className="rounded-[14px] border border-[#E4E3DC] bg-white px-5 py-5 sm:px-6"
      onSubmit={e => {
        e.preventDefault()
        void submit()
      }}
    >
      <label htmlFor="slack-email" className="block text-[14.5px] font-semibold text-[#161613]">
        The email your Refery account is under
      </label>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          id="slack-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@yourfirm.com"
          maxLength={200}
          required
          className="min-h-[46px] w-full flex-1 rounded-full border border-[#D2D1C7] bg-white px-4 text-[15px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="inline-flex min-h-[46px] items-center justify-center rounded-full bg-[#1F3A2F] px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Invite me to Slack'}
        </button>
      </div>
      {error && <p className="mt-2 text-[13.5px] text-[#A8564C]">{error}</p>}
      <p className="mt-3 text-[13px] leading-relaxed text-[#9C9C95]">
        Slack Connect, so you stay in your own workspace. No new account to create.
      </p>
    </form>
  )
}
