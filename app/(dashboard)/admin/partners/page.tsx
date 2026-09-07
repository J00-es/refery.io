'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Spinner } from '@/components/ui/spinner'

/**
 * The partner desk.
 *
 * Answers one question: who is stuck, and on what. Before this, that answer
 * lived only in Gmail and took an evening to reconstruct by hand.
 *
 * Three groups, because there are only three decisions. Give someone their
 * first search, chase what they already took, or leave them alone. Anything
 * that does not serve one of those is off the page: a desk you have to read
 * carefully is one you stop opening.
 *
 * The desk's real job is the first group. 40 of 75 partners have signed and
 * never been offered a single search, and offering one at a time is the reason
 * why. So selection is multi, and one proposal covers everyone ticked.
 *
 * Mobile first. Partners get triaged between other things, on a phone, so rows
 * fold to one column and nothing hides behind a horizontal scroll.
 */

interface Partner {
  user_id: string
  email: string
  full_name: string | null
  role: string
  joined_at: string
  submissions: number
  advanced: number
  searches_open: number
  searches_working: number
  days_quiet: number
  state: string
  needs: string
  stalled: boolean
}

interface Search {
  job_id: string
  title: string
  company_name: string | null
  location: string | null
  search_stage: string
}

interface Payload {
  counts: { total: number; working: number; stalled: number; neverOffered: number; submissions: number }
  partners: Partner[]
  searches: Search[]
}

const GROUPS: Array<{ key: string; title: string; blurb: string; states: string[] }> = [
  {
    key: 'never-offered',
    title: 'Never given a search',
    blurb: 'Signed up and were never asked to do anything. Ours to fix.',
    states: ['joined_unsigned', 'signed_idle'],
  },
  {
    key: 'took-nothing-sent',
    title: 'Took a search, sent nothing',
    blurb: 'They said yes. Worth a note before it goes cold.',
    states: ['search_offered', 'took_a_search'],
  },
  {
    key: 'lapsed',
    title: 'Submitted before, gone quiet',
    blurb: 'They know how this works, which makes them the cheapest to restart.',
    states: ['lapsed'],
  },
  { key: 'working', title: 'Working', blurb: 'Nothing needed.', states: ['working'] },
]

function waitLabel(days: number): string {
  if (days < 1) return 'today'
  if (days === 1) return '1 day'
  if (days < 60) return `${days} days`
  return `${Math.round(days / 30)} months`
}

function waitTone(days: number, stalled: boolean): string {
  if (!stalled) return 'bg-[#E7EDE9] text-[#1F3A2F]'
  if (days >= 30) return 'bg-[#F4E5E0] text-[#8A3B2A]'
  return 'bg-[#F7EEDC] text-[#8A5B12]'
}

