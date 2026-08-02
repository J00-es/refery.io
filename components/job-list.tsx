'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { JobCard, type JobRow } from '@/components/jobs/job-card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  ArrowUpDown,
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
  POSTED_BANDS,
  REMOTE_LABELS,
  SALARY_BANDS,
  STATUS_META,
  formatSalary,
  shortAge,
} from '@/lib/job-ui'

export interface JobStats {
  open: number
  newThisWeek: number
  withCandidates: number
  remote: number
}

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
  stats?: JobStats | null
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

function FacetGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: { key: string; label: string }[]
  selected: string[]
  onToggle: (k: string) => void
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
      <span className="max-w-[160px] truncate">{label}</span>
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
      className={`flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[#FAFAF6] sm:px-4 ${FOCUS}`}
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] text-[12px] font-semibold ${
          showLogo ? 'border border-[#ECECE6] bg-white p-0.5' : avatarTint(company)
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
        <span className="block truncate text-[14px] font-semibold text-[#161613]">{j.title}</span>
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
          <span className="font-medium text-[#1F4D3A]">{j.pipeline_count}</span>
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
  stats,
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
  const remotes = list('remote')
  const stages = list('stage')
  const pay = list('pay')
  const statuses = list('status')
  const posted = params.get('posted') || ''
  const withCands = params.get('cands') === '1'
  const view = params.get('view') === 'row' ? 'row' : 'card'
  const sort = params.get('sort') || 'newest'

  const facetCount =
    fns.length +
    remotes.length +
    stages.length +
    pay.length +
    statuses.length +
    (posted ? 1 : 0) +
    (withCands ? 1 : 0)
  const hasAny = facetCount > 0 || q.length > 0

  const clearAll = () =>
    set({
      q: null,
      fn: null,
      remote: null,
      stage: null,
      pay: null,
      status: null,
      posted: null,
      cands: null,
    })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const facets = (
    <div className="space-y-5">
      <FacetGroup
        title="Function"
        options={FUNCTIONS.map(f => ({ key: f.key, label: f.label }))}
        selected={fns}
        onToggle={k => toggle('fn', k)}
      />
      <FacetGroup
        title="Work setup"
        options={Object.entries(REMOTE_LABELS).map(([key, label]) => ({ key, label }))}
        selected={remotes}
        onToggle={k => toggle('remote', k)}
      />
      <FacetGroup
        title="Salary"
        options={SALARY_BANDS.map(b => ({ key: b.key, label: b.label }))}
        selected={pay}
        onToggle={k => toggle('pay', k)}
      />
      <FacetGroup
        title="Company stage"
        options={STAGE_ORDER.map(s => ({ key: s, label: stageLabel(s)! }))}
        selected={stages}
        onToggle={k => toggle('stage', k)}
      />
      <div>
        <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
          Posted
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {POSTED_BANDS.map(b => {
            const on = posted === b.key
            return (
              <button
                key={b.key}
                type="button"
                aria-pressed={on}
                onClick={() => set({ posted: on ? null : b.key })}
                className={`rounded-full border px-3 py-2 text-[13px] font-medium transition-colors ${FOCUS} ${
                  on
                    ? 'border-[#1F4D3A]/30 bg-[#E9F0EC] text-[#1F4D3A]'
                    : 'border-[#ECECE6] bg-white text-[#6E6E68] hover:border-[#D8D8D0] hover:text-[#161613]'
                }`}
              >
                {b.label}
              </button>
            )
          })}
        </div>
      </div>
      {isAdmin && (
        <FacetGroup
          title="Status"
          options={JOB_STATUSES.map(s => ({ key: s, label: STATUS_META[s].label }))}
          selected={statuses}
          onToggle={k => toggle('status', k)}
        />
      )}
      <FacetGroup
        title="Pipeline"
        options={[
          { key: 'cands', label: canViewAllPipeline ? 'Has candidates' : 'Where I have candidates' },
        ]}
        selected={withCands ? ['cands'] : []}
        onToggle={() => set({ cands: withCands ? null : '1' })}
      />
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── insight strip: each number is also a filter ─────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(
            [
              {
                label: 'Open roles',
                value: stats.open,
                patch: isAdmin ? { status: 'open' } : {},
              },
              { label: 'New this week', value: stats.newThisWeek, patch: { posted: '7d' } },
              {
                // Board-wide for the super admin, this viewer's own otherwise.
                label: canViewAllPipeline ? 'With candidates' : 'Your candidates',
                value: stats.withCandidates,
                patch: { cands: '1' },
              },
              { label: 'Remote', value: stats.remote, patch: { remote: 'remote' } },
            ] as { label: string; value: number; patch: Record<string, string | null> }[]
          ).map(s => (
            <button
              key={s.label}
              type="button"
              onClick={() => set(s.patch)}
              className={`${CARD} cursor-pointer px-3.5 py-3 text-left transition-colors hover:border-[#D8D8D0] ${FOCUS}`}
            >
              <div className="truncate text-[11.5px] text-[#6E6E68]">{s.label}</div>
              <div className="mt-1 font-serif text-[22px] leading-none tracking-[-0.01em] text-[#161613]">
                {s.value.toLocaleString()}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9C9C95]" />
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Search role, company, location…"
            aria-label="Search jobs"
            className={`h-10 rounded-full border-[#D8D8D0] bg-white pl-10 pr-9 text-[14px] placeholder:text-[#9C9C95] ${FOCUS}`}
          />
          {draft && (
            <button
              type="button"
              onClick={() => setDraft('')}
              aria-label="Clear search"
              className={`absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-[#9C9C95] transition-colors hover:bg-[#F0F0EA] hover:text-[#161613] ${FOCUS}`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
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
              <PopoverContent
                align="end"
                className="max-h-[70vh] w-[360px] overflow-y-auto rounded-[14px] border-[#ECECE6] p-4"
              >
                {facets}
              </PopoverContent>
            </Popover>
          </div>

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors sm:hidden ${FOCUS} ${
                  facetCount > 0
                    ? 'border-[#1F4D3A]/30 bg-[#E9F0EC] text-[#1F4D3A]'
                    : 'border-[#D8D8D0] bg-white text-[#161613]'
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
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto rounded-t-[20px]">
              <SheetHeader className="px-4 text-left">
                <SheetTitle className="font-serif text-[20px] tracking-[-0.01em]">Filters</SheetTitle>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8 pt-2">
                {facets}
                {hasAny && (
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
                aria-label="Sort jobs"
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#D8D8D0] bg-white px-3.5 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden lg:inline">{JOB_SORTS.find(s => s.key === sort)?.label}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[200px] rounded-[14px] border-[#ECECE6] p-1.5">
              {/* Sorting by pipeline size would rank roles by other partners'
                  activity, so it is offered only to the super admin. */}
              {JOB_SORTS.filter(s => s.key !== 'pipeline' || canViewAllPipeline).map(s => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => set({ sort: s.key })}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-[13.5px] transition-colors hover:bg-[#FAFAF6] ${FOCUS} ${
                    sort === s.key ? 'font-semibold text-[#1F4D3A]' : 'text-[#6E6E68]'
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
              className={`mt-5 rounded-full border border-[#D8D8D0] px-4 py-2 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
            >
              Clear all filters
            </button>
          ) : (
            <Link
              href="/jobs/new"
              className={`mt-5 rounded-full bg-[#1F4D3A] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] ${FOCUS}`}
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
            <div className={`${CARD} divide-y divide-[#ECECE6] overflow-hidden`}>
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
            className={`flex h-11 items-center gap-1.5 rounded-full border border-[#D8D8D0] bg-white px-4 text-[14px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
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
            className={`flex h-11 items-center gap-1.5 rounded-full border border-[#D8D8D0] bg-white px-4 text-[14px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>
      )}
    </div>
  )
}
