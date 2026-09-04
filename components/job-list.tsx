'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { JobCard, type JobRow } from '@/components/jobs/job-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { CARD, FOCUS, avatarTint, initialsOf } from '@/lib/candidate-ui'
import { STAGE_ORDER, stageLabel, usableLogo } from '@/lib/company-ui'
import {
  FUNCTIONS,
  JOB_SORTS,
  JOB_STATUSES,
  LOCATION_GROUPS,
  LOCATIONS,
  POSTED_BANDS,
  REMOTE_LABELS,
  SALARY_BANDS,
  SENIORITY_LEVELS,
  STATUS_META,
  formatSalary,
  locationLabel,
  seniorityLabel,
  shortAge,
} from '@/lib/job-ui'

interface JobListProps {
  jobs: JobRow[]
  total: number
  page: number
  pageSize: number
  /** Admin console capability: drafts, closed roles, job status. */
  isAdmin: boolean
  /**
   * Super admin. Pipeline counts are board-wide for them and scoped to the
   * viewer's own candidates for everyone else, so the wording and the
   * sort-by-pipeline option change with it.
   */
  canViewAllPipeline: boolean
}

const GRID =
  'grid gap-4 auto-rows-fr [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]'

// ── URL state ───────────────────────────────────────────────────────────────
// ~73k jobs, so filtering, sorting and paging all run in Postgres and the URL
// is the source of truth — which also makes a filtered view shareable.
function useQueryState() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      if (!('page' in patch)) next.delete('page')
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
    },
    [params, pathname, router],
  )

  const list = useCallback(
    (key: string) => (params.get(key) || '').split(',').filter(Boolean),
    [params],
  )

  const toggle = useCallback(
    (key: string, value: string) => {
      const cur = (params.get(key) || '').split(',').filter(Boolean)
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value]
      set({ [key]: next.join(',') || null })
    },
    [params, set],
  )

  return { params, set, list, toggle, pending }
}

// ── filter primitives ───────────────────────────────────────────────────────

/**
 * Full-width option row rather than a wrapped pill.
 *
 * The previous pill grid put ~30 small targets inside a 360px popover that
 * clipped at the viewport, so the lower half of the filter list could be
 * neither seen nor clicked. A single-column list of 40px rows scrolls
 * predictably, gives every option a real touch target, and its height is
 * something the container can be sized against.
 */
function OptionRow({
  label,
  hint,
  on,
  single,
  onToggle,
}: {
  label: string
  hint?: string
  on: boolean
  /** Radio semantics — picking one replaces the other, as with Posted. */
  single?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role={single ? 'radio' : 'checkbox'}
      aria-checked={on}
      onClick={onToggle}
      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition-colors hover:bg-[#F4F4EE] ${FOCUS} ${
        on ? 'bg-[#F4F4EE]' : ''
      }`}
    >
      <span
        aria-hidden
        className={`grid h-[18px] w-[18px] shrink-0 place-items-center border transition-colors ${
          single ? 'rounded-full' : 'rounded-[5px]'
        } ${on ? 'border-[#1F3A2F] bg-[#1F3A2F] text-white' : 'border-[#D2D1C7] bg-white'}`}
      >
        {on &&
          (single ? (
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          ) : (
            <Check className="h-3 w-3" strokeWidth={3} />
          ))}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] ${on ? 'font-medium text-[#161613]' : 'text-[#3F3F3A]'}`}
        >
          {label}
        </span>
        {hint && <span className="mt-0.5 block truncate text-[12px] text-[#9C9C95]">{hint}</span>}
      </span>
    </button>
  )
}

function OptionList({
  options,
  selected,
  onToggle,
  single,
}: {
  options: readonly { key: string; label: string; hint?: string }[]
  selected: string[]
  onToggle: (k: string) => void
  single?: boolean
}) {
  return (
    <div role={single ? 'radiogroup' : 'group'} className="space-y-0.5">
      {options.map(o => (
        <OptionRow
          key={o.key}
          label={o.label}
          hint={o.hint}
          on={selected.includes(o.key)}
          single={single}
          onToggle={() => onToggle(o.key)}
        />
      ))}
    </div>
  )
}

function FacetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 px-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
        {title}
      </h4>
      {children}
    </div>
  )
}

/**
 * Inline dropdown for one facet, so the filters people reach for most are one
 * click from the toolbar instead of buried in a panel.
 *
 * The body is height-bounded and scrolls on its own, and the clear action sits
 * in a footer pinned outside that scroll area — the combination is what keeps
 * every option reachable no matter where the trigger sits in the viewport.
 */
