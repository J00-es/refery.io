'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FOCUS } from '@/lib/candidate-ui'

/**
 * Creating a firm.
 *
 * The summary above the documents is the part people actually read, so it says
 * the five things that change for them rather than inviting them to go and read
 * three contracts. The documents are one click away and the acceptance names
 * both capacities in one sentence, which is how counsel asked for it.
 */

const FIELD =
  'w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2.5 text-[14px] text-[#161613] placeholder:text-[#B8B8B0]'

export function CreateFirmForm({ versions }: { versions: { partner: string; submission: string; addendum: string } }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [companyNumber, setCompanyNumber] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [billingEmail, setBillingEmail] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = name.trim() && legalName.trim() && accepted

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/firms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          legal_name: legalName,
          jurisdiction,
          company_number: companyNumber,
          signer_title: signerTitle,
          billing_email: billingEmail,
          accepted,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not create the firm.')
        return
      }
      router.push('/firm/members')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-[14px] border border-[#E4E3DC] bg-white p-5 sm:p-6">
      <p className="text-[19px] font-semibold tracking-[-0.015em] text-[#161613]">Set up your firm</p>
      <p className="mt-1 text-[13.5px] text-[#6E6E68]">Your firm becomes the Refery partner.</p>

      <div className="mt-5 grid gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
            Firm name
          </span>
          <input className={`${FIELD} ${FOCUS}`} value={name} onChange={e => setName(e.target.value)} placeholder="Alder Talent" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
            Registered legal entity
          </span>
          <input className={`${FIELD} ${FOCUS}`} value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Alder Talent Ltd" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
              Jurisdiction
            </span>
            <input className={`${FIELD} ${FOCUS}`} value={jurisdiction} onChange={e => setJurisdiction(e.target.value)} placeholder="England &amp; Wales" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
              Company number
            </span>
            <input className={`${FIELD} ${FOCUS}`} value={companyNumber} onChange={e => setCompanyNumber(e.target.value)} placeholder="09283711" />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
              Your job title
            </span>
            <input className={`${FIELD} ${FOCUS}`} value={signerTitle} onChange={e => setSignerTitle(e.target.value)} placeholder="Managing Director" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
              Billing email
            </span>
            <input className={`${FIELD} ${FOCUS}`} value={billingEmail} onChange={e => setBillingEmail(e.target.value)} placeholder="accounts@aldertalent.com" />
          </label>
        </div>
      </div>

      <ul className="mt-5 grid gap-1.5">
        {[
          <>Your firm keeps <b className="font-semibold text-[#161613]">70%</b> of each placement fee.</>,
          <>Submissions by your team are recorded for the firm.</>,
          <>Refery pays the firm, not individual team members.</>,
          <>Each colleague accepts short access terms before joining.</>,
          <><b className="font-semibold text-[#161613]">Your existing client relationships remain yours</b> when declared.</>,
        ].map((line, i) => (
          <li
            key={i}
            className="relative pl-[17px] text-[13.5px] leading-[1.55] text-[#6E6E68] before:absolute before:left-0 before:top-[8px] before:h-[5px] before:w-[5px] before:rounded-full before:bg-[#1F3A2F] before:content-['']"
          >
            {line}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] text-[#6E6E68]">
        <a href="/partner-terms" target="_blank" className={`text-[#1F3A2F] underline underline-offset-2 ${FOCUS}`}>
          Read the Partner Terms v{versions.partner}, Submission Terms v{versions.submission} and Firm Addendum v{versions.addendum}
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
          I accept these terms for <b className="font-semibold text-[#161613]">{legalName.trim() || 'my firm'}</b>. In my
          individual capacity, I confirm that I am authorised to bind it and accept the authority undertaking in
          Section 3.
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
        {busy ? 'Creating…' : 'Accept and create firm'}
      </button>
      <p className="mt-2.5 text-[12.5px] text-[#9C9C95]">
        We review every firm by hand. Your colleagues can join once it is approved.
      </p>
    </div>
  )
}
