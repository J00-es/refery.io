/**
 * The desk MCP, the twelve verbs.
 *
 * Six reads, six writes, from the operating review of 9 September 2026. The
 * rule for a write: it is a verb that already exists as a Slack reaction or a
 * button, never a new power. So decide_candidate is applyDecision, the same
 * function the :fire: reaction calls; propose_search is the admin's "put a
 * partner on this search"; run_bench is the bench worker. Each write is off
 * until switched on at /admin/settings#mcp, is recorded with Lily as the
 * actor, and is mirrored into the Slack thread it belongs to so the record
 * never forks.
 *
 * There is deliberately no query tool. Named verbs only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ToolInputError, UnknownToolError, type JsonSchema, type ToolKind, type ToolRegistry, type ToolResult, type ToolSpec } from '@/lib/mcp/protocol'
import { contactLines, daysSince, displayName, untrusted } from '@/lib/mcp/redact'
import { loadWrites } from '@/lib/mcp/settings'
import { applyDecision, type Decision } from '@/lib/desk/decide'
import { latestPanel, recipientFor, type PanelRow } from '@/lib/desk/panel'
import { loadOwner, lilyUserId, properName } from '@/lib/desk/people'
import { loadLiveSeats, type Seat } from '@/lib/desk/seats'
import { draftFor } from '@/lib/desk/card'
import { decisionSubject } from '@/lib/desk/subjects'
import { APP_URL, buildIntroKit, kitText } from '@/lib/desk/intro'
import { logActivity, sendDeskEmail } from '@/lib/desk/outbound'
import { runBenchMatch } from '@/lib/desk/bench'
import { budgetStatus } from '@/lib/engine/ledger'
import { scoreRole, type LiveRole, type Preferences } from '@/lib/onboarding/matcher'
import { PROPOSAL_DAYS } from '@/lib/partners'
import { PROTECTION_MONTHS } from '@/lib/submission-claims'
import { sendSearchProposalEmail } from '@/lib/search-proposal-email'
import { deskChannel } from '@/lib/desk-notifications'
import { esc, postMessage, postThreadReply } from '@/lib/slack-bot'

export interface ToolContext {
  admin: SupabaseClient
  /** Who the record says did it. */
  actor: string
  /** Lily's auth user id, for performed_by columns. */
  lilyId: string | null
}

interface Tool<T> {
  name: string
  kind: ToolKind
  description: string
  inputSchema: JsonSchema
  parse: z.ZodType<T>
  run: (ctx: ToolContext, args: T) => Promise<ToolResult>
}

const uuid = z.string().uuid()
const UUID_SCHEMA = { type: 'string', format: 'uuid' }

const STALE_DAYS = 14
const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F']

function gradeRank(g: string | null | undefined): number {
  const i = GRADE_ORDER.indexOf((g ?? '').trim())
  return i === -1 ? GRADE_ORDER.length : i
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const shortDate = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : 'unknown date')

// ── shared loaders ───────────────────────────────────────────────────────────

type PanelLite = Pick<PanelRow, 'candidate_id' | 'grade' | 'level' | 'function' | 'summary' | 'suggested_decision' | 'suggested_reason' | 'seat_fits' | 'missing_facts' | 'flags' | 'created_at'>

/** The newest panel per candidate, one query. */
async function panelsFor(admin: SupabaseClient, ids: string[]): Promise<Map<string, PanelLite>> {
  const out = new Map<string, PanelLite>()
  if (!ids.length) return out
  const { data } = await admin
    .from('candidate_panels')
    .select('candidate_id, grade, level, function, summary, suggested_decision, suggested_reason, seat_fits, missing_facts, flags, created_at')
    .in('candidate_id', ids)
    .order('created_at', { ascending: false })
  for (const p of (data ?? []) as PanelLite[]) if (!out.has(p.candidate_id)) out.set(p.candidate_id, p)
  return out
}

async function namesFor(admin: SupabaseClient, userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((x): x is string => typeof x === 'string' && x.length > 0))]
  const out = new Map<string, string>()
  if (!ids.length) return out
  const { data } = await admin.from('users_admin').select('user_id, full_name, email').in('user_id', ids)
  for (const u of data ?? []) out.set(u.user_id as string, ((u.full_name as string | null) || (u.email as string)) ?? 'unknown')
  return out
}

/** Candidates with an agreed consent on file. Anyone else is shown by first name and initial. */
async function consentedAmong(admin: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const { data } = await admin.from('candidate_consents').select('candidate_id').eq('status', 'agreed').in('candidate_id', ids)
  return new Set((data ?? []).map(r => r.candidate_id as string))
}

function seatName(s: Seat): string {
  return `${s.companyName} · ${s.headline || s.title}`
}

function strongFits(panel: PanelLite | undefined, seats: Map<string, Seat>): string[] {
  if (!panel?.seat_fits) return []
  return panel.seat_fits
    .filter(f => f.fit === 'strong' && seats.has(f.job_id))
    .map(f => seatName(seats.get(f.job_id)!))
}

