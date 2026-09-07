import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalEmail } from './funnel'
import {
  loadActivity,
  loadPresence,
  loadSignInsSince,
  type ActivityRow,
  type Presence,
} from './activity'

/**
 * The pulse: who is on the site, what they did, and what it adds up to.
 *
 * Three readers feed two Slack cards (app/api/cron/pulse):
 *
 *   visits    a person is "in" when a session starts or when a page view
 *             follows 30 minutes of silence. Sessions alone miss everyone who
 *             stays signed in on a laptop, which is most of the desk.
 *   writes    the things that count as doing something: a candidate
 *             uploaded, a submission, a search accepted or declined, a
 *             question asked, access requested. Read from the tables that
 *             record them, never inferred from page views.
 *   waiting   what is sitting on a person: proposals they have not answered.
 *
 * Everything is counting. No model is called anywhere in this file.
 */

/** Silence this long ends a visit; the next page view starts a new one. */
export const VISIT_GAP_MS = 30 * 60 * 1000

/** A page view is credited with time until the next one, at most this much. */
const DWELL_CAP_MS = 10 * 60 * 1000

/** The last page of a visit has no successor to measure against. */
const DWELL_TAIL_MS = 60 * 1000

/** No write in this long, while still visiting, is the pattern worth naming. */
export const QUIET_WRITE_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

// ── people ───────────────────────────────────────────────────────────────────

export interface Person {
  userId: string
  adminId: string
  email: string
  name: string
  role: string
  status: string
  isBeta: boolean
  joinedAt: string
}

/** Every partner-side account with an auth id, staff and test rows excluded. */
export async function loadPeople(admin: SupabaseClient): Promise<Map<string, Person>> {
  const { data } = await admin
    .from('users_admin')
    .select('id, user_id, email, full_name, role, status, is_beta, created_at')
    .not('user_id', 'is', null)
  const out = new Map<string, Person>()
  for (const r of data ?? []) {
    if (!r.user_id || isInternalEmail(r.email)) continue
    out.set(r.user_id, {
      userId: r.user_id,
      adminId: r.id,
      email: r.email,
      name: (r.full_name ?? '').trim() || r.email,
      role: r.role,
      status: r.status,
      isBeta: Boolean(r.is_beta),
      joinedAt: r.created_at,
    })
  }
  return out
}

// ── visits ───────────────────────────────────────────────────────────────────

export interface Visit {
  userId: string
  startedAt: string
  /** Set when the visit began with a fresh sign-in rather than a returning tab. */
  signedIn: boolean
  userAgent: string | null
  rows: ActivityRow[]
}

/**
 * Visit starts in [since, until): a session created in the window, or a page
 * view in the window with no page view or session in the 30 minutes before it.
 * A person continuing a visit that was already announced is not a new visit.
 */
export async function loadVisits(
  admin: SupabaseClient,
  people: Map<string, Person>,
  since: Date,
  until: Date,
): Promise<Visit[]> {
  const signIns = (await loadSignInsSince(admin, since)).filter(
    (s) => people.has(s.user_id) && new Date(s.signed_in_at) < until,
  )
  const lookback = new Date(since.getTime() - VISIT_GAP_MS)
  const activity = await loadActivity(admin, [...people.keys()], lookback)

  const candidates = new Set<string>([...signIns.map((s) => s.user_id), ...activity.keys()])
  const visits: Visit[] = []

  for (const userId of candidates) {
    const rows = (activity.get(userId) ?? []).filter((r) => new Date(r.at) < until)
    const inWindow = rows.filter((r) => new Date(r.at) >= since)
    const mySignIns = signIns.filter((s) => s.user_id === userId)

    let start: Date | null = null
    let signedIn = false
    let userAgent: string | null = null

    if (mySignIns.length) {
      start = new Date(mySignIns[0].signed_in_at)
      signedIn = true
      userAgent = mySignIns[0].user_agent
    }
    if (inWindow.length) {
      const first = new Date(inWindow[0].at)
      if (!start || first < start) {
        // A page view before any sign-in in the window: only a visit start if
        // nothing happened in the half hour before it.
        const prior = rows.filter((r) => {
          const t = new Date(r.at)
          return t < first && first.getTime() - t.getTime() < VISIT_GAP_MS
        })
        if (prior.length === 0) {
          start = first
        } else if (!start) {
          continue // still the visit announced last time
        }
      }
    }
    if (!start) continue

    visits.push({
      userId,
      startedAt: start.toISOString(),
      signedIn,
      userAgent,
      rows: rows.filter((r) => new Date(r.at) >= start!),
    })
  }

  visits.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
  return visits
}