export default function PartnerDeskPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [showWorking, setShowWorking] = useState(false)

  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [jobId, setJobId] = useState('')
  const [why, setWhy] = useState('')
  // Two steps on purpose. Proposing emails every partner ticked, and an email is
  // the one thing here that cannot be taken back, so the recipients are named
  // and counted before anything is sent.
  const [stage, setStage] = useState<'idle' | 'choosing' | 'confirming' | 'sending'>('idle')
  const [result, setResult] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/admin/partners')
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load partners')
        return res.json()
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong'))
  }, [])

  useEffect(load, [load])

  const grouped = useMemo(() => {
    if (!data) return []
    return GROUPS.map(g => ({ ...g, rows: data.partners.filter(p => g.states.includes(p.state)) })).filter(
      g => g.rows.length > 0,
    )
  }, [data])

  const pickedPartners = useMemo(
    () => (data?.partners ?? []).filter(p => picked.has(p.user_id)),
    [data, picked],
  )
  const chosenSearch = useMemo(
    () => (data?.searches ?? []).find(s => s.job_id === jobId) ?? null,
    [data, jobId],
  )

  function toggle(userId: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  function pickGroup(rows: Partner[]) {
    setPicked(prev => {
      const next = new Set(prev)
      const all = rows.every(r => next.has(r.user_id))
      for (const r of rows) {
        if (all) next.delete(r.user_id)
        else next.add(r.user_id)
      }
      return next
    })
  }

  function reset() {
    setPicked(new Set())
    setJobId('')
    setWhy('')
    setStage('idle')
  }

  async function propose() {
    setStage('sending')
    setResult(null)
    try {
      const res = await fetch('/api/partners/search-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, user_ids: [...picked], why }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload.error ?? 'Could not propose')
      setResult(`Proposed to ${pickedPartners.length} ${pickedPartners.length === 1 ? 'partner' : 'partners'}.`)
      reset()
      load()
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Something went wrong')
      setStage('confirming')
    }
  }

  if (error) return <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-[#8A3B2A]">{error}</div>
  if (!data)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    )

  const { counts } = data

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 pb-32 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#161613] sm:text-3xl">Partner desk</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6E6E68]">
          Who is stuck, and on what. Longest wait first inside each group.
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Partners', value: counts.total, tone: 'text-[#161613]' },
            { label: 'Working', value: counts.working, tone: 'text-[#1F3A2F]' },
            { label: 'Stalled', value: counts.stalled, tone: 'text-[#8A3B2A]' },
            { label: 'Never offered a search', value: counts.neverOffered, tone: 'text-[#8A3B2A]' },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
              <dd className={`font-mono text-2xl font-medium tracking-tight ${s.tone}`}>{s.value}</dd>
              <dt className="mt-1 text-[11px] leading-snug text-[#6E6E68]">{s.label}</dt>
            </div>
          ))}
        </dl>

        {result && (
          <p className="mt-4 rounded-lg border border-[#E4E3DC] bg-[#E7EDE9] px-4 py-2.5 text-sm text-[#1F3A2F]">
            {result}
          </p>
        )}
      </header>

      {grouped.map(group => {
        const collapsed = group.key === 'working' && !showWorking
        const selectable = group.key !== 'working'
        return (
          <section key={group.key} className="mb-10">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold tracking-tight text-[#161613]">
                {group.title} <span className="font-mono text-sm font-normal text-[#9C9C95]">{group.rows.length}</span>
              </h2>
              {group.key === 'working' ? (
                <button
                  type="button"
                  onClick={() => setShowWorking(v => !v)}
                  className="text-xs font-medium text-[#1F3A2F] underline underline-offset-2"
                >
                  {collapsed ? 'Show' : 'Hide'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => pickGroup(group.rows)}
                  className="text-xs font-medium text-[#1F3A2F] underline underline-offset-2"
                >
                  Select all {group.rows.length}
                </button>
              )}
            </div>
            <p className="mb-3 text-[13px] text-[#6E6E68]">{group.blurb}</p>

            {!collapsed && (
              <ul className="divide-y divide-[#E4E3DC] border-y border-[#E4E3DC]">
                {group.rows.map(p => (
                  <li
                    key={p.user_id}
                    className="grid grid-cols-1 gap-2 py-3.5 sm:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1.4fr)_auto] sm:items-center sm:gap-4"
                  >
                    {selectable ? (
                      <label className="flex items-center gap-2 sm:block">
                        <input
                          type="checkbox"
                          checked={picked.has(p.user_id)}
                          onChange={() => toggle(p.user_id)}
                          className="h-5 w-5 shrink-0 accent-[#1F3A2F] sm:h-4 sm:w-4"
                        />
                        <span className="text-xs text-[#9C9C95] sm:hidden">Select</span>
                      </label>
                    ) : (
                      <span className="hidden sm:block sm:w-4" />
                    )}

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-[#161613]">
                          {p.full_name || p.email}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${waitTone(p.days_quiet, p.stalled)}`}
                        >
                          {waitLabel(p.days_quiet)}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-[#9C9C95]">
                        {p.role === 'scout' ? 'Scout' : 'Recruiter'} · joined{' '}
                        {new Date(p.joined_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        {p.submissions > 0 && ` · ${p.submissions} submitted`}
                        {p.advanced > 0 && ` · ${p.advanced} advanced`}
                      </div>
                    </div>

                    <p className="text-[13.5px] leading-snug text-[#6E6E68]">{p.needs}</p>

                    <Link
                      href={`/recruiters/${p.user_id}`}
                      className="justify-self-start rounded-md border border-[#D2D1C7] bg-[#F2F1EB] px-3 py-1.5 text-xs font-semibold text-[#161613]"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      {/* The action bar. Appears only with a selection, so the page is a list
          until there is something to do with it. */}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#D2D1C7] bg-[#FAF9F5]/95 backdrop-blur">
          <div className="mx-auto w-full max-w-4xl px-4 py-3 sm:px-6">
            {stage === 'confirming' ? (
              <div>
                <p className="text-sm font-semibold text-[#161613]">
                  Email {pickedPartners.length} {pickedPartners.length === 1 ? 'partner' : 'partners'} about{' '}
                  {chosenSearch?.title} at {chosenSearch?.company_name}?
                </p>
                <p className="mt-1 max-h-20 overflow-y-auto text-[12.5px] leading-relaxed text-[#6E6E68]">
                  {pickedPartners.map(p => p.full_name || p.email).join(', ')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={propose}
                    className="rounded-md bg-[#1F3A2F] px-4 py-2 text-sm font-semibold text-[#FAF9F5]"
                  >
                    Send it
                  </button>
                  <button
                    type="button"
                    onClick={() => setStage('choosing')}
                    className="rounded-md border border-[#D2D1C7] px-4 py-2 text-sm font-semibold text-[#161613]"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : stage === 'sending' ? (
              <p className="py-2 text-sm text-[#6E6E68]">Proposing…</p>
            ) : stage === 'choosing' ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={jobId}
                  onChange={e => setJobId(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-[#D2D1C7] bg-white px-3 py-2 text-sm text-[#161613]"
                >
                  <option value="">Choose a search…</option>
                  {data.searches.map(s => (
                    <option key={s.job_id} value={s.job_id}>
                      {s.company_name} — {s.title}
                      {s.location ? ` (${s.location})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  value={why}
                  onChange={e => setWhy(e.target.value)}
                  placeholder="Why them, optional"
                  className="min-w-0 flex-1 rounded-md border border-[#D2D1C7] bg-white px-3 py-2 text-sm text-[#161613]"
                />
                <button
                  type="button"
                  disabled={!jobId}
                  onClick={() => setStage('confirming')}
                  className="rounded-md bg-[#1F3A2F] px-4 py-2 text-sm font-semibold text-[#FAF9F5] disabled:opacity-40"
                >
                  Review
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#161613]">
                  {picked.size} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStage('choosing')}
                    className="rounded-md bg-[#1F3A2F] px-4 py-2 text-sm font-semibold text-[#FAF9F5]"
                  >
                    Propose a search
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="rounded-md border border-[#D2D1C7] px-4 py-2 text-sm font-semibold text-[#161613]"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
