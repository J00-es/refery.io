'use client'

/**
 * Where your people are: the one screen that tells the matcher what to
 * suggest. Chips, not dropdowns, because it is filled in on a phone with a
 * thumb, and each chip is a 44px target.
 *
 * Used twice: as a step in sign-up and on the Start page to correct later.
 * The keys under `functions` are the FUNCTIONS keys in lib/job-ui, so the
 * matcher and the searches filter speak the same vocabulary.
 */

export interface PreferencesValue {
  own_location: string
  network_cities: string[]
  functions: string[]
  stages: string[]
  relationship_types: string[]
  would_relocate: boolean
}

export const EMPTY_PREFERENCES: PreferencesValue = {
  own_location: '',
  network_cities: [],
  functions: [],
  stages: [],
  relationship_types: [],
  would_relocate: false,
}

export const CITY_OPTIONS = ['San Francisco', 'New York', 'Los Angeles', 'Seattle', 'Boston', 'Austin', 'Chicago', 'Denver / Boulder', 'Miami', 'Remote US', 'London', 'Toronto']
export const FUNCTION_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'engineering', label: 'Engineering' },
  { key: 'data', label: 'Data / AI' },
  { key: 'sales', label: 'Sales / GTM' },
  { key: 'product', label: 'Product' },
  { key: 'design', label: 'Design' },
  { key: 'operations', label: 'Ops / Finance' },
  { key: 'people', label: 'Talent / People' },
]
export const STAGE_OPTIONS = ['Seed', 'Series A', 'Series B', 'Later', 'Big company']
export const RELATIONSHIP_OPTIONS = [
  "I've hired or managed them",
  "We've worked together",
  'Friends, school, or a community I am in',
  'I recruit professionally',
]

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-[36px] rounded-full border px-3 text-[13px] transition-colors ${
        on ? 'border-[#1F3A2F] bg-[#E7EDE9] font-semibold text-[#1F3A2F]' : 'border-[#D2D1C7] text-[#161613] hover:bg-[#FAF9F5]'
      }`}
    >
      {label}
    </button>
  )
}

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter(x => x !== v) : [...list, v]
}

export function PreferencesFields({ value, onChange }: { value: PreferencesValue; onChange: (v: PreferencesValue) => void }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label htmlFor="ownLocation" className="text-sm font-medium">Where you are based</label>
        <input
          id="ownLocation"
          value={value.own_location}
          onChange={e => onChange({ ...value, own_location: e.target.value })}
          placeholder="City, country"
          className="h-11 rounded-md border border-[#D2D1C7] bg-white px-3 text-base sm:h-10 sm:text-sm"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Where the people you know are</span>
          <span className="text-xs text-[#9C9C95]">most searches are SF or New York, on-site</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CITY_OPTIONS.map(c => (
            <Chip key={c} on={value.network_cities.includes(c)} label={c} onClick={() => onChange({ ...value, network_cities: toggle(value.network_cities, c) })} />
          ))}
        </div>
        <label className="mt-1 flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-[#E4E3DC] px-3 text-sm">
          <span>Some of them would relocate to SF or New York</span>
          <input type="checkbox" checked={value.would_relocate} onChange={e => onChange({ ...value, would_relocate: e.target.checked })} className="h-4 w-4" />
        </label>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">What they do</span>
        <div className="flex flex-wrap gap-2">
          {FUNCTION_OPTIONS.map(f => (
            <Chip key={f.key} on={value.functions.includes(f.key)} label={f.label} onClick={() => onChange({ ...value, functions: toggle(value.functions, f.key) })} />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">Company stages they have worked at</span>
        <div className="flex flex-wrap gap-2">
          {STAGE_OPTIONS.map(s => (
            <Chip key={s} on={value.stages.includes(s)} label={s} onClick={() => onChange({ ...value, stages: toggle(value.stages, s) })} />
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">How you know them</span>
          <span className="text-xs text-[#9C9C95]">pick all that apply</span>
        </div>
        <div className="grid gap-2">
          {RELATIONSHIP_OPTIONS.map(r => {
            const on = value.relationship_types.includes(r)
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...value, relationship_types: toggle(value.relationship_types, r) })}
                className={`flex min-h-[44px] items-center justify-between rounded-lg border px-3 text-left text-sm transition-colors ${
                  on ? 'border-[#1F3A2F] bg-[#E7EDE9] font-semibold text-[#1F3A2F]' : 'border-[#E4E3DC] hover:bg-[#FAF9F5]'
                }`}
              >
                <span>{r}</span>
                <span className={`h-4 w-4 shrink-0 rounded border-2 ${on ? 'border-[#1F3A2F] bg-[#1F3A2F]' : 'border-[#D2D1C7]'}`} aria-hidden />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function preferencesComplete(v: PreferencesValue): boolean {
  return v.network_cities.length > 0 && v.functions.length > 0
}