function FacetDropdown({
  label,
  count,
  onClear,
  width = 'w-[300px]',
  children,
}: {
  label: string
  count: number
  onClear: () => void
  width?: string
  children: React.ReactNode
}) {
  const on = count > 0
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${FOCUS} ${
            on
              ? 'border-[#1F3A2F]/30 bg-[#E7EDE9] text-[#1F3A2F]'
              : 'border-[#D2D1C7] bg-white text-[#3F3F3A] hover:border-[#9C9C95] hover:text-[#161613]'
          }`}
        >
          {label}
          {on && (
            <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#1F3A2F] px-1 text-[10.5px] font-semibold text-white">
              {count}
            </span>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className={`${width} max-w-[calc(100vw-24px)] overflow-hidden rounded-[14px] border-[#E4E3DC] p-0 shadow-lg`}
      >
        <div className="max-h-[min(62vh,380px)] overflow-y-auto overscroll-contain p-2">
          {children}
        </div>
        {on && (
          <div className="border-t border-[#E4E3DC] bg-[#FAF9F5] p-2">
            <button
              type="button"
              onClick={onClear}
              className={`w-full rounded-[10px] py-2 text-[13px] font-medium text-[#6E6E68] transition-colors hover:bg-white hover:text-[#161613] ${FOCUS}`}
            >
              Clear {label.toLowerCase()}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Location picker.
 *
 * The 22 buckets cover ~85% of open roles; the rest is a long tail of one-off
 * towns and office names ("Weirton, WV", "One Island East"). The same box
 * therefore does two jobs: it narrows the bucket list as you type, and offers
 * a raw contains-search as the last row so nothing on the board is
 * unreachable.
 */
function LocationPicker({
  selected,
  locq,
  onToggle,
  onSearch,
}: {
  selected: string[]
  locq: string
  onToggle: (k: string) => void
  onSearch: (v: string | null) => void
}) {
  const [term, setTerm] = useState('')
  const needle = term.trim().toLowerCase()

  const matches = useMemo(
    () => (needle ? LOCATIONS.filter(l => l.label.toLowerCase().includes(needle)) : LOCATIONS),
    [needle],
  )

  return (
    <div className="space-y-2">
      <div className="relative px-0.5 pt-0.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9C9C95]" />
        <Input
          value={term}
          onChange={e => setTerm(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && term.trim()) {
              e.preventDefault()
              onSearch(term.trim())
            }
          }}
          placeholder="Market, city or country…"
          aria-label="Find a location"
          className={`h-9 rounded-[10px] border-[#E4E3DC] bg-[#FAF9F5] pl-8 text-[13px] placeholder:text-[#9C9C95] ${FOCUS}`}
        />
      </div>

      {locq && (
        <div className="px-0.5">
          <span className="flex items-center gap-1 rounded-[10px] bg-[#E7EDE9] py-1.5 pl-2.5 pr-1 text-[12.5px] text-[#1F3A2F]">
            <span className="min-w-0 flex-1 truncate">Location contains “{locq}”</span>
            <button
              type="button"
              onClick={() => onSearch(null)}
              aria-label="Clear location search"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-white/70 ${FOCUS}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      {LOCATION_GROUPS.map(g => {
        const inGroup = matches.filter(l => l.group === g)
        if (!inGroup.length) return null
        return (
          <FacetSection key={g} title={g}>
            <OptionList
              options={inGroup.map(l => ({ key: l.key, label: l.label }))}
              selected={selected}
              onToggle={onToggle}
            />
          </FacetSection>
        )
      })}

      {/* Escape hatch for the towns and office names no bucket covers. */}
      {needle && (
        <div className="border-t border-[#E4E3DC] pt-2">
          <button
            type="button"
            onClick={() => onSearch(term.trim())}
            className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left transition-colors hover:bg-[#F4F4EE] ${FOCUS}`}
          >
            <Search className="h-4 w-4 shrink-0 text-[#9C9C95]" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-[#161613]">
                Search locations containing “{term.trim()}”
              </span>
              {!matches.length && (
                <span className="mt-0.5 block text-[12px] text-[#9C9C95]">
                  No market matches that name
                </span>
              )}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

function ActiveChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#EAE9E1] py-1 pl-3 pr-1 text-[12.5px] text-[#161613]">
      <span className="max-w-[180px] truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[#6E6E68] transition-colors hover:bg-[#E0E0D8] hover:text-[#161613] ${FOCUS}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  )
}

/** Compact row — density mode for scanning a high-churn feed. */
function JobRowItem({ j, isAdmin }: { j: JobRow; isAdmin: boolean }) {
  const company = j.company_name || 'Unknown company'
  const logoUrl = usableLogo(j.company_logo_url)
  const [logoFailed, setLogoFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setLogoFailed(true)
  }, [logoUrl])
  const showLogo = Boolean(logoUrl) && !logoFailed

  const salary = formatSalary(j.salary_min, j.salary_max)
  const remote = j.remote_policy ? REMOTE_LABELS[j.remote_policy] : null
  const status = STATUS_META[j.status || 'open']

  return (
    <Link
      href={`/jobs/${j.id}`}
      className={`flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[#FAF9F5] sm:px-4 ${FOCUS}`}
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] text-[12px] font-semibold ${
          showLogo ? 'border border-[#E4E3DC] bg-white p-0.5' : avatarTint(company)
        }`}
      >
        {showLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={logoUrl!}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          initialsOf(company)
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-[#161613]">{j.title}</span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[#6E6E68]">
          {[company, j.location].filter(Boolean).join(' · ')}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-[#9C9C95] md:hidden">
          {[remote, salary, j.department].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>

      <span className="hidden w-20 shrink-0 text-[12.5px] text-[#6E6E68] md:block">
        {remote || '—'}
      </span>
      <span className="hidden w-28 shrink-0 text-right text-[13px] font-medium tabular-nums text-[#161613] md:block">
        {salary || '—'}
      </span>
      <span className="hidden w-32 shrink-0 truncate text-[12.5px] text-[#6E6E68] lg:block">
        {j.department && j.department !== j.location ? j.department : '—'}
      </span>
      {isAdmin && status && (
        <span className="hidden w-20 shrink-0 items-center gap-1.5 text-[12.5px] text-[#6E6E68] lg:flex">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      )}
      <span className="hidden w-14 shrink-0 text-right text-[12px] sm:block">
        {j.pipeline_count ? (
          <span className="font-medium text-[#1F3A2F]">{j.pipeline_count}</span>
        ) : (
          <span className="text-[#9C9C95]">—</span>
        )}
      </span>
      <span className="w-12 shrink-0 text-right text-[12px] text-[#9C9C95]">
        {shortAge(j.created_at)}
      </span>
    </Link>
  )
}

// ── main ────────────────────────────────────────────────────────────────────

export function JobList({
  jobs,
  total,
  page,
  pageSize,
  isAdmin,
  canViewAllPipeline,
}: JobListProps) {
  const { params, set, list, toggle, pending } = useQueryState()

  const q = params.get('q') || ''
  const [draft, setDraft] = useState(q)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (draft === q) return
    const t = setTimeout(() => set({ q: draft || null }), 350)
    return () => clearTimeout(t)
  }, [draft, q, set])

  useEffect(() => setDraft(q), [q])

  const fns = list('fn')
  const locs = list('loc')
  const locq = params.get('locq') || ''
  const levels = list('lvl')
  const remotes = list('remote')
  const stages = list('stage')
  const pay = list('pay')
  const statuses = list('status')
  const posted = params.get('posted') || ''
  const withCands = params.get('cands') === '1'
  const paidOnly = params.get('paid') === '1'
  const view = params.get('view') === 'row' ? 'row' : 'card'
  const sort = params.get('sort') || 'newest'

  const locCount = locs.length + (locq ? 1 : 0)
  const payCount = pay.length + (paidOnly ? 1 : 0)
  const facetCount =
    fns.length +
    locCount +
    levels.length +
    remotes.length +
    stages.length +
    payCount +
    statuses.length +
    (posted ? 1 : 0) +
    (withCands ? 1 : 0)
  const hasAny = facetCount > 0 || q.length > 0

  const clearAll = () =>
    set({
      q: null,
      fn: null,
      loc: null,
      locq: null,
      lvl: null,
      remote: null,
      stage: null,
      pay: null,
      paid: null,
      status: null,
      posted: null,
      cands: null,
    })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  // ── facet bodies, shared by the inline dropdowns and the full panel ──────
  const locationBody = (
    <LocationPicker
      selected={locs}
      locq={locq}
      onToggle={k => toggle('loc', k)}
      onSearch={v => set({ locq: v })}
    />
  )
  const seniorityBody = (
    <OptionList options={SENIORITY_LEVELS} selected={levels} onToggle={k => toggle('lvl', k)} />
  )
  const functionBody = (
    <OptionList options={FUNCTIONS} selected={fns} onToggle={k => toggle('fn', k)} />
  )
  const payBody = (
    <div className="space-y-2">
      <OptionList options={SALARY_BANDS} selected={pay} onToggle={k => toggle('pay', k)} />
      {/* Bands match on salary_max, which 87% of roles leave null — so any
          band silently hides them. Saying so beats letting people guess. */}
      <div className="border-t border-[#E4E3DC] pt-2">
        <OptionRow
          label="Only roles with pay posted"
          hint="Most roles do not publish a range"
          on={paidOnly}
          onToggle={() => set({ paid: paidOnly ? null : '1' })}
        />
      </div>
    </div>
  )
  const postedBody = (
    <OptionList
      options={POSTED_BANDS}
      selected={posted ? [posted] : []}
      single
      onToggle={k => set({ posted: posted === k ? null : k })}
    />
  )
  const workSetupBody = (
    <OptionList
      options={Object.entries(REMOTE_LABELS).map(([key, label]) => ({ key, label }))}
      selected={remotes}
      onToggle={k => toggle('remote', k)}
    />
  )
  const stageBody = (
    <OptionList
      options={STAGE_ORDER.map(s => ({ key: s, label: stageLabel(s)! }))}
      selected={stages}
      onToggle={k => toggle('stage', k)}
    />
  )
  const relationshipBody = (
    <OptionList
      options={[
        {
          key: 'cands',
          label: canViewAllPipeline ? 'Has candidates' : 'Where I have candidates',
        },
      ]}
      selected={withCands ? ['cands'] : []}
      onToggle={() => set({ cands: withCands ? null : '1' })}
    />
  )

  return (
    <div className="space-y-4">
      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C9C95]" />
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Search role, company, location…"
            aria-label="Search jobs"
            className={`h-10 rounded-full border-[#D2D1C7] bg-white pl-10 pr-9 text-[14px] placeholder:text-[#9C9C95] ${FOCUS}`}
          />
          {draft && (
            <button
              type="button"
              onClick={() => setDraft('')}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#9C9C95] transition-colors hover:bg-[#EAE9E1] hover:text-[#161613] ${FOCUS}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* One button on small screens; the full panel below carries every
              facet, so nothing is desktop-only. */}
          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors sm:hidden ${FOCUS} ${
                  facetCount > 0
                    ? 'border-[#1F3A2F]/30 bg-[#E7EDE9] text-[#1F3A2F]'
                    : 'border-[#D2D1C7] bg-white text-[#161613]'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {facetCount > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1F3A2F] px-1 text-[11px] font-semibold text-white">
                    {facetCount}
                  </span>
                )}
              </button>
            </SheetTrigger>
            <AllFiltersSheet
              total={total}
              facetCount={facetCount}
              hasAny={hasAny}
              onClearAll={clearAll}
              isAdmin={isAdmin}
              statuses={statuses}
              onToggleStatus={k => toggle('status', k)}
              sections={{
                locationBody,
                seniorityBody,
                functionBody,
                payBody,
                postedBody,
                workSetupBody,
                stageBody,
                relationshipBody,
              }}
            />
          </Sheet>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Sort jobs"
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#D2D1C7] bg-white px-3.5 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden lg:inline">{JOB_SORTS.find(s => s.key === sort)?.label}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              collisionPadding={12}
              className="w-[200px] rounded-[14px] border-[#E4E3DC] p-1.5"
            >
              {/* Sorting by pipeline size would rank roles by other partners'
                  activity, so it is offered only to the super admin. */}
              {JOB_SORTS.filter(s => s.key !== 'pipeline' || canViewAllPipeline).map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set({ sort: s.key })}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-[#FAF9F5] ${FOCUS} ${
                    sort === s.key ? 'font-semibold text-[#1F3A2F]' : 'text-[#6E6E68]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="flex h-10 shrink-0 items-center rounded-full border border-[#D2D1C7] bg-white p-0.5">
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
                onClick={() => set({ view: v.key === 'card' ? null : 'row', page: String(page) })}
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

      {/* ── filter bar: the facets people actually reach for, one click deep.
             Hidden below sm, where the single Filters button covers it. ──── */}
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <FacetDropdown
          label="Location"
          count={locCount}
          onClear={() => set({ loc: null, locq: null })}
          width="w-[320px]"
        >
          {locationBody}
        </FacetDropdown>
        <FacetDropdown label="Level" count={levels.length} onClear={() => set({ lvl: null })}>
          {seniorityBody}
        </FacetDropdown>
        <FacetDropdown label="Function" count={fns.length} onClear={() => set({ fn: null })}>
          {functionBody}
        </FacetDropdown>
        <FacetDropdown
          label="Pay"
          count={payCount}
          onClear={() => set({ pay: null, paid: null })}
        >
          {payBody}
        </FacetDropdown>
        <FacetDropdown
          label="Posted"
          count={posted ? 1 : 0}
          onClear={() => set({ posted: null })}
          width="w-[240px]"
        >
          {postedBody}
        </FacetDropdown>

        <Sheet>
          <SheetTrigger asChild>
            <button
              type="button"
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors ${FOCUS} ${
                facetCount > 0
                  ? 'border-[#1F3A2F]/30 bg-[#E7EDE9] text-[#1F3A2F]'
                  : 'border-[#D2D1C7] bg-white text-[#3F3F3A] hover:border-[#9C9C95] hover:text-[#161613]'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              All filters
              {facetCount > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#1F3A2F] px-1 text-[10.5px] font-semibold text-white">
                  {facetCount}
                </span>
              )}
            </button>
          </SheetTrigger>
          <AllFiltersSheet
            total={total}
            facetCount={facetCount}
            hasAny={hasAny}
            onClearAll={clearAll}
            isAdmin={isAdmin}
            statuses={statuses}
            onToggleStatus={k => toggle('status', k)}
            sections={{
              locationBody,
              seniorityBody,
              functionBody,
              payBody,
              postedBody,
              workSetupBody,
              stageBody,
              relationshipBody,
            }}
          />
        </Sheet>
      </div>

      {/* ── count + active filters ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-[13px] text-[#6E6E68] ${pending ? 'opacity-40' : ''}`}>
          <span className="font-semibold tabular-nums text-[#161613]">{total.toLocaleString()}</span>{' '}
          {total === 1 ? 'role' : 'roles'}
          {total > pageSize && (
            <span className="text-[#9C9C95]">
              {' '}
              · showing {from.toLocaleString()}–{to.toLocaleString()}
            </span>
          )}
        </p>

        {locs.map(l => (
          <ActiveChip key={l} label={locationLabel(l)} onClear={() => toggle('loc', l)} />
        ))}
        {locq && (
          <ActiveChip label={`Location: “${locq}”`} onClear={() => set({ locq: null })} />
        )}
        {levels.map(l => (
          <ActiveChip key={l} label={seniorityLabel(l)} onClear={() => toggle('lvl', l)} />
        ))}
        {fns.map(f => (
          <ActiveChip
            key={f}
            label={FUNCTIONS.find(x => x.key === f)?.label ?? f}
            onClear={() => toggle('fn', f)}
          />
        ))}
        {remotes.map(r => (
          <ActiveChip key={r} label={REMOTE_LABELS[r] ?? r} onClear={() => toggle('remote', r)} />
        ))}
        {pay.map(p => (
          <ActiveChip
            key={p}
            label={SALARY_BANDS.find(b => b.key === p)?.label ?? p}
            onClear={() => toggle('pay', p)}
          />
        ))}
        {paidOnly && <ActiveChip label="Pay posted" onClear={() => set({ paid: null })} />}
        {stages.map(s => (
          <ActiveChip key={s} label={stageLabel(s)!} onClear={() => toggle('stage', s)} />
        ))}
        {statuses.map(s => (
          <ActiveChip key={s} label={STATUS_META[s]?.label ?? s} onClear={() => toggle('status', s)} />
        ))}
        {posted && (
          <ActiveChip
            label={POSTED_BANDS.find(b => b.key === posted)?.label ?? posted}
            onClear={() => set({ posted: null })}
          />
        )}
        {withCands && (
          <ActiveChip
            label={canViewAllPipeline ? 'Has candidates' : 'Where I have candidates'}
            onClear={() => set({ cands: null })}
          />
        )}

        {hasAny && (
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
      {total === 0 ? (
        <div className={`${CARD} flex flex-col items-center justify-center px-6 py-14 text-center`}>
          <p className="text-[15px] font-medium text-[#161613]">
            {hasAny ? 'No roles match these filters' : 'No roles yet'}
          </p>
          <p className="mt-1.5 max-w-xs text-[13.5px] text-[#6E6E68]">
            {hasAny
              ? 'Try removing a filter or widening your search.'
              : 'Add a role to start matching candidates against it.'}
          </p>
          {hasAny ? (
            <button
              type="button"
              onClick={clearAll}
              className={`mt-5 rounded-full border border-[#D2D1C7] px-4 py-2 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/jobs/new"
              className={`mt-5 rounded-full bg-[#1F3A2F] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] ${FOCUS}`}
            >
              Add a role
            </Link>
          )}
        </div>
      ) : (
        <div className={pending ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          {view === 'card' ? (
            <div className={GRID}>
              {jobs.map(j => (
                <JobCard key={j.id} job={j} isAdmin={isAdmin} />
              ))}
            </div>
          ) : (
            <div className={`${CARD} divide-y divide-[#E4E3DC] overflow-hidden`}>
              {jobs.map(j => (
                <JobRowItem key={j.id} j={j} isAdmin={isAdmin} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => set({ page: String(page - 1) })}
            className={`flex h-11 items-center gap-1.5 rounded-full border border-[#D2D1C7] bg-white px-4 text-[14px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </button>
          <span className="text-[13px] tabular-nums text-[#6E6E68]">
            Page {page.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => set({ page: String(page + 1) })}
            className={`flex h-11 items-center gap-1.5 rounded-full border border-[#D2D1C7] bg-white px-4 text-[14px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  )
}

/**
 * Every facet in one panel.
 *
 * A bottom sheet at both breakpoints rather than a popover: the panel is now
 * taller than any popover could safely be, and a sheet is the one container
 * whose header and footer stay pinned while the middle scrolls. That is the
 * fix for options that used to render past the bottom of the viewport with no
 * way to reach them. Width is capped on desktop so the rows do not stretch.
 */
function AllFiltersSheet({
  total,
  facetCount,
  hasAny,
  onClearAll,
  isAdmin,
  statuses,
  onToggleStatus,
  sections,
}: {
  total: number
  facetCount: number
  hasAny: boolean
  onClearAll: () => void
  isAdmin: boolean
  statuses: string[]
  onToggleStatus: (k: string) => void
  sections: {
    locationBody: React.ReactNode
    seniorityBody: React.ReactNode
    functionBody: React.ReactNode
    payBody: React.ReactNode
    postedBody: React.ReactNode
    workSetupBody: React.ReactNode
    stageBody: React.ReactNode
    relationshipBody: React.ReactNode
  }
}) {
  return (
    <SheetContent
      side="bottom"
      className="mx-auto h-[86vh] max-w-[620px] gap-0 rounded-t-[20px] p-0"
    >
      <SheetHeader className="shrink-0 border-b border-[#E4E3DC] px-4 py-3.5 text-left">
        <SheetTitle className="text-[20px] font-semibold tracking-[-0.01em] text-[#161613]">
          Filters
          {facetCount > 0 && (
            <span className="ml-2 text-[13px] font-sans text-[#6E6E68]">{facetCount} active</span>
          )}
        </SheetTitle>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-2 py-4">
        <FacetSection title="Location">{sections.locationBody}</FacetSection>
        <FacetSection title="Level">{sections.seniorityBody}</FacetSection>
        <FacetSection title="Function">{sections.functionBody}</FacetSection>
        <FacetSection title="Work setup">{sections.workSetupBody}</FacetSection>
        <FacetSection title="Pay">{sections.payBody}</FacetSection>
        <FacetSection title="Company stage">{sections.stageBody}</FacetSection>
        <FacetSection title="Posted">{sections.postedBody}</FacetSection>
        <FacetSection title="Our relationship">{sections.relationshipBody}</FacetSection>
        {isAdmin && (
          <FacetSection title="Status">
            <OptionList
              options={JOB_STATUSES.map(s => ({ key: s, label: STATUS_META[s].label }))}
              selected={statuses}
              onToggle={onToggleStatus}
            />
          </FacetSection>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2.5 border-t border-[#E4E3DC] bg-white px-4 py-3">
        {hasAny && (
          <button
            type="button"
            onClick={onClearAll}
            className={`h-11 shrink-0 rounded-full border border-[#D2D1C7] px-4 text-[14px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
          >
            Clear all
          </button>
        )}
        <SheetClose asChild>
          <button
            type="button"
            className={`h-11 flex-1 rounded-full bg-[#1F3A2F] text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] ${FOCUS}`}
          >
            Show {total.toLocaleString()} {total === 1 ? 'role' : 'roles'}
          </button>
        </SheetClose>
      </div>
    </SheetContent>
  )
}
