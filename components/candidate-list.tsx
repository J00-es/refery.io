'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CandidateCard, type EnrichedCandidate } from '@/components/candidate-card'
import { OwnerFilter, UNASSIGNED, type OwnerOption } from '@/components/candidates/owner-filter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ArrowUpDown, LayoutGrid, Rows3, Search, SlidersHorizontal, X } from 'lucide-react'
import {
  AVAILABILITY,
  CARD,
  FOCUS,
  GRADE_BADGE,
  UNGRADED,
  VERDICT_GRADES,
  availabilityOf,
  avatarTint,
  formatSalary,
  initialsOf,
  ownerName,
  relativeTime,
  type AvailabilityKey,
} from '@/lib/candidate-ui'
import { nextActionFor, type JourneyStage } from '@/lib/journey'

interface CandidateListProps {
  candidates: EnrichedCandidate[]
  owners: OwnerOption[]
  /** True only for super admins — gates the owner column and owner filter. */
  canViewAll: boolean
  /** Tab to open on, so /candidates?filter=needs_you lands on the to-do list. */
  initialTab?: StatusKey
}

type ViewMode = 'card' | 'row'

/**
 * Every candidate sits in exactly one tab, and the tabs add up to the total.
 *
 * The first attempt at this failed in a way worth recording. It had both a
 * "Ready" tab (115) and a "Needs me" tab (94) — nearly the same people, with an
 * unexplained 21-person gap that turned out to be benchmarks and off-market
 * candidates. Two overlapping tabs, one of them a superset of the other, and no
 * way for the reader to work out the difference. It also gave a whole tab to
 * "In review", which held one person.
 *
 * So: buckets are assigned first-match, which makes them disjoint by
 * construction, and each carries a sentence saying what is in it. If the counts
 * do not sum to the total, something is being hidden and the design is wrong.
 */
const STATUS_TABS = [
  { key: 'all', label: 'Everyone', blurb: '' },
  {
    key: 'needs_you',
    label: 'Needs you',
    blurb: 'Waiting on a warm introduction from you. Longest wait first.',
  },
  {
    key: 'in_progress',
    label: 'In progress',
    blurb: "We're working on these. Nothing needed from you right now.",
  },
  {
    key: 'warm',
    label: 'Warm',
    blurb: "We've met them and vouch for them. We're matching them to open roles.",
  },
  {
    key: 'not_fit',
    label: 'Not a fit',
    blurb: 'Not a match for the kinds of roles we work on.',
  },
  {
    key: 'benchmark',
    label: 'Benchmarks',
    blurb: 'Profiles sourced to calibrate a search. Not people we are placing.',
  },
] as const
type StatusKey = (typeof STATUS_TABS)[number]['key']

/**
 * Benchmarks are kept out of every other tab, including Everyone. They were
 * sourced to set a bar for a search, not to be placed — 19 of them were sitting
 * in the intro queue before `intake_source` existed to say otherwise. They keep
 * their own tab so they are excluded rather than lost, and that tab hides itself
 * for anyone who has none.
 */
function bucketOf(c: EnrichedCandidate): Exclude<StatusKey, 'all'> {
  if (c.intake_source === 'calibration') return 'benchmark'
  if (nextActionFor(c) !== null) return 'needs_you'

  switch (c.journey_stage) {
    case 'warm':
    case 'placed':
      return 'warm'
    case 'not_fit':
    case 'post_committee_not_fit':
    case 'dormant':
      return 'not_fit'
    default:
      // uploaded, calibrating, and anyone at a stage that would normally ask
      // something of you but currently cannot — off the market, most often.
      return 'in_progress'
  }
}

function matchesTab(c: EnrichedCandidate, tab: StatusKey): boolean {
  const bucket = bucketOf(c)
  if (tab === 'all') return bucket !== 'benchmark'
  return bucket === tab
}

const EXPERIENCE_BANDS = [
  { key: 'junior', label: '0–2 yrs', test: (y: number) => y < 3 },
  { key: 'mid', label: '3–5 yrs', test: (y: number) => y >= 3 && y < 6 },
  { key: 'senior', label: '6–9 yrs', test: (y: number) => y >= 6 && y < 10 },
  { key: 'lead', label: '10+ yrs', test: (y: number) => y >= 10 },
] as const

const REMOTE_OPTS = [
  { key: 'remote', label: 'Remote' },
  { key: 'hybrid', label: 'Hybrid' },
  { key: 'onsite', label: 'On-site' },
  { key: 'flexible', label: 'Flexible' },
] as const

