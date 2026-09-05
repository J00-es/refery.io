/**
 * Filtering the live searches.
 *
 * A scout's evening starts with one of three questions — "where can I earn
 * tonight", "who wants the engineer I just met", "what happened to what I sent" —
 * and only the third was answerable before this. This module powers the first
 * two.
 *
 * Four rules, taken from what faceted search has settled on:
 *
 *   OR within a group, AND across groups.  Engineering *or* Data, and remote, and
 *                                          paying $10k+.
 *   Counts on every value, always live.    Each count is computed against the set
 *                                          filtered by every *other* group, so a
 *                                          value showing "0" is the only thing
 *                                          that can dead-end — and it says so
 *                                          before you click it.
 *   State in the URL.                      Back, forward, refresh and sharing a
 *                                          filtered view all work.
 *   One row of controls.                   Popover chips, horizontally scrollable,
 *                                          identical on a phone. No second
 *                                          desktop-only layout to keep in step.
 *
 * Everything runs in memory. The desk holds a handful of mandates today and would
 * hold a few hundred at its most successful; filtering that in Postgres would be
 * three round trips to save nothing.
 */

import { FUNCTIONS, LOCATIONS, REMOTE_LABELS, SENIORITY_LEVELS, seniorityLabel } from '@/lib/job-ui'
import { PAYOUT_BANDS, type ResolvedFee } from '@/lib/fees'
import type { RolePriority, SearchAssignmentStatus, SearchStage } from '@/lib/partners'

/** One live search, flattened for the list and the filters. */
export interface DeskSearch {
  jobId: string
  companyId: string
  companyName: string
  /** False when the viewer is not assigned — the row shows the alias. */
  unlocked: boolean
  title: string
  headline: string | null
  department: string | null
  location: string | null
  locationBuckets: string[]
  remotePolicy: string | null
  seniority: string | null
  priority: RolePriority
  exclusive: boolean
  fee: ResolvedFee
  payoutBand: string | null
  /** Null when uncapped. */
  slotsLeft: number | null
  submissionCap: number | null
  liveSubmissions: number
  /** Candidates this viewer already has paired with the role. */
  myMatches: number
  mySubmissions: number
  briefPublished: boolean
  addedAt: string
  /** How far the search has got. Shown instead of any count. */
  stage: SearchStage
  stageMovedAt: string | null
  isOpen: boolean
  /** This viewer's assignment on the search, if any. */
  assignment: SearchAssignmentStatus | null
}

// ── facets ──────────────────────────────────────────────────────────────────

export type FacetKey = 'fn' | 'mkt' | 'lvl' | 'rem' | 'pay'

export interface FacetOption {
  value: string
  label: string
}

export interface Facet {
  key: FacetKey
  /** The chip label when nothing is selected. */
  label: string
  options: FacetOption[]
  /** Which options this search satisfies. */
  match: (search: DeskSearch) => string[]
}

export const FACETS: Facet[] = [
  {
    key: 'fn',
    label: 'Function',
    options: FUNCTIONS.map(f => ({ value: f.key, label: f.label })),
    // Department is free text and fragmented, so each bucket owns a set of
    // substrings — the same vocabulary the jobs board filters on.
    match: search => {
      const haystack = `${search.department ?? ''} ${search.title}`.toLowerCase()
      return FUNCTIONS.filter(f => f.patterns.some(p => haystack.includes(p))).map(f => f.key)
    },
  },
  {
    key: 'mkt',
    label: 'Market',
    options: LOCATIONS.map(l => ({ value: l.key, label: l.label })),
    match: search => search.locationBuckets,
  },
  {
    key: 'lvl',
    label: 'Seniority',
    options: SENIORITY_LEVELS.map(s => ({ value: s.key, label: s.label })),
    match: search => (search.seniority ? [search.seniority] : []),
  },
  {
    key: 'rem',
    label: 'Setup',
    options: Object.entries(REMOTE_LABELS).map(([value, label]) => ({ value, label })),
    match: search => (search.remotePolicy ? [search.remotePolicy] : []),
  },
  {
    key: 'pay',
    label: 'You earn',
    options: PAYOUT_BANDS.map(b => ({ value: b.key, label: b.label })),
    match: search => (search.payoutBand ? [search.payoutBand] : []),
  },
]

