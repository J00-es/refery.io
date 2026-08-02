'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CompanyCard, type CompanyRow } from '@/components/companies/company-card'
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
  TriangleAlert,
  X,
} from 'lucide-react'
import { CARD, FOCUS, avatarTint, initialsOf } from '@/lib/candidate-ui'
import {
  COMPANY_SORTS,
  RAISE_BANDS,
  RECENCY_BANDS,
  ROUND_TYPES,
  STAGE_ORDER,
  formatFundingDate,
  formatMoney,
  shortRound,
  stageLabel,
  stageTint,
  usableLogo,
} from '@/lib/company-ui'

export interface CompanyStats {
  total: number
  withOpenRoles: number
  fundedLast6Mo: number
  missingFunding: number
}

interface CompanyListProps {
  companies: CompanyRow[]
  total: number
  page: number
  pageSize: number
  isAdmin: boolean
  /** Portfolio-level numbers; admin only. */
  stats?: CompanyStats | null
}

// 20rem min track: at the 1072px container this yields three columns
// (3×320 + 2×16 = 992). 22rem needed 1088 and silently dropped to two.
const GRID =
  'grid gap-4 auto-rows-fr [grid-template-columns:repeat(auto-fill,minmax(min(100%,20rem),1fr))]'

// ── URL state ───────────────────────────────────────────────────────────────
// Filtering happens on the server: 19k+ companies cannot be shipped to the
// browser to be filtered there. The URL is the single source of truth, which
// also makes any filtered view shareable and back-button friendly.
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
      // Any filter change invalidates the current page offset.
      if (!('page' in patch)) next.delete('page')
      startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }))
    },
    [params, pathname, router],
  )

  /** Multi-value params are stored comma-separated. */
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