async function candidateById(admin: SupabaseClient, id: string): Promise<Record<string, unknown> | null> {
  const { data } = await admin.from('candidates').select('*').eq('id', id).maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

/** A thread reply under the candidate's decision card, when they have one. Best effort. */
async function mirrorToCard(c: Record<string, unknown>, line: string): Promise<boolean> {
  const channel = c.desk_card_channel as string | null
  const ts = c.desk_card_ts as string | null
  if (!channel || !ts) return false
  const r = await postThreadReply(channel, ts, line)
  return r.ok
}

const VIA_MCP = ':robot_face: via the desk MCP, Lily:'

// ── reads ────────────────────────────────────────────────────────────────────

const deskInbox: Tool<{ limit?: number }> = {
  name: 'desk_inbox',
  kind: 'read',
  description:
    'Everything waiting on Lily, ranked: candidates whose decision card is open (grade, the live seats they fit, owner, days waiting), proposals to partners that have gone stale, search questions nobody answered, people stuck in a retired stage, and this month\'s model spend. Call this first.',
  inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 50, description: 'How many pending decisions to list. Default 20.' } }, additionalProperties: false },
  parse: z.object({ limit: z.number().int().min(1).max(50).optional() }),
  async run({ admin }, args) {
    const limit = args.limit ?? 20
    const now = Date.now()
    const [{ data: pending }, { data: stale }, { data: questions }, { count: stranded }, { count: snoozedDue }, seats, budget, { count: reading }] = await Promise.all([
      admin
        .from('candidates')
        .select('id, name, journey_stage, journey_stage_at, owner_user_id, intake_source, desk_snoozed_until, created_at')
        .eq('journey_stage', 'decision_pending'),
      admin
        .from('search_assignments')
        .select('user_id, job_id, proposed_at')
        .eq('status', 'proposed')
        .lt('proposed_at', new Date(now - STALE_DAYS * 86_400_000).toISOString()),
      admin.from('search_questions').select('id, job_id, question, created_at').is('answer', null).order('created_at', { ascending: true }),
      admin.from('candidates').select('id', { count: 'exact', head: true }).eq('journey_stage', 'ready_for_intro'),
      admin.from('candidates').select('id', { count: 'exact', head: true }).lte('desk_snoozed_until', new Date(now).toISOString()).not('desk_snoozed_until', 'is', null),
      loadLiveSeats(admin),
      budgetStatus(admin),
      admin.from('candidates').select('id', { count: 'exact', head: true }).in('journey_stage', ['uploaded', 'calibrating']),
    ])

    const seatMap = new Map(seats.map(s => [s.jobId, s]))
    const waiting = ((pending ?? []) as Record<string, unknown>[]).filter(c => {
      const until = c.desk_snoozed_until as string | null
      return !until || Date.parse(until) <= now
    })
    const ids = waiting.map(c => c.id as string)
    const [panels, owners, consented] = await Promise.all([panelsFor(admin, ids), namesFor(admin, waiting.map(c => c.owner_user_id as string | null)), consentedAmong(admin, ids)])

    const ranked = waiting
      .map(c => {
        const p = panels.get(c.id as string)
        const fits = strongFits(p, seatMap)
        return {
          id: c.id as string,
          name: displayName(c.name as string, consented.has(c.id as string)),
          grade: p?.grade ?? null,
          read: p ? [p.level, p.function].filter(Boolean).join(' ') || (p.summary ?? '').slice(0, 90) : 'not read yet',
          suggested: p?.suggested_decision ?? null,
          fits,
          owner: owners.get(c.owner_user_id as string) ?? (c.intake_source === 'inbound_email' ? 'nobody, came in by email' : 'nobody'),
          days: daysSince(c.journey_stage_at as string) ?? daysSince(c.created_at as string) ?? 0,
        }
      })
      .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade) || (b.fits.length ? 1 : 0) - (a.fits.length ? 1 : 0) || b.days - a.days)

    const staleRows = (stale ?? []) as { user_id: string; job_id: string; proposed_at: string }[]
    const byPartner = new Map<string, number>()
    for (const s of staleRows) byPartner.set(s.user_id, (byPartner.get(s.user_id) ?? 0) + 1)
    const partnerNames = await namesFor(admin, [...byPartner.keys()])

    const qs = ((questions ?? []) as { id: string; job_id: string; question: string; created_at: string }[]).map(q => ({
      id: q.id,
      search: seatMap.get(q.job_id) ? seatName(seatMap.get(q.job_id)!) : 'a search that is no longer live',
      question: q.question.slice(0, 160),
      days: daysSince(q.created_at) ?? 0,
    }))

    const spent = typeof budget?.spent_usd === 'number' ? budget.spent_usd : null
    const cap = typeof budget?.hard_limit_usd === 'number' ? budget.hard_limit_usd : null
    const oldest = ranked.reduce((m, r) => Math.max(m, r.days), 0)

    const lines: string[] = []
    lines.push(`Waiting on you: ${plural(ranked.length, 'decision')}${ranked.length ? `, oldest ${oldest} d` : ''} · ${plural(staleRows.length, 'proposal')} stale over ${STALE_DAYS} days · ${plural(qs.length, 'search question')} unanswered · ${stranded ?? 0} stuck in ready_for_intro · ${snoozedDue ?? 0} snoozes due · ${reading ?? 0} still being read`)
    if (spent !== null && cap !== null) lines.push(`Model spend this month: $${spent.toFixed(2)} of $${cap}.`)
    lines.push('')
    if (ranked.length) {
      lines.push(`Decisions pending (${ranked.length}), best first:`)
      for (const r of ranked.slice(0, limit)) {
        lines.push(
          `- ${r.grade ?? '?'} · ${r.name} · ${r.read} · fits: ${r.fits.length ? r.fits.join('; ') : 'no live seat'} · owner: ${r.owner} · waiting ${r.days} d · suggested: ${r.suggested ?? 'none'} · id ${r.id}`,
        )
      }
      if (ranked.length > limit) lines.push(`  and ${ranked.length - limit} more.`)
    } else lines.push('No decisions pending.')
    lines.push('')
    if (staleRows.length) {
      lines.push(`Stale proposals (${staleRows.length}) by partner:`)
      for (const [uid, n] of [...byPartner.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) lines.push(`- ${partnerNames.get(uid) ?? uid}: ${n} · partner id ${uid}`)
    }
    if (qs.length) {
      lines.push('')
      lines.push('Unanswered search questions:')
      for (const q of qs) lines.push(`- ${q.search}: "${q.question}" · ${q.days} d · question id ${q.id}`)
    }
    if ((stranded ?? 0) > 0) {
      lines.push('')
      lines.push(`${stranded} people are in ready_for_intro, a stage retired on 6 September 2026. decide_candidate with "bench" moves them.`)
    }

    return {
      text: untrusted(lines.join('\n')),
      data: {
        decisions: ranked.slice(0, limit),
        decisions_total: ranked.length,
        stale_proposals: staleRows.length,
        stale_by_partner: [...byPartner.entries()].map(([user_id, n]) => ({ user_id, name: partnerNames.get(user_id) ?? null, stale: n })),
        questions: qs,
        stranded_ready_for_intro: stranded ?? 0,
        snoozes_due: snoozedDue ?? 0,
        being_read: reading ?? 0,
        spend: budget ?? null,
      },
    }
  },
}

