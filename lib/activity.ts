import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Who is on the site, and what they do.
 *
 * Sign-ins were always recorded (auth.sessions), but nothing read them, and
 * nothing recorded which pages a signed-in person opened. This module is the
 * shared vocabulary for both: the page-visit log written by the beacon, the
 * presence read over the auth tables, and the plain-English summaries the
 * Slack feed and the daily digest print. No model call anywhere: a route is
 * labelled by a static table, and a visit is summarised by counting.
 *
 * Everything here is service-role: user_activity has RLS with no policies,
 * and the two SQL functions may only be executed by service_role.
 */

export const ACTIVITY_RETENTION_DAYS = 90

/** Someone counts as gone quiet after this long without a sign-in or a page view. */
export const QUIET_AFTER_DAYS = 14

// ── routes ───────────────────────────────────────────────────────────────────

/**
 * Every signed-in page, most specific first. `route` is the pattern that
 * groups visits, `label` is what a human reads in the summary, and `noun`
 * is what gets counted ("viewed 3 searches").
 */
interface RouteSpec {
  route: string
  match: RegExp
  label: string
  /** Singular noun for counting distinct entities; omitted for pages without an entity. */
  noun?: string
  /** Which capture group holds the entity id. */
  idGroup?: number
}

const ROUTES: RouteSpec[] = [
  { route: '/searches/[companyId]/roles/[jobId]/coverage', match: /^\/searches\/([^/]+)\/roles\/([^/]+)\/coverage$/, label: 'checked coverage on a role', noun: 'role', idGroup: 2 },
  { route: '/searches/[companyId]/roles/[jobId]', match: /^\/searches\/([^/]+)\/roles\/([^/]+)$/, label: 'opened a role', noun: 'role', idGroup: 2 },
  { route: '/searches/[companyId]/brief', match: /^\/searches\/([^/]+)\/brief$/, label: 'read a brief', noun: 'brief', idGroup: 1 },
  { route: '/searches/coverage', match: /^\/searches\/coverage$/, label: 'looked at coverage' },
  { route: '/searches/pipeline', match: /^\/searches\/pipeline$/, label: 'checked the pipeline' },
  { route: '/searches/requests', match: /^\/searches\/requests$/, label: 'looked at access requests' },
  { route: '/searches/[companyId]', match: /^\/searches\/([^/]+)$/, label: 'viewed a search', noun: 'search', idGroup: 1 },
  { route: '/searches', match: /^\/searches$/, label: 'browsed searches' },
  { route: '/candidates/new', match: /^\/candidates\/new$/, label: 'started adding a candidate' },
  { route: '/candidates/bulk', match: /^\/candidates\/bulk$/, label: 'opened bulk upload' },
  { route: '/candidates/[id]/edit', match: /^\/candidates\/([^/]+)\/edit$/, label: 'edited a candidate', noun: 'candidate', idGroup: 1 },
  { route: '/candidates/[id]', match: /^\/candidates\/([^/]+)$/, label: 'opened a candidate', noun: 'candidate', idGroup: 1 },
  { route: '/candidates', match: /^\/candidates$/, label: 'browsed candidates' },
  { route: '/jobs/[id]', match: /^\/jobs\/([^/]+)(?:\/edit)?$/, label: 'opened a job', noun: 'job', idGroup: 1 },
  { route: '/jobs', match: /^\/jobs(?:\/new)?$/, label: 'browsed jobs' },
  { route: '/companies/[id]', match: /^\/companies\/(?:view\/)?([^/]+)(?:\/edit)?$/, label: 'opened a company', noun: 'company', idGroup: 1 },
  { route: '/companies', match: /^\/companies(?:\/new)?$/, label: 'browsed companies' },
  { route: '/talents/[id]', match: /^\/talents\/([^/]+)(?:\/edit)?$/, label: 'opened a talent profile', noun: 'profile', idGroup: 1 },
  { route: '/talents', match: /^\/talents$/, label: 'browsed talents' },
  { route: '/recruiters/[id]', match: /^\/recruiters\/([^/]+)(?:\/edit)?$/, label: 'opened a recruiter', noun: 'recruiter', idGroup: 1 },
  { route: '/recruiters', match: /^\/recruiters$/, label: 'browsed recruiters' },
  { route: '/outreach', match: /^\/outreach(?:\/.*)?$/, label: 'worked in outreach' },
  { route: '/firm', match: /^\/firm(?:\/.*)?$/, label: 'looked at their firm' },
  { route: '/profile', match: /^\/profile$/, label: 'edited their profile' },
  { route: '/dashboard/pipeline/[stage]', match: /^\/dashboard\/pipeline\/([^/]+)$/, label: 'drilled into the pipeline', noun: 'stage', idGroup: 1 },
  { route: '/dashboard', match: /^\/dashboard$/, label: 'landed on the dashboard' },
  { route: '/admin', match: /^\/admin(?:\/.*)?$/, label: 'used the admin console' },
  { route: '/agreement/[companyId]', match: /^\/agreement\/([^/]+)$/, label: 'opened an agreement', noun: 'agreement', idGroup: 1 },
]