/** Compact row — the density mode for scanning many companies at once. */
function CompanyRowItem({ c, isAdmin }: { c: CompanyRow; isAdmin: boolean }) {
  const amount = formatMoney(c.last_funding_amount_usd)
  const round = shortRound(c.last_funding_type)
  const stage = stageLabel(c.stage)
  const href = c.id ? `/companies/${c.id}` : `/companies/view/${encodeURIComponent(c.name)}`

  const logoUrl = usableLogo(c.logo_url)
  const [logoFailed, setLogoFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  // Rows are server-rendered too, so a dead logo URL can fail before onError
  // is attached. Re-check the decoded size on mount. See Logo in company-card.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setLogoFailed(true)
  }, [logoUrl])
  const showLogo = Boolean(logoUrl) && !logoFailed

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-3 transition-colors hover:bg-[#FAFAF6] sm:px-4 ${FOCUS}`}
    >
      <span
        aria-hidden
        className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px] text-[12px] font-semibold ${
          showLogo ? 'border border-[#ECECE6] bg-white p-0.5' : avatarTint(c.name)
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
          initialsOf(c.name)
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-[#161613]">{c.name}</span>
          {isAdmin && c.do_not_contact && (
            <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-[#9C4038]" />
          )}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-[#6E6E68]">
          {[c.industry, c.location].filter(Boolean).join(' · ') || '—'}
        </span>
        {/* Below md the funding facts collapse under the name. */}
        <span className="mt-0.5 block truncate text-[12px] text-[#9C9C95] md:hidden">
          {[stage, amount && round ? `${amount} ${round}` : amount || round]
            .filter(Boolean)
            .join(' · ') || 'No funding on record'}
        </span>
      </span>

      {stage && (
        <span
          className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none md:block ${stageTint(c.stage)}`}
        >
          {stage}
        </span>
      )}
      <span className="hidden w-24 shrink-0 text-right text-[13px] font-medium tabular-nums text-[#161613] md:block">
        {amount || '—'}
      </span>
      <span className="hidden w-28 shrink-0 truncate text-[12.5px] text-[#6E6E68] lg:block">
        {round || '—'}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-[12px] text-[#9C9C95] lg:block">
        {formatFundingDate(c.last_funding_date) || '—'}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-[12px] sm:block">
        {c.jobCount ? (
          <span className="font-medium text-[#1F4D3A]">{c.jobCount} roles</span>
        ) : (
          <span className="text-[#9C9C95]">—</span>
        )}
      </span>
    </Link>
  )
}

// ── main ────────────────────────────────────────────────────────────────────

export function CompanyList({ companies, total, page, pageSize, isAdmin, stats }: CompanyListProps) {
  const { params, set, list, toggle, pending } = useQueryState()

  const q = params.get('q') || ''
  const [draft, setDraft] = useState(q)
  const firstRender = useRef(true)

  // Debounce typing into the URL — every keystroke is a server round-trip at
  // this table size, so wait for 350ms of quiet before committing.
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

  const stages = list('stage')
  const rounds = list('round')
  const raise = list('raise')
  const recency = params.get('funded') || ''
  const openOnly = params.get('open') === '1'
  const dncOnly = params.get('dnc') === '1'
  const view = params.get('view') === 'row' ? 'row' : 'card'
  const sort = params.get('sort') || 'recent_funding'

  const facetCount =
    stages.length +
    rounds.length +
    raise.length +
    (recency ? 1 : 0) +
    (openOnly ? 1 : 0) +
    (dncOnly ? 1 : 0)
  const hasAny = facetCount > 0 || q.length > 0

  const clearAll = () =>
    set({ q: null, stage: null, round: null, raise: null, funded: null, open: null, dnc: null })

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const facets = (
    <div className="space-y-5">
      <FacetGroup
        title="Stage"
        options={STAGE_ORDER.map(s => ({ key: s, label: stageLabel(s)! }))}
        selected={stages}
        onToggle={k => toggle('stage', k)}
      />
      <FacetGroup
        title="Last round size"
        options={RAISE_BANDS.map(b => ({ key: b.key, label: b.label }))}
        selected={raise}
        onToggle={k => toggle('raise', k)}
      />
      <FacetGroup
        title="Round type"
        options={ROUND_TYPES.map(r => ({ key: r, label: r }))}
        selected={rounds}
        onToggle={k => toggle('round', k)}
      />
      <div>
        <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">
          Funded within
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {RECENCY_BANDS.map(b => {
            const on = recency === b.key
            return (
              <button
                key={b.key}
                type="button"
                aria-pressed={on}
                onClick={() => set({ funded: on ? null : b.key })}
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
      <FacetGroup
        title="Hiring"
        options={[{ key: 'open', label: 'Has open roles' }]}
        selected={openOnly ? ['open'] : []}
        onToggle={() => set({ open: openOnly ? null : '1' })}
      />
      {isAdmin && (
        <FacetGroup
          title="Admin"
          options={[{ key: 'dnc', label: 'Do not contact' }]}
          selected={dncOnly ? ['dnc'] : []}
          onToggle={() => set({ dnc: dncOnly ? null : '1' })}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* ── admin insight strip: portfolio numbers, each one a filter ───── */}
      {isAdmin && stats && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(
            [
              { label: 'Companies', value: stats.total, patch: null },
              { label: 'With open roles', value: stats.withOpenRoles, patch: { open: '1' } },
              { label: 'Funded last 6mo', value: stats.fundedLast6Mo, patch: { funded: '6mo' } },
              { label: 'No funding data', value: stats.missingFunding, patch: null },
            ] as { label: string; value: number; patch: Record<string, string | null> | null }[]
          ).map(s => (
            <button
              key={s.label}
              type="button"
              disabled={!s.patch}
              onClick={() => s.patch && set(s.patch)}
              className={`${CARD} px-3.5 py-3 text-left transition-colors ${
                s.patch ? `cursor-pointer hover:border-[#D8D8D0] ${FOCUS}` : 'cursor-default'
              }`}
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
            placeholder="Search company, industry, location…"
            aria-label="Search companies"
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
                aria-label="Sort companies"
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#D8D8D0] bg-white px-3.5 text-[13.5px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden lg:inline">
                  {COMPANY_SORTS.find(s => s.key === sort)?.label}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[200px] rounded-[14px] border-[#ECECE6] p-1.5">
              {COMPANY_SORTS.map(s => (
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
          {total === 1 ? 'company' : 'companies'}
          {total > pageSize && (
            <span className="text-[#9C9C95]">
              {' '}
              · showing {from.toLocaleString()}–{to.toLocaleString()}
            </span>
          )}
        </p>

        {stages.map(s => (
          <ActiveChip key={s} label={stageLabel(s)!} onClear={() => toggle('stage', s)} />
        ))}
        {raise.map(r => (
          <ActiveChip
            key={r}
            label={RAISE_BANDS.find(b => b.key === r)?.label ?? r}
            onClear={() => toggle('raise', r)}
          />
        ))}
        {rounds.map(r => (
          <ActiveChip key={r} label={r} onClear={() => toggle('round', r)} />
        ))}
        {recency && (
          <ActiveChip
            label={RECENCY_BANDS.find(b => b.key === recency)?.label ?? recency}
            onClear={() => set({ funded: null })}
          />
        )}
        {openOnly && <ActiveChip label="Has open roles" onClear={() => set({ open: null })} />}
        {dncOnly && <ActiveChip label="Do not contact" onClear={() => set({ dnc: null })} />}

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
            {hasAny ? 'No companies match these filters' : 'No companies yet'}
          </p>
          <p className="mt-1.5 max-w-xs text-[13.5px] text-[#6E6E68]">
            {hasAny
              ? 'Try removing a filter or widening your search.'
              : 'Add your first company to start tracking roles and funding.'}
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
              href="/companies/new"
              className={`mt-5 rounded-full bg-[#1F4D3A] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] ${FOCUS}`}
            >
              Add a company
            </Link>
          )}
        </div>
      ) : (
        <div className={pending ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          {view === 'card' ? (
            <div className={GRID}>
              {companies.map((c, i) => (
                <CompanyCard key={c.id ?? `${c.name}-${i}`} company={c} isAdmin={isAdmin} />
              ))}
            </div>
          ) : (
            <div className={`${CARD} divide-y divide-[#ECECE6] overflow-hidden`}>
              {companies.map((c, i) => (
                <CompanyRowItem key={c.id ?? `${c.name}-${i}`} c={c} isAdmin={isAdmin} />
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
