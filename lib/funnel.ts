import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The partner funnel, end to end.
 *
 * Five stages, and each one is recorded by a different system, which is why
 * nobody could see the whole thing before:
 *
 *   1. applied      scout_applications / hiring_manager_leads (marketing site)
 *   2. answered     the same rows, once someone has triaged them
 *   3. signed up    signup_events (the /auth/sign-up beacon)
 *   4. approved     users_admin.status = 'active'
 *   5. activated    has ever put a candidate into the system
 *
 * Stages 1-2 and 4-5 are cumulative and have no useful window: an application
 * that has been ignored since May is exactly the thing worth seeing today.
 * Stage 3 is windowed, because a sign-up session is an event, not a state.
 *
 * Shared by the admin funnel page and the daily digest so the two can never
 * disagree about what "stalled" means.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Untriaged past this many days counts as stalled rather than simply recent. */
export const STALE_INTAKE_DAYS = 3

/** Approved but silent for this long counts as never activated. */
export const DORMANT_PARTNER_DAYS = 14

/** Only these mean nobody has dealt with the row yet. */
const UNTRIAGED = 'new'

/**
 * Our own accounts. lily@refery.io is a second users_admin row carrying the
 * recruiter identity, distinct from the lily@10kventures.co super admin, and it
 * is dormant by design: it exists so inbound résumés have an owner, not so
 * somebody submits through it.
 *
 * Excluded from the chase list only. They stay in `active` and `activated`,
 * because the activation rate is a measurement and quietly shrinking its
 * denominator would flatter it.
 */
const INTERNAL_EMAILS = new Set(['lily@10kventures.co', 'lily@refery.io'])

export interface StalledIntake {
  id: string
  name: string | null
  email: string | null
  /** Company for a hiring lead, null for a scout. */
  company: string | null
  createdAt: string
  ageDays: number
  /** False when the row never reached Slack, so nobody was ever told about it. */
  announced: boolean
}

export interface DormantPartner {
  id: string
  name: string | null
  email: string | null
  role: string
  joinedAt: string
  ageDays: number
}

export interface IntakeStage {
  total: number
  untriaged: number
  stalled: StalledIntake[]
  /** Rows that never got a Slack message, so no human was ever notified. */
  neverAnnounced: number
  /** Rows we replied to, by whatever automation owns that table. */
  answered: number
}

export interface SignupStage {
  windowDays: number
  sessions: number
  roleSelected: number
  reachedTerms: number
  completed: number
  failed: number
  /** Reached the terms in the window and never completed. Named, not counted. */
  stalledAtTerms: Array<{ who: string | null; role: string | null }>
}

export interface PartnerStage {
  active: number
  pending: number
  activated: number
  dormant: DormantPartner[]
}

export interface FunnelSnapshot {
  scouts: IntakeStage
  hiringManagers: IntakeStage
  signup: SignupStage
  partners: PartnerStage
}

function ageDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
}

/**
 * Rows are read whole rather than counted, because every count here has a
 * companion list: "12 stalled" is not actionable, "12 stalled, oldest is Jane
 * from May 5" is. The tables are in the low hundreds, so the read is cheap.
 */