const candidateBrief: Tool<{ candidate_id?: string; query?: string }> = {
  name: 'candidate_brief',
  kind: 'read',
  description:
    'One candidate in full: grade and read from the panel, the evidence lines, the live seats they fit and the blockers, who owns them and since when, where they are in the journey, whether consent is on file, the missing facts, recent activity and emails. Give a candidate_id, or a query (part of a name) to find them first. Surname and contact stay hidden until consent exists.',
  inputSchema: {
    type: 'object',
    properties: { candidate_id: UUID_SCHEMA, query: { type: 'string', minLength: 2, description: 'Part of a name, when you do not have the id.' } },
    additionalProperties: false,
  },
  parse: z.object({ candidate_id: uuid.optional(), query: z.string().min(2).max(80).optional() }),
  async run({ admin }, args) {
    if (!args.candidate_id && !args.query) throw new ToolInputError('Give a candidate_id or a query.')

    if (!args.candidate_id) {
      const { data } = await admin
        .from('candidates')
        .select('id, name, journey_stage, owner_user_id, created_at')
        .ilike('name', `%${args.query!.replace(/[%_]/g, '')}%`)
        .order('created_at', { ascending: false })
        .limit(8)
      const rows = (data ?? []) as Record<string, unknown>[]
      if (!rows.length) return { text: untrusted(`Nobody matches "${args.query}".`), data: { matches: [] } }
      if (rows.length > 1) {
        const consented = await consentedAmong(admin, rows.map(r => r.id as string))
        const owners = await namesFor(admin, rows.map(r => r.owner_user_id as string | null))
        const matches = rows.map(r => ({ id: r.id, name: displayName(r.name as string, consented.has(r.id as string)), stage: r.journey_stage, owner: owners.get(r.owner_user_id as string) ?? null, since: shortDate(r.created_at as string) }))
        return {
          text: untrusted(`${matches.length} people match. Call again with one of these ids:\n${matches.map(m => `- ${m.name} · ${m.stage} · owner ${m.owner ?? 'nobody'} · since ${m.since} · id ${m.id}`).join('\n')}`),
          data: { matches },
        }
      }
      args.candidate_id = rows[0].id as string
    }

    const c = await candidateById(admin, args.candidate_id!)
    if (!c) return { text: 'No candidate with that id.', isError: true }
    const id = c.id as string
    const [panel, owner, consented, { data: activity }, { data: emails }, { data: claims }] = await Promise.all([
      latestPanel(admin, id),
      loadOwner(admin, (c.owner_user_id as string | null) ?? null),
      consentedAmong(admin, [id]),
      admin.from('candidate_activity_log').select('activity_type, description, created_at, source').eq('candidate_id', id).order('created_at', { ascending: false }).limit(6),
      admin.from('candidate_emails').select('kind, to_email, subject, sent_at, error, created_at').eq('candidate_id', id).order('created_at', { ascending: false }).limit(5),
      admin.from('submission_claims').select('holder_user_id, holder_firm_id, client_company_id, protected_through, status').eq('candidate_id', id).eq('status', 'active'),
    ])
    const hasConsent = consented.has(id)
    const seats = panel?.seat_fits?.length ? await loadLiveSeats(admin, panel.seat_fits.map(f => f.job_id)) : []
    const seatMap = new Map(seats.map(s => [s.jobId, s]))
    const parsed = (c.parsed_data ?? {}) as { headline?: string; work_history?: { title?: string; company?: string }[] }
    const current = parsed.work_history?.[0] ? [parsed.work_history[0].title, parsed.work_history[0].company].filter(Boolean).join(' at ') : parsed.headline ?? null

    const lines: string[] = []
    lines.push(`${displayName(c.name as string, hasConsent)} · id ${id}`)
    lines.push([current, c.location, typeof c.experience_years === 'number' ? `${c.experience_years} yrs` : null, c.visa_status].filter(Boolean).join(' · ') || 'no headline on file')
    lines.push(...contactLines(c, hasConsent))
    lines.push(`Journey: ${c.journey_stage ?? 'unknown'} since ${shortDate(c.journey_stage_at as string)} (${daysSince(c.journey_stage_at as string) ?? '?'} d) · source ${c.intake_source ?? 'unknown'} · type ${c.person_type ?? 'unknown'}`)
    lines.push(`Owner: ${owner ? `${owner.name ?? owner.email}${owner.isUs ? ' (Refery)' : ''}` : 'nobody'} · in the book since ${shortDate(c.created_at as string)}`)
    lines.push(`Consent: ${hasConsent ? 'agreed' : 'none on file'}${c.consent_told_candidate ? ' · told they were referred' : ''}`)
    if (claims?.length) lines.push(`Active ownership claims: ${claims.length}, protected through ${claims.map(k => shortDate(k.protected_through as string)).join(', ')}`)
    lines.push('')
    if (panel) {
      lines.push(`Panel read (${shortDate(panel.created_at)}): grade ${panel.grade} · ${[panel.level, panel.function].filter(Boolean).join(' ')}${panel.positioning ? ` · ${panel.positioning}` : ''}`)
      if (panel.summary) lines.push(panel.summary)
      for (const h of panel.highlights ?? []) lines.push(`- ${h}`)
      if (panel.flags?.length) lines.push(`Flags: ${panel.flags.join('; ')}`)
      lines.push(`Suggested: ${panel.suggested_decision}${panel.suggested_reason ? `, ${panel.suggested_reason}` : ''}`)
      if (panel.missing_facts?.length) lines.push(`Missing facts: ${panel.missing_facts.join('; ')}`)
      const fits = (panel.seat_fits ?? []).filter(f => f.fit !== 'no')
      if (fits.length) {
        lines.push('Seat fits:')
        for (const f of fits) {
          const s = seatMap.get(f.job_id)
          lines.push(`- ${f.fit}: ${s ? seatName(s) : 'a seat no longer live'} · ${f.reason}${f.blockers?.length ? ` · blockers: ${f.blockers.join('; ')}` : ''} · job id ${f.job_id}`)
        }
      } else lines.push('Seat fits: none of the live seats.')
    } else lines.push('No panel read yet.')
    if (activity?.length) {
      lines.push('')
      lines.push('Recent activity:')
      for (const a of activity) lines.push(`- ${shortDate(a.created_at as string)} · ${a.activity_type} · ${String(a.description ?? '').slice(0, 140)}`)
    }
    if (emails?.length) {
      lines.push('')
      lines.push('Emails:')
      for (const e of emails) lines.push(`- ${shortDate((e.sent_at ?? e.created_at) as string)} · ${e.kind} · ${e.sent_at ? 'sent' : e.error ? `failed: ${String(e.error).slice(0, 80)}` : 'not sent'}${hasConsent ? ` · to ${e.to_email}` : ''}`)
    }
    if (c.desk_card_channel && c.desk_card_ts) lines.push(`\nDecision card: Slack ${c.desk_card_channel} at ${c.desk_card_ts}.`)

    return {
      text: untrusted(lines.join('\n')),
      data: {
        id,
        name: displayName(c.name as string, hasConsent),
        journey_stage: c.journey_stage,
        owner: owner ? { name: owner.name, user_id: owner.userId } : null,
        consent: hasConsent ? 'agreed' : 'none',
        grade: panel?.grade ?? null,
        suggested_decision: panel?.suggested_decision ?? null,
        seat_fits: (panel?.seat_fits ?? []).map(f => ({ ...f, seat: seatMap.get(f.job_id) ? seatName(seatMap.get(f.job_id)!) : null })),
        missing_facts: panel?.missing_facts ?? [],
        active_claims: claims?.length ?? 0,
      },
    }
  },
}