/** Distinct visits in a set of timestamps: a new one after each 30-minute gap. */
export function countVisits(timestamps: string[]): number {
  const ts = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b)
  let n = 0
  let last = -Infinity
  for (const t of ts) {
    if (t - last > VISIT_GAP_MS) n++
    last = t
  }
  return n
}

/** Visits in the last 7 days, from sign-ins and page views together. */
export async function loadVisitsThisWeek(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 7 * DAY_MS)
  const [signIns, activity] = await Promise.all([
    loadSignInsSince(admin, since),
    loadActivity(admin, userIds, since),
  ])
  const stamps = new Map<string, string[]>()
  for (const s of signIns) {
    if (!userIds.includes(s.user_id)) continue
    stamps.set(s.user_id, [...(stamps.get(s.user_id) ?? []), s.signed_in_at])
  }
  for (const [userId, rows] of activity) {
    stamps.set(userId, [...(stamps.get(userId) ?? []), ...rows.map((r) => r.at)])
  }
  const out = new Map<string, number>()
  for (const [userId, list] of stamps) out.set(userId, countVisits(list))
  return out
}

// ── dwell ────────────────────────────────────────────────────────────────────

export interface Dwell {
  route: string
  entityId: string | null
  ms: number
  views: number
}

/** Time per page, from the gaps between views. Rows must belong to one person. */
export function dwellByPage(rows: ActivityRow[]): Dwell[] {
  const sorted = [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  const acc = new Map<string, Dwell>()
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    const next = sorted[i + 1]
    let ms = DWELL_TAIL_MS
    if (next) {
      const gap = new Date(next.at).getTime() - new Date(r.at).getTime()
      ms = gap > VISIT_GAP_MS ? DWELL_TAIL_MS : Math.min(gap, DWELL_CAP_MS)
    }
    const key = `${r.route}|${r.entity_id ?? ''}`
    const d = acc.get(key) ?? { route: r.route, entityId: r.entity_id, ms: 0, views: 0 }
    d.ms += ms
    d.views += 1
    acc.set(key, d)
  }
  return [...acc.values()]
}

export type Area = 'Searches' | 'Pipeline' | 'Candidates' | 'Dashboard' | 'Jobs' | 'Companies' | 'Other'

export function areaOf(route: string): Area {
  if (route.startsWith('/searches/pipeline')) return 'Pipeline'
  if (route.startsWith('/searches')) return 'Searches'
  if (route.startsWith('/candidates')) return 'Candidates'
  if (route.startsWith('/dashboard')) return 'Dashboard'
  if (route.startsWith('/jobs')) return 'Jobs'
  if (route.startsWith('/companies')) return 'Companies'
  return 'Other'
}

// ── entity names ─────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function entityKind(route: string): 'company' | 'job' | 'candidate' | null {
  if (route.startsWith('/searches/[companyId]/roles')) return 'job'
  if (route.startsWith('/searches/[companyId]')) return 'company'
  if (route.startsWith('/companies/[id]')) return 'company'
  if (route.startsWith('/jobs/[id]')) return 'job'
  if (route.startsWith('/candidates/[id]')) return 'candidate'
  return null
}

/** Names for every entity referenced in the rows, keyed by id. */
export async function loadEntityNames(
  admin: SupabaseClient,
  rows: ActivityRow[],
): Promise<Map<string, string>> {
  const ids: Record<'company' | 'job' | 'candidate', Set<string>> = {
    company: new Set(),
    job: new Set(),
    candidate: new Set(),
  }
  for (const r of rows) {
    const kind = entityKind(r.route)
    if (kind && r.entity_id && UUID.test(r.entity_id)) ids[kind].add(r.entity_id)
  }
  const names = new Map<string, string>()
  const fetchNames = async (table: string, column: string, set: Set<string>) => {
    if (set.size === 0) return
    const { data } = await admin.from(table).select(`id, ${column}`).in('id', [...set])
    for (const row of (data ?? []) as unknown as Array<Record<string, string | null>>) {
      if (row.id && row[column]) names.set(row.id, row[column] as string)
    }
  }
  await Promise.all([
    fetchNames('companies', 'name', ids.company),
    fetchNames('jobs', 'title', ids.job),
    fetchNames('candidates', 'name', ids.candidate),
  ])
  return names
}

// ── describing a visit ───────────────────────────────────────────────────────

