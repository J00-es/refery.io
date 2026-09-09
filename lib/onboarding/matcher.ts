/**
 * One strong first search, or an honest none.
 *
 * Rule-based on purpose, and free: what a partner told us at sign-up (where
 * their people are, what they do, which stages) against what each live search
 * needs (its location buckets, department, stage, priority). No model, no
 * cost, and every score explains itself in a sentence the partner reads.
 *
 * A match is a suggestion. It becomes a `search_assignments` row in
 * `proposed`, which the partner accepts or declines on Searches. It never
 * overwrites an earlier answer on the same search: a decline stays a decline.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { FUNCTIONS, LOCATIONS } from '@/lib/job-ui'
import { PROPOSAL_DAYS } from '@/lib/partners'
import { templateF, templateH } from '@/lib/voice/templates'
import { queueEmail } from '@/lib/comms'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz'
const OPEN_STAGES = new Set(['sourcing', 'shortlisting', 'client_interviewing'])

export interface Preferences {
  network_cities: string[]
  functions: string[]
  stages: string[]
  would_relocate: boolean | null
}

interface LiveRole {
  job_id: string
  company_id: string
  title: string
  headline: string | null
  company_name: string | null
  location: string | null
  location_buckets: string[] | null
  department: string | null
  company_stage: string | null
  priority: string
  search_stage: string | null
  submission_cap: number | null
  hard_requirements: string[] | null
  is_live: boolean
  job_status: string
}

export interface Match {
  role: LiveRole
  score: number
  reason: string
}

/** The city chips a partner picks map onto the job location buckets. */
const CITY_TO_BUCKET: Record<string, string | string[]> = {
  'san francisco': 'sf-bay',
  'san francisco / bay area': 'sf-bay',
  'bay area': 'sf-bay',
  'new york': 'nyc',
  'los angeles': 'la',
  seattle: 'seattle',
  boston: 'boston',
  austin: 'austin',
  chicago: 'chicago',
  'denver / boulder': 'denver',
  miami: 'florida',
  'remote us': 'anywhere',
  london: 'uk',
  'uk / europe': ['uk', 'europe'],
  toronto: 'canada',
}

/**
 * A city typed under "Other" is not in the chip list. Read what we can from
 * the text so "Berlin" or "Paris, France" still reaches a European search;
 * anything unrecognised scores nothing and is left for Lily to read.
 */
const FREE_TEXT_BUCKETS: Array<{ bucket: string; patterns: string[] }> = [
  { bucket: 'uk', patterns: ['uk', 'u.k.', 'united kingdom', 'england', 'britain', 'london', 'manchester', 'edinburgh', 'scotland'] },
  { bucket: 'europe', patterns: ['europe', 'eu', 'berlin', 'paris', 'amsterdam', 'dublin', 'ireland', 'germany', 'france', 'netherlands', 'spain', 'madrid', 'barcelona', 'lisbon', 'portugal', 'stockholm', 'sweden', 'copenhagen', 'denmark', 'zurich', 'switzerland', 'munich', 'vienna', 'austria', 'italy', 'milan', 'poland', 'warsaw', 'tallinn', 'helsinki', 'oslo', 'brussels', 'belgium'] },
  { bucket: 'canada', patterns: ['canada', 'vancouver', 'montreal', 'toronto'] },
  { bucket: 'india', patterns: ['india', 'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai'] },
  { bucket: 'apac', patterns: ['singapore', 'sydney', 'melbourne', 'australia', 'tokyo', 'japan', 'seoul', 'korea', 'hong kong', 'taipei', 'asia'] },
  { bucket: 'latam', patterns: ['mexico', 'brazil', 'sao paulo', 'argentina', 'buenos aires', 'colombia', 'bogot', 'chile', 'latam', 'latin america'] },
  { bucket: 'mea', patterns: ['dubai', 'uae', 'tel aviv', 'israel', 'africa', 'lagos', 'nairobi', 'cairo', 'riyadh', 'middle east'] },
  { bucket: 'sf-bay', patterns: ['san francisco', 'bay area', 'palo alto', 'oakland', 'san jose', 'sf'] },
  { bucket: 'nyc', patterns: ['new york', 'nyc', 'brooklyn', 'manhattan'] },
  { bucket: 'la', patterns: ['los angeles', 'la'] },
  { bucket: 'san-diego', patterns: ['san diego', 'orange county', 'irvine'] },
  { bucket: 'seattle', patterns: ['seattle', 'bellevue'] },
  { bucket: 'boston', patterns: ['boston', 'cambridge, ma'] },
  { bucket: 'austin', patterns: ['austin'] },
  { bucket: 'texas', patterns: ['dallas', 'houston', 'texas'] },
  { bucket: 'denver', patterns: ['denver', 'boulder'] },
  { bucket: 'chicago', patterns: ['chicago'] },
  { bucket: 'dc', patterns: ['washington', 'dc', 'd.c.', 'arlington'] },
  { bucket: 'atlanta', patterns: ['atlanta'] },
  { bucket: 'florida', patterns: ['miami', 'florida', 'tampa', 'orlando'] },
  { bucket: 'anywhere', patterns: ['remote', 'anywhere'] },
]