export interface ResolvedRoute {
  route: string
  entityId: string | null
}

/**
 * The pattern a concrete path belongs to, or null for anything that is not a
 * signed-in page. Query strings and trailing slashes are ignored.
 */
export function resolveRoute(path: string): ResolvedRoute | null {
  const clean = path.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/'
  for (const spec of ROUTES) {
    const m = spec.match.exec(clean)
    if (!m) continue
    const entityId = spec.idGroup ? m[spec.idGroup] ?? null : null
    return { route: spec.route, entityId }
  }
  return null
}

function specFor(route: string): RouteSpec | undefined {
  return ROUTES.find((r) => r.route === route)
}

// ── summaries ────────────────────────────────────────────────────────────────

export interface ActivityRow {
  route: string
  entity_id: string | null
  at: string
}

/**
 * "viewed 3 searches, opened a candidate, checked the pipeline"
 *
 * Distinct entities are counted rather than page loads, so a search someone
 * refreshed five times reads as one search. The dashboard landing is dropped
 * whenever anything else happened, since everyone starts there. Ordered by
 * how much of the visit each thing took, most first.
 */
export function summariseActivity(rows: ActivityRow[], max = 4): string | null {
  if (rows.length === 0) return null

  const seen = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = seen.get(r.route) ?? new Set<string>()
    set.add(r.entity_id ?? '')
    seen.set(r.route, set)
  }

  const parts: Array<{ text: string; weight: number }> = []
  for (const [route, ids] of seen) {
    if (route === '/dashboard' && seen.size > 1) continue
    const spec = specFor(route)
    if (!spec) continue
    const n = ids.size
    if (spec.noun && n > 1) {
      // "opened a candidate" -> "opened 3 candidates"
      const verb = spec.label.replace(/ (a|an) [a-z ]+$/, '')
      parts.push({ text: `${verb} ${n} ${plural(spec.noun)}`, weight: n })
    } else {
      parts.push({ text: spec.label, weight: n })
    }
  }
  parts.sort((a, b) => b.weight - a.weight)
  const shown = parts.slice(0, max).map((p) => p.text)
  const rest = parts.length - shown.length
  return shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '')
}

function plural(noun: string): string {
  if (noun.endsWith('y')) return `${noun.slice(0, -1)}ies`
  if (noun.endsWith('h') || noun.endsWith('s')) return `${noun}es`
  return `${noun}s`
}

/** "2h ago", "3d ago", "just now". Coarse on purpose: this is a glance, not a log. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never'
  const ms = now - new Date(iso).getTime()
  const min = Math.floor(ms / 60_000)
  if (min < 2) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 14) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (d < 60) return `${w}w ago`
  return `${Math.floor(d / 30)}mo ago`
}

// ── presence ─────────────────────────────────────────────────────────────────

export interface Presence {
  user_id: string
  email: string
  first_sign_in_at: string | null
  last_sign_in_at: string | null
  /** Latest of: sign-in, token refresh, page view. */
  last_active_at: string | null
  sign_ins_7d: number
}

/** Presence for every auth user, keyed by auth id. Service-role only. */
export async function loadPresence(admin: SupabaseClient): Promise<Map<string, Presence>> {
  const { data, error } = await admin.rpc('user_presence')
  if (error) {
    console.error('[activity] user_presence failed:', error.message)
    return new Map()
  }
  const map = new Map<string, Presence>()
  for (const row of (data ?? []) as Presence[]) map.set(row.user_id, row)
  return map
}

export interface SignIn {
  user_id: string
  email: string
  signed_in_at: string
  user_agent: string | null
}

export async function loadSignInsSince(admin: SupabaseClient, since: Date): Promise<SignIn[]> {
  const { data, error } = await admin.rpc('recent_sign_ins', { p_since: since.toISOString() })
  if (error) {
    console.error('[activity] recent_sign_ins failed:', error.message)
    return []
  }
  return (data ?? []) as SignIn[]
}

/**
 * Page views for a set of people since a moment, grouped by user.
 * Bounded by the retention window, so the read never grows past 90 days.
 */
export async function loadActivity(
  admin: SupabaseClient,
  userIds: string[],
  since: Date,
): Promise<Map<string, ActivityRow[]>> {
  const out = new Map<string, ActivityRow[]>()
  if (userIds.length === 0) return out
  const { data, error } = await admin
    .from('user_activity')
    .select('user_id, route, entity_id, at')
    .in('user_id', userIds)
    .gte('at', since.toISOString())
    .order('at', { ascending: true })
    .limit(5000)
  if (error) {
    console.error('[activity] user_activity read failed:', error.message)
    return out
  }
  for (const r of data ?? []) {
    const list = out.get(r.user_id) ?? []
    list.push({ route: r.route, entity_id: r.entity_id, at: r.at })
    out.set(r.user_id, list)
  }
  return out
}

/** A browser string reduced to the one word that matters in a feed. */
export function deviceWord(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? '').toLowerCase()
  if (!ua) return null
  if (/iphone|android.*mobile|windows phone/.test(ua)) return 'phone'
  if (/ipad|android(?!.*mobile)|tablet/.test(ua)) return 'tablet'
  return null
}
