import type { Education, ParsedResumeData, WorkExperience } from '@/lib/types'

/**
 * Everything that turns an AI-parsed resume into a `candidates` row.
 *
 * Both creation paths — the single-resume form and the bulk uploader — and the
 * re-analyse endpoint go through here, so a column that needs coercing gets
 * coerced everywhere or nowhere.
 */

/**
 * Coerce whatever the model produced into something an `integer` column will
 * accept.
 *
 * This is the fix for the bug that broke both upload paths: `experience_years`
 * and the two salary columns are `integer` in Postgres, but the model happily
 * answers "1.5" for eighteen months of experience. PostgREST forwards that
 * verbatim and Postgres rejects the whole insert with
 * `22P02 invalid input syntax for type integer: "1.5"` — so every resume of a
 * candidate with a fractional tenure failed to save, with no hint as to why.
 *
 * Rounding is the right call rather than truncating: 1.5 years of experience is
 * much closer to 2 than to 1. The exact value is still kept verbatim inside
 * `parsed_data`, so nothing is actually lost.
 */
export function toInt(value: unknown, opts: { min?: number; max?: number } = {}): number | null {
  if (value === null || value === undefined || value === '') return null

  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''))
  if (!Number.isFinite(n)) return null

  let rounded = Math.round(n)
  if (opts.min !== undefined) rounded = Math.max(opts.min, rounded)
  if (opts.max !== undefined) rounded = Math.min(opts.max, rounded)
  return rounded
}

/** Trimmed string, or null for anything blank/absent. */
export function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** A `text[]` column's worth of unique, non-empty strings. */
export function toTextArray(value: unknown, limit = 200): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const text = typeof item === 'string' ? item.trim() : null
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= limit) break
  }
  return out
}

/** A `jsonb` array column — objects only, everything else dropped. */
function toObjectArray(value: unknown, limit = 100): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .slice(0, limit)
}

/**
 * Strip the characters Postgres will not accept inside `jsonb`.
 *
 * A PDF text layer can contain a NUL byte, and some fonts leave lone surrogate
 * halves behind. Postgres rejects both with
 * `unsupported Unicode escape sequence` and refuses the entire write — so one
 * stray byte in a résumé took the whole profile down with it.
 *
 * Applied to the parse as a whole rather than to raw_text alone: the model
 * quotes the document, so anything unwriteable in the text can resurface in a
 * bullet point or a job title.
 */
export function stripUnwritableChars<T>(value: T): T {
  if (typeof value === 'string') {
    // Filtered by code point rather than by regex: the characters being removed
    // are exactly the ones that cannot safely appear in source either.
    let out = ''
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i)

      // C0 controls, except tab (9), newline (10) and carriage return (13).
      if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) continue
      if (code === 0x7f) continue

      // A surrogate is only meaningful as a matched pair; a lone half is not
      // valid UTF-8 and Postgres will reject the whole document over it.
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(i + 1)
        if (!(next >= 0xdc00 && next <= 0xdfff)) continue
        out += value[i] + value[i + 1]
        i++
        continue
      }
      if (code >= 0xdc00 && code <= 0xdfff) continue

      out += value[i]
    }
    return out as unknown as T
  }

  if (Array.isArray(value)) {
    return value.map(item => stripUnwritableChars(item)) as unknown as T
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      out[key] = stripUnwritableChars(item)
    }
    return out as unknown as T
  }

  return value
}

/** Postgres CHECK constraint on `candidates.status`. */
export const CANDIDATE_STATUSES = ['new', 'reviewing', 'shortlisted', 'rejected', 'hired'] as const

/** Postgres CHECK constraint on `candidates.availability_status`. */
export const AVAILABILITY_VALUES = ['active', 'off_market', 'not_yet_talked', 'not_qualified'] as const

/**
 * A LinkedIn URL the browser will actually open.
 *
 * Resumes write these every possible way — "linkedin.com/in/x", "in/x",
 * "@x" — and a bare host with no scheme renders as a broken relative link.
 */
