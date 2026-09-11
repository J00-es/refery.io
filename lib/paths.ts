/**
 * The URLs people see, built in one place.
 *
 * Convention (since 2026-09-11): a URL segment is a short slug, never a UUID.
 *
 *   /searches/<company slug>                      k7m2qxf
 *   /searches/<company slug>/roles/<role slug>    applied-ai-engineer-7kq3
 *   /candidates/<candidate slug>                  frznf6z
 *
 * Company and candidate slugs are random on purpose. A partner who is not on
 * a search sees the client anonymised, so the client's name cannot sit in the
 * address bar; and a candidate's name never belongs in a URL. The role slug
 * carries the title, which the anonymised card already shows.
 *
 * Slugs are minted by the database (see 20260911180000_short_slugs.sql), so a
 * row always has one. Every builder here still accepts a row without a slug
 * and falls back to the id, because the pages resolve both and redirect the
 * UUID form to the short one. Old links in sent emails keep working.
 *
 * New surfaces: add a `slug` column with `default public.short_slug(7)` (or a
 * title-based trigger like partner_roles_set_slug), a builder here, and a
 * resolver in lib/slugs.ts. Never put a UUID in a path a person will read.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && UUID_RE.test(value)
}

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

/** A row that carries an id and, usually, a slug. */
export interface SlugRef {
  id: string
  slug?: string | null
}

function segment(ref: SlugRef | string): string {
  if (typeof ref === 'string') return ref
  return ref.slug?.trim() || ref.id
}

/** /searches/<company> */
export function searchPath(company: SlugRef | string, tail = ''): string {
  return `/searches/${segment(company)}${tail}`
}

/** /searches/<company>/roles/<role> */
export function rolePath(company: SlugRef | string, role: SlugRef | string, tail = ''): string {
  return `/searches/${segment(company)}/roles/${segment(role)}${tail}`
}

/**
 * The same, straight from a partner_roles_v row (or anything shaped like one:
 * job_id + company_id, with slug + company_slug when the query selected them).
 */
export function rolePathFrom(
  row: { job_id: string; company_id: string; slug?: string | null; company_slug?: string | null },
  tail = '',
): string {
  return rolePath({ id: row.company_id, slug: row.company_slug }, { id: row.job_id, slug: row.slug }, tail)
}

/** /candidates/<candidate> */
export function candidatePath(candidate: SlugRef | string, tail = ''): string {
  return `/candidates/${segment(candidate)}${tail}`
}

export const searchUrl = (company: SlugRef | string, tail = '') => `${APP_URL}${searchPath(company, tail)}`
export const roleUrl = (company: SlugRef | string, role: SlugRef | string, tail = '') => `${APP_URL}${rolePath(company, role, tail)}`
export const candidateUrl = (candidate: SlugRef | string, tail = '') => `${APP_URL}${candidatePath(candidate, tail)}`