/** Short noun phrases for pages without an entity. */
const SHORT: Record<string, string> = {
  '/searches': 'browsed searches',
  '/searches/pipeline': 'pipeline',
  '/searches/coverage': 'coverage',
  '/searches/requests': 'access requests',
  '/candidates': 'candidates list',
  '/candidates/new': 'opened add candidate',
  '/candidates/bulk': 'opened bulk upload',
  '/jobs': 'jobs list',
  '/companies': 'companies list',
  '/talents': 'talents',
  '/recruiters': 'recruiters',
  '/outreach': 'outreach',
  '/firm': 'their firm',
  '/profile': 'their profile',
  '/dashboard': 'dashboard',
  '/dashboard/pipeline/[stage]': 'a pipeline stage',
  '/admin': 'admin',
}

function minutes(ms: number): string | null {
  const m = Math.round(ms / 60_000)
  return m >= 1 ? `${m} min` : null
}

function pageLabel(d: Dwell, names: Map<string, string>): string {
  const name = d.entityId ? names.get(d.entityId) : undefined
  const kind = entityKind(d.route)
  if (name && kind === 'company') {
    return d.route.endsWith('/brief') ? `${name} brief` : `${name} search`
  }
  if (name && kind === 'job') return `${name} role`
  if (name && kind === 'candidate') return name
  return SHORT[d.route] ?? d.route
}

/**
 * "Alcor Labs search 5 min · Founding AI Engineer role · pipeline 3 min"
 *
 * Ordered by time spent. The dashboard is dropped when anything else was
 * opened, since everyone lands there. At most five items.
 */
export function describeVisit(
  rows: ActivityRow[],
  names: Map<string, string>,
  opts: { uploadedNothing?: boolean } = {},
): string | null {
  if (rows.length === 0) return null
  let pages = dwellByPage(rows)
  if (pages.length > 1) pages = pages.filter((p) => p.route !== '/dashboard')
  // Named things first (a search, a role, a candidate), then the list pages;
  // within each, by time spent. "Alcor Labs search 5 min" tells Lily more
  // than "browsed searches 2 min" ever will.
  const named = (p: Dwell) => (p.entityId && names.has(p.entityId) ? 0 : 1)
  pages.sort((a, b) => named(a) - named(b) || b.ms - a.ms)

  const parts = pages.slice(0, 5).map((p) => {
    const label = pageLabel(p, names)
    const m = minutes(p.ms)
    return m && p.ms >= 2 * DWELL_TAIL_MS ? `${label} ${m}` : label
  })
  const openedUpload = rows.some((r) => r.route === '/candidates/bulk' || r.route === '/candidates/new')
  if (openedUpload && opts.uploadedNothing) {
    const i = parts.findIndex((p) => p.startsWith('opened bulk upload') || p.startsWith('opened add candidate'))
    if (i >= 0) parts[i] = `${parts[i]}, uploaded nothing`
  }
  const rest = pages.length - Math.min(pages.length, 5)
  return parts.join(' · ') + (rest > 0 ? ` · and ${rest} more` : '')
}

// ── writes ───────────────────────────────────────────────────────────────────

export type WriteKind = 'candidate' | 'submission' | 'accepted' | 'declined' | 'question' | 'access'

export interface Write {
  userId: string
  at: string
  kind: WriteKind
  /** Candidate name, job title or company name, whichever the kind needs. */
  what: string | null
  company: string | null
}