/** Short tokens ("uk", "la", "sf", "eu", "dc") only count as whole words. */
function bucketsFromText(raw: string): string[] {
  const words = raw.toLowerCase().replace(/[^a-z0-9.& ]+/g, ' ').replace(/\s+/g, ' ').trim()
  const padded = ` ${words} `
  const out: string[] = []
  for (const { bucket, patterns } of FREE_TEXT_BUCKETS) {
    if (patterns.some(p => (p.length <= 3 ? padded.includes(` ${p} `) : padded.includes(p)))) out.push(bucket)
  }
  return out
}

const STAGE_ALIASES: Record<string, string[]> = {
  seed: ['seed', 'pre-seed', 'pre_seed'],
  'series a': ['series_a', 'series a'],
  'series b': ['series_b', 'series b'],
  later: ['series_c', 'series c', 'series_d', 'growth', 'late'],
}

function bucketsFor(cities: string[]): Set<string> {
  const out = new Set<string>()
  for (const c of cities) {
    const b = CITY_TO_BUCKET[c.trim().toLowerCase()]
    const list = b ? (Array.isArray(b) ? b : [b]) : bucketsFromText(c)
    for (const x of list) out.add(x)
  }
  return out
}

function functionKeysFor(role: LiveRole): Set<string> {
  const hay = `${role.department ?? ''} ${role.title} ${role.headline ?? ''}`.toLowerCase()
  const out = new Set<string>()
  for (const f of FUNCTIONS) if (f.patterns.some(p => hay.includes(p))) out.add(f.key)
  return out
}

/** The partner's function chips use the same keys as FUNCTIONS. */
function functionLabel(key: string): string {
  return FUNCTIONS.find(f => f.key === key)?.label.toLowerCase() ?? key
}

function bucketLabel(key: string): string {
  return LOCATIONS.find(l => l.key === key)?.label ?? key
}

export function scoreRole(prefs: Preferences, role: LiveRole): Match | null {
  const wantBuckets = bucketsFor(prefs.network_cities)
  const roleBuckets = new Set(role.location_buckets ?? [])
  const roleFns = functionKeysFor(role)

  let score = 0
  const reasons: string[] = []

  const cityHit = [...wantBuckets].find(b => roleBuckets.has(b))
  if (cityHit) {
    score += 3
    reasons.push(`you told us your people are in ${bucketLabel(cityHit)}`)
  } else if (prefs.would_relocate && roleBuckets.size) {
    score += 1
    reasons.push('you said some of your people would relocate')
  } else if (roleBuckets.has('anywhere')) {
    score += 1
  } else {
    // No city overlap and no relocation: not a match, whatever else lines up.
    return null
  }

  const fnHit = prefs.functions.find(f => roleFns.has(f))
  if (fnHit) {
    score += 3
    reasons.push(`the role is ${functionLabel(fnHit)}, which is what you know`)
  } else if (roleFns.size && prefs.functions.length) {
    return null
  }

  const stageHit = prefs.stages.find(s => {
    const aliases = STAGE_ALIASES[s.toLowerCase()] ?? [s.toLowerCase()]
    return aliases.some(a => (role.company_stage ?? '').toLowerCase().includes(a))
  })
  if (stageHit) score += 1

  if (role.priority === 'urgent') score += 1
  if (role.search_stage === 'sourcing') score += 1

  return { role, score, reason: reasons.join(', and ') }
}

/**
 * Live searches with room for one more partner.
 *
 * `submission_cap` is the number of partners a search takes; the count of
 * live assignments is read fresh every time, never cached.
 */
async function openRoles(admin: SupabaseClient): Promise<LiveRole[]> {
  const { data } = await admin
    .from('partner_roles_v')
    .select('job_id, company_id, title, headline, company_name, location, location_buckets, department, company_stage, priority, search_stage, submission_cap, hard_requirements, is_live, job_status')
    .eq('is_live', true)
    .eq('job_status', 'open')
  const roles = ((data ?? []) as LiveRole[]).filter(r => OPEN_STAGES.has(r.search_stage ?? 'sourcing'))
  if (!roles.length) return []

  const { data: live } = await admin
    .from('search_assignments')
    .select('job_id')
    .in('job_id', roles.map(r => r.job_id))
    .in('status', ['proposed', 'working', 'paused'])
  const count = new Map<string, number>()
  for (const a of live ?? []) count.set(a.job_id as string, (count.get(a.job_id as string) ?? 0) + 1)

  return roles.filter(r => !r.submission_cap || (count.get(r.job_id) ?? 0) < r.submission_cap)
}

