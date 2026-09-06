'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FOCUS } from '@/lib/candidate-ui'
import { BASE_BANDS, CITY_OPTIONS, VISA_OPTIONS, cityFromText, visaFromText } from '@/lib/desk/facts'
import type { ParsedResumeData } from '@/lib/types'

export interface CreatedRow {
  id: string
  name: string
  parsed: ParsedResumeData | null
}

interface RowState {
  visa: string | null
  city: string | null
  band: string | null
  consent: boolean | null
  saved: boolean
  saving: boolean
}

/**
 * Step two of a bulk upload: the created profiles in a table with the three
 * facts, pre-filled from each CV where it said, amber where it did not. Every
 * cell saves on change. "Same for all" copies the first row down.
 */
export function BulkFactsTable({ rows }: { rows: CreatedRow[] }) {
  const [state, setState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map(r => [
        r.id,
        {
          visa: visaFromText(r.parsed?.work_authorization) ?? null,
          city: cityFromText(r.parsed?.location) ?? null,
          band: r.parsed?.salary_expectation_min ? BASE_BANDS.find(b => (r.parsed?.salary_expectation_min ?? 0) >= b.min && (r.parsed?.salary_expectation_min ?? 0) < b.max)?.label ?? null : null,
          consent: null,
          saved: false,
          saving: false,
        },
      ]),
    ),
  )

  async function save(id: string, patch: Partial<RowState>) {
    const next = { ...state[id], ...patch, saving: true }
    setState(s => ({ ...s, [id]: next }))
    const band = BASE_BANDS.find(b => b.label === next.band)
    try {
      await fetch(`/api/candidates/${id}/facts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visa_status: next.visa,
          allowed_locations: next.city ? [next.city] : [],
          salary_expectation_min: band?.min ?? null,
          salary_expectation_max: band?.max ?? null,
          consent_told_candidate: next.consent,
        }),
      })
      setState(s => ({ ...s, [id]: { ...s[id], saving: false, saved: true } }))
    } catch {
      setState(s => ({ ...s, [id]: { ...s[id], saving: false } }))
    }
  }

  function sameForAll(key: 'visa' | 'city' | 'consent') {
    const first = state[rows[0]?.id]
    if (!first) return
    for (const r of rows.slice(1)) void save(r.id, { [key]: first[key] } as Partial<RowState>)
  }

  const sel = (missing: boolean) => `rounded-md border px-2 py-1 text-[12.5px] ${FOCUS} ${missing ? 'border-[#C79A2E] text-[#8A6A1F]' : 'border-[#D2D1C7] text-[#161613]'}`
  const missingCount = rows.filter(r => !state[r.id]?.visa || !state[r.id]?.city || !state[r.id]?.band).length

  return (
    <div className="rounded-[16px] border border-[#E4E3DC] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[16px] font-semibold text-[#161613]">
          {rows.length} profile{rows.length === 1 ? '' : 's'} created. Fill the gaps.
        </p>
        <p className="text-[12.5px] text-[#6E6E68]">{missingCount ? `${missingCount} with something unknown` : 'Every profile is match-ready'}</p>
      </div>
      <p className="mt-1 text-[12.5px] text-[#9C9C95]">Cells the CV answered are filled. Amber means unknown. Every change saves on its own; the panel re-reads each person with the new facts.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={`rounded-full border border-[#D2D1C7] px-3 py-1 text-[12.5px] font-semibold ${FOCUS}`} onClick={() => sameForAll('visa')}>
          Same visa for all
        </button>
        <button type="button" className={`rounded-full border border-[#D2D1C7] px-3 py-1 text-[12.5px] font-semibold ${FOCUS}`} onClick={() => sameForAll('city')}>
          Same city for all
        </button>
        <button type="button" className={`rounded-full border border-[#D2D1C7] px-3 py-1 text-[12.5px] font-semibold ${FOCUS}`} onClick={() => sameForAll('consent')}>
          Same consent for all
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-wider text-[#9C9C95]">
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Current</th>
              <th className="py-2 pr-3 font-semibold">Visa</th>
              <th className="py-2 pr-3 font-semibold">City</th>
              <th className="py-2 pr-3 font-semibold">Base</th>
              <th className="py-2 pr-3 font-semibold">Told them?</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const s = state[r.id]
              const w = r.parsed?.work_history?.[0]
              return (
                <tr key={r.id} className="border-t border-[#E4E3DC]">
                  <td className="py-2 pr-3 font-semibold">
                    <Link href={`/candidates/${r.id}`} className="text-[#1F3A2F] hover:underline">
                      {r.name}
                    </Link>
                    {s?.saved && <span className="ml-1 text-[11px] text-[#2E9E6B]">saved</span>}
                  </td>
                  <td className="py-2 pr-3 text-[#6E6E68]">{w ? [w.title, w.company].filter(Boolean).join(', ') : r.parsed?.headline ?? ''}</td>
                  <td className="py-2 pr-3">
                    <select className={sel(!s?.visa)} value={s?.visa ?? ''} onChange={e => save(r.id, { visa: e.target.value || null })}>
                      <option value="">unknown</option>
                      {VISA_OPTIONS.map(o => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select className={sel(!s?.city)} value={s?.city ?? ''} onChange={e => save(r.id, { city: e.target.value || null })}>
                      <option value="">unknown</option>
                      {CITY_OPTIONS.map(o => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select className={sel(!s?.band)} value={s?.band ?? ''} onChange={e => save(r.id, { band: e.target.value || null })}>
                      <option value="">unknown</option>
                      {BASE_BANDS.map(b => (
                        <option key={b.label} value={b.label}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select className={sel(s?.consent === null)} value={s?.consent === null ? '' : s?.consent ? 'yes' : 'no'} onChange={e => save(r.id, { consent: e.target.value === '' ? null : e.target.value === 'yes' })}>
                      <option value="">?</option>
                      <option value="yes">Yes</option>
                      <option value="no">Not yet</option>
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
