'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Search } from 'lucide-react'
import { BTN_PRIMARY, BTN_QUIET, CARD, CHIP, CHIP_BAD, CHIP_VALUE, CHIP_WARN, FIELD, FOCUS, META } from '@/lib/desk-ui'
import { shortAge } from '@/lib/job-ui'
import type { SearchAssignmentStatus } from '@/lib/partners'

export interface CoverageRow {
  id: string
  userId: string
  name: string
  email: string
  role: string
  status: SearchAssignmentStatus
  why: string | null
  proposedAt: string
  expiresAt: string | null
  confirmedAt: string | null
  declinedAt: string | null
  declinedReason: string | null
  /** When the proposal email was last re-sent from this page. */
  nudgedAt: string | null
  /** This partner's submissions on the search, by status label. */
  activity: string
  /** Days since their last submission on this search, or null if none. */
  silentDays: number | null
}

export interface SuggestedPartner {
  userId: string
  name: string
  email: string
  role: string
  /** Candidates of theirs the matcher paired with this search. */
  matches: number
  /** Searches they are already working, as a load signal. */
  workingElsewhere: number
}

interface UserOption {
  user_id: string
  email: string
  full_name: string | null
  role: string
}

const STATUS_CHIP: Record<SearchAssignmentStatus, { label: string; cls: string }> = {
  working: { label: 'Working', cls: CHIP_VALUE },
  proposed: { label: 'Proposed', cls: CHIP_WARN },
  declined: { label: 'Declined', cls: CHIP },
  paused: { label: 'Paused', cls: CHIP },
}

/**
 * Who is on one search, for the admin only.
 *
 * Partners never see this page or any count on it. The table answers three
 * questions Lily asks every Sunday: who said yes, who has gone quiet, and who
 * should be proposed next.
 */
