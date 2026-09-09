/**
 * Date arithmetic, in code. A master's that ended in May is finished by
 * September; the model does not get to decide that (audit finding 8).
 */

export type EducationTiming = 'completed' | 'in_progress' | 'ends_this_year_month_unknown' | 'unknown'

export interface EducationEnd {
  year: number | null
  /** 1-12 when known */
  month?: number | null
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

/** "May 2026", "2026-05", "05/2026", "2026", "Expected Dec 2026", "present" */
export function parseEducationEnd(raw: string | number | null | undefined): EducationEnd {
  if (raw == null) return { year: null, month: null }
  const s = String(raw).trim().toLowerCase()
  if (!s || /present|current|ongoing/.test(s)) return { year: null, month: null }
  const iso = s.match(/(20\d{2}|19\d{2})[-/](\d{1,2})/)
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]) }
  const us = s.match(/(\d{1,2})[-/](20\d{2}|19\d{2})/)
  if (us) return { year: Number(us[2]), month: Number(us[1]) }
  const named = s.match(/\b([a-z]{3,9})\.?\s+(20\d{2}|19\d{2})\b/)
  if (named) {
    const m = MONTHS[named[1].slice(0, 4) === 'sept' ? 'sept' : named[1].slice(0, 3)]
    return { year: Number(named[2]), month: m ?? null }
  }
  const year = s.match(/\b(20\d{2}|19\d{2})\b/)
  return { year: year ? Number(year[1]) : null, month: null }
}

export function educationTiming(end: EducationEnd, today: Date): EducationTiming {
  if (end.year == null) return 'unknown'
  const ty = today.getUTCFullYear()
  const tm = today.getUTCMonth() + 1
  if (end.year < ty) return 'completed'
  if (end.year > ty) return 'in_progress'
  if (end.month == null) return 'ends_this_year_month_unknown'
  return end.month <= tm ? 'completed' : 'in_progress'
}

export function describeEducationTiming(end: EducationEnd, today: Date): string {
  const t = educationTiming(end, today)
  const when = end.year == null ? '' : end.month ? `${new Date(Date.UTC(end.year, end.month - 1, 1)).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${end.year}` : String(end.year)
  switch (t) {
    case 'completed':
      return `finished (${when}, before today)`
    case 'in_progress':
      return `still in progress (ends ${when}); start date is a question, not an assumption`
    case 'ends_this_year_month_unknown':
      return `ends ${when}, month not on record; ask rather than assume`
    default:
      return 'end date not on record'
  }
}

/** Whole years between two dates, floored. */
export function yearsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (365.25 * 86_400_000)))
}
