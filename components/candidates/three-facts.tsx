'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { FOCUS } from '@/lib/candidate-ui'
import { BASE_BANDS, CITY_OPTIONS, VISA_OPTIONS, readiness } from '@/lib/desk/facts'

/**
 * The three facts founders ask first (visa, cities, base) plus consent.
 *
 * Two modes. Before a profile exists (the upload step) it only reports its
 * values up through `onChange`; the page sends them with the create. On a
 * profile it saves each change straight away through /facts and the panel
 * re-reads the person with the new facts.
 *
 * Never mandatory. The readiness meter is the nudge: it says what the answer
 * buys, in the only currency that matters here (which live seats can even be
 * evaluated).
 */

export interface FactValues {
  visa_status: string | null
  allowed_locations: string[]
  relocation_ok: boolean | null
  salary_expectation_min: number | null
  salary_expectation_max: number | null
  consent_told_candidate: boolean | null
  other_city: string
}

export function emptyFacts(): FactValues {
  return { visa_status: null, allowed_locations: [], relocation_ok: null, salary_expectation_min: null, salary_expectation_max: null, consent_told_candidate: null, other_city: '' }
}

export function readinessOf(v: FactValues): number {
  return readiness({
    visa: !!v.visa_status,
    cities: v.allowed_locations.length > 0 || !!v.other_city.trim(),
    comp: !!v.salary_expectation_min,
    consent: v.consent_told_candidate !== null,
  })
}

const chip = (on: boolean, extra = '') =>
  `rounded-full border px-3 py-1.5 text-[13px] transition-colors ${FOCUS} ${on ? 'border-[#1F3A2F] bg-[#E7EDE9] font-semibold text-[#1F3A2F]' : 'border-[#D2D1C7] text-[#161613] hover:border-[#9C9C95]'} ${extra}`

export function ThreeFacts({
  candidateId,
  initial,
  onChange,
  compact = false,
  title = 'Three things founders ask first',
}: {
  /** When set, every change saves to this profile. */
  candidateId?: string
  initial: FactValues
  onChange?: (v: FactValues) => void
  /** On the profile page: only the unanswered questions, in less room. */
  compact?: boolean
  title?: string
}) {
  const router = useRouter()
  const [v, setV] = useState<FactValues>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const score = useMemo(() => readinessOf(v), [v])
  const before = useMemo(() => readinessOf(initial), [initial])

  async function commit(next: FactValues) {
    setV(next)
    onChange?.(next)
    if (!candidateId) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/candidates/${candidateId}/facts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visa_status: next.visa_status,
          allowed_locations: [...next.allowed_locations, ...(next.other_city.trim() ? [next.other_city.trim()] : [])],
          relocation_ok: next.relocation_ok,
          salary_expectation_min: next.salary_expectation_min,
          salary_expectation_max: next.salary_expectation_max,
          consent_told_candidate: next.consent_told_candidate,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not save')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  const showVisa = !compact || !initial.visa_status
  const showCities = !compact || initial.allowed_locations.length === 0
  const showComp = !compact || !initial.salary_expectation_min
  const showConsent = !compact || initial.consent_told_candidate === null
  if (compact && !showVisa && !showCities && !showComp && !showConsent) return null

  return (
    <div className={compact ? '' : 'rounded-[16px] border border-[#E4E3DC] bg-white p-5'}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-[#161613]">{title}</p>
        <p className="text-[12.5px] text-[#6E6E68]">
          Match readiness <b className="text-[#161613]">{before}%</b>
          {score !== before && (
            <>
              {' '}→ <b className="text-[#1F3A2F]">{score}%</b>
            </>
          )}
          {saving && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E4E3DC]">
        <div className="h-full rounded-full bg-[#2E9E6B] transition-all" style={{ width: `${score}%` }} />
      </div>
      {!compact && (
        <p className="mt-2 text-[12.5px] text-[#9C9C95]">
          Every live seat needs the work authorisation answer before it can be matched. Skip anything you do not know; you can answer later from the profile.
        </p>
      )}

      {showVisa && (
        <Q label="Work authorisation in the US" hint={initial.visa_status ? `From the CV: ${initial.visa_status}` : undefined}>
          {VISA_OPTIONS.map(o => (
            <button key={o} type="button" className={chip(v.visa_status === o)} onClick={() => commit({ ...v, visa_status: v.visa_status === o ? null : o })}>
              {o}
            </button>
          ))}
        </Q>
      )}

      {showCities && (
        <Q label="Where they will work" hint="Pick every city that is a yes. Most seats are onsite in SF or NY.">
          {CITY_OPTIONS.map(o => {
            const on = v.allowed_locations.includes(o)
            return (
              <button
                key={o}
                type="button"
                className={chip(on)}
                onClick={() => commit({ ...v, allowed_locations: on ? v.allowed_locations.filter(x => x !== o) : [...v.allowed_locations, o] })}
              >
                {o}
              </button>
            )
          })}
          <input
            value={v.other_city}
            onChange={e => setV({ ...v, other_city: e.target.value })}
            onBlur={() => commit(v)}
            placeholder="+ somewhere else"
            className={`w-40 rounded-full border border-dashed border-[#D2D1C7] px-3 py-1.5 text-[13px] text-[#161613] placeholder:text-[#9C9C95] ${FOCUS}`}
          />
          <span className="basis-full" />
          <button type="button" className={chip(v.relocation_ok === true)} onClick={() => commit({ ...v, relocation_ok: v.relocation_ok === true ? null : true })}>
            Open to relocating
          </button>
          <button type="button" className={chip(v.relocation_ok === false)} onClick={() => commit({ ...v, relocation_ok: v.relocation_ok === false ? null : false })}>
            Not relocating
          </button>
        </Q>
      )}

      {showComp && (
        <Q label="Base salary they are targeting" hint="A band is fine. USD.">
          {BASE_BANDS.map(b => {
            const on = v.salary_expectation_min === b.min && v.salary_expectation_max === b.max
            return (
              <button
                key={b.label}
                type="button"
                className={chip(on)}
                onClick={() => commit({ ...v, salary_expectation_min: on ? null : b.min, salary_expectation_max: on ? null : b.max })}
              >
                {b.label}
              </button>
            )
          })}
          <input
            inputMode="numeric"
            placeholder="exact, e.g. 150000"
            className={`w-40 rounded-full border border-dashed border-[#D2D1C7] px-3 py-1.5 text-[13px] text-[#161613] placeholder:text-[#9C9C95] ${FOCUS}`}
            onBlur={e => {
              const n = Number(e.target.value.replace(/[^0-9]/g, ''))
              if (n > 0) commit({ ...v, salary_expectation_min: n, salary_expectation_max: n })
            }}
          />
        </Q>
      )}

      {showConsent && (
        <Q label="Have you told them you are sharing their profile?">
          <button type="button" className={chip(v.consent_told_candidate === true)} onClick={() => commit({ ...v, consent_told_candidate: v.consent_told_candidate === true ? null : true })}>
            Yes, they know
          </button>
          <button type="button" className={chip(v.consent_told_candidate === false)} onClick={() => commit({ ...v, consent_told_candidate: v.consent_told_candidate === false ? null : false })}>
            Not yet
          </button>
        </Q>
      )}
      {error && <p className="mt-2 text-[12.5px] text-[#C2544B]">{error}</p>}
    </div>
  )
}

function Q({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[13.5px] font-semibold text-[#161613]">{label}</p>
      {hint && <p className="mt-0.5 text-[12.5px] text-[#6E6E68]">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