const searchStatus: Tool<{ job_id?: string; company?: string }> = {
  name: 'search_status',
  kind: 'read',
  description:
    'The live searches on the desk, or one of them: client, headline, stage and days in it, priority, partners proposed and working against the cap, live submissions, unanswered questions. Filter by job_id or by part of a company name.',
  inputSchema: {
    type: 'object',
    properties: { job_id: UUID_SCHEMA, company: { type: 'string', minLength: 2, description: 'Part of the client name.' } },
    additionalProperties: false,
  },
  parse: z.object({ job_id: uuid.optional(), company: z.string().min(2).max(80).optional() }),
  async run({ admin }, args) {
    let q = admin
      .from('partner_roles_v')
      .select('job_id, company_id, company_name, title, headline, location, priority, search_stage, stage_moved_at, submission_cap, live_submission_count, submission_count, salary_min, salary_max, salary_currency, decision_days, hiring_manager_name, added_at')
      .eq('is_live', true)
      .eq('job_status', 'open')
      .order('company_name')
    if (args.job_id) q = q.eq('job_id', args.job_id)
    if (args.company) q = q.ilike('company_name', `%${args.company.replace(/[%_]/g, '')}%`)
    const { data } = await q
    const roles = (data ?? []) as Record<string, unknown>[]
    if (!roles.length) return { text: untrusted('No live search matches.'), data: { searches: [] } }

    const jobIds = roles.map(r => r.job_id as string)
    const [{ data: assignments }, { data: questions }] = await Promise.all([
      admin.from('search_assignments').select('job_id, status, user_id, proposed_at').in('job_id', jobIds).in('status', ['proposed', 'working', 'paused']),
      admin.from('search_questions').select('job_id').in('job_id', jobIds).is('answer', null),
    ])
    const byJob = new Map<string, { proposed: number; working: number; paused: number; stale: number }>()
    const staleBefore = Date.now() - STALE_DAYS * 86_400_000
    for (const a of (assignments ?? []) as { job_id: string; status: string; proposed_at: string }[]) {
      const row = byJob.get(a.job_id) ?? { proposed: 0, working: 0, paused: 0, stale: 0 }
      if (a.status === 'proposed') {
        row.proposed++
        if (Date.parse(a.proposed_at) < staleBefore) row.stale++
      } else if (a.status === 'working') row.working++
      else row.paused++
      byJob.set(a.job_id, row)
    }
    const openQ = new Map<string, number>()
    for (const x of (questions ?? []) as { job_id: string }[]) openQ.set(x.job_id, (openQ.get(x.job_id) ?? 0) + 1)

    const searches = roles.map(r => {
      const a = byJob.get(r.job_id as string) ?? { proposed: 0, working: 0, paused: 0, stale: 0 }
      const cur = (r.salary_currency as string) === 'EUR' ? '€' : (r.salary_currency as string) === 'GBP' ? '£' : '$'
      const band = r.salary_min || r.salary_max ? `${cur}${Math.round(Number(r.salary_min ?? 0) / 1000)}k to ${cur}${Math.round(Number(r.salary_max ?? 0) / 1000)}k` : null
      return {
        job_id: r.job_id as string,
        company: r.company_name as string,
        headline: (r.headline as string) || (r.title as string),
        location: (r.location as string) ?? null,
        band,
        priority: r.priority as string,
        stage: (r.search_stage as string) ?? 'sourcing',
        days_in_stage: daysSince((r.stage_moved_at as string) ?? (r.added_at as string)),
        partners: a,
        cap: (r.submission_cap as number) ?? null,
        live_submissions: (r.live_submission_count as number) ?? 0,
        submissions_ever: (r.submission_count as number) ?? 0,
        questions_open: openQ.get(r.job_id as string) ?? 0,
        hiring_manager: (r.hiring_manager_name as string) ?? null,
        decision_days: (r.decision_days as number) ?? null,
      }
    })

    const lines = searches.map(
      s =>
        `- ${s.company} · ${s.headline}${s.location ? ` · ${s.location}` : ''}${s.band ? ` · ${s.band}` : ''} · ${s.priority} · ${s.stage} for ${s.days_in_stage ?? '?'} d · partners: ${s.partners.working} working, ${s.partners.proposed} proposed${s.partners.stale ? ` (${s.partners.stale} stale)` : ''}${s.cap ? ` of ${s.cap}` : ''} · submissions: ${s.live_submissions} live, ${s.submissions_ever} ever${s.questions_open ? ` · ${s.questions_open} question(s) open` : ''} · job id ${s.job_id}`,
    )
    return { text: untrusted(`${plural(searches.length, 'live search', 'live searches')}:\n${lines.join('\n')}`), data: { searches } }
  },
}

