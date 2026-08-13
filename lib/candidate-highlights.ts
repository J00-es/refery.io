import type { ParsedResumeData } from '@/lib/types'

/**
 * The short version of a candidate, for a Slack ping.
 *
 * Reads from parsed_data rather than the flat columns, which are mostly empty,
 * and uses `institution` for schools, which is the key the parser actually
 * writes.
 */

export interface CandidateHighlights {
  headline: string | null
  linkedin: string | null
  summary: string | null
  points: string[]
}

interface WorkEntry {
  title?: string
  company?: string
  start_date?: string
  end_date?: string
}

interface EduEntry {
  institution?: string
  degree?: string
  field?: string
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

function clean(s: unknown): string | null {
  const t = typeof s === 'string' ? s.trim() : ''
  return t ? t : null
}

export function candidateHighlights(
  parsed: Partial<ParsedResumeData> | null,
  fallback: { name?: string | null; linkedin_url?: string | null; location?: string | null },
): CandidateHighlights {
  const p = (parsed ?? {}) as Record<string, unknown>

  const work = asArray<WorkEntry>(p.work_history)
  const edu = asArray<EduEntry>(p.education)

  const current = work[0]
  const headline = current
    ? [clean(current.title), clean(current.company)].filter(Boolean).join(' at ') || null
    : null

  const points: string[] = []

  const years = typeof p.experience_years === 'number' ? p.experience_years : null
  if (years) points.push(`${years} years experience`)

  const loc = clean(p.location) || clean(fallback.location)
  if (loc) points.push(loc)

  const companies = work
    .slice(0, 4)
    .map((w) => clean(w.company))
    .filter((c): c is string => !!c)
  if (companies.length > 1) points.push(`Previously ${companies.slice(1).join(', ')}`)

  const schools = edu
    .map((e) => clean(e.institution))
    .filter((s): s is string => !!s)
    .slice(0, 2)
  if (schools.length) points.push(schools.join(', '))

  const skills = asArray<string>(p.skills)
    .map((s) => clean(s))
    .filter((s): s is string => !!s)
    .slice(0, 6)
  if (skills.length) points.push(skills.join(', '))

  return {
    headline,
    linkedin: clean(p.linkedin_url) || clean(fallback.linkedin_url),
    summary: clean(p.summary),
    points,
  }
}