export async function bestMatches(admin: SupabaseClient, userId: string, prefs: Preferences): Promise<Match[]> {
  const roles = await openRoles(admin)
  if (!roles.length) return []

  // Anything the partner already answered is off the table.
  const { data: answered } = await admin.from('search_assignments').select('job_id').eq('user_id', userId)
  const seen = new Set((answered ?? []).map(a => a.job_id as string))

  return roles
    .filter(r => !seen.has(r.job_id))
    .map(r => scoreRole(prefs, r))
    .filter((m): m is Match => m !== null && m.score >= 6)
    .sort((a, b) => b.score - a.score)
}

export interface SuggestResult {
  outcome: 'suggested' | 'no_match' | 'skipped'
  jobId?: string
  emailed?: boolean
  reason?: string
}

/**
 * Suggest one search to a partner, and tell them, or record an honest no-match.
 *
 * Safe to call repeatedly: it does nothing when the partner already holds a
 * proposal or a working search, and it writes the no-match once.
 */
export async function suggestFirstSearch(
  admin: SupabaseClient,
  partner: { userId: string; email: string; fullName: string | null },
  opts: { by: string; sendEmail?: boolean } = { by: 'system', sendEmail: true },
): Promise<SuggestResult> {
  const { data: open } = await admin
    .from('search_assignments')
    .select('id')
    .eq('user_id', partner.userId)
    .in('status', ['proposed', 'working', 'paused'])
    .limit(1)
  if (open?.length) return { outcome: 'skipped', reason: 'already has a search' }

  const { data: prefs } = await admin
    .from('partner_preferences')
    .select('network_cities, functions, stages, would_relocate')
    .eq('user_id', partner.userId)
    .maybeSingle()
  if (!prefs) return { outcome: 'skipped', reason: 'no preferences' }

  const matches = await bestMatches(admin, partner.userId, prefs as Preferences)
  const top = matches[0]

  if (!top) {
    const { data: u } = await admin.from('users_admin').select('no_match_at').eq('user_id', partner.userId).maybeSingle()
    if (u?.no_match_at) return { outcome: 'no_match', reason: 'already told' }
    await admin.from('users_admin').update({ no_match_at: new Date().toISOString() }).eq('user_id', partner.userId)
    if (opts.sendEmail !== false && partner.fullName) {
      const where = await whereSearchesAre(admin)
      const strength = describeNetwork(prefs as Preferences)
      const email = templateF({ fullName: partner.fullName, strength, whereSearchesAre: where, applied: false })
      await queueEmail(admin, {
        to: partner.email,
        toName: partner.fullName,
        userId: partner.userId,
        email,
        dedupeKey: `F:${partner.userId}`,
        stop: { kind: 'account_active', userId: partner.userId },
      })
    }
    return { outcome: 'no_match' }
  }

  const now = new Date()
  const { data: inserted, error } = await admin
    .from('search_assignments')
    .insert({
      job_id: top.role.job_id,
      company_id: top.role.company_id,
      user_id: partner.userId,
      status: 'proposed',
      why: top.reason,
      proposed_at: now.toISOString(),
      expires_at: new Date(now.getTime() + PROPOSAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: now.toISOString(),
      note: `suggested by ${opts.by}`,
    })
    .select('id')
    .single()
  if (error) return { outcome: 'skipped', reason: error.message }

  let emailed = false
  if (opts.sendEmail !== false && partner.fullName) {
    const email = templateH({
      fullName: partner.fullName,
      role: top.role.headline || top.role.title,
      city: top.role.location,
      client: top.role.company_name ?? 'a client',
      reason: top.reason,
      requirement: top.role.hard_requirements?.[0] ?? null,
      briefLink: `${APP_URL}/searches/${top.role.company_id}/roles/${top.role.job_id}`,
    })
    const q = await queueEmail(admin, {
      to: partner.email,
      toName: partner.fullName,
      userId: partner.userId,
      email,
      dedupeKey: `H:${inserted.id}`,
      stop: { kind: 'assignment_proposed', assignmentId: inserted.id as string },
    })
    emailed = q.ok
  }
  return { outcome: 'suggested', jobId: top.role.job_id, emailed }
}

/** "on-site in San Francisco or New York", built from the live searches. */
export async function whereSearchesAre(admin: SupabaseClient): Promise<string> {
  const roles = await openRoles(admin)
  const buckets = new Map<string, number>()
  for (const r of roles) for (const b of r.location_buckets ?? []) buckets.set(b, (buckets.get(b) ?? 0) + 1)
  const top = [...buckets.entries()]
    .filter(([k]) => k !== 'anywhere')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([k]) => bucketLabel(k))
  const onsite = roles.every(r => !(r.location_buckets ?? []).includes('anywhere'))
  return top.length ? `${onsite ? 'on-site ' : ''}in ${top.join(' or ')}` : 'in San Francisco or New York'
}

function describeNetwork(prefs: Preferences): string {
  const cities = prefs.network_cities.slice(0, 2).join(' and ')
  const fns = prefs.functions.slice(0, 2).map(functionLabel).join(' and ')
  if (cities && fns) return `Your ${fns} network around ${cities}`
  if (cities) return `Your network around ${cities}`
  return 'Your network'
}