export function normalizeLinkedIn(value: unknown): string | null {
  const raw = toText(value)
  if (!raw) return null

  const cleaned = raw.replace(/^@/, '').trim()
  if (/^https?:\/\//i.test(cleaned)) return cleaned
  if (/^(www\.)?linkedin\.com/i.test(cleaned)) return `https://${cleaned.replace(/^www\./i, '')}`
  if (/^(in|pub)\//i.test(cleaned)) return `https://linkedin.com/${cleaned}`
  return null
}

/** Same idea for any other profile/portfolio link. */
export function normalizeUrl(value: unknown): string | null {
  const raw = toText(value)
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(raw)) return `https://${raw}`
  return null
}

/**
 * Free-text keywords the matcher can filter on, derived from the parts of the
 * resume that describe *what kind of background this is* rather than what the
 * person can do. Kept short — this feeds a `text[]` used for coarse filtering,
 * not for ranking.
 */
export function deriveBackgroundKeywords(parsed: Partial<ParsedResumeData>): string[] {
  const keywords: string[] = []

  for (const role of parsed.work_history ?? []) {
    if (role.company) keywords.push(role.company)
    if (role.title) keywords.push(role.title)
  }
  for (const edu of parsed.education ?? []) {
    if (edu.institution) keywords.push(edu.institution)
    if (edu.field) keywords.push(edu.field)
  }
  keywords.push(...(parsed.industries ?? []))
  if (parsed.seniority_level) keywords.push(parsed.seniority_level)

  return toTextArray(keywords, 60)
}

/**
 * A role's date range for display and for the embedding.
 *
 * The extractor stores structured `start_date`/`end_date`/`is_current` rather
 * than a pre-formatted string, so this is the one place that decides how they
 * read. Older profiles still carry the formatted `duration` and fall back to it.
 */
export function formatRoleDates(role: WorkExperience): string | null {
  if (role.start_date || role.end_date) {
    const end = role.is_current ? 'Present' : role.end_date || 'Present'
    return [role.start_date, end].filter(Boolean).join(' — ')
  }
  return role.duration ?? null
}

/** Same idea for an education entry. */
export function formatEducationYears(edu: Education): string | null {
  if (edu.start_year || edu.end_year) {
    return [edu.start_year, edu.end_year].filter(Boolean).join(' - ')
  }
  return edu.year ?? null
}

/**
 * The text we embed for job matching.
 *
 * Ordered most- to least-discriminating, because the embedding model weights
 * the whole string and a candidate is best characterised by what they do now,
 * then by what they have done, then by the tools they used doing it.
 */
export function buildEmbeddingText(parsed: Partial<ParsedResumeData>, name: string): string {
  const parts: string[] = [name]

  if (parsed.headline) parts.push(parsed.headline)
  if (parsed.current_title || parsed.current_company) {
    parts.push([parsed.current_title, parsed.current_company].filter(Boolean).join(' at '))
  }
  if (parsed.seniority_level) parts.push(`Seniority: ${parsed.seniority_level}`)
  if (parsed.experience_years != null) parts.push(`${parsed.experience_years} years of experience`)
  if (parsed.location) parts.push(`Based in ${parsed.location}`)
  if (parsed.summary) parts.push(parsed.summary)

  const roles = (parsed.work_history ?? []).slice(0, 10).map(role =>
    [
      [role.title, role.company].filter(Boolean).join(' at '),
      formatRoleDates(role),
      // `description` only exists on older parses; the bullets say the same
      // thing in the candidate's own words, so prefer them when both are there.
      (role.highlights ?? []).length ? role.highlights!.join(' ') : role.description,
    ]
      .filter(Boolean)
      .join(' — '),
  )
  if (roles.length) parts.push(`Experience: ${roles.join(' | ')}`)

  const skills = toTextArray(parsed.skills, 60)
  if (skills.length) parts.push(`Skills: ${skills.join(', ')}`)

  const education = (parsed.education ?? [])
    .map(edu => [edu.degree, edu.field, edu.institution].filter(Boolean).join(' '))
    .filter(Boolean)
  if (education.length) parts.push(`Education: ${education.join('; ')}`)

  const industries = toTextArray(parsed.industries, 20)
  if (industries.length) parts.push(`Industries: ${industries.join(', ')}`)

  // text-embedding-3-small truncates past 8191 tokens; ~24k characters keeps us
  // comfortably inside that without having to count tokens.
  return parts.join('\n').slice(0, 24000)
}

/**
 * How much of the resume we actually captured, as a 0-100 score plus the list
 * of things that came back empty. Surfaced on the review screen so a bad parse
 * is obvious *before* the profile is created rather than discovered weeks later
 * when the candidate does not turn up in a search.
 */
export function resumeCompleteness(parsed: Partial<ParsedResumeData>): {
  score: number
  missing: string[]
} {
  const checks: { label: string; ok: boolean; weight: number }[] = [
    { label: 'Name', ok: !!toText(parsed.name), weight: 2 },
    { label: 'Email', ok: !!toText(parsed.email), weight: 2 },
    { label: 'Phone', ok: !!toText(parsed.phone), weight: 1 },
    { label: 'Location', ok: !!toText(parsed.location), weight: 1 },
    { label: 'Summary', ok: !!toText(parsed.summary), weight: 1 },
    { label: 'Skills', ok: (parsed.skills?.length ?? 0) > 0, weight: 2 },
    { label: 'Work history', ok: (parsed.work_history?.length ?? 0) > 0, weight: 3 },
    { label: 'Education', ok: (parsed.education?.length ?? 0) > 0, weight: 1 },
    { label: 'Years of experience', ok: parsed.experience_years != null, weight: 1 },
    { label: 'Résumé text', ok: (toText(parsed.raw_text)?.length ?? 0) > 200, weight: 2 },
  ]

  const total = checks.reduce((sum, c) => sum + c.weight, 0)
  const earned = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0)

  return {
    score: Math.round((earned / total) * 100),
    missing: checks.filter(c => !c.ok).map(c => c.label),
  }
}

