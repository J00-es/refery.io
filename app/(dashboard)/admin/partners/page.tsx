'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui/spinner'
import { rolePath } from '@/lib/paths'

/**
 * The partner desk, grouped by who can unblock the next step.
 *
 * Five lists, each ending in a button: your decision, a Refery fix, suitable
 * work, the partner's move, the client's move. Under them, which searches
 * need people, and what the ledger sent on its own this week. A row is one
 * tap or one line. Mobile first, because partners get triaged between other
 * things.
 */

interface DecisionRow { id: string; name: string; email: string; linkedin: string; status: string; ageDays: number; overdue: boolean; source: string; conflict: string | null }
interface FixRow { kind: string; who: string; email: string; detail: string; userId?: string; commId?: string }
interface WorkRow { userId: string; name: string; email: string; joinedDays: number; preferences: string | null; confirmed: boolean; noMatchAt: string | null; state: string | null }
interface PartnerActionRow { kind: string; userId: string; name: string; role: string; company: string | null; ageDays: number; assignmentId: string }
interface ClientRow { id: string; candidate: string; role: string; company: string; status: string; quietDays: number; partner: string | null }
interface DemandRow { jobId: string; companyId: string; slug?: string | null; companySlug?: string | null; title: string; company: string | null; location: string | null; priority: string; stage: string | null; working: number; proposed: number; open: number | null; cap: number | null; subs14: number; movedDays: number | null; read: string }
interface Payload {
  counts: { applications: number; overdue: number; partners: number; withTerms: number; working: number }
  decisions: DecisionRow[]
  fixes: FixRow[]
  needsWork: WorkRow[]
  partnerAction: PartnerActionRow[]
  clientAction: ClientRow[]
  demand: DemandRow[]
  ledger: { sent: number; queued: number; failed: number; cancelled: number; held: number; byTemplate: Record<string, number> }
  searches: Array<{ job_id: string; title: string; company_name: string | null; location: string | null; search_stage: string | null }>
}

const DECISIONS: Array<{ key: string; label: string; tone: string }> = [
  { key: 'approve', label: 'Approve', tone: 'bg-[#1F3A2F] text-white' },
  { key: 'approve_call', label: 'Approve, offer a call', tone: 'border border-[#D2D1C7]' },
  { key: 'clarify', label: 'Ask', tone: 'border border-[#D2D1C7]' },
  { key: 'no_match', label: 'No match', tone: 'border border-[#D2D1C7]' },
  { key: 'decline', label: 'Decline', tone: 'border border-[#D2D1C7]' },
]

function days(n: number): string {
  return n < 1 ? 'today' : n === 1 ? '1 day' : n < 60 ? `${n} days` : `${Math.round(n / 30)} months`
}

const READ_TONE: Record<string, string> = {
  'needs people': 'bg-[#FBEDEB] text-[#A3423A]',
  'enough partners': 'bg-[#F5EEDD] text-[#8A6A1F]',
  'client quiet': 'bg-[#E7EDF2] text-[#3F5A70]',
  moving: 'bg-[#E7EDE9] text-[#1F3A2F]',
}