const partnerShortlist: Tool<{ job_id: string; limit?: number }> = {
  name: 'partner_shortlist',
  kind: 'read',
  description:
    'Who to propose a search to and why: every active partner not yet on it, scored by the same rule the onboarding matcher uses (their network cities, functions and stages against the search), with the size of their own book. Read-only; propose_search is the write.',
  inputSchema: {
    type: 'object',
    properties: { job_id: UUID_SCHEMA, limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Default 8.' } },
    required: ['job_id'],
    additionalProperties: false,
  },
  parse: z.object({ job_id: uuid, limit: z.number().int().min(1).max(30).optional() }),
  async run({ admin }, args) {
    const { data: role } = await admin
      .from('partner_roles_v')
      .select('job_id, company_id, title, headline, company_name, location, location_buckets, department, company_stage, priority, search_stage, submission_cap, hard_requirements, is_live, job_status')
      .eq('job_id', args.job_id)
      .maybeSingle()
    if (!role) return { text: 'No search with that job id.', isError: true }

    const [{ data: partners }, { data: prefs }, { data: onIt }, { data: books }] = await Promise.all([
      admin.from('users_admin').select('user_id, full_name, email, role, company_id').eq('status', 'active').in('role', ['recruiter', 'scout']),
      admin.from('partner_preferences').select('user_id, network_cities, functions, stages, would_relocate'),
      admin.from('search_assignments').select('user_id, status').eq('job_id', args.job_id),
      admin.from('candidates').select('owner_user_id').not('owner_user_id', 'is', null),
    ])
    const prefMap = new Map(((prefs ?? []) as ({ user_id: string } & Preferences)[]).map(p => [p.user_id, p]))
    const already = new Map(((onIt ?? []) as { user_id: string; status: string }[]).map(a => [a.user_id, a.status]))
    const book = new Map<string, number>()
    for (const b of (books ?? []) as { owner_user_id: string }[]) book.set(b.owner_user_id, (book.get(b.owner_user_id) ?? 0) + 1)

    const scored: { user_id: string; name: string; role: string; score: number; reason: string; book: number; no_preferences: boolean }[] = []
    let withoutPrefs = 0
    for (const p of (partners ?? []) as { user_id: string; full_name: string | null; email: string; role: string }[]) {
      if (!p.user_id || already.has(p.user_id)) continue
      const pref = prefMap.get(p.user_id)
      if (!pref) {
        withoutPrefs++
        continue
      }
      const m = scoreRole({ network_cities: pref.network_cities ?? [], functions: pref.functions ?? [], stages: pref.stages ?? [], would_relocate: pref.would_relocate ?? null }, role as LiveRole)
      if (!m) continue
      scored.push({ user_id: p.user_id, name: p.full_name || p.email, role: p.role, score: m.score, reason: m.reason, book: book.get(p.user_id) ?? 0, no_preferences: false })
    }
    scored.sort((a, b) => b.score - a.score || b.book - a.book)
    const top = scored.slice(0, args.limit ?? 8)

    const head = `${role.company_name} · ${role.headline || role.title}: ${already.size} already on it (${[...already.values()].join(', ') || 'none'}), ${scored.length} partners score a match, ${withoutPrefs} active partners have no preferences on file and cannot be scored.`
    const lines = top.map(s => `- ${s.name} (${s.role}) · score ${s.score} · ${s.reason || 'location matches only'} · ${plural(s.book, 'person', 'people')} in their book · partner id ${s.user_id}`)
    return { text: untrusted(`${head}\n${lines.join('\n') || 'Nobody scores a match. Try search_status for the location and function, then look at who is not on preferences.'}`), data: { job_id: args.job_id, already_on_it: already.size, unscored: withoutPrefs, shortlist: top } }
  },
}

const ownershipCheck: Tool<{ candidate_id?: string; email?: string; linkedin_url?: string; name?: string }> = {
  name: 'ownership_check',
  kind: 'read',
  description:
    'Who owns a person and until when, before anyone spends a day on them. Looks up by candidate_id, email, LinkedIn URL or name; returns the owner on the record, the intake source, and every active submission claim with its client and the date protection ends. The rule is 24 months from a qualified submission.',
  inputSchema: {
    type: 'object',
    properties: { candidate_id: UUID_SCHEMA, email: { type: 'string' }, linkedin_url: { type: 'string' }, name: { type: 'string', minLength: 2 } },
    additionalProperties: false,
  },
  parse: z.object({ candidate_id: uuid.optional(), email: z.string().email().optional(), linkedin_url: z.string().min(8).optional(), name: z.string().min(2).max(80).optional() }),
  async run({ admin }, args) {
    if (!args.candidate_id && !args.email && !args.linkedin_url && !args.name) throw new ToolInputError('Give a candidate_id, email, linkedin_url or name.')
    let q = admin.from('candidates').select('id, name, owner_user_id, intake_source, created_at, journey_stage').limit(10)
    if (args.candidate_id) q = q.eq('id', args.candidate_id)
    else if (args.email) q = q.ilike('email', args.email.trim())
    else if (args.linkedin_url) q = q.ilike('linkedin_url', `%${args.linkedin_url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '').replace(/[%_]/g, '')}%`)
    else q = q.ilike('name', `%${args.name!.replace(/[%_]/g, '')}%`)
    const { data } = await q
    const rows = (data ?? []) as Record<string, unknown>[]
    if (!rows.length) return { text: untrusted('Nobody on the book matches. Not owned by anyone here.'), data: { matches: [] } }

    const ids = rows.map(r => r.id as string)
    const [owners, consented, { data: claims }] = await Promise.all([
      namesFor(admin, rows.map(r => r.owner_user_id as string | null)),
      consentedAmong(admin, ids),
      admin.from('submission_claims').select('candidate_id, holder_user_id, holder_firm_id, client_company_id, protected_through, qualified_submission_at').in('candidate_id', ids).eq('status', 'active'),
    ])
    const claimRows = (claims ?? []) as Record<string, unknown>[]
    const holderNames = await namesFor(admin, claimRows.map(k => k.holder_user_id as string | null))
    const clientIds = [...new Set(claimRows.map(k => k.client_company_id as string).filter(Boolean))]
    const { data: clients } = clientIds.length ? await admin.from('companies').select('id, name').in('id', clientIds) : { data: [] }
    const clientNames = new Map((clients ?? []).map(c => [c.id as string, c.name as string]))

    const matches = rows.map(r => {
      const mine = claimRows.filter(k => k.candidate_id === r.id)
      return {
        id: r.id as string,
        name: displayName(r.name as string, consented.has(r.id as string)),
        owner: owners.get(r.owner_user_id as string) ?? null,
        since: shortDate(r.created_at as string),
        source: r.intake_source as string | null,
        stage: r.journey_stage as string | null,
        claims: mine.map(k => ({
          holder: k.holder_user_id ? holderNames.get(k.holder_user_id as string) ?? 'a partner' : k.holder_firm_id ? 'a firm' : 'unknown',
          client: clientNames.get(k.client_company_id as string) ?? 'a client',
          submitted: shortDate(k.qualified_submission_at as string),
          protected_through: shortDate(k.protected_through as string),
        })),
      }
    })
    const lines = matches.map(m => {
      const own = m.owner ? `owned by ${m.owner} since ${m.since}` : `nobody owns them (${m.source ?? 'unknown source'}, since ${m.since})`
      const cl = m.claims.length ? m.claims.map(k => `${k.holder} at ${k.client}, submitted ${k.submitted}, protected through ${k.protected_through}`).join('; ') : 'no active submission claim'
      return `- ${m.name} · ${m.stage ?? '?'} · ${own} · ${cl} · id ${m.id}`
    })
    return { text: untrusted(`${lines.join('\n')}\n\nA qualified submission protects the submitter for ${PROTECTION_MONTHS} months with that client.`), data: { matches } }
  },
}

const spendStatus: Tool<Record<string, never>> = {
  name: 'spend_status',
  kind: 'read',
  description: 'This month\'s model spend against the cap, by source (desk panels, parser, bench, onboarding, transcripts), and whether anything is deferred or blocked.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  parse: z.object({}).strict(),
  async run({ admin }) {
    const b = await budgetStatus(admin)
    if (!b) return { text: 'The ledger did not answer.', isError: true }
    const by = (b.by_source ?? {}) as Record<string, { spent?: number; deferred?: number; blocked?: number }>
    const lines = Object.entries(by)
      .sort((x, y) => (y[1].spent ?? 0) - (x[1].spent ?? 0))
      .map(([k, v]) => `- ${k}: $${(v.spent ?? 0).toFixed(2)}${v.deferred ? ` · ${v.deferred} deferred` : ''}${v.blocked ? ` · ${v.blocked} blocked` : ''}`)
    return {
      text: untrusted(`${b.month}: $${Number(b.spent_usd ?? 0).toFixed(2)} spent of $${b.hard_limit_usd} (alert at $${b.alert_usd}, defer at $${b.defer_usd})${b.over_defer ? ' · OVER THE DEFER LINE, panels are queuing' : b.over_alert ? ' · over the alert line' : ''}.\n${lines.join('\n')}`),
      data: b,
    }
  },
}

// ── writes ───────────────────────────────────────────────────────────────────

const DECISIONS = ['intro_now', 'bench', 'not_fit', 'snooze', 'manual'] as const

const decideCandidate: Tool<{ candidate_ids: string[]; decision: (typeof DECISIONS)[number]; reason_line?: string; job_ids?: string[] }> = {
  name: 'decide_candidate',
  kind: 'write',
  description:
    'The reactions on a decision card, as a call: intro_now (the intro ask goes to the owner, or to the person when Refery owns them), bench (the note goes to the owner, the person moves to the bench), not_fit (needs reason_line, one sentence the owner will read), snooze (a week of quiet), manual (you will do it by hand). Up to 20 people at once. Each one sends the same email the reaction would, moves the journey, and is written to the Slack thread. Journaled with Lily as the actor.',
  inputSchema: {
    type: 'object',
    properties: {
      candidate_ids: { type: 'array', items: UUID_SCHEMA, minItems: 1, maxItems: 20 },
      decision: { type: 'string', enum: [...DECISIONS] },
      reason_line: { type: 'string', description: 'Required for not_fit. Goes to the owner, never to the candidate.' },
      job_ids: { type: 'array', items: UUID_SCHEMA, description: 'For intro_now: only these seats.' },
    },
    required: ['candidate_ids', 'decision'],
    additionalProperties: false,
  },
  parse: z.object({
    candidate_ids: z.array(uuid).min(1).max(20),
    decision: z.enum(DECISIONS),
    reason_line: z.string().min(8).max(600).optional(),
    job_ids: z.array(uuid).max(10).optional(),
  }),
  async run({ admin, lilyId, actor }, args) {
    if (args.decision === 'not_fit' && !args.reason_line) throw new ToolInputError('not_fit needs a reason_line the owner will read.')
    const results: { id: string; ok: boolean; message: string }[] = []
    for (const id of args.candidate_ids) {
      const c = await candidateById(admin, id)
      if (!c) {
        results.push({ id, ok: false, message: 'not found' })
        continue
      }
      const r = await applyDecision(admin, {
        candidateId: id,
        decision: args.decision as Decision,
        by: lilyId ?? actor,
        via: 'web',
        reasonLine: args.reason_line ?? null,
        jobIds: args.job_ids,
      })
      results.push({ id, ok: r.ok, message: r.message })
      await mirrorToCard(c, `${r.ok ? ':white_check_mark:' : ':warning:'} ${VIA_MCP} ${args.decision.replace(/_/g, ' ')}. ${r.message}`)
    }
    const done = results.filter(r => r.ok).length
    const text = results.map(r => `- ${r.id}: ${r.ok ? 'done' : 'not done'} · ${r.message.replace(/\*/g, '')}`).join('\n')
    return { text: untrusted(`${done} of ${results.length} ${args.decision.replace(/_/g, ' ')}.\n${text}`), data: { decision: args.decision, done, results }, isError: done === 0 }
  },
}

const proposeSearch: Tool<{ job_id: string; partner_ids?: string[]; partner_emails?: string[]; why: string }> = {
  name: 'propose_search',
  kind: 'write',
  description:
    'Put partners on a search as a proposal they confirm or decline from their Searches page, and send each the proposal email with your line on why them. Same as the admin button. Re-proposing someone who declined resets their row. Name partners by id (from partner_shortlist) or email.',
  inputSchema: {
    type: 'object',
    properties: {
      job_id: UUID_SCHEMA,
      partner_ids: { type: 'array', items: UUID_SCHEMA, maxItems: 10 },
      partner_emails: { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 10 },
      why: { type: 'string', minLength: 20, maxLength: 500, description: 'Why this partner, in a sentence they read.' },
    },
    required: ['job_id', 'why'],
    additionalProperties: false,
  },
  parse: z.object({ job_id: uuid, partner_ids: z.array(uuid).max(10).optional(), partner_emails: z.array(z.string().email()).max(10).optional(), why: z.string().min(20).max(500) }),
  async run({ admin, lilyId }, args) {
    if (!args.partner_ids?.length && !args.partner_emails?.length) throw new ToolInputError('Name at least one partner by id or email.')
    const { data: role } = await admin
      .from('partner_roles_v')
      .select('job_id, company_id, title, headline, company_name, salary_min, salary_max, salary_currency, fee_percentage, fee_flat, scout_payout, scout_share, location, is_live')
      .eq('job_id', args.job_id)
      .maybeSingle()
    if (!role) return { text: 'No search with that job id.', isError: true }
    if (!role.is_live) return { text: `${role.company_name} · ${role.headline || role.title} is not live. Nothing proposed.`, isError: true }

    let q = admin.from('users_admin').select('user_id, email, full_name, status, role')
    if (args.partner_ids?.length && args.partner_emails?.length) q = q.or(`user_id.in.(${args.partner_ids.join(',')}),email.in.(${args.partner_emails.map(e => e.toLowerCase()).join(',')})`)
    else if (args.partner_ids?.length) q = q.in('user_id', args.partner_ids)
    else q = q.in('email', args.partner_emails!.map(e => e.toLowerCase()))
    const { data: users } = await q
    const eligible = (users ?? []).filter(u => u.status === 'active' && u.user_id)
    if (!eligible.length) return { text: 'None of those partners are active accounts. Nothing proposed.', isError: true }

    const now = new Date()
    const { error } = await admin.from('search_assignments').upsert(
      eligible.map(u => ({
        job_id: args.job_id,
        company_id: role.company_id as string,
        user_id: u.user_id as string,
        status: 'proposed',
        why: args.why,
        proposed_by: lilyId,
        proposed_at: now.toISOString(),
        expires_at: new Date(now.getTime() + PROPOSAL_DAYS * 86_400_000).toISOString(),
        confirmed_at: null,
        declined_at: null,
        declined_reason: null,
        updated_at: now.toISOString(),
        note: 'proposed via the desk MCP',
      })),
      { onConflict: 'job_id,user_id' },
    )
    if (error) return { text: `Could not write the proposals: ${error.message}`, isError: true }

    const sent: string[] = []
    const failed: string[] = []
    for (const u of eligible) {
      const r = await sendSearchProposalEmail({ to: u.email as string, fullName: (u.full_name as string) ?? '', role, why: args.why, jobId: args.job_id, companyId: role.company_id as string })
      ;(r.sent ? sent : failed).push((u.full_name as string) || (u.email as string))
    }
    const label = `${role.company_name} · ${role.headline || role.title}`
    await postMessage(deskChannel('feed'), `${VIA_MCP} proposed *${esc(label)}* to ${esc(eligible.map(u => (u.full_name as string) || (u.email as string)).join(', '))}. Why: ${esc(args.why)}${failed.length ? ` · email failed for ${esc(failed.join(', '))}` : ''}`, [])
    return {
      text: untrusted(`Proposed ${label} to ${eligible.length}: ${sent.length ? `emailed ${sent.join(', ')}` : 'no email went out'}${failed.length ? `; email failed for ${failed.join(', ')}` : ''}. Proposals expire in ${PROPOSAL_DAYS} days.`),
      data: { job_id: args.job_id, proposed: eligible.map(u => u.user_id), emailed: sent.length, failed: failed.length },
    }
  },
}

const DRAFT_KINDS = ['intro_now', 'bench', 'not_fit', 'intro_kit'] as const

const draftEmail: Tool<{ candidate_id: string; kind: (typeof DRAFT_KINDS)[number] }> = {
  name: 'draft_email',
  kind: 'read',
  description:
    'The email a decision would send, as text, without sending it: the intro ask (intro_now), the bench note (bench), the passing note (not_fit), each addressed to whoever the desk would write to, or the intro kit (intro_kit) a partner forwards. Returns subject and body; the draft carries the person's full name because it is the email itself. Never sends; send_desk_email is a separate tool.',
  inputSchema: { type: 'object', properties: { candidate_id: UUID_SCHEMA, kind: { type: 'string', enum: [...DRAFT_KINDS] } }, required: ['candidate_id', 'kind'], additionalProperties: false },
  parse: z.object({ candidate_id: uuid, kind: z.enum(DRAFT_KINDS) }),
  async run({ admin }, args) {
    const c = await candidateById(admin, args.candidate_id)
    if (!c) return { text: 'No candidate with that id.', isError: true }
    const owner = await loadOwner(admin, (c.owner_user_id as string | null) ?? null)
    const name = properName(c.name as string)
    if (args.kind === 'intro_kit') {
      const kit = await buildIntroKit(admin, c, { withLink: false, ownerUserId: (c.owner_user_id as string | null) ?? null })
      return { text: untrusted(`Intro kit for ${name}, nothing sent:\n\n${kitText(kit)}`), data: { candidate_id: args.candidate_id, kind: args.kind, body: kitText(kit) } }
    }
    const panel = await latestPanel(admin, args.candidate_id)
    if (!panel) return { text: `${name} has no panel read yet, so there is no draft. Nothing sent.`, isError: true }
    const recipient = recipientFor(c, owner)
    const d = draftFor(panel, args.kind)
    const subject = d.subject || decisionSubject(args.kind, recipient, name)
    const to = recipient === 'owner' ? `${owner?.name ?? 'the owner'} (owner)` : `${name} (the candidate)`
    return {
      text: untrusted(`Draft ${args.kind.replace(/_/g, ' ')} for ${name}, to ${to}. Nothing sent.\n\nSubject: ${subject}\n\n${d.body || '(the panel wrote no body for this decision)'}`),
      data: { candidate_id: args.candidate_id, kind: args.kind, recipient, subject, body: d.body },
    }
  },
}

const sendDeskEmailTool: Tool<{ to: string; subject: string; body: string; candidate_id?: string; kind?: string; confirm?: boolean }> = {
  name: 'send_desk_email',
  kind: 'write',
  description:
    'Send one email from lily@refery.io, recorded on the candidate\'s timeline when candidate_id is given. Refuses unless confirm is true: show the person the exact recipient, subject and body first, and pass confirm only after they said yes. Plain text; links are written out. Nothing here drafts for you, draft_email does.',
  inputSchema: {
    type: 'object',
    properties: {
      to: { type: 'string', format: 'email' },
      subject: { type: 'string', minLength: 3, maxLength: 200 },
      body: { type: 'string', minLength: 20, maxLength: 6000 },
      candidate_id: UUID_SCHEMA,
      kind: { type: 'string', description: 'A short label for the timeline. Default mcp_note.' },
      confirm: { type: 'boolean', description: 'Must be true. The person has read the email and said send.' },
    },
    required: ['to', 'subject', 'body'],
    additionalProperties: false,
  },
  parse: z.object({ to: z.string().email(), subject: z.string().min(3).max(200), body: z.string().min(20).max(6000), candidate_id: uuid.optional(), kind: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/).optional(), confirm: z.boolean().optional() }),
  async run({ admin, actor }, args) {
    if (args.confirm !== true) return { text: `Not sent. Show the person this email, to ${args.to}, subject "${args.subject}", and call again with confirm: true once they say send.`, isError: true }
    const c = args.candidate_id ? await candidateById(admin, args.candidate_id) : null
    if (args.candidate_id && !c) return { text: 'No candidate with that id. Nothing sent.', isError: true }
    const r = await sendDeskEmail(admin, { candidateId: c ? (c.id as string) : null, kind: args.kind ?? 'mcp_note', to: args.to, subject: args.subject, body: args.body, sentBy: actor, meta: { via: 'mcp' } })
    if (c) await mirrorToCard(c, `${r.ok ? ':email:' : ':warning:'} ${VIA_MCP} ${r.ok ? `emailed ${esc(args.to)}: "${esc(args.subject)}"` : `email to ${esc(args.to)} failed: ${esc(r.error ?? 'unknown')}`}`)
    return r.ok
      ? { text: `Sent to ${args.to}: "${args.subject}".${c ? ' Recorded on the timeline.' : ''}`, data: { email_id: r.emailId, thread_id: r.threadId } }
      : { text: `Not sent: ${r.error ?? 'unknown error'}. The attempt is recorded${c ? ' on the timeline' : ''}.`, isError: true }
  },
}