const SORTS = [
  { key: 'last_updated', label: 'Recent activity' },
  { key: 'availability', label: 'Availability' },
  { key: 'newest', label: 'Newest added' },
  { key: 'oldest', label: 'Oldest added' },
  { key: 'name_asc', label: 'Name A–Z' },
  { key: 'experience_desc', label: 'Most experience' },
] as const

const GRID =
  'grid gap-4 auto-rows-fr [grid-template-columns:repeat(auto-fill,minmax(min(100%,21rem),1fr))]'

const PAGE = 48

// ── small building blocks ───────────────────────────────────────────────────

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: readonly { key: string; label: string }[]
  selected: string[]
  onToggle: (key: string) => void
}) {
  return (
    <div>
      <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = selected.includes(o.key)
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.key)}
              className={`rounded-full border px-3 py-2 text-[13px] font-medium transition-colors ${FOCUS} ${
                on
                  ? 'border-[#1F4D3A]/30 bg-[#E9F0EC] text-[#1F4D3A]'
                  : 'border-[#ECECE6] bg-white text-[#6E6E68] hover:border-[#D8D8D0] hover:text-[#161613]'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F0EA] py-1 pl-3 pr-1 text-[12.5px] text-[#161613]">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className={`grid h-6 w-6 place-items-center rounded-full text-[#6E6E68] transition-colors hover:bg-[#E0E0D8] hover:text-[#161613] ${FOCUS}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** Compact row — replaces the old wide table, which needed horizontal scroll. */
function CandidateRow({
  candidate,
  canViewAll,
}: {
  candidate: EnrichedCandidate
  canViewAll: boolean
}) {
  const availability = availabilityOf(candidate.availability_status)
  const role = candidate.parsed_data?.work_history?.[0]
  const owner = ownerName(candidate.owner)
  const salary = formatSalary(candidate.salary_expectation_min, candidate.salary_expectation_max)

  // Same rule as the card: Lily's grade wins for super admins, and partners
  // never see it — it is admin-only on the detail page.
  const verdict = (canViewAll && candidate.lily_verdict) || candidate.recruiter_verdict
  const grade = (verdict && VERDICT_GRADES[verdict]) || UNGRADED
  const rowAction = nextActionFor(candidate)

  return (
    <Link
      href={`/candidates/${candidate.id}`}
      className={`flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[#FAFAF6] sm:px-4 ${FOCUS}`}
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${avatarTint(candidate.name)}`}
      >
        {initialsOf(candidate.name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-[#161613]">{candidate.name}</span>
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${availability.dot}`} title={availability.label} />
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[#6E6E68]">
          {role ? `${role.title}${role.company ? ` · ${role.company}` : ''}` : 'No role on file'}
        </span>
        {/* Below sm the meta collapses under the name instead of into columns. */}
        <span className="mt-0.5 block truncate text-[12px] text-[#9C9C95] md:hidden">
          {[candidate.location, salary, canViewAll ? owner : null].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>

      <span className="hidden w-32 shrink-0 truncate text-[12.5px] text-[#6E6E68] md:block">
        {candidate.location || '—'}
      </span>
      <span className="hidden w-24 shrink-0 truncate text-[12.5px] text-[#6E6E68] lg:block">
        {salary || '—'}
      </span>
      <span
        className={`${GRADE_BADGE} ${grade.className} shrink-0`}
        title={verdict ? grade.label : UNGRADED.label}
        aria-label={verdict ? `Grade ${grade.grade}` : UNGRADED.label}
      >
        {grade.grade}
      </span>

      {canViewAll && (
        <span className="hidden w-36 shrink-0 items-center gap-1.5 md:flex">
          {owner ? (
            <>
              <span
                aria-hidden
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${avatarTint(owner)}`}
              >
                {initialsOf(owner)}
              </span>
              <span className="truncate text-[12.5px] text-[#6E6E68]">{owner}</span>
            </>
          ) : (
            <span className="text-[12.5px] text-[#9C9C95]">Unassigned</span>
          )}
        </span>
      )}
      {/* Same slot, same rule as the card: a row that owes something says so,
          everything else keeps showing recency. */}
      {rowAction ? (
        <span
          className={`hidden w-28 shrink-0 text-right text-[12px] font-semibold sm:block ${
            rowAction.tone === 'do' ? 'text-[#1F4D3A]' : 'text-[#8A6A1F]'
          }`}
        >
          {rowAction.label} →
        </span>
      ) : (
        <span className="hidden w-28 shrink-0 text-right text-[12px] text-[#9C9C95] sm:block">
          {relativeTime(candidate.last_activity ?? candidate.updated_at)}
        </span>
      )}
    </Link>
  )
}

// ── main ────────────────────────────────────────────────────────────────────

export function CandidateList({
  candidates,
  owners,
  canViewAll,
  initialTab = 'all',
}: CandidateListProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusKey>(initialTab)
  const [availability, setAvailability] = useState<string[]>([])
  const [experience, setExperience] = useState<string[]>([])
  const [remote, setRemote] = useState<string[]>([])
  const [selectedOwners, setSelectedOwners] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<string>('last_updated')
  const [view, setView] = useState<ViewMode>('card')
  const [limit, setLimit] = useState(PAGE)

  // Typing stays responsive on large lists: the input updates immediately and
  // the (expensive) filtered list re-renders at React's convenience.
  const deferredSearch = useDeferredValue(search)

  const toggle = useCallback(
    (setter: React.Dispatch<React.SetStateAction<string[]>>) => (key: string) =>
      setter(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])),
    [],
  )

  // Status counts come off the full set so the tab numbers do not move as you
  // filter — they are a stable map of the whole pipeline.
  const statusCounts = useMemo(() => {
    const c = {
      all: 0,
      needs_you: 0,
      in_progress: 0,
      warm: 0,
      not_fit: 0,
      benchmark: 0,
    } as Record<StatusKey, number>
    for (const cand of candidates) {
      const bucket = bucketOf(cand)
      c[bucket]++
      if (bucket !== 'benchmark') c.all++
    }
    return c
  }, [candidates])

  const activeTabBlurb = STATUS_TABS.find(t => t.key === status)?.blurb

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase()

    return candidates.filter(c => {
      if (!matchesTab(c, status)) return false

      if (availability.length && !availability.includes(c.availability_status || 'not_yet_talked'))
        return false

      if (remote.length && !remote.includes(c.remote_preference || '')) return false

      if (experience.length) {
        const y = c.experience_years ?? 0
        if (!experience.some(k => EXPERIENCE_BANDS.find(b => b.key === k)?.test(y))) return false
      }

      if (selectedOwners.length) {
        const id = c.owner_user_id ?? UNASSIGNED
        if (!selectedOwners.includes(id)) return false
      }

      if (q) {
        const role = c.parsed_data?.work_history?.[0]
        const haystack = [
          c.name,
          c.email,
          c.location,
          role?.title,
          role?.company,
          ownerName(c.owner),
          ...(c.skills ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }

      return true
    })
  }, [candidates, deferredSearch, status, availability, experience, remote, selectedOwners])

  const sorted = useMemo(() => {
    const s = [...filtered]
    const activityOf = (c: EnrichedCandidate) =>
      new Date(c.last_activity ?? c.updated_at).getTime()

    switch (sortBy) {
      case 'availability':
        s.sort(
          (a, b) =>
            availabilityOf(a.availability_status).order - availabilityOf(b.availability_status).order ||
            activityOf(b) - activityOf(a),
        )
        break
      case 'name_asc':
        s.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'experience_desc':
        s.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0))
        break
      case 'newest':
        s.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'oldest':
        s.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
      default:
        s.sort((a, b) => activityOf(b) - activityOf(a))
    }
    return s
  }, [filtered, sortBy])

  // Any change to the result set starts paging over again.
  useEffect(() => setLimit(PAGE), [sorted.length, view])

  const visible = useMemo(() => sorted.slice(0, limit), [sorted, limit])

  // Two counts on purpose: the desktop "Filters" popover holds only the facets
  // (owner has its own control beside it), while the mobile sheet holds both —
  // so the badge on each button counts exactly what that surface contains.
  const facetCount = availability.length + experience.length + remote.length
  const mobileFilterCount = facetCount + (selectedOwners.length ? 1 : 0)
  const hasAnyFilter =
    mobileFilterCount > 0 || search.trim().length > 0 || status !== 'all'

  const clearAll = () => {
    setSearch('')
    setStatus('all')
    setAvailability([])
    setExperience([])
    setRemote([])
    setSelectedOwners([])
  }

  const facets = (
    <div className="space-y-5">
      <FacetGroup
        title="Availability"
        options={(Object.keys(AVAILABILITY) as AvailabilityKey[]).map(k => ({
          key: k,
          label: AVAILABILITY[k].label,
        }))}
        selected={availability}
        onToggle={toggle(setAvailability)}
      />
      <FacetGroup
        title="Experience"
        options={EXPERIENCE_BANDS.map(b => ({ key: b.key, label: b.label }))}
        selected={experience}
        onToggle={toggle(setExperience)}
      />
      <FacetGroup
        title="Work preference"
        options={REMOTE_OPTS}
        selected={remote}
        onToggle={toggle(setRemote)}
      />
    </div>
  )

  if (candidates.length === 0) {
    return (
      <div className={`${CARD} flex flex-col items-center justify-center px-6 py-16 text-center`}>
        <h3 className="font-serif text-[22px] tracking-[-0.01em] text-[#161613]">
          No candidates yet
        </h3>
        <p className="mt-2 max-w-sm text-[14px] text-[#6E6E68]">
          Upload a resume and we&apos;ll parse it, score it, and start matching it to open roles.
        </p>
        <Link
          href="/candidates/new"
          className={`mt-6 rounded-full bg-[#1F4D3A] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] ${FOCUS}`}
        >
          Upload a resume
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── status tabs ─────────────────────────────────────────────────── */}
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          aria-label="Filter by status"
          className="flex w-max min-w-full items-center gap-1 border-b border-[#ECECE6]"
        >
          {STATUS_TABS.filter(t => t.key !== 'benchmark' || statusCounts.benchmark > 0).map(t => {
            const on = status === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                onClick={() => setStatus(t.key)}
                className={`relative shrink-0 px-3 pb-2.5 pt-2 text-[13.5px] font-medium transition-colors ${FOCUS} ${
                  on ? 'text-[#161613]' : 'text-[#9C9C95] hover:text-[#6E6E68]'
                }`}
              >
                {t.label}
                <span className={`ml-1.5 tabular-nums ${on ? 'text-[#1F4D3A]' : 'text-[#C9C9C1]'}`}>
                  {statusCounts[t.key]}
                </span>
                {on && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#1F4D3A]" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* One sentence, only for the tab you are on. A permanent legend for six
          tabs would be six lines of chrome nobody reads after the first week;
          this answers "what am I looking at" exactly when the question arises. */}
      {activeTabBlurb && (
        <p className="-mt-1 text-[13px] leading-snug text-[#6E6E68]">{activeTabBlurb}</p>
      )}

      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C9C95]" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={canViewAll ? 'Search name, role, skill, owner…' : 'Search name, role, skill…'}
            aria-label="Search candidates"
            className={`h-10 rounded-full border-[#D8D8D0] bg-white pl-10 pr-9 text-[14px] placeholder:text-[#9C9C95] ${FOCUS}`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#9C9C95] transition-colors hover:bg-[#F0F0EA] hover:text-[#161613] ${FOCUS}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Owner filter is a super-admin affordance: everyone else only ever
              has their own candidates, so the control would always be a no-op. */}
          {canViewAll && owners.length > 0 && (
            <div className="hidden sm:block">
              <OwnerFilter owners={owners} selected={selectedOwners} onChange={setSelectedOwners} />
            </div>
          )}

          {/* Desktop: popover. Mobile: bottom sheet. */}
          <div className="hidden sm:block">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors ${FOCUS} ${
                    facetCount > 0
                      ? 'border-[#1F4D3A]/30 bg-[#E9F0EC] text-[#1F4D3A]'
                      : 'border-[#D8D8D0] bg-white text-[#161613] hover:border-[#9C9C95]'
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {facetCount > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1F4D3A] px-1 text-[11px] font-semibold text-white">
                      {facetCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] rounded-[14px] border-[#ECECE6] p-4">
                {facets}
              </PopoverContent>
            </Popover>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors sm:hidden ${FOCUS} ${
                  mobileFilterCount > 0
                    ? 'border-[#1F4D3A]/30 bg-[#E9F0EC] text-[#1F4D3A]'
                    : 'border-[#D8D8D0] bg-white text-[#161613]'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {mobileFilterCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1F4D3A] px-1 text-[11px] font-semibold text-white">
                    {mobileFilterCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[20px]">
              <SheetHeader className="px-4 text-left">
                <SheetTitle className="font-serif text-[20px] tracking-[-0.01em]">Filters</SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8 pt-2">
                {canViewAll && owners.length > 0 && (
                  <div>
                    <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
                      Owner
                    </h4>
                    <OwnerFilter
                      owners={owners}
                      selected={selectedOwners}
                      onChange={setSelectedOwners}
                      inline
                    />
                  </div>
                )}
                {facets}
                {hasAnyFilter && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className={`h-11 w-full rounded-full border border-[#D8D8D0] text-[14px] font-medium text-[#161613] ${FOCUS}`}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Sort candidates"
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#D8D8D0] bg-white px-3.5 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden lg:inline">
                  {SORTS.find(s => s.key === sortBy)?.label}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[200px] rounded-[14px] border-[#ECECE6] p-1.5">
              {SORTS.map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSortBy(s.key)}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-[#FAFAF6] ${FOCUS} ${
                    sortBy === s.key ? 'font-semibold text-[#1F4D3A]' : 'text-[#6E6E68]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="flex h-10 shrink-0 items-center rounded-full border border-[#D8D8D0] bg-white p-0.5">
            {(
              [
                { key: 'card', icon: LayoutGrid, label: 'Card view' },
                { key: 'row', icon: Rows3, label: 'List view' },
              ] as const
            ).map(v => (
              <button
                key={v.key}
                type="button"
                aria-label={v.label}
                aria-pressed={view === v.key}
                onClick={() => setView(v.key)}
                className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${FOCUS} ${
                  view === v.key ? 'bg-[#161613] text-white' : 'text-[#6E6E68] hover:text-[#161613]'
                }`}
              >
                <v.icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── active filters + count ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-[#6E6E68]">
          <span className="font-semibold tabular-nums text-[#161613]">{sorted.length}</span>
          {sorted.length === candidates.length
            ? ` candidate${sorted.length === 1 ? '' : 's'}`
            : ` of ${candidates.length}`}
        </p>

        {selectedOwners.map(id => (
          <ActiveChip
            key={id}
            label={owners.find(o => o.id === id)?.name ?? 'Owner'}
            onClear={() => setSelectedOwners(prev => prev.filter(o => o !== id))}
          />
        ))}
        {availability.map(k => (
          <ActiveChip
            key={k}
            label={AVAILABILITY[k as AvailabilityKey]?.label ?? k}
            onClear={() => setAvailability(prev => prev.filter(a => a !== k))}
          />
        ))}
        {experience.map(k => (
          <ActiveChip
            key={k}
            label={EXPERIENCE_BANDS.find(b => b.key === k)?.label ?? k}
            onClear={() => setExperience(prev => prev.filter(e => e !== k))}
          />
        ))}
        {remote.map(k => (
          <ActiveChip
            key={k}
            label={REMOTE_OPTS.find(r => r.key === k)?.label ?? k}
            onClear={() => setRemote(prev => prev.filter(r => r !== k))}
          />
        ))}

        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className={`rounded-full px-2 py-1 text-[12.5px] font-medium text-[#6E6E68] underline-offset-2 transition-colors hover:text-[#161613] hover:underline ${FOCUS}`}
          >
            Clear all
          </button>
        )}
      </div>

      {/* ── results ─────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className={`${CARD} flex flex-col items-center justify-center px-6 py-14 text-center`}>
          <p className="text-[15px] font-medium text-[#161613]">No candidates match these filters</p>
          <p className="mt-1.5 max-w-xs text-[13.5px] text-[#6E6E68]">
            Try removing a filter or widening your search.
          </p>
          <button
            type="button"
            onClick={clearAll}
            className={`mt-5 rounded-full border border-[#D8D8D0] px-4 py-2 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
          >
            Clear all filters
          </button>
        </div>
      ) : view === 'card' ? (
        <div className={GRID}>
          {visible.map(c => (
            <CandidateCard key={c.id} candidate={c} canViewAll={canViewAll} />
          ))}
        </div>
      ) : (
        <div className={`${CARD} divide-y divide-[#ECECE6] overflow-hidden`}>
          {visible.map(c => (
            <CandidateRow key={c.id} candidate={c} canViewAll={canViewAll} />
          ))}
        </div>
      )}

      {visible.length < sorted.length && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setLimit(l => l + PAGE)}
            className={`h-11 rounded-full border border-[#D8D8D0] bg-white px-6 text-[14px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
          >
            Show {Math.min(PAGE, sorted.length - visible.length)} more
            <span className="ml-1.5 text-[#9C9C95]">({sorted.length - visible.length} left)</span>
          </button>
        </div>
      )}
    </div>
  )
}