// ── toggles ─────────────────────────────────────────────────────────────────

export type ToggleKey = 'mine' | 'on' | 'brief' | 'urgent' | 'open'

export interface Toggle {
  key: ToggleKey
  label: string
  /** Why this is worth a click. Shown under the label in the popover. */
  hint: string
  test: (search: DeskSearch) => boolean
}

export const TOGGLES: Toggle[] = [
  {
    key: 'mine',
    label: 'I already have someone',
    hint: 'Searches with one of your candidates already matched to them',
    test: s => s.myMatches > 0,
  },
  {
    key: 'on',
    label: 'On my list',
    hint: 'Searches you are working, or have been proposed',
    test: s => s.assignment === 'working' || s.assignment === 'proposed',
  },
  {
    key: 'open',
    label: 'Open to me',
    hint: 'Only clients whose name and brief you can read',
    test: s => s.unlocked,
  },
  {
    key: 'brief',
    label: 'Has a brief',
    hint: 'A published scout brief tells you the bar before you approach anyone',
    test: s => s.briefPublished,
  },
  {
    key: 'urgent',
    label: 'Urgent only',
    hint: 'Searches the client is pushing on',
    test: s => s.priority === 'urgent' || s.priority === 'high',
  },
]

// ── sorts ───────────────────────────────────────────────────────────────────

export type SortKey = 'payout' | 'moving' | 'new' | 'urgent'

export const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: 'payout', label: 'Highest payout', hint: 'What you earn, best first' },
  { key: 'moving', label: 'Moving now', hint: 'Searches that changed stage most recently' },
  { key: 'urgent', label: 'Most urgent', hint: 'What the client is pushing on' },
  { key: 'new', label: 'Newest', hint: 'Most recently put on the desk' },
]

const PRIORITY_RANK: Record<RolePriority, number> = { urgent: 0, high: 1, normal: 2 }

function compare(sort: SortKey, a: DeskSearch, b: DeskSearch): number {
  switch (sort) {
    case 'payout':
      // A search with no salary recorded cannot be ranked on payout, so it sorts
      // last rather than as zero — it is unknown, not worthless.
      return (b.fee.payoutLow ?? -1) - (a.fee.payoutLow ?? -1)
    case 'moving':
      return new Date(b.stageMovedAt ?? b.addedAt).getTime() - new Date(a.stageMovedAt ?? a.addedAt).getTime()
    case 'urgent':
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    case 'new':
      return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
  }
}

// ── state ───────────────────────────────────────────────────────────────────

export interface DeskQuery {
  facets: Record<FacetKey, string[]>
  toggles: Record<ToggleKey, boolean>
  sort: SortKey
  /** Free-text over the role title and the client name. */
  q: string
}

const EMPTY_FACETS = (): Record<FacetKey, string[]> => ({ fn: [], mkt: [], lvl: [], rem: [], pay: [] })
const EMPTY_TOGGLES = (): Record<ToggleKey, boolean> => ({
  mine: false,
  on: false,
  brief: false,
  urgent: false,
  open: false,
})

/** Reads the query out of searchParams, ignoring anything unrecognised. */
export function parseDeskQuery(sp: Record<string, string | string[] | undefined>): DeskQuery {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

  const facets = EMPTY_FACETS()
  for (const facet of FACETS) {
    const valid = new Set(facet.options.map(o => o.value))
    facets[facet.key] = one(sp[facet.key])
      .split(',')
      .filter(v => valid.has(v))
  }

  const toggles = EMPTY_TOGGLES()
  for (const toggle of TOGGLES) {
    toggles[toggle.key] = one(sp[toggle.key]) === '1'
  }

  const requestedSort = one(sp.sort) as SortKey
  return {
    facets,
    toggles,
    sort: SORTS.some(s => s.key === requestedSort) ? requestedSort : 'payout',
    q: one(sp.q).trim(),
  }
}

/** Serialises back to a query string, omitting defaults so URLs stay short. */
export function deskQueryToParams(query: DeskQuery): URLSearchParams {
  const params = new URLSearchParams()
  for (const facet of FACETS) {
    const values = query.facets[facet.key]
    if (values.length) params.set(facet.key, values.join(','))
  }
  for (const toggle of TOGGLES) {
    if (query.toggles[toggle.key]) params.set(toggle.key, '1')
  }
  if (query.sort !== 'payout') params.set('sort', query.sort)
  if (query.q) params.set('q', query.q)
  return params
}

