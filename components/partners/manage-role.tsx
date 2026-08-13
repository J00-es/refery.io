'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Settings2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { FIELD_LABEL, FOCUS } from '@/lib/desk-ui'
import { PRIORITY_META, type RolePriority } from '@/lib/partners'
import {
  DEFAULT_FEE_PERCENTAGE,
  DEFAULT_SCOUT_SHARE,
  clientFeeAmount,
  feeExplanation,
  payoutAmount,
  resolveFee,
} from '@/lib/fees'

/**
 * The commercial terms of one mandate.
 *
 * These are the numbers the scout-facing page leads with, so they need to be
 * editable in ten seconds from the page that shows them. `scout_payout` is
 * asked for first and in plain words — what the referrer earns — because a role
 * card with "Payout not set yet" on it is a role nobody works.
 *
 * The cap is offered rather than defaulted. Capping a search is a real decision
 * with a cost (fewer candidates) and a benefit (nobody's evening wasted on a
 * role that is already full), and guessing one on the admin's behalf would make
 * the scarcity signal a lie.
 */

const label = FIELD_LABEL
const input = `mt-1.5 w-full rounded-[12px] border border-[#ECECE6] bg-white px-3 py-2.5 text-[14px] text-[#161613] placeholder:text-[#B8B8B0] ${FOCUS}`

