'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * Inviting a colleague.
 *
 * The role is chosen here rather than after they arrive, because the point at
 * which you know what someone will do is when you are inviting them, and a
 * default of "sees everything" is how a firm ends up giving a contractor the
 * whole book.
 */

const ROLES = [
  { value: 'recruiter', label: 'Recruiter', help: 'Sees and submits across the firm' },
  { value: 'admin', label: 'Firm admin', help: 'Also invites, removes and manages billing' },
  { value: 'coordinator', label: 'Coordinator', help: 'Only candidates assigned to them, cannot submit' },
] as const

export function InviteForm({ disabled, reason }: { disabled?: boolean; reason?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('recruiter')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    setSent(null)
    try {
      const res = await fetch('/api/firms/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not send that invitation.')
        return
      }
      // An invitation that exists but was not emailed is worse than a failure,
      // because nobody arrives and nobody knows why.
      setSent(
        body.emailed
          ? `Invitation sent to ${body.invited}.`
          : `Invitation created for ${body.invited}, but the email did not send. Send them the link yourself.`,
      )
      setEmail('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-5">
      <p className="text-[15px] font-semibold text-[#161613]">Invite a colleague</p>
      <p className="mt-1 text-[13px] text-[#6E6E68]">
        {/* A disabled box with no explanation reads as broken. Say which of the
            two waits they are in, since one of them they can chase. */}
        {reason ?? 'They accept short access terms of their own, then they are in. No separate approval needed.'}
      </p>

      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <input
          type="email"
          value={email}
          disabled={disabled}
          onChange={e => setEmail(e.target.value)}
          placeholder="colleague@aldertalent.com"
          className={`flex-1 rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14px] text-[#161613] placeholder:text-[#B8B8B0] disabled:bg-[#FAF9F5] ${FOCUS}`}
        />
        <select
          value={role}
          disabled={disabled}
          onChange={e => setRole(e.target.value)}
          className={`rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14px] text-[#161613] disabled:bg-[#FAF9F5] ${FOCUS}`}
        >
          {ROLES.map(r => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={submit}
          disabled={!email.trim() || busy || disabled}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:cursor-not-allowed disabled:bg-[#B4C7BC] ${FOCUS}`}
        >
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>

      <p className="mt-2 text-[12.5px] text-[#9C9C95]">
        {ROLES.find(r => r.value === role)?.help}
      </p>

      {error && (
        <p className="mt-3 rounded-[10px] border border-[#E8CFCB] bg-[#F5E9E7] px-3 py-2.5 text-[13px] text-[#8E4239]">
          {error}
        </p>
      )}
      {sent && (
        <p className="mt-3 rounded-[10px] border border-[#C6D6CC] bg-[#E7EDE9] px-3 py-2.5 text-[13px] text-[#1F3A2F]">
          {sent}
        </p>
      )}
    </div>
  )
}