export function activeFilterCount(query: DeskQuery): number {
  return (
    FACETS.reduce((n, f) => n + query.facets[f.key].length, 0) +
    TOGGLES.filter(t => query.toggles[t.key]).length +
    (query.q ? 1 : 0)
  )
}

// ── applying ────────────────────────────────────────────────────────────────

function matchesFacet(search: DeskSearch, facet: Facet, selected: string[]): boolean {
  if (!selected.length) return true
  const owned = facet.match(search)
  return selected.some(value => owned.includes(value))
}

function matchesText(search: DeskSearch, q: string): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return (
    search.title.toLowerCase().includes(needle) ||
    (search.headline ?? '').toLowerCase().includes(needle) ||
    search.companyName.toLowerCase().includes(needle) ||
    (search.location ?? '').toLowerCase().includes(needle)
  )
}

/**
 * Applies every group except `skip`, which is how a facet's own counts are
 * computed: a value's count must reflect the rest of the query but not its own
 * group, or selecting one option would show every sibling as zero.
 */
function applyExcept(
  searches: DeskSearch[],
  query: DeskQuery,
  skip?: FacetKey | ToggleKey,
): DeskSearch[] {
  return searches.filter(search => {
    for (const facet of FACETS) {
      if (facet.key === skip) continue
      if (!matchesFacet(search, facet, query.facets[facet.key])) return false
    }
    for (const toggle of TOGGLES) {
      if (toggle.key === skip) continue
      if (query.toggles[toggle.key] && !toggle.test(search)) return false
    }
    return matchesText(search, query.q)
  })
}

export interface DeskResult {
  searches: DeskSearch[]
  /** `counts[facetKey][optionValue]` — how many results that option would leave. */
  counts: Record<FacetKey, Record<string, number>>
  /** How many results each toggle would leave if switched on. */
  toggleCounts: Record<ToggleKey, number>
  total: number
}

export function applyDeskQuery(all: DeskSearch[], query: DeskQuery): DeskResult {
  const searches = applyExcept(all, query).sort((a, b) => compare(query.sort, a, b))

  const counts = {} as Record<FacetKey, Record<string, number>>
  for (const facet of FACETS) {
    const pool = applyExcept(all, query, facet.key)
    counts[facet.key] = Object.fromEntries(
      facet.options.map(option => [
        option.value,
        pool.filter(search => facet.match(search).includes(option.value)).length,
      ]),
    )
  }

  const toggleCounts = {} as Record<ToggleKey, number>
  for (const toggle of TOGGLES) {
    toggleCounts[toggle.key] = applyExcept(all, query, toggle.key).filter(toggle.test).length
  }

  return { searches, counts, toggleCounts, total: all.length }
}

/** The chips that describe what is currently on, so each can be removed alone. */
export function activeChips(query: DeskQuery): { key: string; label: string; remove: DeskQuery }[] {
  const chips: { key: string; label: string; remove: DeskQuery }[] = []

  for (const facet of FACETS) {
    for (const value of query.facets[facet.key]) {
      const label = facet.options.find(o => o.value === value)?.label ?? value
      chips.push({
        key: `${facet.key}:${value}`,
        label,
        remove: {
          ...query,
          facets: {
            ...query.facets,
            [facet.key]: query.facets[facet.key].filter(v => v !== value),
          },
        },
      })
    }
  }

  for (const toggle of TOGGLES) {
    if (!query.toggles[toggle.key]) continue
    chips.push({
      key: `t:${toggle.key}`,
      label: toggle.label,
      remove: { ...query, toggles: { ...query.toggles, [toggle.key]: false } },
    })
  }

  if (query.q) {
    chips.push({ key: 'q', label: `“${query.q}”`, remove: { ...query, q: '' } })
  }

  return chips
}

export function emptyDeskQuery(): DeskQuery {
  return { facets: EMPTY_FACETS(), toggles: EMPTY_TOGGLES(), sort: 'payout', q: '' }
}

/** Re-exported so the row component and the filter bar agree on wording. */
export { seniorityLabel }