type JobRef = { title: string | null; company_name: string | null } | null
type NameRef = { name: string | null } | null

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/** Everything these people did in [since, until), from the tables that record it. */
export async function loadWrites(
  admin: SupabaseClient,
  userIds: string[],
  since: Date,
  until: Date = new Date(),
): Promise<Map<string, Write[]>> {
  const out = new Map<string, Write[]>()
  if (userIds.length === 0) return out
  const s = since.toISOString()
  const u = until.toISOString()
  const list = `(${userIds.join(',')})`

  const [cands, subs, accepted, declined, questions, access] = await Promise.all([
    admin
      .from('candidates')
      .select('name, created_at, created_by_user_id, uploaded_by_user_id')
      .gte('created_at', s)
      .lt('created_at', u)
      .or(`created_by_user_id.in.${list},uploaded_by_user_id.in.${list}`),
    admin
      .from('role_submissions')
      .select('submitted_by_user_id, created_at, jobs(title, company_name), candidates(name)')
      .gte('created_at', s)
      .lt('created_at', u)
      .in('submitted_by_user_id', userIds),
    admin
      .from('search_assignments')
      .select('user_id, confirmed_at, jobs(title, company_name)')
      .gte('confirmed_at', s)
      .lt('confirmed_at', u)
      .in('user_id', userIds),
    admin
      .from('search_assignments')
      .select('user_id, declined_at, jobs(title, company_name)')
      .gte('declined_at', s)
      .lt('declined_at', u)
      .in('user_id', userIds),
    admin
      .from('search_questions')
      .select('asked_by, created_at, jobs(title, company_name)')
      .gte('created_at', s)
      .lt('created_at', u)
      .in('asked_by', userIds),
    admin
      .from('company_access_requests')
      .select('user_id, created_at, companies(name)')
      .gte('created_at', s)
      .lt('created_at', u)
      .in('user_id', userIds),
  ])

  const push = (w: Write) => out.set(w.userId, [...(out.get(w.userId) ?? []), w])

  for (const c of cands.data ?? []) {
    const userId = c.created_by_user_id ?? c.uploaded_by_user_id
    if (!userId || !userIds.includes(userId)) continue
    push({ userId, at: c.created_at, kind: 'candidate', what: c.name, company: null })
  }
  for (const r of subs.data ?? []) {
    const job = one(r.jobs as JobRef | JobRef[])
    const cand = one(r.candidates as NameRef | NameRef[])
    push({
      userId: r.submitted_by_user_id,
      at: r.created_at,
      kind: 'submission',
      what: cand?.name ?? null,
      company: job ? [job.company_name, job.title].filter(Boolean).join(', ') : null,
    })
  }
  for (const a of accepted.data ?? []) {
    const job = one(a.jobs as JobRef | JobRef[])
    push({ userId: a.user_id, at: a.confirmed_at, kind: 'accepted', what: job?.title ?? null, company: job?.company_name ?? null })
  }
  for (const d of declined.data ?? []) {
    const job = one(d.jobs as JobRef | JobRef[])
    push({ userId: d.user_id, at: d.declined_at, kind: 'declined', what: job?.title ?? null, company: job?.company_name ?? null })
  }
  for (const q of questions.data ?? []) {
    const job = one(q.jobs as JobRef | JobRef[])
    push({ userId: q.asked_by, at: q.created_at, kind: 'question', what: job?.title ?? null, company: job?.company_name ?? null })
  }
  for (const a of access.data ?? []) {
    const co = one(a.companies as NameRef | NameRef[])
    push({ userId: a.user_id, at: a.created_at, kind: 'access', what: null, company: co?.name ?? null })
  }
  return out
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "uploaded 2 candidates · accepted the NewForm search · submitted Marta Ruiz to Livo, Product Manager" */
export function describeWrites(writes: Write[]): string | null {
  if (writes.length === 0) return null
  const parts: string[] = []
  const cands = writes.filter((w) => w.kind === 'candidate')
  if (cands.length === 1 && cands[0].what) parts.push(`uploaded ${cands[0].what}`)
  else if (cands.length) parts.push(`uploaded ${plural(cands.length, 'candidate')}`)

  for (const w of writes.filter((w) => w.kind === 'submission')) {
    parts.push(`submitted ${w.what ?? 'a candidate'}${w.company ? ` to ${w.company}` : ''}`)
  }
  const acc = writes.filter((w) => w.kind === 'accepted')
  if (acc.length === 1) parts.push(`accepted the ${acc[0].company ?? acc[0].what ?? ''} search`.replace('  ', ' '))
  else if (acc.length) parts.push(`accepted ${plural(acc.length, 'search', 'searches')}`)
  const dec = writes.filter((w) => w.kind === 'declined')
  if (dec.length === 1) parts.push(`declined the ${dec[0].company ?? dec[0].what ?? ''} search`.replace('  ', ' '))
  else if (dec.length) parts.push(`declined ${plural(dec.length, 'search', 'searches')}`)
  for (const w of writes.filter((w) => w.kind === 'question')) {
    parts.push(`asked a question${w.company ? ` on ${w.company}` : ''}`)
  }
  for (const w of writes.filter((w) => w.kind === 'access')) {
    parts.push(`asked for access${w.company ? ` to ${w.company}` : ''}`)
  }
  return parts.join(' · ')
}

// ── waiting on them ──────────────────────────────────────────────────────────

export interface Waiting {
  count: number
  oldest: string
  expires: string | null
  companies: string[]
}

/** Proposed searches nobody has answered, per person. */
export async function loadWaiting(admin: SupabaseClient, userIds: string[]): Promise<Map<string, Waiting>> {
  const out = new Map<string, Waiting>()
  if (userIds.length === 0) return out
  const { data } = await admin
    .from('search_assignments')
    .select('user_id, proposed_at, expires_at, jobs(company_name)')
    .eq('status', 'proposed')
    .in('user_id', userIds)
  for (const r of data ?? []) {
    const job = one(r.jobs as { company_name: string | null } | { company_name: string | null }[] | null)
    const w: Waiting = out.get(r.user_id) ?? { count: 0, oldest: r.proposed_at, expires: null, companies: [] }
    w.count += 1
    if (r.proposed_at < w.oldest) w.oldest = r.proposed_at
    if (r.expires_at && (!w.expires || r.expires_at < w.expires)) w.expires = r.expires_at
    if (job?.company_name && !w.companies.includes(job.company_name)) w.companies.push(job.company_name)
    out.set(r.user_id, w)
  }
  return out
}

/** Candidates a person has ever put in, and in the last 30 days. */
export async function loadCandidateCounts(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, { ever: number; last30: number }>> {
  const out = new Map<string, { ever: number; last30: number }>()
  if (userIds.length === 0) return out
  const list = `(${userIds.join(',')})`
  const { data } = await admin
    .from('candidates')
    .select('created_at, created_by_user_id, uploaded_by_user_id')
    .or(`created_by_user_id.in.${list},uploaded_by_user_id.in.${list}`)
  const cutoff = Date.now() - 30 * DAY_MS
  for (const c of data ?? []) {
    const userId = c.created_by_user_id ?? c.uploaded_by_user_id
    if (!userId) continue
    const n = out.get(userId) ?? { ever: 0, last30: 0 }
    n.ever += 1
    if (new Date(c.created_at).getTime() > cutoff) n.last30 += 1
    out.set(userId, n)
  }
  return out
}

/** Has this person ever had a search in 'working'? Used for "first search accepted". */
export async function loadEverWorking(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  if (userIds.length === 0) return out
  const { data } = await admin
    .from('search_assignments')
    .select('user_id')
    .in('user_id', userIds)
    .in('status', ['working', 'paused'])
  for (const r of data ?? []) out.add(r.user_id)
  return out
}

// ── needs you ────────────────────────────────────────────────────────────────

export interface NeedsYou {
  userId: string
  reason: string
  since: string
}

/** Things waiting on the super admin about these people. */
export async function loadNeedsYou(
  admin: SupabaseClient,
  people: Map<string, Person>,
  userIds: string[],
): Promise<Map<string, NeedsYou[]>> {
  const out = new Map<string, NeedsYou[]>()
  const push = (n: NeedsYou) => out.set(n.userId, [...(out.get(n.userId) ?? []), n])
  for (const id of userIds) {
    const p = people.get(id)
    if (p?.status === 'pending') push({ userId: id, reason: 'waiting for your approval', since: p.joinedAt })
  }
  if (userIds.length) {
    const [access, questions] = await Promise.all([
      admin
        .from('company_access_requests')
        .select('user_id, created_at, companies(name)')
        .eq('status', 'pending')
        .in('user_id', userIds),
      admin
        .from('search_questions')
        .select('asked_by, created_at, jobs(company_name)')
        .is('answered_at', null)
        .in('asked_by', userIds),
    ])
    for (const a of access.data ?? []) {
      const co = one(a.companies as NameRef | NameRef[])
      push({ userId: a.user_id, reason: `asked for access to ${co?.name ?? 'a search'}`, since: a.created_at })
    }
    for (const q of questions.data ?? []) {
      const job = one(q.jobs as { company_name: string | null } | { company_name: string | null }[] | null)
      push({ userId: q.asked_by, reason: `asked a question on ${job?.company_name ?? 'a search'}, unanswered`, since: q.created_at })
    }
  }
  return out
}

// ── formatting ───────────────────────────────────────────────────────────────

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** "31 Aug", "7 Sep". */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`
}

/** Slack renders this in each reader's own timezone. */
export function slackTime(iso: string): string {
  const ts = Math.floor(new Date(iso).getTime() / 1000)
  const fallback = new Date(iso).toISOString().slice(11, 16) + ' UTC'
  return `<!date^${ts}^{time}|${fallback}>`
}

export function slackDay(iso: string): string {
  const ts = Math.floor(new Date(iso).getTime() / 1000)
  return `<!date^${ts}^{date_long}|${shortDate(iso)}>`
}

/** "12 visits this week", "1 visit this week". */
export function visitsPhrase(n: number): string {
  return `${plural(n, 'visit')} this week`
}

export function daysAgo(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS)
}

export { plural, loadPresence }
export type { Presence }
