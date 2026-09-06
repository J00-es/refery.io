'use client'

import { useState } from 'react'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * The signature that binds the firm.
 *
 * Typing a name rather than only ticking a box, because this person has no
 * account and the typed name is the signature: it is what the record shows, and
 * what a court would look at alongside the timestamp, IP and user agent.
 *
 * The authority representation is its own sentence, separate from accepting the
 * terms, because they are two different things being agreed to and merging them
 * is how a signer later says they never noticed the second one.
 */
export function SignFirmForm({
  token,
  firmName,
  legalName,
  suggestedName,
  versions,
}: {
  token: string
  firmName: string
  legalName: string
  suggestedName: string
  versions: { partner: string; submission: string; addendum: string }
}) {
  const [name, setName] = useState(suggestedName)
  const [authorised, setAuthorised] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const ready = name.trim().length > 1 && authorised && accepted

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/firms/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, authorised, accepted }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not record your signature.')
        return
      }
      setDone(true)
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-6">
        <p className="text-[19px] font-semibold tracking-[-0.015em] text-[#161613]">
          Signed. Thank you.
        </p>
        <p className="mt-2 text-[14px] leading-[1.6] text-[#6E6E68]">
          {legalName} is now with Refery for review. We look at every firm by hand, and your
          colleague will hear from us shortly. A copy of what you accepted is on its way to you.
        </p>
        <p className="mt-4 text-[13px] text-[#9C9C95]">
          You do not have an account and do not need one. Nothing else is required from you.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-5 sm:p-6">
      <p className="text-[19px] font-semibold tracking-[-0.015em] text-[#161613]">
        Sign for {firmName}
      </p>
      <p className="mt-1 text-[13.5px] leading-[1.55] text-[#6E6E68]">
        You are accepting on behalf of <b className="font-semibold text-[#161613]">{legalName}</b>.
        This does not create an account for you.
      </p>

      <ul className="mt-4 grid gap-1.5">
        {[
          <>The firm keeps <b className="font-semibold text-[#161613]">70%</b> of each placement fee.</>,
          <>Refery pays the firm, not individual team members.</>,
          <>Your colleagues each accept short access terms before joining.</>,
          <><b className="font-semibold text-[#161613]">Your existing client relationships remain yours</b> when declared.</>,
          <>Either side can end it. Submitted candidates stay protected for 24 months.</>,
        ].map((line, i) => (
          <li
            key={i}
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
          How firm accounts work, in two minutes
        </a>
      </p>

      <p className="mt-2 text-[13px]">
        <a
          href="/partner-terms#firm-addendum"
          target="_blank"
          className={`text-[#1F3A2F] underline underline-offset-2 ${FOCUS}`}
        >
          See the partner terms
        </a>
      </p>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
          Your full legal name
        </span>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Priya Raman"
          className={`w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`}
        />
      </label>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={authorised}
          onChange={e => setAuthorised(e.target.checked)}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border-[#D2D1C7] text-[#1F3A2F] ${FOCUS}`}
        />
        <span className="text-[13.5px] leading-[1.55] text-[#2A2A26]">
          I am authorised to bind{' '}
          <b className="font-semibold text-[#161613]">{legalName}</b> to this agreement.
        </span>
      </label>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded border-[#D2D1C7] text-[#1F3A2F] ${FOCUS}`}
        />
        <span className="text-[13.5px] leading-[1.55] text-[#2A2A26]">
          I accept the Partner Terms, the Submission Terms and the Firm Addendum on the company&rsquo;s
          behalf. Typing my name and clicking below is a legally binding electronic signature under
          the E-SIGN Act and UETA.
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
        disabled={!ready || busy}
        className={`mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[10px] bg-[#1F3A2F] px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-[#142E24] disabled:cursor-not-allowed disabled:bg-[#B4C7BC] ${FOCUS}`}
      >
        {busy ? 'Signing…' : `Sign for ${firmName}`}
      </button>
      <p className="mt-2.5 text-[12.5px] text-[#9C9C95]">
        If you were not expecting this, or the person who sent it is not authorised to ask, close
        this page and nothing happens.
      </p>
    </div>
  )
}
