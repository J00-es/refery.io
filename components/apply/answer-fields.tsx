'use client'

/**
 * The questions a person answers about what they want, shared by the door
 * (/apply) and the private page (/me). Chips first, typed fields only where a
 * chip cannot carry the answer, and a note the moment an answer means a
 * longer wait, so expectations are set before anything is sent.
 */

import {
  BASE_BANDS,
  CURRENCY_SYMBOL,
  FUNCTIONS,
  LOCATIONS,
  LOCATION_NOTE,
  LOOKING,
  RELOCATION,
  ROLES,
  SETTINGS,
  SETTING_NOTE,
  START,
  STAGES,
  TYPED_LOCATIONS,
  WORK_AUTH_UK_EU,
  WORK_AUTH_US,
  asksOtherAuth,
  asksUkEuAuth,
  asksUsAuth,
  outsideCore,
  scalesFor,
  type ApplyAnswers,
  type BaseAnswer,
  type Currency,
  type FunctionKey,
  type Location,
} from '@/lib/apply/options'

export const INPUT = 'h-11 w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 text-[14px] outline-none focus:border-[#1F3A2F]'

export function Chips<T extends string>({ options, value, onChange, multi }: { options: readonly T[]; value: T[] | T | null; onChange: (next: T[] | T | null) => void; multi?: boolean }) {
  const selected = new Set<T>(Array.isArray(value) ? value : value ? [value] : [])
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = selected.has(o)
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => {
              if (multi) {
                const next = new Set(selected)
                if (on) next.delete(o)
                else next.add(o)
                onChange([...next] as T[])
              } else onChange(on ? null : o)
            }}
            className={`min-h-[36px] rounded-full border px-3 text-[12.5px] font-medium transition-colors ${on ? 'border-[#1F3A2F] bg-[#1F3A2F] text-[#FAF9F5]' : 'border-[#D2D1C7] bg-white text-[#161613] hover:border-[#1F3A2F]'}`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function Q({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div>
        <p className="text-[13.5px] font-semibold">{title}</p>
        {hint && <p className="text-[12px] text-[#6E6E68]">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[10px] border border-[#E4D9B8] bg-[#FFF8EC] px-3 py-2 text-[12.5px] text-[#5C4A1A]">{children}</p>
}

function setBase(bases: BaseAnswer[], currency: BaseAnswer['currency'], patch: Partial<BaseAnswer>): BaseAnswer[] {
  const rest = bases.filter(b => b.currency !== currency)
  const cur = bases.find(b => b.currency === currency) ?? { currency, band: null, amount: null, note: null }
  return [...rest, { ...cur, ...patch }]
}

export function WantsFields({ value: a, onChange }: { value: ApplyAnswers; onChange: (next: ApplyAnswers) => void }) {
  const set = (patch: Partial<ApplyAnswers>) => onChange({ ...a, ...patch })
  const scales = scalesFor(a)
  const baseFor = (c: BaseAnswer['currency']) => a.bases.find(b => b.currency === c)
  return (
    <>
      <Q title="Right now I am">
        <Chips options={LOOKING.map(l => l.label)} value={LOOKING.find(l => l.key === a.looking)?.label ?? null} onChange={v => set({ looking: LOOKING.find(l => l.label === v)?.key ?? null })} />
      </Q>

      <Q title="Where you'd work" hint="Pick every place that is true.">
        <Chips options={LOCATIONS} value={a.locations} multi onChange={v => set({ locations: v as Location[] })} />
        {a.locations.filter(l => TYPED_LOCATIONS[l]).map(l => (
          <input key={l} value={a.cities[l] ?? ''} onChange={e => set({ cities: { ...a.cities, [l]: e.target.value } })} placeholder={TYPED_LOCATIONS[l]} className={INPUT} />
        ))}
        {outsideCore(a) && <Note>{LOCATION_NOTE}</Note>}
      </Q>

      <Q title="Would you relocate for the right role?">
        <Chips options={RELOCATION.map(r => r.label)} value={RELOCATION.find(r => r.key === a.relocation)?.label ?? null} onChange={v => set({ relocation: RELOCATION.find(r => r.label === v)?.key ?? null })} />
      </Q>

      <Q title="In the office">
        <Chips options={SETTINGS.map(s => s.label)} value={SETTINGS.find(s => s.key === a.setting)?.label ?? null} onChange={v => set({ setting: SETTINGS.find(s => s.label === v)?.key ?? null })} />
        {(a.setting === 'hybrid' || a.setting === 'remote') && <Note>{SETTING_NOTE}</Note>}
      </Q>

      {asksUsAuth(a) && (
        <Q title="US work authorisation" hint="The first thing every founder asks. Answering it here saves a call.">
          <Chips options={WORK_AUTH_US} value={(a.workAuthUs as (typeof WORK_AUTH_US)[number]) ?? null} onChange={v => set({ workAuthUs: v as string | null })} />
        </Q>
      )}
      {asksUkEuAuth(a) && (
        <Q title="Right to work in the UK or EU" hint="Pick everything that applies.">
          <Chips options={WORK_AUTH_UK_EU} value={a.workAuthUkEu as (typeof WORK_AUTH_UK_EU)[number][]} multi onChange={v => set({ workAuthUkEu: v as string[] })} />
        </Q>
      )}
      {asksOtherAuth(a) && (
        <Q title={`Right to work in ${a.cities.Elsewhere?.trim() || 'the places you named'}`}>
          <input value={a.workAuthOther} onChange={e => set({ workAuthOther: e.target.value })} placeholder="Citizen, permanent resident, visa that transfers, needs sponsorship…" className={INPUT} />
        </Q>
      )}

      {(['USD', 'GBP', 'EUR'] as Currency[]).filter(c => scales.includes(c)).map(c => (
        <Q key={c} title={c === 'USD' ? "Base salary you'd move for" : `Base salary you'd move for, in ${c === 'GBP' ? 'the UK' : 'Europe'}`} hint={c === 'USD' ? undefined : 'UK and European bases run differently from US ones, so the bands do too.'}>
          <Chips options={BASE_BANDS[c].map(b => b.label)} value={baseFor(c)?.band ?? null} onChange={v => set({ bases: setBase(a.bases, c, { band: v as string | null, amount: null }) })} />
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#9C9C95]">or a number</span>
            <div className="flex h-10 flex-1 items-center rounded-[10px] border border-[#D2D1C7] bg-white px-3">
              <span className="text-[13px] text-[#9C9C95]">{CURRENCY_SYMBOL[c]}</span>
              <input inputMode="numeric" value={baseFor(c)?.amount ?? ''} onChange={e => set({ bases: setBase(a.bases, c, { amount: Number(e.target.value.replace(/[^0-9]/g, '')) || null, band: null }) })} placeholder="e.g. 185000" className="ml-1 w-full text-[14px] outline-none" />
            </div>
          </div>
        </Q>
      ))}
      {scales.includes('OTHER') && (
        <Q title={`Base salary you'd move for, in ${a.cities.Elsewhere?.trim() || 'the places you named'}`} hint="Any currency; say which.">
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <input inputMode="numeric" value={baseFor('OTHER')?.amount ?? ''} onChange={e => set({ bases: setBase(a.bases, 'OTHER', { amount: Number(e.target.value.replace(/[^0-9]/g, '')) || null }) })} placeholder="Amount" className={INPUT} />
            <input value={baseFor('OTHER')?.note ?? ''} onChange={e => set({ bases: setBase(a.bases, 'OTHER', { note: e.target.value }) })} placeholder="Currency" className={INPUT} />
          </div>
        </Q>
      )}

      <Q title="Current base" hint="Optional. It stops us wasting your time on roles that pay less.">
        <input inputMode="numeric" value={a.currentBase ?? ''} onChange={e => set({ currentBase: Number(e.target.value.replace(/[^0-9]/g, '')) || null })} placeholder="e.g. 185000" className={INPUT} />
      </Q>

      <Q title="Earliest start">
        <Chips options={START.map(s => s.label)} value={START.find(s => s.key === a.startBy)?.label ?? null} onChange={v => set({ startBy: START.find(s => s.label === v)?.key ?? null })} />
      </Q>
    </>
  )
}

export function RolesFields({ value: a, onChange }: { value: ApplyAnswers; onChange: (next: ApplyAnswers) => void }) {
  const set = (patch: Partial<ApplyAnswers>) => onChange({ ...a, ...patch })
  const withRoles = a.functions.filter(f => ROLES[f as FunctionKey])
  const rolesOf = (f: string) => a.roles.filter(r => (ROLES[f as FunctionKey] ?? []).includes(r))
  return (
    <>
      <Q title="Roles you're open to" hint="Pick the kind of work first.">
        <Chips options={FUNCTIONS} value={a.functions as FunctionKey[]} multi onChange={v => set({ functions: v as string[], roles: a.roles.filter(r => (v as string[]).some(f => (ROLES[f as FunctionKey] ?? []).includes(r))) })} />
      </Q>
      {withRoles.map(f => (
        <Q key={f} title={`${f}: which roles?`}>
          <Chips options={ROLES[f as FunctionKey]!} value={rolesOf(f)} multi onChange={v => set({ roles: [...a.roles.filter(r => !(ROLES[f as FunctionKey] ?? []).includes(r)), ...(v as string[])] })} />
        </Q>
      ))}
      {(a.roles.includes('Other') || a.functions.includes('Other') || a.functions.some(f => !ROLES[f as FunctionKey] && f !== 'Other')) && (
        <Q title="Roles in your own words" hint={a.functions.some(f => !ROLES[f as FunctionKey] && f !== 'Other') ? 'Optional for Product, Design and Operations; a title or two helps.' : undefined}>
          <input value={a.rolesOther} onChange={e => set({ rolesOther: e.target.value })} placeholder="e.g. Head of Product, Growth PM, Chief of Staff" className={INPUT} />
        </Q>
      )}

      <Q title="Stages you'd join">
        <Chips options={STAGES} value={a.stages as (typeof STAGES)[number][]} multi onChange={v => set({ stages: v as string[] })} />
      </Q>

      <Q title="Companies never to show me to" hint="Optional. Your employer, a competitor, anyone you already spoke to. We honour it before anything is suggested.">
        <input value={a.neverCompanies} onChange={e => set({ neverCompanies: e.target.value })} placeholder="Comma-separated" className={INPUT} />
      </Q>

      <Q title="Anything we should know" hint="Optional, 280 characters.">
        <textarea value={a.notes} maxLength={280} onChange={e => set({ notes: e.target.value })} placeholder='"Founding roles only", "not fintech", "finishing a contract in November"' className="min-h-[72px] w-full rounded-[10px] border border-[#D2D1C7] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#1F3A2F]" />
      </Q>
    </>
  )
}