export default function PartnerDeskPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [callFor, setCallFor] = useState<{ userId: string; name: string; role: string } | null>(null)
  const [callReason, setCallReason] = useState('')
  // Propose one search to several people at once, kept from the first desk.
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [jobId, setJobId] = useState('')
  const [why, setWhy] = useState('')
  const [stage, setStage] = useState<'idle' | 'confirming' | 'sending'>('idle')

  const load = useCallback(() => {
    fetch('/api/admin/desk')
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load the desk')
        return res.json()
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong'))
  }, [])
  useEffect(load, [load])

  async function act(key: string, body: Record<string, unknown>, done: string) {
    setBusy(key)
    setMsg(null)
    const res = await fetch('/api/admin/desk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const payload = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok || payload.ok === false) {
      setMsg(payload.error ?? payload.note ?? 'That did not go through')
      return
    }
    setMsg([done, payload.queued ? `Email ${payload.queued} queued for 3 minutes.` : '', payload.note ?? '', payload.outcome ? `Result: ${payload.outcome}${payload.reason ? ` (${payload.reason})` : ''}.` : ''].filter(Boolean).join(' '))
    load()
  }

  const pickedRows = useMemo(() => (data?.needsWork ?? []).filter(p => picked.has(p.userId)), [data, picked])

  async function propose() {
    setStage('sending')
    const res = await fetch('/api/partners/search-assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, user_ids: [...picked], why }) })
    const payload = await res.json().catch(() => ({}))
    setMsg(res.ok ? `Suggested to ${pickedRows.length} ${pickedRows.length === 1 ? 'partner' : 'partners'}.` : payload.error ?? 'Could not propose')
    setPicked(new Set())
    setJobId('')
    setWhy('')
    setStage('idle')
    load()
  }

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-[#8A3B2A]">{error}</div>
  if (!data) return <div className="flex justify-center py-24"><Spinner /></div>
  const { counts } = data

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 pb-32 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Partners</h1>
        <p className="mt-2 max-w-xl text-sm text-[#6E6E68]">Grouped by who can unblock the next step. Each row is one tap or one line.</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Applications in review', counts.applications, counts.overdue ? `${counts.overdue} overdue` : ''],
            ['Partners', counts.partners, `${counts.withTerms} with terms`],
            ['Working', counts.working, ''],
            ['Sent this week', data.ledger.sent, data.ledger.failed ? `${data.ledger.failed} failed` : ''],
            ['Queued now', data.ledger.queued, data.ledger.held ? `${data.ledger.held} held` : ''],
          ].map(([l, v, s]) => (
            <div key={String(l)} className="rounded-xl border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
              <dd className="font-mono text-2xl font-medium tracking-tight">{v}</dd>
              <dt className="mt-1 text-[11px] leading-snug text-[#6E6E68]">{l}{s ? <span className="text-[#A3423A]"> · {s}</span> : null}</dt>
            </div>
          ))}
        </dl>
        {msg && <p className="mt-4 rounded-lg border border-[#E4E3DC] bg-[#E7EDE9] px-4 py-2.5 text-sm text-[#1F3A2F]">{msg}</p>}
      </header>

      {/* 1 · Needs your decision */}
      <Section title="1 · Needs your decision" count={data.decisions.length} blurb="Only you can move these. Each button queues its email for three minutes; cancel in the Slack thread.">
        {data.decisions.map(d => (
          <li key={d.id} className="py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-[14px] font-semibold">{d.name} <a href={d.linkedin} target="_blank" rel="noreferrer" className="ml-1 text-[12px] font-medium text-[#1F3A2F] underline underline-offset-2">LinkedIn</a></p>
              <span className={`font-mono text-[11.5px] ${d.overdue ? 'text-[#A3423A]' : 'text-[#9C9C95]'}`}>{d.overdue ? `overdue · ${days(d.ageDays)}` : days(d.ageDays)}{d.status === 'clarification' ? ' · waiting on their answer' : ''}</span>
            </div>
            <p className="text-[12.5px] text-[#6E6E68]">{d.email} · {d.source}{d.conflict ? <span className="text-[#A3423A]"> · {d.conflict}</span> : null}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {d.conflict ? (
                <button type="button" disabled={busy === d.id} onClick={() => act(d.id, { action: 'already_partner', applicationId: d.id }, 'Closed as already a partner.')} className="min-h-[32px] rounded-full bg-[#1F3A2F] px-3 text-[12px] font-semibold text-white">Already a partner, close</button>
              ) : (
                DECISIONS.map(x => (
                  <button key={x.key} type="button" disabled={busy === d.id} onClick={() => act(d.id, { action: 'decide', applicationId: d.id, decision: x.key }, `${d.name}: ${x.label.toLowerCase()}.`)} className={`min-h-[32px] rounded-full px-3 text-[12px] font-semibold ${x.tone}`}>{x.label}</button>
                ))
              )}
            </div>
          </li>
        ))}
      </Section>

      {/* 2 · Needs a Refery fix */}
      <Section title="2 · Needs a Refery fix" count={data.fixes.length} blurb="Nobody gets a reminder while they sit here." tone="text-[#A3423A]">
        {data.fixes.map((f, i) => (
          <li key={`${f.kind}-${f.email}-${i}`} className="py-3">
            <p className="text-[14px] font-semibold">{f.who} <span className="ml-1 rounded-full bg-[#FBEDEB] px-2 py-0.5 text-[11px] font-semibold text-[#A3423A]">{f.kind}</span></p>
            <p className="text-[12.5px] text-[#6E6E68]">{f.detail}</p>
            {f.commId && <button type="button" onClick={() => act(f.commId!, { action: 'retry_email', commId: f.commId }, 'Retrying.')} className="mt-1.5 min-h-[32px] rounded-full border border-[#D2D1C7] px-3 text-[12px] font-semibold">Retry send</button>}
            {f.kind === 'terms' && <Link href={`/admin?email=${encodeURIComponent(f.email)}`} className="mt-1.5 inline-flex min-h-[32px] items-center rounded-full border border-[#D2D1C7] px-3 text-[12px] font-semibold">Open account</Link>}
          </li>
        ))}
      </Section>

      {/* 3 · Needs suitable work */}
      <Section
        title="3 · Needs suitable work"
        count={data.needsWork.length}
        blurb="Approved, terms on file, nothing to work on. Suggest one by rule, or pick several and propose one search to all of them."
        tone="text-[#3F5A70]"
        extra={data.needsWork.length ? <button type="button" onClick={() => setPicked(new Set(picked.size === data.needsWork.length ? [] : data.needsWork.map(p => p.userId)))} className="text-xs font-medium text-[#1F3A2F] underline underline-offset-2">{picked.size === data.needsWork.length ? 'Clear' : `Select all ${data.needsWork.length}`}</button> : null}
      >
        {data.needsWork.map(p => (
          <li key={p.userId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-3">
            <input type="checkbox" checked={picked.has(p.userId)} onChange={() => setPicked(prev => { const n = new Set(prev); if (n.has(p.userId)) n.delete(p.userId); else n.add(p.userId); return n })} className="h-4 w-4" aria-label={`Select ${p.name}`} />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{p.name} <span className="font-mono text-[11.5px] font-normal text-[#9C9C95]">{days(p.joinedDays)}</span></p>
              <p className="truncate text-[12.5px] text-[#6E6E68]">{p.preferences ? `${p.preferences}${p.confirmed ? '' : ' · not confirmed'}` : 'No preferences yet'}{p.noMatchAt ? ` · told no match ${p.noMatchAt.slice(0, 10)}` : ''}</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" disabled={busy === p.userId} onClick={() => act(p.userId, { action: 'suggest', userId: p.userId }, `Checked ${p.name}.`)} className="min-h-[32px] rounded-full border border-[#D2D1C7] px-3 text-[12px] font-semibold">Suggest by rule</button>
              <button type="button" onClick={() => { setCallFor({ userId: p.userId, name: p.name, role: '' }); setCallReason('') }} className="min-h-[32px] rounded-full border border-[#D2D1C7] px-3 text-[12px] font-semibold">15 min</button>
            </div>
          </li>
        ))}
      </Section>

      {/* 4 · Needs partner action */}
      <Section title="4 · Needs partner action" count={data.partnerAction.length} blurb="Theirs to do, on their timeline. The reminders run themselves." tone="text-[#8A6A1F]">
        {data.partnerAction.map(a => (
          <li key={a.assignmentId} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
            <div>
              <p className="text-[14px] font-semibold">{a.name}</p>
              <p className="text-[12.5px] text-[#6E6E68]">{a.kind === 'unanswered' ? 'Suggested, no answer' : 'Accepted, nothing sent'} · {a.role}{a.company ? ` at ${a.company}` : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11.5px] text-[#9C9C95]">{days(a.ageDays)}</span>
              <button type="button" onClick={() => { setCallFor({ userId: a.userId, name: a.name, role: a.role }); setCallReason('') }} className="min-h-[32px] rounded-full border border-[#D2D1C7] px-3 text-[12px] font-semibold">15 min</button>
            </div>
          </li>
        ))}
      </Section>

      {/* 5 · Needs client action */}
      <Section title="5 · Needs client action" count={data.clientAction.length} blurb="Refery chases the client; the partner is told either way.">
        {data.clientAction.map(c => (
          <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
            <div>
              <p className="text-[14px] font-semibold">{c.company} · {c.candidate}</p>
              <p className="text-[12.5px] text-[#6E6E68]">{c.role} · {c.status.replace(/_/g, ' ')}{c.partner ? ` · via ${c.partner}` : ''}</p>
            </div>
            <span className={`font-mono text-[11.5px] ${c.quietDays >= 7 ? 'text-[#A3423A]' : 'text-[#9C9C95]'}`}>quiet {days(c.quietDays)}</span>
          </li>
        ))}
      </Section>

      {/* Demand */}
      <section className="mb-10">
        <h2 className="text-base font-semibold tracking-tight">Which searches need people</h2>
        <p className="mb-3 text-[13px] text-[#6E6E68]">Read this before suggesting anyone. Places are held at acceptance and recomputed on every load.</p>
        <ul className="divide-y divide-[#E4E3DC] border-y border-[#E4E3DC]">
          {data.demand.map(d => (
            <li key={d.jobId} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_auto] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <Link href={rolePath({ id: d.companyId, slug: d.companySlug }, { id: d.jobId, slug: d.slug })} className="text-[14px] font-semibold underline-offset-4 hover:underline">{d.title}</Link>
                <p className="text-[12.5px] text-[#6E6E68]">{[d.company, d.location].filter(Boolean).join(' · ')}{d.priority === 'urgent' ? ' · urgent' : ''}</p>
              </div>
              <span className="text-[12.5px]">{d.stage?.replace(/_/g, ' ') ?? 'sourcing'}{d.movedDays !== null ? <span className="text-[#9C9C95]"> · {days(d.movedDays)}</span> : null}</span>
              <span className="text-[12.5px]">{d.working} working · {d.proposed} suggested{d.cap ? ` · ${d.open} open of ${d.cap}` : ''}</span>
              <span className="text-[12.5px]">{d.subs14} introduced · 14 d</span>
              <span className={`w-fit rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${READ_TONE[d.read] ?? ''}`}>{d.read}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Ledger */}
      <section className="rounded-[14px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Sent on its own this week</p>
        <p className="mt-1 text-[13px]">
          {Object.entries(data.ledger.byTemplate).map(([t, n]) => `${n} × ${t}`).join(' · ') || 'Nothing yet.'}
          {data.ledger.cancelled ? ` · ${data.ledger.cancelled} cancelled` : ''}{data.ledger.held ? ` · ${data.ledger.held} held by the 72 h budget` : ''}
        </p>
        <p className="mt-1 text-[12px] text-[#9C9C95]">Queued emails can be cancelled. Sent emails cannot. Decisions stand whatever the delivery did.</p>
      </section>

      {/* Offer a call */}
      {callFor && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E4E3DC] bg-white p-4 shadow-[0_-8px_30px_rgba(22,22,19,0.08)]">
          <div className="mx-auto max-w-3xl">
            <p className="text-[14px] font-semibold">15 minutes with {callFor.name}</p>
            <p className="text-[12.5px] text-[#6E6E68]">One line on why you want to talk. It goes in the email, in your name, with your calendar link.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto_auto]">
              <input value={callFor.role} onChange={e => setCallFor({ ...callFor, role: e.target.value })} placeholder="Search name" className="h-10 rounded-md border border-[#D2D1C7] px-3 text-[13px]" />
              <input value={callReason} onChange={e => setCallReason(e.target.value)} placeholder="Your last company is one I know well" className="h-10 rounded-md border border-[#D2D1C7] px-3 text-[13px]" />
              <button type="button" disabled={busy === 'call'} onClick={() => act('call', { action: 'offer_call', userId: callFor.userId, role: callFor.role, reason: callReason }, `Offered 15 minutes to ${callFor.name}.`).then(() => setCallFor(null))} className="min-h-[40px] rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white">Send</button>
              <button type="button" onClick={() => setCallFor(null)} className="min-h-[40px] px-3 text-[13px] font-medium text-[#6E6E68]">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Propose one search to several */}
      {picked.size > 0 && !callFor && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#E4E3DC] bg-white p-4 shadow-[0_-8px_30px_rgba(22,22,19,0.08)]">
          <div className="mx-auto max-w-3xl">
            {stage === 'confirming' ? (
              <>
                <p className="text-[14px] font-semibold">Suggest {data.searches.find(s => s.job_id === jobId)?.title} to {pickedRows.map(p => p.name).join(', ')}?</p>
                <p className="text-[12.5px] text-[#6E6E68]">Each gets one email in three minutes and the search on their Start page. Declining stays easy.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={propose} className="min-h-[40px] rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white">Yes, suggest</button>
                  <button type="button" onClick={() => setStage('idle')} className="min-h-[40px] px-3 text-[13px] font-medium text-[#6E6E68]">Back</button>
                </div>
              </>
            ) : (
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <select value={jobId} onChange={e => setJobId(e.target.value)} className="h-10 rounded-md border border-[#D2D1C7] bg-white px-3 text-[13px]">
                  <option value="">Which search, for {picked.size}?</option>
                  {data.searches.map(s => <option key={s.job_id} value={s.job_id}>{s.title} · {s.company_name}</option>)}
                </select>
                <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why them, one line. Goes in the email." className="h-10 rounded-md border border-[#D2D1C7] px-3 text-[13px]" />
                <button type="button" disabled={!jobId || why.trim().length < 8 || stage === 'sending'} onClick={() => setStage('confirming')} className="min-h-[40px] rounded-full bg-[#1F3A2F] px-4 text-[13px] font-semibold text-white disabled:opacity-50">Review</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, count, blurb, tone, extra, children }: { title: string; count: number; blurb: string; tone?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className={`text-base font-semibold tracking-tight ${tone ?? ''}`}>{title} <span className="font-mono text-sm font-normal text-[#9C9C95]">{count}</span></h2>
        {extra}
      </div>
      <p className="mb-2 text-[13px] text-[#6E6E68]">{blurb}</p>
      {count === 0 ? <p className="text-[13px] text-[#9C9C95]">Nothing here.</p> : <ul className="divide-y divide-[#E4E3DC] border-y border-[#E4E3DC]">{children}</ul>}
    </section>
  )
}
