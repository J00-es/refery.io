'use client'

/**
 * Onboard a client: five facts, then the drafts write themselves.
 *
 * Super admin only (the API refuses everyone else). The form posts, the page
 * polls the run, and the result is a set of links plus the reminder that the
 * :+1: on the Slack card is what publishes. Nothing here publishes anything.
 */

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BTN_PRIMARY, BTN_QUIET, CARD, CHIP, CHIP_VALUE, CHIP_WARN, FIELD, FIELD_LABEL, H1, H2, LEDE, META } from '@/lib/desk-ui'

interface RunView {
  id: string
  status: string
  error: string | null
  costUsd: number
  model: string | null
  companyName: string | null
  clientUrl: string | null
  briefUrl: string | null
  slackChannel: string | null
  roles: { headline: string; comp: string }[]
  unknowns: string[]
  conflicts: string[]
  sources: number
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  researching: 'Reading the web',
  drafting: 'Writing the drafts',
  ready: 'Ready for your :+1: in #refery-desk',
  published: 'Published',
  discarded: 'Discarded',
  failed: 'Failed',
}

export default function OnboardPage() {
  return (
    <Suspense fallback={null}>
      <OnboardInner />
    </Suspense>
  )
}

function OnboardInner() {
  const params = useSearchParams()
  const [runId, setRunId] = useState<string | null>(params.get('run'))
  const [run, setRun] = useState<RunView | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    website: '',
    companyName: '',
    contactName: '',
    contactEmail: '',
    roles: '',
    currency: 'USD',
    bands: '',
    workingPattern: '',
    feePercent: '10',
    notes: '',
  })

  useEffect(() => {
    if (!runId) return
    let stop = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/admin/onboard/${runId}`, { cache: 'no-store' })
        if (!res.ok) return
        const json = (await res.json()) as RunView
        if (!stop) setRun(json)
        if (!stop && ['queued', 'researching', 'drafting'].includes(json.status)) setTimeout(tick, 5000)
      } catch {
        if (!stop) setTimeout(tick, 8000)
      }
    }
    void tick()
    return () => {
      stop = true
    }
  }, [runId])

  async function start() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, feePercent: Number(form.feePercent), roles: form.roles.split('\n') }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not start')
      setRunId(json.id)
      window.history.replaceState(null, '', `/admin/onboard?run=${json.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start')
    } finally {
      setBusy(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const working = run && ['queued', 'researching', 'drafting'].includes(run.status)

  return (
    <div className="mx-auto max-w-[1120px] px-1 pb-16 sm:px-0">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className={CHIP_VALUE}>Onboard a client</span>
          <span className={CHIP}>Super admin</span>
        </div>
        <h1 className={`mt-3 ${H1}`}>{run?.companyName ? `Onboard ${run.companyName}` : 'Onboard a client'}</h1>
        <p className={`mt-2 ${META}`}>Five facts, then the drafts write themselves. Nothing is published until you react :+1: on the card in #refery-desk.</p>
      </header>

      {!runId && (
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="space-y-5">
            <section className={`p-5 ${CARD}`}>
              <h2 className={H2}>The company</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className={FIELD_LABEL}>
                  Website
                  <input className={FIELD} placeholder="getlivo.com" value={form.website} onChange={set('website')} />
                </label>
                <label className={FIELD_LABEL}>
                  Company name, if the domain is not it
                  <input className={FIELD} placeholder="Livo" value={form.companyName} onChange={set('companyName')} />
                </label>
                <label className={FIELD_LABEL}>
                  Contact
                  <input className={FIELD} placeholder="Adnane Ouahabi" value={form.contactName} onChange={set('contactName')} />
                </label>
                <label className={FIELD_LABEL}>
                  Contact email, optional
                  <input className={FIELD} placeholder="adnane@getlivo.com" value={form.contactEmail} onChange={set('contactEmail')} />
                </label>
              </div>
            </section>

            <section className={`p-5 ${CARD}`}>
              <h2 className={H2}>The roles</h2>
              <label className={`mt-4 ${FIELD_LABEL}`}>
                Job links or titles, one per line
                <textarea className={`${FIELD} min-h-[96px]`} placeholder={'https://www.linkedin.com/jobs/view/…\nProduct Manager'} value={form.roles} onChange={set('roles')} />
              </label>
              <p className={`mt-1.5 ${META}`}>LinkedIn, Ashby, Greenhouse, Lever, Teamtailor and Workable pages are read in full. A bare title works too.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className={FIELD_LABEL}>
                  Currency
                  <select className={FIELD} value={form.currency} onChange={set('currency')}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
                <label className={FIELD_LABEL}>
                  Bands, per role in order
                  <input className={FIELD} placeholder="60 to 90 · 70 to 100" value={form.bands} onChange={set('bands')} />
                </label>
                <label className={FIELD_LABEL}>
                  Working pattern
                  <input className={FIELD} placeholder="Unknown, ask" value={form.workingPattern} onChange={set('workingPattern')} />
                </label>
              </div>
            </section>

            <section className={`p-5 ${CARD}`}>
              <h2 className={H2}>Terms and what they told you</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <label className={FIELD_LABEL}>
                  Fee, % of first-year base
                  <input className={FIELD} value={form.feePercent} onChange={set('feePercent')} />
                </label>
                <p className={`sm:col-span-2 ${LEDE}`}>The agreement is issued on the current standard (v2.8): fully contingent, no retainer, one replacement within 90 days, invoiced 30 days after start.</p>
              </div>
              <label className={`mt-4 ${FIELD_LABEL}`}>
                Paste the WhatsApp, email or call notes
                <textarea className={`${FIELD} min-h-[140px]`} placeholder={'[5 Sep] We are paying 60k to 90k + equity for engineers…'} value={form.notes} onChange={set('notes')} />
              </label>
              <p className={`mt-1.5 ${META}`}>Their words are quoted in the briefs and attributed by date. Comp comes from here, never from the web.</p>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void start()} disabled={busy} className={BTN_PRIMARY}>
                {busy ? 'Starting…' : 'Draft everything'}
              </button>
              <span className={META}>About five minutes. You get a Slack card when it is ready.</span>
              {error && <span className="text-[13.5px] text-[#A8564C]">{error}</span>}
            </div>
          </div>

          <aside className={`p-5 ${CARD}`}>
            <p className="text-[12.5px] font-semibold text-[#6E6E68]">What gets drafted</p>
            <ul className="mt-2 space-y-1.5 text-[13.5px] leading-relaxed text-[#2A2A26]">
              <li>Company record and client card, unpublished</li>
              <li>One search per role, bands in the currency you set, hidden until published</li>
              <li>Partner brief, draft</li>
              <li>Founder brief with the agreement button, Slack by email, delivery choice and the questions, draft</li>
              <li>Agreement link at the fee you set, open, 30 days</li>
              <li>Private Slack room with you in it</li>
            </ul>
            <p className={`mt-4 rounded-[12px] bg-[#F5EEDD] px-3 py-2 text-[13px] leading-relaxed text-[#2A2A26]`}>Publishing to partners and emailing the founder wait for your :+1: on the card.</p>
          </aside>
        </div>
      )}

      {runId && (
        <section className={`mt-7 p-5 ${CARD}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={run?.status === 'ready' || run?.status === 'published' ? CHIP_VALUE : run?.status === 'failed' ? 'inline-flex items-center rounded-full bg-[#F9EBE9] px-2.5 py-1 text-[12px] font-semibold text-[#9C3F37]' : CHIP_WARN}>
              {run ? STATUS_LABEL[run.status] ?? run.status : 'Starting'}
            </span>
            {run && run.costUsd > 0 && <span className={CHIP}>${run.costUsd.toFixed(2)} of model time{run.model ? ` · ${run.model.replace(/^.*\//, '')}` : ''}</span>}
            {run && run.sources > 0 && <span className={CHIP}>{run.sources} pages read</span>}
          </div>
          {working && <p className={`mt-3 ${LEDE}`}>Reading the site, the job posts and a handful of search results, then writing both briefs. This page refreshes on its own.</p>}
          {run?.error && <p className="mt-3 text-[13.5px] text-[#A8564C]">{run.error}</p>}
          {run && (run.status === 'ready' || run.status === 'published') && (
            <div className="mt-4 space-y-4">
              {run.roles.length > 0 && (
                <ul className="space-y-1 text-[14px] text-[#2A2A26]">
                  {run.roles.map(r => (
                    <li key={r.headline}>
                      <span className="font-semibold">{r.headline}</span> · {r.comp}
                    </li>
                  ))}
                </ul>
              )}
              {run.unknowns.length > 0 && (
                <p className={LEDE}>
                  <span className="font-semibold text-[#8A6A1F]">Could not verify: </span>
                  {run.unknowns.join(' · ')}
                </p>
              )}
              {run.conflicts.length > 0 && (
                <p className={LEDE}>
                  <span className="font-semibold text-[#8A6A1F]">Sources disagree: </span>
                  {run.conflicts.join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {run.clientUrl && (
                  <a href={run.clientUrl} className={BTN_PRIMARY}>
                    Open the client page
                  </a>
                )}
                {run.briefUrl && (
                  <a href={run.briefUrl} target="_blank" rel="noopener noreferrer" className={BTN_QUIET}>
                    Founder brief{run.status === 'ready' ? ' (draft, 404 until published)' : ''}
                  </a>
                )}
                {run.slackChannel && <span className={`${CHIP} self-center`}>#{run.slackChannel}</span>}
              </div>
              <p className={META}>{run.status === 'ready' ? 'Edit anything on the client page, then react :+1: on the card in #refery-desk to publish all of it and send the founder their brief.' : 'Published.'}</p>
            </div>
          )}
          <div className="mt-5">
            <a href="/admin/onboard" className={BTN_QUIET}>
              Onboard another
            </a>
          </div>
        </section>
      )}
    </div>
  )
}