const runBench: Tool<{ job_id: string }> = {
  name: 'run_bench',
  kind: 'write',
  description:
    'Re-match one live seat against the bench now, the way the Monday run does: reads the bench, posts a bench card in #refery-desk for each strong match, costs model spend from the ledger. Use when a seat changed or you want the answer today rather than Monday.',
  inputSchema: { type: 'object', properties: { job_id: UUID_SCHEMA }, required: ['job_id'], additionalProperties: false },
  parse: z.object({ job_id: uuid }),
  async run({ admin }, args) {
    const r = await runBenchMatch(admin, args.job_id, 'mcp')
    const ok = r.posted || (r.outcome !== 'input_error' && !r.error)
    return {
      text: `Bench run ${ok ? 'done' : `stopped: ${r.error ?? r.outcome}`}: checked ${r.checked}, ${plural(r.strong, 'strong match', 'strong matches')}, ${r.posted ? 'card posted in #refery-desk' : 'no card posted'}.`,
      data: { ...r },
      isError: !ok,
    }
  },
}

const note: Tool<{ candidate_id?: string; job_id?: string; text: string }> = {
  name: 'note',
  kind: 'write',
  description:
    'A line onto a candidate (their activity log, and the Slack thread under their card) or onto a search (its internal notes). One of candidate_id or job_id. This is a note in Lily\'s name, nothing is sent to anyone.',
  inputSchema: {
    type: 'object',
    properties: { candidate_id: UUID_SCHEMA, job_id: UUID_SCHEMA, text: { type: 'string', minLength: 3, maxLength: 2000 } },
    required: ['text'],
    additionalProperties: false,
  },
  parse: z.object({ candidate_id: uuid.optional(), job_id: uuid.optional(), text: z.string().min(3).max(2000) }),
  async run({ admin, lilyId }, args) {
    if (!!args.candidate_id === !!args.job_id) throw new ToolInputError('Give exactly one of candidate_id or job_id.')
    if (args.candidate_id) {
      const c = await candidateById(admin, args.candidate_id)
      if (!c) return { text: 'No candidate with that id.', isError: true }
      await logActivity(admin, args.candidate_id, 'note', args.text, { source: 'human', performedBy: lilyId, metadata: { via: 'mcp' } })
      const mirrored = await mirrorToCard(c, `:memo: ${VIA_MCP} ${esc(args.text)}`)
      return { text: `Noted on ${properName(c.name as string)}${mirrored ? ', and in the Slack thread' : ''}.`, data: { candidate_id: args.candidate_id, mirrored } }
    }
    const { data: role } = await admin.from('partner_roles_v').select('job_id, company_name, headline, title').eq('job_id', args.job_id!).maybeSingle()
    if (!role) return { text: 'No search with that job id.', isError: true }
    const { error } = await admin.from('job_internal_notes').insert({ job_id: args.job_id, user_id: lilyId, note_type: 'general', content: args.text })
    if (error) return { text: `Could not write the note: ${error.message}`, isError: true }
    return { text: `Noted on ${role.company_name} · ${role.headline || role.title}.`, data: { job_id: args.job_id } }
  },
}

