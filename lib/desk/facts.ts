/**
 * The three facts founders ask first, as the chips the upload step, the bulk
 * review table and the profile all share. One list, so the same answer is
 * stored the same way from every door.
 */

export const VISA_OPTIONS = [
  'US citizen or green card',
  'H-1B, transfer needed',
  'OPT or STEM OPT',
  'Needs new sponsorship',
  'Not US based, no US visa',
] as const

export const CITY_OPTIONS = ['SF Bay Area', 'New York', 'Other US hub', 'UK or Europe', 'Elsewhere'] as const

export const BASE_BANDS: { label: string; min: number; max: number }[] = [
  { label: 'Under $120k', min: 90_000, max: 120_000 },
  { label: '$120 to 160k', min: 120_000, max: 160_000 },
  { label: '$160 to 200k', min: 160_000, max: 200_000 },
  { label: '$200 to 250k', min: 200_000, max: 250_000 },
  { label: '$250k+', min: 250_000, max: 320_000 },
]

/** Map what a CV says to a chip, so the step opens pre-filled. */
export function visaFromText(raw?: string | null): (typeof VISA_OPTIONS)[number] | null {
  const t = (raw ?? '').toLowerCase()
  if (!t) return null
  if (/citizen|green card|permanent resident|\bgc\b|\bpr\b/.test(t) && !/sponsor/.test(t)) return 'US citizen or green card'
  if (/h-?1b/.test(t)) return 'H-1B, transfer needed'
  if (/\bopt\b|f-?1/.test(t)) return 'OPT or STEM OPT'
  if (/sponsor|visa required|needs? (a )?visa/.test(t)) return 'Needs new sponsorship'
  return null
}

export function cityFromText(raw?: string | null): (typeof CITY_OPTIONS)[number] | null {
  const t = (raw ?? '').toLowerCase()
  if (!t) return null
  if (/san francisco|\bsf\b|bay area|palo alto|mountain view|oakland|berkeley|san jose|menlo park|burlingame/.test(t)) return 'SF Bay Area'
  if (/new york|\bnyc?\b|brooklyn|manhattan/.test(t)) return 'New York'
  if (/london|berlin|paris|amsterdam|dublin|madrid|barcelona|lisbon|zurich|munich|\buk\b|united kingdom|england|germany|france|spain|netherlands|portugal|switzerland/.test(t)) return 'UK or Europe'
  if (/\b(ca|ny|tx|wa|ma|il|co|ga|fl|nc|pa|az|or|dc|usa|united states)\b|austin|seattle|boston|chicago|denver|los angeles|\bla\b|atlanta|miami|philadelphia|portland|washington/.test(t)) return 'Other US hub'
  return 'Elsewhere'
}

/** How ready the profile is to be matched: the share of live-seat questions the record can answer. */
export function readiness(facts: { visa: boolean; cities: boolean; comp: boolean; consent: boolean }): number {
  const w = { visa: 45, cities: 25, comp: 20, consent: 10 }
  return (facts.visa ? w.visa : 0) + (facts.cities ? w.cities : 0) + (facts.comp ? w.comp : 0) + (facts.consent ? w.consent : 0)
}
