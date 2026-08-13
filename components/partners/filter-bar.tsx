'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CHIP, FOCUS, META, MUTED, RULE } from '@/lib/desk-ui'
import {
  FACETS,
  SORTS,
  TOGGLES,
  activeChips,
  activeFilterCount,
  deskQueryToParams,
  emptyDeskQuery,
  type DeskQuery,
  type DeskResult,
} from '@/lib/desk-filters'

/**
 * One row of controls for the searches list.
 *
 * Popover chips rather than a sidebar or a modal: a rail scrolls on a phone
 * without a second layout to maintain, and a popover keeps the results visible
 * while you pick — so you see the count change. Every value carries its own
 * count, computed against the rest of the query, so an option showing 0 tells you
 * it is a dead end *before* you spend a click on it.
 *
 * State lives entirely in the URL. Back, forward, refresh and pasting a filtered
 * view to someone else all work, and there is no client state to fall out of step
 * with what is on screen.
 */
export function FilterBar({
  query,
  result,
  /** Free-text is debounced in the parent; this only reports changes. */
  onQueryText,
}: {
  query: DeskQuery
  result: DeskResult
  onQueryText?: (value: string) => void
}) {
  const router = useRouter()
  const pathname = usePathname()

  function go(next: DeskQuery) {
    const params = deskQueryToParams(next)
    params.set('view', 'searches')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function toggleFacetValue(facetKey: keyof DeskQuery['facets'], value: string) {
    const current = query.facets[facetKey]
    go({
      ...query,
      facets: {
        ...query.facets,
        [facetKey]: current.includes(value) ? current.filter(v => v !== value) : [...current, value],
      },
    })
  }

  const active = activeFilterCount(query)
  const chips = activeChips(query)
  const sort = SORTS.find(s => s.key === query.sort) ?? SORTS[0]

  return (
    <div className="space-y-3">
      {/* Search first: it is the fastest path when you already know the name. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[320px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B4B4AA]"
            aria-hidden
          />
          <input
            defaultValue={query.q}
            onChange={e => onQueryText?.(e.target.value)}
            placeholder="Search roles and clients"
            aria-label="Search roles and clients"
            className={`h-[38px] w-full rounded-full border border-[#E0E0D7] bg-white pl-9 pr-3 text-[14px] text-[#161613] placeholder:text-[#B4B4AA] ${FOCUS}`}
          />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={triggerClass(query.sort !== 'payout')}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {sort.label}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[260px] p-1.5">
            {SORTS.map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => go({ ...query, sort: option.key })}
                className={`flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[#F2F2EC] ${FOCUS}`}
              >
                <Check
                  className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                    query.sort === option.key ? 'text-[#1F4D3A]' : 'text-transparent'
                  }`}
                />
                <span>
                  <span className="block text-[13.5px] font-medium text-[#161613]">{option.label}</span>
                  <span className={`block ${META}`}>{option.hint}</span>
                </span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* The facet rail. Scrolls horizontally rather than wrapping into a wall. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FACETS.map(facet => {
          const selected = query.facets[facet.key]
          const counts = result.counts[facet.key]
          return (
            <Popover key={facet.key}>
              <PopoverTrigger asChild>
                <button type="button" className={triggerClass(selected.length > 0)}>
                  {facet.label}
                  {selected.length > 0 && (
                    <span className="rounded-full bg-white/25 px-1.5 text-[11px] font-bold">
                      {selected.length}
                    </span>
                  )}
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-[320px] w-[262px] overflow-y-auto p-1.5">
                {facet.options.map(option => {
                  const count = counts[option.value] ?? 0
                  const isOn = selected.includes(option.value)
                  // A zero-count option stays clickable only if already on, so
                  // you can always undo — but it never invites a dead end.
                  const dead = count === 0 && !isOn
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={dead}
                      onClick={() => toggleFacetValue(facet.key, option.value)}
                      className={`flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13.5px] transition-colors ${FOCUS} ${
                        dead
                          ? 'cursor-not-allowed text-[#C4C4BA]'
                          : 'text-[#161613] hover:bg-[#F2F2EC]'
                      }`}
                    >
                      <Check
                        className={`h-3.5 w-3.5 shrink-0 ${isOn ? 'text-[#1F4D3A]' : 'text-transparent'}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className={`shrink-0 tabular-nums ${dead ? 'text-[#D2D2C8]' : MUTED}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </PopoverContent>
            </Popover>
          )
        })}

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={triggerClass(TOGGLES.some(t => query.toggles[t.key]))}
            >
              Only show
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[300px] p-1.5">
            {TOGGLES.map(toggle => {
              const isOn = query.toggles[toggle.key]
              const count = result.toggleCounts[toggle.key] ?? 0
              const dead = count === 0 && !isOn
              return (
                <button
                  key={toggle.key}
                  type="button"
                  disabled={dead}
                  onClick={() =>
                    go({ ...query, toggles: { ...query.toggles, [toggle.key]: !isOn } })
                  }
                  className={`flex w-full items-start gap-2 rounded-[10px] px-2.5 py-2 text-left transition-colors ${FOCUS} ${
                    dead ? 'cursor-not-allowed opacity-50' : 'hover:bg-[#F2F2EC]'
                  }`}
                >
                  <Check
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isOn ? 'text-[#1F4D3A]' : 'text-transparent'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2 text-[13.5px] font-medium text-[#161613]">
                      <span className="min-w-0 flex-1">{toggle.label}</span>
                      <span className={`shrink-0 tabular-nums ${MUTED}`}>{count}</span>
                    </span>
                    <span className={`block ${META}`}>{toggle.hint}</span>
                  </span>
                </button>
              )
            })}
          </PopoverContent>
        </Popover>
      </div>

      {/* What is on, each removable alone. Nobody should have to guess why a list
          is short, or reset everything to widen it by one. */}
      {active > 0 && (
        <div className={`flex flex-wrap items-center gap-1.5 border-t pt-3 ${RULE}`}>
          <span className={META}>
            {result.searches.length} of {result.total} searches
          </span>
          {chips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => go(chip.remove)}
              className={`${CHIP} transition-colors hover:bg-[#E5E5DC] ${FOCUS}`}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => go(emptyDeskQuery())}
            className={`ml-1 text-[13px] font-semibold text-[#1F4D3A] hover:text-[#173D2E] ${FOCUS}`}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}

function triggerClass(on: boolean): string {
  return `inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors ${FOCUS} ${
    on
      ? 'border-[#1F4D3A] bg-[#1F4D3A] text-white'
      : 'border-[#E0E0D7] bg-white text-[#5F5F58] hover:border-[#D2D2C8] hover:text-[#161613]'
  }`
}
