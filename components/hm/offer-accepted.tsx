'use client'

/**
 * "They accepted." Two fields the agreement asks the client for anyway: the
 * start date and the base salary. Saving starts the invoice, guarantee and
 * payout clocks and tells Lily and the partner.
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const NAME_KEY = 'refery.brief.author'

export function OfferAccepted({ slug, submissionId, candidateFirstName, currencySymbol }: { slug: string; submissionId: string; candidateFirstName: string; currencySymbol: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [base, setBase] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ invoiceDue: string; guaranteeEnds: string } | null>(null)

  useEffect(() => {
    try {
      setName(window.localStorage.getItem(NAME_KEY) ?? '')
    } catch {
      /* nothing to restore */
    }
  }, [])

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/b/${slug}/candidates/${submissionId}/offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, baseSalary: Number(base.replace(/[^\d.]/g, '')), decidedBy: name.trim() || null }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save that.')
      setDone(json.clock)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.')
    } finally {
      setBusy(false)
    }
  }

  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

  if (done) {
    return (
      <div className="mt-3 rounded-[12px] bg-[#E7EDE9] px-4 py-3 text-[14px] leading-relaxed text-[#1F3A2F]">
        <p className="font-semibold">Congratulations. {candidateFirstName} is marked hired.</p>
        <p className="mt-1">The invoice lands on their first day and is due {fmt(done.invoiceDue)}. If they leave before {fmt(done.guaranteeEnds)}, we run the replacement search free.</p>
      </div>
    )
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-[40px] items-center rounded-full border border-[#D2D1C7] bg-white px-4 text-[13.5px] font-semibold text-[#161613] hover:border-[#1F3A2F]">
        {candidateFirstName} accepted an offer
      </button>
    )
  }

  return (
    <form
      className="mt-3 rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3"
      onSubmit={e => {
        e.preventDefault()
        void save()
      }}
    >
      <p className="text-[13.5px] font-semibold text-[#161613]">Two things, and the paperwork takes care of itself.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[12.5px] font-medium text-[#6E6E68]">Start date</span>
          <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="mt-1 block min-h-[44px] w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 text-[14px] text-[#161613] outline-none focus:border-[#1F3A2F]" />
        </label>
        <label className="block">
          <span className="text-[12.5px] font-medium text-[#6E6E68]">Annual base salary ({currencySymbol})</span>
          <input type="text" inputMode="numeric" required value={base} onChange={e => setBase(e.target.value)} placeholder="85000" className="mt-1 block min-h-[44px] w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 text-[14px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]" />
        </label>
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[#6E6E68]">Base only, from the signed offer. Bonus, equity and commission are not counted. The fee is invoiced on the first day and due 30 days later; the 90-day replacement guarantee runs from the same day.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy || !startDate || !base.trim()} className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Confirm the hire'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-[44px] px-2 text-[13.5px] font-medium text-[#6E6E68]">
          Cancel
        </button>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" maxLength={80} className="ml-auto w-full max-w-[200px] rounded-full border border-[#E4E3DC] bg-white px-3 py-1.5 text-[13px] text-[#161613] outline-none placeholder:text-[#9C9C95] focus:border-[#1F3A2F]" />
      </div>
      {error && <p className="mt-2 text-[13px] text-[#A8564C]">{error}</p>}
    </form>
  )
}