export async function loadFunnel(
  admin: SupabaseClient,
  opts: { windowDays?: number } = {},
): Promise<FunnelSnapshot> {
  const windowDays = opts.windowDays ?? 1
  const since = new Date(Date.now() - windowDays * DAY_MS).toISOString()

  const [scoutRes, leadRes, signupRes, userRes, candidateRes] = await Promise.all([
    admin
      .from('scout_applications')
      .select('id, full_name, email, status, created_at, slack_message_ts, outreach_sent_at'),
    admin
      .from('hiring_manager_leads')
      .select(
        'id, full_name, work_email, company_name, status, created_at, slack_message_ts, outreach_sent_at',
      ),
    admin
      .from('signup_events')
      .select('session_id, step, role, full_name, email')
      .gte('occurred_at', since),
    admin.from('users_admin').select('id, user_id, full_name, email, role, status, created_at'),
    // Only the ownership columns matter: this answers "has this partner ever
    // put anyone in", not "how many".
    admin.from('candidates').select('owner_user_id, uploaded_by_user_id, created_by_user_id'),
  ])

  const scouts = scoutRes.data ?? []
  const leads = leadRes.data ?? []
  const signups = signupRes.data ?? []
  const users = userRes.data ?? []
  const candidates = candidateRes.data ?? []

  const staleBefore = Date.now() - STALE_INTAKE_DAYS * DAY_MS

  const scoutStage: IntakeStage = {
    total: scouts.length,
    untriaged: scouts.filter((s) => s.status === UNTRIAGED).length,
    neverAnnounced: scouts.filter((s) => !s.slack_message_ts).length,
    answered: scouts.filter((s) => s.outreach_sent_at).length,
    stalled: scouts
      .filter((s) => s.status === UNTRIAGED && new Date(s.created_at).getTime() < staleBefore)
      .map((s) => ({
        id: s.id,
        name: s.full_name,
        email: s.email,
        company: null,
        createdAt: s.created_at,
        ageDays: ageDays(s.created_at),
        announced: !!s.slack_message_ts,
      }))
      .sort((a, b) => b.ageDays - a.ageDays),
  }

  const hmStage: IntakeStage = {
    total: leads.length,
    untriaged: leads.filter((l) => l.status === UNTRIAGED).length,
    neverAnnounced: leads.filter((l) => !l.slack_message_ts).length,
    answered: leads.filter((l) => l.outreach_sent_at).length,
    stalled: leads
      .filter((l) => l.status === UNTRIAGED && new Date(l.created_at).getTime() < staleBefore)
      .map((l) => ({
        id: l.id,
        name: l.full_name,
        email: l.work_email,
        company: l.company_name,
        createdAt: l.created_at,
        ageDays: ageDays(l.created_at),
        announced: !!l.slack_message_ts,
      }))
      .sort((a, b) => b.ageDays - a.ageDays),
  }

  // One entry per visit. A session that reached step 3 counts once, however
  // many times the beacon fired on the way.
  const sessions = new Map<string, { steps: Set<string>; who: string | null; role: string | null }>()
  for (const e of signups) {
    const s = sessions.get(e.session_id) ?? { steps: new Set<string>(), who: null, role: null }
    s.steps.add(e.step)
    s.who = s.who ?? e.full_name ?? e.email ?? null
    s.role = s.role ?? e.role ?? null
    sessions.set(e.session_id, s)
  }
  const all = [...sessions.values()]

  const signupStage: SignupStage = {
    windowDays,
    sessions: all.length,
    roleSelected: all.filter((s) => s.steps.has('role_selected')).length,
    reachedTerms: all.filter((s) => s.steps.has('agreement_viewed')).length,
    completed: all.filter((s) => s.steps.has('completed')).length,
    failed: all.filter((s) => s.steps.has('failed')).length,
    stalledAtTerms: all
      .filter((s) => s.steps.has('agreement_viewed') && !s.steps.has('completed'))
      .map((s) => ({ who: s.who, role: s.role })),
  }

  // A partner counts as activated if any of the three ownership columns points
  // at them. They are written by different paths (self-upload, bulk import,
  // admin creation) and only one is set at a time.
  const owners = new Set<string>()
  for (const c of candidates) {
    if (c.owner_user_id) owners.add(c.owner_user_id)
    if (c.uploaded_by_user_id) owners.add(c.uploaded_by_user_id)
    if (c.created_by_user_id) owners.add(c.created_by_user_id)
  }

  const partnerRoles = new Set(['scout', 'recruiter'])
  const partners = users.filter((u) => partnerRoles.has(u.role))
  const activePartners = partners.filter((u) => u.status === 'active')

  const dormantBefore = Date.now() - DORMANT_PARTNER_DAYS * DAY_MS
  const partnerStage: PartnerStage = {
    active: activePartners.length,
    pending: partners.filter((u) => u.status === 'pending').length,
    activated: activePartners.filter((u) => u.user_id && owners.has(u.user_id)).length,
    dormant: activePartners
      .filter(
        (u) =>
          !(u.user_id && owners.has(u.user_id)) &&
          new Date(u.created_at).getTime() < dormantBefore &&
          !INTERNAL_EMAILS.has((u.email ?? '').trim().toLowerCase()),
      )
      .map((u) => ({
        id: u.id,
        name: u.full_name,
        email: u.email,
        role: u.role,
        joinedAt: u.created_at,
        ageDays: ageDays(u.created_at),
      }))
      .sort((a, b) => b.ageDays - a.ageDays),
  }

  return {
    scouts: scoutStage,
    hiringManagers: hmStage,
    signup: signupStage,
    partners: partnerStage,
  }
}

export function pct(part: number, whole: number): number | null {
  if (!whole) return null
  return Math.round((part / whole) * 100)
}
