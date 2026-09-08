import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { normalizeEmail } from '@/lib/current-user'
import { decideApplication, type Decision } from '@/lib/onboarding/decisions'
import { suggestFirstSearch } from '@/lib/onboarding/matcher'
import { queueEmail } from '@/lib/comms'
import { templateU } from '@/lib/voice/templates'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const INTERNAL = new Set(['refery.io', '10kventures.co'])
const OPEN_STAGES = ['sourcing', 'shortlisting', 'client_interviewing', 'offer_out']

/**
 * The partner desk, grouped by who can unblock the next step.
 *
 *   1. Needs your decision   applications waiting, identity conflicts
 *   2. Needs a Refery fix    failing access checks, failed emails
 *   3. Needs suitable work   approved, preferences confirmed, no match
 *   4. Needs partner action  suggestions unanswered, accepted with nothing sent
 *   5. Needs client action   submissions sent and quiet
 *
 * Plus the demand view (which searches need people) and what the ledger sent
 * on its own this week. Everything is computed from live rows; nothing is
 * cached and nothing calls a model.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const admin = createAdminClient()
  const now = Date.now()
  const weekAgo = new Date(now - 7 * DAY_MS).toISOString()

  const [
    { data: apps },
    { data: partners },
    { data: prefs },
    { data: assignments },
    { data: roles },
    { data: submissions },
    { data: comms },
    { data: state },
  ] = await Promise.all([
    admin.from('scout_applications').select('id, full_name, email, linkedin_url, status, created_at, decided_at, source, source_campaign, slack_channel_id, slack_message_ts, pending_note_sent_at').in('status', ['new', 'clarification']).order('created_at', { ascending: true }),
    admin.from('users_admin').select('user_id, email, full_name, role, status, created_at, source, source_campaign, no_match_at, is_beta').in('role', ['scout', 'recruiter']).eq('status', 'active'),
    admin.from('partner_preferences').select('user_id, confirmed_at, network_cities, functions'),
    admin.from('search_assignments').select('id, job_id, company_id, user_id, status, proposed_at, confirmed_at, expires_at, why'),
    admin.from('partner_roles_v').select('job_id, company_id, title, headline, company_name, location, priority, search_stage, stage_moved_at, submission_cap, is_live, job_status, updated_at').eq('is_live', true).eq('job_status', 'open'),
    admin.from('role_submissions_v').select('id, job_id, company_id, status, submitted_by_user_id, candidate_name, job_title, company_name, updated_at, created_at'),
    admin.from('communications').select('id, to_email, template_id, status, subject, sent_at, error, created_at, stop_reason').gt('created_at', weekAgo).order('created_at', { ascending: false }),
    admin.from('partner_state_v').select('*'),
  ])

  const external = (partners ?? []).filter(p => !INTERNAL.has((p.email as string).split('@')[1] ?? ''))
  const emails = external.map(p => normalizeEmail(p.email))
  const userIds = external.map(p => p.user_id as string).filter(Boolean)

  const [{ data: acceptances }, { data: members }] = await Promise.all([
    emails.length ? admin.from('agreement_acceptances').select('user_email, agreement_type, agreement_version').in('user_email', emails).in('agreement_type', ['scout', 'recruiter', 'scout_partner']) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from('partner_org_members').select('user_id, removed_at, partner_orgs(name, status)').in('user_id', userIds).is('removed_at', null) : Promise.resolve({ data: [] }),
  ])
  const termsByEmail = new Set((acceptances ?? []).map(a => normalizeEmail(a.user_email)))
  const firmByUser = new Map((members ?? []).map(m => [m.user_id as string, (m as unknown as { partner_orgs: { name: string; status: string } | null }).partner_orgs]))
  const prefsByUser = new Map((prefs ?? []).map(p => [p.user_id as string, p]))
  const roleById = new Map((roles ?? []).map(r => [r.job_id as string, r]))
  const stateByUser = new Map((state ?? []).map(s => [s.user_id as string, s]))

  // 1. Needs your decision
  const activeByEmail = new Map(external.map(p => [normalizeEmail(p.email), p]))
  const decisions = (apps ?? []).map(a => {
    const ageDays = (now - new Date(a.created_at).getTime()) / DAY_MS
    const existing = activeByEmail.get(normalizeEmail(a.email))
    return {
      id: a.id,
      name: a.full_name,
      email: a.email,
      linkedin: a.linkedin_url,
      status: a.status,
      ageDays: Math.floor(ageDays),
      overdue: a.status === 'new' && ageDays >= 2,
      source: a.source_campaign ? `via ${a.source_campaign} link` : a.source ?? 'website',
      conflict: existing ? `active ${existing.role} account exists under this email` : null,
      slack: a.slack_message_ts ? { channel: a.slack_channel_id, ts: a.slack_message_ts } : null,
    }
  })

  // 2. Needs a Refery fix
  const fixes: Array<{ kind: string; who: string; email: string; detail: string; userId?: string; commId?: string }> = []
  for (const p of external) {
    const email = normalizeEmail(p.email)
    const firm = firmByUser.get(p.user_id as string)
    if (!termsByEmail.has(email)) fixes.push({ kind: 'terms', who: p.full_name ?? email, email, userId: p.user_id, detail: 'Active account, but no partner terms on file under this email. Searches stays closed until fixed.' })
    if (firm && firm.status !== 'active') fixes.push({ kind: 'firm', who: p.full_name ?? email, email, userId: p.user_id, detail: `Firm ${firm.name} is ${firm.status}.` })
  }
  for (const c of comms ?? []) {
    if (c.status === 'failed') fixes.push({ kind: 'email', who: c.to_email, email: c.to_email, commId: c.id, detail: `Email ${c.template_id} failed: ${c.error ?? 'unknown'}. The decision stands.` })
  }
  const appEmails = new Set((apps ?? []).map(a => normalizeEmail(a.email)))
  for (const p of external) {
    if (appEmails.has(normalizeEmail(p.email))) fixes.push({ kind: 'identity', who: p.full_name ?? p.email, email: p.email, userId: p.user_id, detail: 'Has an active account and an open application. Close the application as already-partner.' })
  }

  // 3. Needs suitable work
  const openByUser = new Map<string, number>()
  for (const a of assignments ?? []) if (['proposed', 'working', 'paused'].includes(a.status)) openByUser.set(a.user_id, (openByUser.get(a.user_id) ?? 0) + 1)
  const needsWork = external
    .filter(p => termsByEmail.has(normalizeEmail(p.email)) && !openByUser.get(p.user_id as string))
    .map(p => {
      const pr = prefsByUser.get(p.user_id as string)
      return {
        userId: p.user_id as string,
        name: p.full_name ?? p.email,
        email: p.email,
        joinedDays: Math.floor((now - new Date(p.created_at).getTime()) / DAY_MS),
        preferences: pr ? [...(pr.network_cities ?? []).slice(0, 2), ...(pr.functions ?? []).slice(0, 2)].join(' · ') : null,
        confirmed: Boolean(pr?.confirmed_at),
        noMatchAt: p.no_match_at,
        state: stateByUser.get(p.user_id as string)?.state ?? null,
      }
    })
    .sort((a, b) => b.joinedDays - a.joinedDays)

  // 4. Needs partner action
  const nameByUser = new Map(external.map(p => [p.user_id as string, p.full_name ?? p.email]))
  const subsByUserJob = new Map<string, number>()
  for (const s of submissions ?? []) subsByUserJob.set(`${s.submitted_by_user_id}:${s.job_id}`, (subsByUserJob.get(`${s.submitted_by_user_id}:${s.job_id}`) ?? 0) + 1)
  const partnerAction = (assignments ?? [])
    .filter(a => nameByUser.has(a.user_id))
    .flatMap(a => {
      const r = roleById.get(a.job_id)
      if (!r) return []
      if (a.status === 'proposed') {
        const age = Math.floor((now - new Date(a.proposed_at).getTime()) / DAY_MS)
        return [{ kind: 'unanswered', userId: a.user_id, name: nameByUser.get(a.user_id)!, role: r.headline || r.title, company: r.company_name, ageDays: age, assignmentId: a.id }]
      }
      if (a.status === 'working' && !subsByUserJob.get(`${a.user_id}:${a.job_id}`)) {
        const age = Math.floor((now - new Date(a.confirmed_at ?? a.proposed_at).getTime()) / DAY_MS)
        if (age >= 7) return [{ kind: 'accepted_quiet', userId: a.user_id, name: nameByUser.get(a.user_id)!, role: r.headline || r.title, company: r.company_name, ageDays: age, assignmentId: a.id }]
      }
      return []
    })
    .sort((a, b) => b.ageDays - a.ageDays)

  // 5. Needs client action
  const clientAction = (submissions ?? [])
    .filter(s => ['sent_to_client', 'client_interview'].includes(s.status))
    .map(s => ({ id: s.id, candidate: s.candidate_name, role: s.job_title, company: s.company_name, status: s.status, quietDays: Math.floor((now - new Date(s.updated_at ?? s.created_at).getTime()) / DAY_MS), partner: nameByUser.get(s.submitted_by_user_id) ?? null }))
    .filter(s => s.quietDays >= 5)
    .sort((a, b) => b.quietDays - a.quietDays)

  // Demand
  const liveAssign = (assignments ?? []).filter(a => ['proposed', 'working', 'paused'].includes(a.status))
  const twoWeeks = now - 14 * DAY_MS
  const demand = (roles ?? [])
    .filter(r => OPEN_STAGES.includes(r.search_stage ?? 'sourcing'))
    .map(r => {
      const working = liveAssign.filter(a => a.job_id === r.job_id && a.status === 'working').length
      const proposed = liveAssign.filter(a => a.job_id === r.job_id && a.status === 'proposed').length
      const cap = r.submission_cap ?? null
      const open = cap ? Math.max(0, cap - working - proposed) : null
      const subs14 = (submissions ?? []).filter(s => s.job_id === r.job_id && new Date(s.created_at).getTime() > twoWeeks).length
      const movedDays = r.stage_moved_at ? Math.floor((now - new Date(r.stage_moved_at).getTime()) / DAY_MS) : null
      const read =
        r.search_stage === 'client_interviewing' && movedDays !== null && movedDays >= 14
          ? 'client quiet'
          : open === 0
            ? 'enough partners'
            : subs14 < 2
              ? 'needs people'
              : 'moving'
      return { jobId: r.job_id, companyId: r.company_id, title: r.headline || r.title, company: r.company_name, location: r.location, priority: r.priority, stage: r.search_stage, working, proposed, open, cap, subs14, movedDays, read }
    })
    .sort((a, b) => (a.read === 'needs people' ? -1 : 1) - (b.read === 'needs people' ? -1 : 1))

  // Ledger summary
  const ledger = { sent: 0, queued: 0, failed: 0, cancelled: 0, held: 0, byTemplate: {} as Record<string, number> }
  for (const c of comms ?? []) {
    const k = c.status as keyof typeof ledger
    if (k in ledger && typeof ledger[k] === 'number') (ledger[k] as number)++
    if (c.status === 'sent') ledger.byTemplate[c.template_id] = (ledger.byTemplate[c.template_id] ?? 0) + 1
  }

  return NextResponse.json({
    counts: { applications: decisions.length, overdue: decisions.filter(d => d.overdue).length, partners: external.length, withTerms: external.filter(p => termsByEmail.has(normalizeEmail(p.email))).length, working: (state ?? []).filter(s => s.state === 'working').length },
    decisions,
    fixes,
    needsWork,
    partnerAction,
    clientAction,
    demand,
    ledger,
    searches: (roles ?? []).filter(r => OPEN_STAGES.includes(r.search_stage ?? 'sourcing')).map(r => ({ job_id: r.job_id, title: r.headline || r.title, company_name: r.company_name, location: r.location, search_stage: r.search_stage })),
  })
}

/** Actions from the desk. Each is one row changed and, where it applies, one email queued. */
export async function POST(req: Request) {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })
  const body = await req.json().catch(() => ({}))
  const admin = createAdminClient()
  const by = gate.email

  switch (body.action) {
    case 'decide': {
      const decision = body.decision as Decision
      if (!['approve', 'approve_call', 'clarify', 'no_match', 'decline'].includes(decision)) return NextResponse.json({ error: 'bad decision' }, { status: 400 })
      const { data: app } = await admin.from('scout_applications').select('slack_channel_id, slack_message_ts').eq('id', body.applicationId).maybeSingle()
      const slack = app?.slack_message_ts ? { channel: app.slack_channel_id as string, ts: app.slack_message_ts as string } : null
      const r = await decideApplication(admin, { applicationId: String(body.applicationId), decision, by, slack })
      return NextResponse.json(r, { status: r.ok ? 200 : 409 })
    }
    case 'already_partner': {
      const { error } = await admin.from('scout_applications').update({ status: 'already_partner', decision: 'already_partner', decided_by: by, decided_at: new Date().toISOString() }).eq('id', body.applicationId).in('status', ['new', 'clarification'])
      return NextResponse.json({ ok: !error, error: error?.message })
    }
    case 'suggest': {
      const { data: u } = await admin.from('users_admin').select('user_id, email, full_name').eq('user_id', body.userId).maybeSingle()
      if (!u) return NextResponse.json({ error: 'not found' }, { status: 404 })
      await admin.from('users_admin').update({ no_match_at: null }).eq('user_id', u.user_id)
      const r = await suggestFirstSearch(admin, { userId: u.user_id, email: u.email, fullName: u.full_name }, { by, sendEmail: true })
      return NextResponse.json(r)
    }
    case 'offer_call': {
      const { data: u } = await admin.from('users_admin').select('user_id, email, full_name').eq('user_id', body.userId).maybeSingle()
      if (!u?.full_name) return NextResponse.json({ error: 'not found' }, { status: 404 })
      const role = String(body.role ?? '').trim() || 'the search you looked at'
      const reason = String(body.reason ?? '').trim()
      if (reason.length < 8) return NextResponse.json({ error: 'Say why you want to talk, in a few words. It goes in the email.' }, { status: 400 })
      const email = templateU({ fullName: u.full_name, role, reason })
      const q = await queueEmail(admin, { to: u.email, toName: u.full_name, userId: u.user_id, email, dedupeKey: `U:${u.user_id}:${Date.now()}`, stop: { kind: 'account_active', userId: u.user_id } })
      return NextResponse.json(q)
    }
    case 'retry_email': {
      const { error } = await admin.from('communications').update({ status: 'queued', send_after: new Date().toISOString(), attempts: 0, error: null }).eq('id', body.commId).eq('status', 'failed')
      return NextResponse.json({ ok: !error, error: error?.message })
    }
    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }
}