export function ManageRole({
  jobId,
  jobTitle,
  initial,
}: {
  jobId: string
  jobTitle: string
  initial: {
    isLive: boolean
    priority: RolePriority
    headline: string | null
    context: string | null
    scoutPayout: number | null
    feePercentage: number | null
    feeFlat: number | null
    payoutNote: string | null
    exclusivity: 'exclusive' | 'shared' | null
    scoutShare: number | null
    submissionCap: number | null
    targetStart: string | null
    /** The band a percentage fee is computed against, for the live preview. */
    salaryMin: number | null
    salaryMax: number | null
  }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const [isLive, setIsLive] = useState(initial.isLive)
  const [priority, setPriority] = useState<RolePriority>(initial.priority)
  const [headline, setHeadline] = useState(initial.headline ?? '')
  const [context, setContext] = useState(initial.context ?? '')
  const [scoutPayout, setScoutPayout] = useState(initial.scoutPayout?.toString() ?? '')
  const [feePercentage, setFeePercentage] = useState(initial.feePercentage?.toString() ?? '')
  const [feeFlat, setFeeFlat] = useState(initial.feeFlat?.toString() ?? '')
  const [payoutNote, setPayoutNote] = useState(initial.payoutNote ?? '')
  const [exclusivity, setExclusivity] = useState(initial.exclusivity ?? '')
  const [scoutShare, setScoutShare] = useState(initial.scoutShare?.toString() ?? '')
  const [cap, setCap] = useState(initial.submissionCap?.toString() ?? '')
  const [targetStart, setTargetStart] = useState(initial.targetStart ?? '')

  /*
    The outcome of the current settings, recomputed as they are typed.

    Every fee field here is an override of a platform default, so on a normal
    mandate all four are blank and it is not obvious what that produces. The
    preview shows the exact sentence a scout will read — including the case where
    no salary is recorded and there is honestly no figure to give.
  */
  const previewFee = resolveFee({
    salary_min: initial.salaryMin,
    salary_max: initial.salaryMax,
    fee_percentage: feePercentage || null,
    fee_flat: feeFlat || null,
    scout_share: scoutShare || null,
    scout_payout: scoutPayout || null,
  })
  const preview = {
    payout: payoutAmount(previewFee),
    explanation: feeExplanation(previewFee),
    clientFee: clientFeeAmount(previewFee),
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/partners/roles/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_live: isLive,
          priority,
          headline: headline || null,
          context: context || null,
          scout_payout: scoutPayout || null,
          fee_percentage: feePercentage || null,
          fee_flat: feeFlat || null,
          scout_share: scoutShare || null,
          payout_note: payoutNote || null,
          exclusivity: exclusivity || null,
          submission_cap: cap || null,
          target_start: targetStart || null,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ tone: 'bad', text: body.error ?? 'Could not save that.' })
        return
      }
      setMessage({ tone: 'ok', text: 'Terms saved.' })
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#D8D8D0] px-4 text-[14px] font-semibold text-[#161613] transition-colors hover:border-[#1F4D3A] hover:text-[#1F4D3A] ${FOCUS}`}
        >
          <Settings2 className="h-4 w-4" />
          Terms
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
        <SheetHeader className="border-b border-[#ECECE6] px-5 py-4">
          <SheetTitle className="text-left font-serif text-[19px] font-normal text-[#161613]">
            Mandate terms
          </SheetTitle>
          <p className="text-left text-[13px] text-[#6E6E68]">{jobTitle}</p>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {message && (
            <p
              className={`rounded-[10px] px-3 py-2 text-[13px] ${
                message.tone === 'ok' ? 'bg-[#E9F0EC] text-[#1F4D3A]' : 'bg-[#FBEDEB] text-[#A3423A]'
              }`}
            >
              {message.text}
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-[14px] border border-[#ECECE6] px-3.5 py-3 text-[13.5px] text-[#161613]">
            <input
              type="checkbox"
              checked={isLive}
              onChange={e => setIsLive(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#1F4D3A]"
            />
            <span>
              Live on the desk
              <span className="mt-0.5 block text-[12.5px] text-[#9C9C95]">
                Turn this off when a search pauses. Submissions already in flight keep their history.
              </span>
            </span>
          </label>

          <div>
            <span className={label}>Priority</span>
            <div className="mt-1.5 flex gap-1.5">
              {(Object.keys(PRIORITY_META) as RolePriority[]).map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPriority(key)}
                  className={`inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-full border text-[13px] font-medium transition-colors ${FOCUS} ${
                    priority === key
                      ? 'border-[#1F4D3A] bg-[#1F4D3A] text-white'
                      : 'border-[#ECECE6] text-[#6E6E68] hover:border-[#D8D8D0]'
                  }`}
                >
                  {PRIORITY_META[key].label}
                </button>
              ))}
            </div>
          </div>

          <section className="rounded-[14px] border border-[#E0E0D7] p-4">
            <p className="text-[14px] font-semibold text-[#161613]">Fee</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A8A82]">
              Leave everything blank for the default: {DEFAULT_FEE_PERCENTAGE}% of first-year base to
              Refery, of which the scout keeps {DEFAULT_SCOUT_SHARE}%.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className={label}>
                Fee % of base
                <input
                  inputMode="decimal"
                  value={feePercentage}
                  onChange={e => setFeePercentage(e.target.value)}
                  placeholder={String(DEFAULT_FEE_PERCENTAGE)}
                  className={input}
                />
              </label>
              <label className={label}>
                Scout keeps %
                <input
                  inputMode="decimal"
                  value={scoutShare}
                  onChange={e => setScoutShare(e.target.value)}
                  placeholder={String(DEFAULT_SCOUT_SHARE)}
                  className={input}
                />
              </label>
            </div>

            {/* The two rarer shapes, folded away: most mandates are a percentage
                of base, and putting four fee inputs on screen at once makes the
                common case look complicated. */}
            <details className="mt-3">
              <summary className="cursor-pointer list-none text-[13px] font-semibold text-[#1F4D3A]">
                Not a percentage of base
              </summary>
              <div className="mt-2.5 space-y-3">
                <label className={label}>
                  Flat fee to Refery (USD)
                  <input
                    inputMode="numeric"
                    value={feeFlat}
                    onChange={e => setFeeFlat(e.target.value)}
                    placeholder="25000"
                    className={input}
                  />
                </label>
                <label className={label}>
                  Or a fixed scout payout (USD)
                  <input
                    inputMode="numeric"
                    value={scoutPayout}
                    onChange={e => setScoutPayout(e.target.value)}
                    placeholder="4000"
                    className={input}
                  />
                  <span className="mt-1.5 block text-[12px] text-[#8A8A82]">
                    Overrides everything above. Use it where the number was agreed rather than
                    calculated.
                  </span>
                </label>
              </div>
            </details>

            <div className="mt-3 rounded-[10px] bg-[#F2F2EC] px-3 py-2.5">
              <p className="text-[15px] font-semibold text-[#1F4D3A]">
                {preview.payout ? `${preview.payout} to the scout` : 'No figure — no salary recorded'}
              </p>
              <p className="mt-0.5 text-[12.5px] text-[#5F5F58]">{preview.explanation}</p>
              {preview.clientFee && (
                <p className="mt-0.5 text-[12.5px] text-[#8A8A82]">Client pays {preview.clientFee}</p>
              )}
            </div>

            <label className={`${label} mt-3`}>
              Payout note
              <input
                value={payoutNote}
                onChange={e => setPayoutNote(e.target.value)}
                placeholder="Paid 30 days after start date"
                className={input}
              />
            </label>
          </section>

          <label className={label}>
            Submission cap
            <input
              inputMode="numeric"
              value={cap}
              onChange={e => setCap(e.target.value)}
              placeholder="Leave blank for no cap"
              className={input}
            />
            <span className="mt-1.5 block text-[12px] text-[#9C9C95]">
              How many can be in play at once. Declined and withdrawn candidates free their slot back
              up.
            </span>
          </label>

          <div>
            <span className={label}>Exclusivity</span>
            <div className="mt-1.5 flex gap-1.5">
              {[
                { key: '', label: 'Not stated' },
                { key: 'shared', label: 'Shared' },
                { key: 'exclusive', label: 'Exclusive' },
              ].map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setExclusivity(option.key as typeof exclusivity)}
                  className={`inline-flex min-h-[38px] flex-1 items-center justify-center rounded-full border text-[13px] font-medium transition-colors ${FOCUS} ${
                    exclusivity === option.key
                      ? 'border-[#1F4D3A] bg-[#1F4D3A] text-white'
                      : 'border-[#ECECE6] text-[#6E6E68] hover:border-[#D8D8D0]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className={label}>
            Target start
            <input
              type="date"
              value={targetStart}
              onChange={e => setTargetStart(e.target.value)}
              className={input}
            />
          </label>

          <label className={label}>
            Headline for the desk
            <input
              value={headline}
              onChange={e => setHeadline(e.target.value)}
              placeholder="Overrides the posted job title, e.g. “Founding AE, US”"
              className={input}
            />
          </label>

          <label className={label}>
            What we know about this search
            <textarea
              rows={5}
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="What came out of the intake call that is not in the job post. Assigned scouts read this."
              className={input}
            />
          </label>
        </div>

        <div className="border-t border-[#ECECE6] bg-white px-5 py-4">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full bg-[#1F4D3A] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] disabled:opacity-60 ${FOCUS}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save terms
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