// ── registry ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOLS: Tool<any>[] = [deskInbox, candidateBrief, searchStatus, partnerShortlist, ownershipCheck, spendStatus, decideCandidate, proposeSearch, draftEmail, sendDeskEmailTool, runBench, note]

export const TOOL_SPECS: ToolSpec[] = TOOLS.map(t => ({ name: t.name, kind: t.kind, description: t.description, inputSchema: t.inputSchema }))
export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.filter(t => t.kind === 'write').map(t => t.name))

export function toolKind(name: string): ToolKind | null {
  return TOOLS.find(t => t.name === name)?.kind ?? null
}

export const SETTINGS_URL = `${APP_URL}/admin/settings#mcp`

/**
 * The registry the route hands to the protocol. Write tools are checked
 * against the switches on every call, so turning one off takes effect on the
 * next message, not the next session.
 */
export function buildRegistry(admin: SupabaseClient, actor = 'lily'): ToolRegistry {
  let lily: string | null | undefined
  return {
    specs: () => TOOL_SPECS,
    async call(name, args) {
      const tool = TOOLS.find(t => t.name === name)
      if (!tool) throw new UnknownToolError(name)
      if (tool.kind === 'write') {
        const writes = await loadWrites(admin)
        if (!writes[name]) return { text: `${name} is switched off. Turn it on at ${SETTINGS_URL} and call again. Nothing was changed.`, isError: true }
      }
      const parsed = tool.parse.safeParse(args)
      if (!parsed.success) throw new ToolInputError(parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '))
      if (lily === undefined) lily = await lilyUserId(admin)
      return tool.run({ admin, actor, lilyId: lily ?? null }, parsed.data)
    },
  }
}