export function CoverageTable({
  jobId,
  rows,
  suggested = [],
  roleTitle = 'this search',
}: {
  jobId: string
  rows: CoverageRow[]
  /** Partners not yet on the search, best first. */
  suggested?: SuggestedPartner[]
  roleTitle?: string
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)
  const [users, setUsers] = useState<UserOption[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [why, setWhy] = useState('')
  const [q, setQ] = useState('')
  const [straightToWorking, setStraightToWorking] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (proposing && users === null) {
      fetch('/api/partners/users')
        .then(r => r.json())
        .then(body => setUsers(body.users ?? []))
        .catch(() => setMessage('Could not load the partner list.'))
    }
  }, [proposing, users])

  const onSearch = useMemo(() => new Set(rows.map(r => r.userId)), [rows])
  const candidates = (users ?? [])
    .filter(u => !onSearch.has(u.user_id))
    .filter(u => {
      const needle = q.trim().toLowerCase()
      if (!needle) return true
      return (u.full_name ?? '').toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
    })

  async function move(row: CoverageRow, status: SearchAssignmentStatus) {
    setBusyId(row.id)
    await fetch(`/api/partners/search-assignments/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setBusyId(null)
    router.refresh()
  }

  async function remove(row: CoverageRow) {
    setBusyId(row.id)
    await fetch(`/api/partners/search-assignments/${row.id}`, { method: 'DELETE' })
    setBusyId(null)
    router.refresh()
  }

  /** Send the proposal email again. The row keeps its status and its expiry. */
  async function nudge(row: CoverageRow) {
    setBusyId(row.id)
    setMessage(null)
    const res = await fetch(`/api/partners/search-assignments/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'nudge' }),
    })
    const body = await res.json().catch(() => ({}))
    setBusyId(null)
    setMessage(res.ok ? `Nudged ${row.name.split(' ')[0]} by email.` : (body.error ?? 'Could not send the nudge.'))
    router.refresh()
  }

  /** Open the propose panel with one suggested partner already ticked. */
  function proposeOne(p: SuggestedPartner) {
    setPicked(new Set([p.userId]))
    setProposing(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const checkInHref = (row: CoverageRow) =>
    `mailto:${row.email}?subject=${encodeURIComponent(`${roleTitle}: anyone in mind?`)}&body=${encodeURIComponent(
      `Hi ${row.name.split(' ')[0]},\n\nQuick check-in on ${roleTitle}. Anyone in your network worth a look this week? Even one name helps me tell the client where we are.\n\nLily`,
    )}`

  async function propose() {
    setBusyId('propose')
    setMessage(null)
    const res = await fetch('/api/partners/search-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        user_ids: [...picked],
        why: why.trim(),
        status: straightToWorking ? 'working' : 'proposed',
      }),
    })
    const body = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) {
      setMessage(body.error ?? 'That did not work.')
      return
    }
    setMessage(
      straightToWorking
        ? `${body.assigned} put straight to working.`
        : `${body.assigned} proposed · ${body.emailed} emailed.`,
    )
    setPicked(new Set())
    setWhy('')
    setProposing(false)
    router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className={META}>{message ?? `${rows.length} partner${rows.length === 1 ? '' : 's'} on or offered this search.`}</p>
        <button type="button" onClick={() => setProposing(p => !p)} className={`${BTN_PRIMARY} min-h-[40px] px-4 text-[13.5px]`}>
          <Plus className="h-4 w-4" />
          Propose to partners
        </button>
      </div>

      {proposing && (
        <div className={`p-5 ${CARD} space-y-4`}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C9C95]" aria-hidden />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a partner by name or email" className={`${FIELD} mt-0 pl-9`} />
          </div>
          <ul className="max-h-[260px] divide-y divide-[#E4E3DC] overflow-y-auto rounded-[12px] border border-[#E4E3DC]">
            {users === null ? (
              <li className={`px-3 py-4 ${META}`}>Loading…</li>
            ) : candidates.length === 0 ? (
              <li className={`px-3 py-4 ${META}`}>Nobody left to propose{q ? ' matching that' : ''}.</li>
            ) : (
              candidates.map(u => (
                <li key={u.user_id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={picked.has(u.user_id)}
                      onChange={() =>
                        setPicked(prev => {
                          const next = new Set(prev)
                          if (next.has(u.user_id)) next.delete(u.user_id)
                          else next.add(u.user_id)
                          return next
                        })
                      }
                      className="h-4 w-4 accent-[#1F3A2F]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#161613]">{u.full_name || u.email}</span>
                      <span className={`block truncate ${META}`}>{u.email} · {u.role.replace(/_/g, ' ')}</span>
                    </span>
                  </label>
                </li>
              ))
            )}
          </ul>
          <label className="block text-[13px] font-medium text-[#2A2A26]">
            Why them, in one line. It goes in the email.
            <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Your applied-AI bench in the Bay Area" className={FIELD} />
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#2A2A26]">
            <input type="checkbox" checked={straightToWorking} onChange={e => setStraightToWorking(e.target.checked)} className="h-4 w-4 accent-[#1F3A2F]" />
            They already said yes on a call. Put them straight to working, no email.
          </label>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busyId === 'propose' || picked.size === 0} onClick={propose} className={`${BTN_PRIMARY} min-h-[40px] px-4 text-[13.5px]`}>
              {busyId === 'propose' && <Loader2 className="h-4 w-4 animate-spin" />}
              {straightToWorking ? `Add ${picked.size || ''}`.trim() : `Propose to ${picked.size || ''}`.trim()}
            </button>
            <button type="button" onClick={() => setProposing(false)} className={`min-h-[40px] px-2 text-[13px] font-medium text-[#6E6E68] hover:text-[#161613] ${FOCUS}`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className={`py-8 text-center ${META}`}>Nobody is on this search yet.</p>
      ) : (
        <ul className={`divide-y divide-[#E4E3DC] ${CARD}`}>
          {rows.map(row => {
            const chip = STATUS_CHIP[row.status]
            const quiet = row.status === 'working' && row.silentDays !== null && row.silentDays >= 14
            return (
              <li key={row.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[220px_minmax(0,1fr)_150px_200px_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-[#161613]">{row.name}</p>
                  <p className={`truncate ${META}`}>{row.email} · {row.role.replace(/_/g, ' ')}</p>
                </div>
                <p className="text-[13px] leading-relaxed text-[#6E6E68]">
                  {row.status === 'declined' && row.declinedReason
                    ? `Declined: “${row.declinedReason}”`
                    : row.why || '—'}
                </p>
                <div>
                  <span className={quiet ? CHIP_BAD : chip.cls}>
                    {quiet ? 'Working · silent' : chip.label}
                  </span>
                  <p className={`mt-1 ${META}`}>
                    {row.status === 'working' && row.confirmedAt
                      ? `since ${shortAge(row.confirmedAt)}`
                      : row.status === 'proposed'
                        ? `proposed ${shortAge(row.proposedAt)}`
                        : row.status === 'declined' && row.declinedAt
                          ? shortAge(row.declinedAt)
                          : ''}
                  </p>
                </div>
                <p className={META}>{row.activity}</p>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {row.status === 'proposed' && (
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => nudge(row)}
                      className={`${BTN_QUIET} min-h-[34px] px-3 text-[12.5px]`}
                      title={row.nudgedAt ? `Last nudged ${shortAge(row.nudgedAt)}` : 'Send the proposal email again'}
                    >
                      {row.nudgedAt ? `Nudge again · ${shortAge(row.nudgedAt)}` : 'Nudge'}
                    </button>
                  )}
                  {row.status === 'proposed' && (
                    <button type="button" disabled={busyId === row.id} onClick={() => move(row, 'working')} className={`${BTN_QUIET} min-h-[34px] px-3 text-[12.5px]`} title="They confirmed on a call">
                      <Check className="h-3.5 w-3.5" />
                      Confirm for them
                    </button>
                  )}
                  {quiet && (
                    <a href={checkInHref(row)} className={`${BTN_QUIET} min-h-[34px] px-3 text-[12.5px]`}>
                      Check in
                    </a>
                  )}
                  {row.status === 'working' && (
                    <button type="button" disabled={busyId === row.id} onClick={() => move(row, 'paused')} className={`${BTN_QUIET} min-h-[34px] px-3 text-[12.5px]`}>
                      Pause
                    </button>
                  )}
                  {(row.status === 'paused' || row.status === 'declined') && (
                    <button type="button" disabled={busyId === row.id} onClick={() => move(row, row.status === 'paused' ? 'working' : 'proposed')} className={`${BTN_QUIET} min-h-[34px] px-3 text-[12.5px]`}>
                      {row.status === 'paused' ? 'Resume' : 'Re-propose'}
                    </button>
                  )}
                  <button type="button" disabled={busyId === row.id} onClick={() => remove(row)} className={`min-h-[34px] px-2 text-[12.5px] font-medium text-[#6E6E68] hover:text-[#A3423A] ${FOCUS}`}>
                    Remove
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {suggested.length > 0 && (
        <section className="space-y-3 pt-2">
          <div>
            <h2 className="text-[17px] font-semibold leading-snug text-[#161613]">Suggested next partners</h2>
            <p className={META}>
              Ranked by how many of their candidates the matcher paired with this search, then by how little they already carry.
            </p>
          </div>
          <ul className={`divide-y divide-[#E4E3DC] ${CARD}`}>
            {suggested.slice(0, 8).map(p => (
              <li key={p.userId} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-[#161613]">{p.name}</p>
                  <p className={`truncate ${META}`}>
                    {p.role.replace(/_/g, ' ')}
                    {' · '}
                    {p.matches ? `${p.matches} candidate${p.matches === 1 ? '' : 's'} match` : 'no matches yet'}
                    {' · '}
                    {p.workingElsewhere ? `working ${p.workingElsewhere} other ${p.workingElsewhere === 1 ? 'search' : 'searches'}` : 'on no search yet'}
                  </p>
                </div>
                <button type="button" onClick={() => proposeOne(p)} className={`${BTN_QUIET} min-h-[34px] px-3 text-[12.5px]`}>
                  <Plus className="h-3.5 w-3.5" />
                  Propose
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
