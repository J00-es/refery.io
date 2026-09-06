'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * Accepting the Team access terms.
 *
 * This screen is the legal moment in the whole firm flow: it is where a person
 * takes on confidentiality and post-access obligations personally, because
 * their firm cannot take them on for them. So it names the firm, links the full
 * text rather than only summarising it, and states the obligation that outlives
 * their employment in plain words.
 */
export function JoinForm({
  token,
  firmName,
  legalName,
  version,
}: {
  token: string
  firmName: string
  legalName: string
  version: string
}) {
  const router = useRouter()
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/firms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, accepted }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not join.')
        return
      }
      router.push('/candidates')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-5 sm:p-6">
      <p className="text-[19px] font-semibold tracking-[-0.015em] text-[#161613]">Join {firmName}</p>
      <p className="mt-1 text-[13.5px] text-[#6E6E68]">
        {legalName} has already agreed the commercial terms with Refery. These cover your own access.
      </p>

      <ul className="mt-4 grid gap-1.5">
        {[
          'Keep client and candidate information confidential.',
          'Use your own account for the firm’s Refery work.',
          'Keep Refery-protected placements on Refery.',
          'Refery pays the firm, not individual team members.',
          'Your independently developed network stays yours.',
        ].map(line => (
          <li
            key={line}
            className="relative pl-[17px] text-[13.5px] leading-[1.55] text-[#6E6E68] before:absolute before:left-0 before:top-[8px] before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#1F3A2F] before:content-['']"
          >
            {line}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px]">
        <a
          href="/firm/guide"
          target="_blank"
          className={`text-[#1F3A2F] underline underline-offset-2 ${FOCUS}`}
        >
          How firm accounts work
        </a>
      </p>

      <p className="mt-2 text-[13px]">
        <a
          href="/partner-terms#team-access"
          target="_blank"
          className={`text-[#1F3A2F] underline underline-offset-2 ${FOCUS}`}
        >
          See the team access terms
        </a>
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border-[#D2D1C7] text-[#1F3A2F] ${FOCUS}`}
        />
        <span className="text-[13.5px] leading-[1.55] text-[#2A2A26]">
          I agree to the Team access terms. I understand{' '}
          <b className="font-semibold text-[#161613]">I have no individual right to payment</b> under{' '}
          {legalName}&rsquo;s agreement, and that confidentiality continues after my access ends.
        </span>
      </label>

      {error && (
        <p className="mt-4 rounded-[10px] border border-[#E8CFCB] bg-[#F5E9E7] px-3 py-2.5 text-[13px] text-[#8E4239]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!accepted || busy}
        className={`mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[#1F3A2F] px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:cursor-not-allowed disabled:bg-[#B4C7BC] ${FOCUS}`}
      >
        {busy ? 'Joining…' : `Accept and join ${firmName}`}
      </button>
    </div>
  )
}
