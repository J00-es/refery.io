/**
 * Turning a URL segment back into a row, and old UUID links into short ones.
 *
 * Pages call `canonicalCompany` / `canonicalRole` / `canonicalCandidate` first. Given a
 * slug they return the ids the rest of the page works with; given a UUID (the
 * shape every link sent before 2026-09-11 has) they look the slug up and send
 * the browser to the short URL with a permanent redirect, so nothing anyone
 * has in an inbox breaks and nobody keeps two addresses for one thing.
 *
 * The lookup helpers at the bottom are for code that only holds ids (Slack
 * cards, email builders) and wants to print the short URL.
 */

// Server-side only: it queries with the admin client and calls next/navigation.
// (No `server-only` marker: the package is not installed and tests import through here.)
import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound, permanentRedirect } from 'next/navigation'
import { candidatePath, isUuid, rolePath, searchPath, APP_URL } from '@/lib/paths'

export interface CompanySlugRow {
  companyId: string
  slug: string
}

export interface RoleSlugRow {
  jobId: string
  companyId: string
  slug: string
  companySlug: string | null
}

export interface CandidateSlugRow {
  id: string
  slug: string
}

// ── lookups ────────────────────────────────────────────────────────────────

export async function findCompanyBySegment(admin: SupabaseClient, segment: string): Promise<CompanySlugRow | null> {
  const q = admin.from('client_companies').select('company_id, slug')
  const { data } = await (isUuid(segment) ? q.eq('company_id', segment) : q.eq('slug', segment)).maybeSingle()
  return data ? { companyId: data.company_id as string, slug: data.slug as string } : null
}

export async function findRoleBySegment(admin: SupabaseClient, segment: string): Promise<RoleSlugRow | null> {
  const q = admin.from('partner_roles_v').select('job_id, company_id, slug, company_slug')
  const { data } = await (isUuid(segment) ? q.eq('job_id', segment) : q.eq('slug', segment)).maybeSingle()
  return data
    ? { jobId: data.job_id as string, companyId: data.company_id as string, slug: data.slug as string, companySlug: (data.company_slug as string | null) ?? null }
    : null
}

export async function findCandidateBySegment(admin: SupabaseClient, segment: string): Promise<CandidateSlugRow | null> {
  const q = admin.from('candidates').select('id, slug')
  const { data } = await (isUuid(segment) ? q.eq('id', segment) : q.eq('slug', segment)).maybeSingle()
  return data ? { id: data.id as string, slug: data.slug as string } : null
}

// ── page entry points ──────────────────────────────────────────────────────

function withQuery(path: string, query?: Record<string, string | string[] | undefined> | URLSearchParams | null): string {
  if (!query) return path
  const params = query instanceof URLSearchParams ? query : new URLSearchParams()
  if (!(query instanceof URLSearchParams)) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue
      for (const one of Array.isArray(v) ? v : [v]) params.append(k, one)
    }
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

type Query = Record<string, string | string[] | undefined> | null

/**
 * Resolve /searches/<company>. 404s when unknown; redirects to the slug form
 * when the URL used the UUID. `tail` is whatever follows the segment
 * ("/brief"); `query` is re-attached after a redirect.
 */
export async function canonicalCompany(
  admin: SupabaseClient,
  segment: string,
  opts: { tail?: string; query?: Query } = {},
): Promise<{ companyId: string; companySlug: string }> {
  const company = await findCompanyBySegment(admin, segment)
  if (!company) notFound()
  if (isUuid(segment)) permanentRedirect(withQuery(searchPath(company.slug, opts.tail ?? ''), opts.query))
  return { companyId: company.companyId, companySlug: company.slug }
}

/**
 * Resolve /searches/<company>/roles/<role>. 404s when either half is unknown
 * or the role is not the company's (a scout on company A must not read
 * company B's mandate by editing the path). Redirects when either segment
 * is a UUID where a slug now exists.
 */
export async function canonicalRole(
  admin: SupabaseClient,
  params: { companyId: string; jobId: string },
  opts: { tail?: string; query?: Query } = {},
): Promise<{ companyId: string; companySlug: string; jobId: string; roleSlug: string }> {
  const [company, role] = await Promise.all([
    findCompanyBySegment(admin, params.companyId),
    findRoleBySegment(admin, params.jobId),
  ])
  if (!company || !role || role.companyId !== company.companyId) notFound()
  if (isUuid(params.companyId) || isUuid(params.jobId)) {
    permanentRedirect(withQuery(rolePath(company.slug, role.slug, opts.tail ?? ''), opts.query))
  }
  return { companyId: company.companyId, companySlug: company.slug, jobId: role.jobId, roleSlug: role.slug }
}

/** Resolve /candidates/<candidate>[tail]; redirects a UUID to the slug. */
export async function canonicalCandidate(
  admin: SupabaseClient,
  segment: string,
  opts: { tail?: string; query?: Query } = {},
): Promise<CandidateSlugRow> {
  const row = await findCandidateBySegment(admin, segment)
  if (!row) notFound()
  if (isUuid(segment)) permanentRedirect(withQuery(candidatePath(row.slug, opts.tail ?? ''), opts.query))
  return row
}

// ── short URLs for code that only holds ids ────────────────────────────────

/**
 * Absolute short URLs for a search and, when given, one of its roles. Falls
 * back to the id form when the row is gone, which the page then 404s
 * honestly rather than this throwing inside an email builder.
 */
export async function deskUrls(
  admin: SupabaseClient,
  ids: { companyId: string; jobId?: string | null },
): Promise<{ search: string; role: string | null; companySlug: string; roleSlug: string | null }> {
  if (ids.jobId) {
    const role = await findRoleBySegment(admin, ids.jobId)
    if (role) {
      const companySeg = role.companySlug ?? ids.companyId
      return {
        search: `${APP_URL}${searchPath(companySeg)}`,
        role: `${APP_URL}${rolePath(companySeg, role.slug)}`,
        companySlug: companySeg,
        roleSlug: role.slug,
      }
    }
  }
  const company = await findCompanyBySegment(admin, ids.companyId)
  const companySeg = company?.slug ?? ids.companyId
  return {
    search: `${APP_URL}${searchPath(companySeg)}`,
    role: ids.jobId ? `${APP_URL}${rolePath(companySeg, ids.jobId)}` : null,
    companySlug: companySeg,
    roleSlug: null,
  }
}

/** Absolute short URL for one candidate, by id. */
export async function candidateUrlById(admin: SupabaseClient, candidateId: string, tail = ''): Promise<string> {
  const row = await findCandidateBySegment(admin, candidateId)
  return `${APP_URL}${candidatePath(row?.slug ?? candidateId, tail)}`
}

/** Slugs for many candidates at once, for lists that only hold ids. */
export async function candidateSlugs(admin: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (!unique.length) return new Map()
  const { data } = await admin.from('candidates').select('id, slug').in('id', unique)
  return new Map((data ?? []).map(r => [r.id as string, r.slug as string]))
}
