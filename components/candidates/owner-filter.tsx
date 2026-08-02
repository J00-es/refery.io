'use client'

import { useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Check, ChevronDown, Search, Users } from 'lucide-react'
import { FOCUS, avatarTint, initialsOf } from '@/lib/candidate-ui'

export interface OwnerOption {
  /** auth user id, or the sentinel below for candidates with no owner. */
  id: string
  name: string
  email: string | null
  count: number
}

/** Sentinel id for the "Unassigned" bucket — no real user has this id. */
export const UNASSIGNED = '__unassigned__'

interface OwnerFilterProps {
  owners: OwnerOption[]
  selected: string[]
  onChange: (ids: string[]) => void
  /** Renders the list inline (mobile sheet) instead of inside a popover. */
  inline?: boolean
}

function OwnerRows({
  owners,
  selected,
  onChange,
}: Pick<OwnerFilterProps, 'owners' | 'selected' | 'onChange'>) {
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return owners
    return owners.filter(
      o => o.name.toLowerCase().includes(q) || (o.email ?? '').toLowerCase().includes(q),
    )
  }, [owners, query])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id])

  const allSelected = selected.length === 0

  return (
    <div className="flex max-h-[min(60vh,420px)] flex-col">
      <div className="border-b border-[#ECECE6] p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9C9C95]" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search owners"
            aria-label="Search owners"
            className={`h-9 border-[#ECECE6] pl-8 text-[13.5px] placeholder:text-[#9C9C95] ${FOCUS}`}
          />
        </div>
      </div>

      <div className="overflow-y-auto overscroll-contain p-1.5">
        {/* "Everyone" is the zero-selection state, shown as a real row so the
            way back to unfiltered is always visible. */}
        <button
          type="button"
          onClick={() => onChange([])}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13.5px] transition-colors hover:bg-[#FAFAF6] ${FOCUS}`}
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center">
            {allSelected && <Check className="h-4 w-4 text-[#1F4D3A]" />}
          </span>
          <Users className="h-4 w-4 shrink-0 text-[#9C9C95]" />
          <span className={`flex-1 ${allSelected ? 'font-semibold text-[#161613]' : 'text-[#6E6E68]'}`}>
            Everyone
          </span>
        </button>

        <div className="my-1.5 h-px bg-[#ECECE6]" />

        {visible.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-[#9C9C95]">No owners match</p>
        )}

        {visible.map(o => {
          const checked = selected.includes(o.id)
          return (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[#FAFAF6] ${
                checked ? 'bg-[#FAFAF6]' : ''
              }`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggle(o.id)}
                aria-label={`Filter by ${o.name}`}
                className="h-5 w-5 shrink-0 rounded-[6px] border-[#D8D8D0] data-[state=checked]:border-[#1F4D3A] data-[state=checked]:bg-[#1F4D3A]"
              />
              <span
                aria-hidden
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${
                  o.id === UNASSIGNED ? 'bg-[#F0F0EA] text-[#9C9C95]' : avatarTint(o.name)
                }`}
              >
                {o.id === UNASSIGNED ? '—' : initialsOf(o.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] leading-tight text-[#161613]">
                  {o.name}
                </span>
                {o.email && (
                  <span className="block truncate text-[11.5px] leading-tight text-[#9C9C95]">
                    {o.email}
                  </span>
                )}
              </span>
              {/* Counts let you judge a facet before applying it. */}
              <span className="shrink-0 rounded-full bg-[#F0F0EA] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[#6E6E68]">
                {o.count}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

export function OwnerFilter({ owners, selected, onChange, inline = false }: OwnerFilterProps) {
  const [open, setOpen] = useState(false)

  const label =
    selected.length === 0
      ? 'All owners'
      : selected.length === 1
        ? (owners.find(o => o.id === selected[0])?.name ?? '1 owner')
        : `${selected.length} owners`

  if (inline) {
    return (
      <div className="rounded-[14px] border border-[#ECECE6]">
        <OwnerRows owners={owners} selected={selected} onChange={onChange} />
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Filter by owner. Currently: ${label}`}
          className={`flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition-colors ${FOCUS} ${
            selected.length > 0
              ? 'border-[#1F4D3A]/30 bg-[#E9F0EC] text-[#1F4D3A]'
              : 'border-[#D8D8D0] bg-white text-[#161613] hover:border-[#9C9C95]'
          }`}
        >
          <Users className="h-4 w-4 shrink-0" />
          <span className="max-w-[140px] truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[300px] rounded-[14px] border-[#ECECE6] p-0">
        <OwnerRows owners={owners} selected={selected} onChange={onChange} />
      </PopoverContent>
    </Popover>
  )
}
