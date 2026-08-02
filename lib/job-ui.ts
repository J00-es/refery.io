/**
 * Shared formatting and filter vocabulary for the jobs surfaces.
 * Visual tokens come from lib/candidate-ui.ts so all three list pages read as
 * one system.
 */

export function formatSalary(min?: number | null, max?: number | null): string | null {
  const k = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${k(min)}–${k(max)}`
  if (min) return `${k(min)}+`
  if (max) return `Up to ${k(max)}`
  return null
}

/**
 * Returns null for the default-shaped value. 72,165 of 72,862 jobs carry
 * experience_years_min = 0 with no max — the column was defaulted rather than
 * filled, so rendering it would put a meaningless "0+ yrs" on 99% of cards.
 * Only a real floor or a range is worth the space.
 */
export function formatExperience(min?: number | null, max?: number | null): string | null {
  const lo = min ?? 0
  if (!lo && max == null) return null
  if (lo && max != null) return lo === max ? `${lo} yrs` : `${lo}–${max} yrs`
  if (lo) return `${lo}+ yrs`
  return `Up to ${max} yrs`
}

export const REMOTE_LABELS: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
}

export const STATUS_META: Record<string, { label: string; dot: string }> = {
  open: { label: 'Open', dot: 'bg-[#2E9E6B]' },
  draft: { label: 'Draft', dot: 'bg-[#C79A2E]' },
  closed: { label: 'Closed', dot: 'bg-[#B8B8B0]' },
}

/**
 * Visa is 100% populated but 85% of it is the unremarkable default. Only
 * surface the values that change a scout's decision.
 */
export function visaSignal(v?: string | null): string | null {
  if (v === 'sponsorship_available') return 'Sponsorship available'
  if (v === 'no_restriction') return 'No visa restriction'
  return null
}

/**
 * Department is free text and badly fragmented — "Engineering" (10,131),
 * "Software Engineering" (568), "Software" (468) and "Technology" (404) are
 * all the same function. Filtering on the raw column would silently miss
 * thousands of rows, so each bucket matches a set of patterns instead.
 */
export const FUNCTIONS = [
  { key: 'engineering', label: 'Engineering', patterns: ['engineer', 'software', 'technology', 'developer', 'infrastructure'] },
  { key: 'sales', label: 'Sales & GTM', patterns: ['sales', 'gtm', 'revenue', 'business development', 'commercial', 'partnerships'] },
  { key: 'product', label: 'Product', patterns: ['product'] },
  { key: 'design', label: 'Design', patterns: ['design', 'ux', 'creative'] },
  { key: 'marketing', label: 'Marketing', patterns: ['marketing', 'growth', 'brand', 'communications'] },
  { key: 'data', label: 'Data & AI', patterns: ['data', 'analytics', 'machine learning', 'research scientist'] },
  { key: 'operations', label: 'Operations', patterns: ['operation', 'supply', 'logistics', 'manufacturing'] },
  { key: 'finance', label: 'Finance', patterns: ['financ', 'fp&a', 'accounting', 'treasury'] },
  { key: 'people', label: 'People', patterns: ['people', 'human resource', 'talent', 'recruit'] },
  { key: 'clinical', label: 'Clinical & Science', patterns: ['clinical', 'r&d', 'scientific', 'medical', 'regulatory'] },
] as const

/** PostgREST `or` clauses for the selected function buckets, OR-ed together. */
export function functionFilterClauses(keys: string[]): string[] {
  return keys.flatMap(k => {
    const fn = FUNCTIONS.find(f => f.key === k)
    if (!fn) return []
    return fn.patterns.map(p => `department.ilike.%${p}%`)
  })
}

export const SALARY_BANDS = [
  { key: 'lt100', label: 'Under $100k', min: null, max: 100_000 },
  { key: '100to150', label: '$100–150k', min: 100_000, max: 150_000 },
  { key: '150to200', label: '$150–200k', min: 150_000, max: 200_000 },
  { key: 'gte200', label: '$200k+', min: 200_000, max: null },
] as const

export const POSTED_BANDS = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
] as const

export const JOB_SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'salary', label: 'Highest salary' },
  { key: 'pipeline', label: 'Most candidates' },
  { key: 'company', label: 'Company A–Z' },
  { key: 'title', label: 'Title A–Z' },
] as const

export const JOB_STATUSES = ['open', 'draft', 'closed'] as const

/** Compact "3d" / "2w" freshness marker for a high-churn feed. */
export function shortAge(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return '1d'
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  return `${Math.floor(days / 365)}y`
}

/** True for roles posted within the last week — the freshest referral targets. */
export function isFresh(dateStr?: string | null): boolean {
  if (!dateStr) return false
  return Date.now() - new Date(dateStr).getTime() < 7 * 86_400_000
}
