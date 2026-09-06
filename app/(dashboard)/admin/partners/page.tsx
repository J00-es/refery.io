'use client'

import { useEffect, useMemo, useState } from 'react'
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
 * Mobile first. Partners get triaged between other things, on a phone, so the
 * row collapses to name, wait, need, action in a single column and nothing is
 * behind a horizontal scroll.
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
  last_submission_at: string | null
  last_call_at: string | null
  days_quiet: number
  state: string
  needs: string
  stalled: boolean
}

interface Payload {
  counts: { total: number; working: number; stalled: number; neverOffered: number; submissions: number }
  partners: Partner[]
}

/**
 * The three groups, in the order they are worked.
 *
 * Never offered comes first on purpose. It is the largest group and the only
 * one entirely within our control: nobody has asked these people to do
 * anything, so their silence is ours rather than theirs.
 */
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
  {
    key: 'working',
    title: 'Working',
    blurb: 'Nothing needed.',
    states: ['working'],
  },
]

function waitLabel(days: number): string {
  if (days < 1) return 'today'
  if (days === 1) return '1 day'
  if (days < 60) return `${days} days`
  return `${Math.round(days / 30)} months`
}

/** Red past a month of silence, amber past a fortnight, quiet otherwise. */
function waitTone(days: number, stalled: boolean): string {
  if (!stalled) return 'bg-[#E7EDE9] text-[#1F3A2F]'
  if (days >= 30) return 'bg-[#F4E5E0] text-[#8A3B2A]'
  return 'bg-[#F7EEDC] text-[#8A5B12]'
}

export default function PartnerDeskPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [showWorking, setShowWorking] = useState(false)

  useEffect(() => {
    fetch('/api/admin/partners')
      .then(async res => {
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not load partners')
        return res.json()
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong'))
  }, [])

  const grouped = useMemo(() => {
    if (!data) return []
    return GROUPS.map(g => ({
      ...g,
      rows: data.partners.filter(p => g.states.includes(p.state)),
    })).filter(g => g.rows.length > 0)
  }, [data])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-[#8A3B2A]">{error}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    )
  }

  const { counts } = data

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
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
      </header>

      {grouped.map(group => {
        const collapsed = group.key === 'working' && !showWorking
        return (
          <section key={group.key} className="mb-10">
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold tracking-tight text-[#161613]">
                {group.title}{' '}
                <span className="font-mono text-sm font-normal text-[#9C9C95]">{group.rows.length}</span>
              </h2>
              {group.key === 'working' && (
                <button
                  type="button"
                  onClick={() => setShowWorking(v => !v)}
                  className="text-xs font-medium text-[#1F3A2F] underline underline-offset-2"
                >
                  {collapsed ? 'Show' : 'Hide'}
                </button>
              )}
            </div>
            <p className="mb-3 text-[13px] text-[#6E6E68]">{group.blurb}</p>

            {!collapsed && (
              <ul className="divide-y divide-[#E4E3DC] border-y border-[#E4E3DC]">
                {group.rows.map(p => (
                  <li
                    key={p.user_id}
                    className="grid grid-cols-1 gap-2 py-3.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_auto] sm:items-center sm:gap-4"
                  >
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

                    <div className="flex flex-wrap gap-2">
                      {group.key !== 'working' && (
                        <Link
                          href={`/searches?propose=${p.user_id}`}
                          className="rounded-md bg-[#1F3A2F] px-3 py-1.5 text-xs font-semibold text-[#FAF9F5]"
                        >
                          {p.searches_open > 0 ? 'Nudge' : 'Send a search'}
                        </Link>
                      )}
                      <Link
                        href={`/recruiters/${p.user_id}`}
                        className="rounded-md border border-[#D2D1C7] bg-[#F2F1EB] px-3 py-1.5 text-xs font-semibold text-[#161613]"
                      >
                        Open
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