export interface CandidateRowInput {
  parsed: Partial<ParsedResumeData>
  resume_blob_pathname?: string | null
  resume_filename?: string | null
}

/**
 * The `candidates` columns implied by a parsed resume.
 *
 * The flat columns are deliberately kept in step with `parsed_data`: matching,
 * filtering and the list pages read the columns, while the detail page reads
 * the JSON. They used to drift — `work_history` and `education` were left at
 * their `'[]'` defaults on every upload — which is why a candidate's schooling
 * was invisible to anything but the profile page.
 */
export function candidateRowFromParsed(input: CandidateRowInput): Record<string, unknown> {
  const { parsed } = input

  const name = toText(parsed.name) ?? 'Unknown'
  const salaryMin = toInt(parsed.salary_expectation_min, { min: 0, max: 100_000_000 })
  const salaryMax = toInt(parsed.salary_expectation_max, { min: 0, max: 100_000_000 })

  return {
    name,
    email: toText(parsed.email)?.toLowerCase() ?? null,
    phone: toText(parsed.phone),
    linkedin_url: normalizeLinkedIn(parsed.linkedin_url),
    location: toText(parsed.location),
    remote_preference: toText(parsed.remote_preference)?.toLowerCase() ?? null,
    visa_status: toText(parsed.work_authorization),

    // Integer columns — the model's fractional answers get rounded here rather
    // than blowing up the insert. 60 years is a generous ceiling that still
    // catches a model that has confused "years" with something else.
    experience_years: toInt(parsed.experience_years, { min: 0, max: 60 }),
    salary_expectation_min: salaryMin,
    // Guard against a model that swapped the bounds.
    salary_expectation_max: salaryMax != null && salaryMin != null && salaryMax < salaryMin ? salaryMin : salaryMax,

    skills: toTextArray(parsed.skills, 120),
    background_keywords: deriveBackgroundKeywords(parsed),
    work_history: toObjectArray(parsed.work_history, 40),
    education: toObjectArray(parsed.education, 20),

    ...(input.resume_blob_pathname ? { resume_blob_pathname: input.resume_blob_pathname } : {}),
    ...(input.resume_filename !== undefined ? { resume_filename: toText(input.resume_filename) } : {}),
  }
}

/** Columns a client is allowed to set directly on `POST /api/candidates`. */
export const WRITABLE_CANDIDATE_COLUMNS = [
  'name',
  'email',
  'phone',
  'linkedin_url',
  'location',
  'remote_preference',
  'visa_status',
  'experience_years',
  'salary_expectation_min',
  'salary_expectation_max',
  'skills',
  'background_keywords',
  'work_history',
  'education',
  'parsed_data',
  'resume_blob_pathname',
  'resume_filename',
  'status',
  'availability_status',
  'owner_user_id',
  'ai_analysis',
  'brief',
  'last_contacted',
  'allowed_stages',
  'allowed_locations',
  'stage_filter_notes',
] as const

const INTEGER_COLUMNS: Record<string, { min?: number; max?: number }> = {
  experience_years: { min: 0, max: 60 },
  salary_expectation_min: { min: 0, max: 100_000_000 },
  salary_expectation_max: { min: 0, max: 100_000_000 },
}

const TEXT_ARRAY_COLUMNS = ['skills', 'background_keywords', 'allowed_stages', 'allowed_locations']

/**
 * Drop unknown keys and coerce the rest to what the column will accept.
 *
 * An unknown key makes PostgREST reject the entire insert (`PGRST204`), and a
 * float in an integer column makes Postgres reject it (`22P02`). Neither is the
 * caller's fault when the values came out of a language model, so both are
 * fixed here instead of being surfaced as "Failed to create candidate".
 */
export function sanitizeCandidateInput(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}

  for (const column of WRITABLE_CANDIDATE_COLUMNS) {
    if (!(column in body)) continue
    const value = body[column]

    if (column in INTEGER_COLUMNS) {
      out[column] = toInt(value, INTEGER_COLUMNS[column])
    } else if (TEXT_ARRAY_COLUMNS.includes(column)) {
      out[column] = toTextArray(value)
    } else if (column === 'email') {
      out[column] = toText(value)?.toLowerCase() ?? null
    } else if (column === 'linkedin_url') {
      out[column] = normalizeLinkedIn(value)
    } else {
      out[column] = value
    }
  }

  if (out.status !== undefined && !CANDIDATE_STATUSES.includes(out.status as never)) {
    out.status = 'new'
  }
  if (out.availability_status !== undefined && !AVAILABILITY_VALUES.includes(out.availability_status as never)) {
    delete out.availability_status
  }

  return out
}
