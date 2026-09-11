/**
 * Apollo, the workhorse for discovery and the first stop for a profile.
 *
 * Two calls only. `mixed_people/api_search` costs no credits and returns a
 * stub (first name, masked last name, title, employer, whether an email
 * exists). `people/match` costs one credit when it finds the person and
 * returns the record we grade on: employment history, LinkedIn URL, email
 * with its verification status. Every match is written to sourcing_lookups
 * so the funnel and the spend are measured, not assumed.
 *
 * APOLLO_API_KEY is a team master key from Apollo's settings. Unset means
 * every function returns an error string and nothing else happens.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const BASE = 'https://api.apollo.io/api/v1'

export interface ApolloStub {
  id: string
  first_name: string
  last_name_obfuscated: string | null
  title: string | null
  organization: string | null
  has_email: boolean
  last_refreshed_at: string | null
}

export interface ApolloPerson {
  id: string
  name: string
  first_name: string | null
  last_name: string | null
  headline: string | null
  title: string | null
  linkedin_url: string | null
  github_url: string | null
  email: string | null
  email_status: string | null
  personal_emails: string[]
  city: string | null
  state: string | null
  country: string | null
  organization_name: string | null
  organization_domain: string | null
  employment_history: { title: string | null; organization_name: string | null; start_date: string | null; end_date: string | null; current: boolean; description: string | null }[]
}

export interface SearchFilters {
  titles?: string[]
  locations?: string[]
  employerDomains?: string[]
  keywords?: string
  yearsMin?: number | null
  yearsMax?: number | null
  page?: number
  perPage?: number
}

function key(): string | null {
  return process.env.APOLLO_API_KEY ?? null
}

async function post<T>(path: string, body: Record<string, unknown>): Promise<{ data?: T; error?: string; status?: number }> {
  const k = key()
  if (!k) return { error: 'APOLLO_API_KEY is not set' }
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': k },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    if (!res.ok) return { error: `${res.status}: ${text.slice(0, 300)}`, status: res.status }
    return { data: text ? (JSON.parse(text) as T) : (undefined as T), status: res.status }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/** Free. Up to 100 stubs per page. */
export async function searchPeople(f: SearchFilters): Promise<{ people: ApolloStub[]; total: number; error?: string }> {
  const body: Record<string, unknown> = { page: f.page ?? 1, per_page: Math.min(100, f.perPage ?? 25) }
  if (f.titles?.length) body.person_titles = f.titles.slice(0, 12)
  if (f.locations?.length) body.person_locations = f.locations.slice(0, 6)
  if (f.employerDomains?.length) body.q_organization_domains_list = f.employerDomains.slice(0, 20)
  if (f.keywords) body.q_keywords = f.keywords
  if (f.yearsMin != null || f.yearsMax != null) body.person_total_yoe_range = { ...(f.yearsMin != null ? { min: f.yearsMin } : {}), ...(f.yearsMax != null ? { max: f.yearsMax } : {}) }
  const r = await post<{ people?: Record<string, unknown>[]; total_entries?: number; pagination?: { total_entries?: number } }>('/mixed_people/api_search', body)
  if (r.error) return { people: [], total: 0, error: r.error }
  const people = (r.data?.people ?? []).map(p => ({
    id: String(p.id),
    first_name: String(p.first_name ?? ''),
    last_name_obfuscated: (p.last_name_obfuscated as string | undefined) ?? (p.last_name as string | undefined) ?? null,
    title: (p.title as string | undefined) ?? null,
    organization: ((p.organization as { name?: string } | undefined)?.name as string | undefined) ?? null,
    has_email: Boolean(p.has_email),
    last_refreshed_at: (p.last_refreshed_at as string | undefined) ?? null,
  }))
  return { people, total: r.data?.total_entries ?? r.data?.pagination?.total_entries ?? people.length }
}

/**
 * One credit when found. `revealPersonal` asks for personal addresses too;
 * Apollo refuses that for people in GDPR regions, which is the right default
 * for us as well.
 */
export async function matchPerson(
  admin: SupabaseClient,
  input: { apolloId?: string; linkedinUrl?: string; name?: string; domain?: string; jobId?: string | null; personId?: string | null; revealPersonal?: boolean },
): Promise<{ person?: ApolloPerson; credits: number; error?: string }> {
  const body: Record<string, unknown> = { reveal_personal_emails: Boolean(input.revealPersonal) }
  if (input.apolloId) body.id = input.apolloId
  else if (input.linkedinUrl) body.linkedin_url = input.linkedinUrl
  else if (input.name && input.domain) {
    body.name = input.name
    body.domain = input.domain
  } else return { credits: 0, error: 'nothing to match on' }

  const r = await post<{ person?: Record<string, unknown> }>('/people/match', body)
  const raw = r.data?.person
  const found = Boolean(raw && (raw.email || raw.linkedin_url || (raw.employment_history as unknown[])?.length))
  // Apollo charges only when it finds someone; a miss is a free lookup.
  const credits = found ? 1 : 0
  await admin.from('sourcing_lookups').insert({
    job_id: input.jobId ?? null,
    person_id: input.personId ?? null,
    provider: 'apollo',
    kind: 'match',
    credits,
    found,
    detail: r.error ? r.error.slice(0, 200) : found ? (raw?.email_status as string | undefined) ?? 'found' : 'no match',
  })
  if (r.error) return { credits: 0, error: r.error }
  if (!raw || !found) return { credits: 0 }

  const org = raw.organization as { name?: string; primary_domain?: string; website_url?: string } | undefined
  const person: ApolloPerson = {
    id: String(raw.id),
    name: String(raw.name ?? `${raw.first_name ?? ''} ${raw.last_name ?? ''}`.trim()),
    first_name: (raw.first_name as string | undefined) ?? null,
    last_name: (raw.last_name as string | undefined) ?? null,
    headline: (raw.headline as string | undefined) ?? null,
    title: (raw.title as string | undefined) ?? null,
    linkedin_url: (raw.linkedin_url as string | undefined) ?? null,
    github_url: (raw.github_url as string | undefined) ?? null,
    email: (raw.email as string | undefined) ?? null,
    email_status: (raw.email_status as string | undefined) ?? null,
    personal_emails: Array.isArray(raw.personal_emails) ? (raw.personal_emails as string[]).filter(Boolean) : [],
    city: (raw.city as string | undefined) ?? null,
    state: (raw.state as string | undefined) ?? null,
    country: (raw.country as string | undefined) ?? null,
    organization_name: org?.name ?? null,
    organization_domain: org?.primary_domain ?? (org?.website_url ? org.website_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null),
    employment_history: ((raw.employment_history as Record<string, unknown>[] | undefined) ?? []).map(h => ({
      title: (h.title as string | undefined) ?? null,
      organization_name: (h.organization_name as string | undefined) ?? null,
      start_date: (h.start_date as string | undefined) ?? null,
      end_date: (h.end_date as string | undefined) ?? null,
      current: Boolean(h.current),
      description: (h.description as string | undefined) ?? null,
    })),
  }
  return { person, credits }
}

/** Credits spent through this desk in the current calendar month, from our own record. */
export async function creditsThisMonth(admin: SupabaseClient): Promise<{ apollo: number; lookups: number; found: number }> {
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const { data } = await admin.from('sourcing_lookups').select('provider, credits, found').gte('created_at', start.toISOString())
  const rows = data ?? []
  return {
    apollo: rows.filter(r => r.provider === 'apollo').reduce((s, r) => s + (r.credits ?? 0), 0),
    lookups: rows.length,
    found: rows.filter(r => r.found).length,
  }
}
