/**
 * The three things the super admin hears about the moment they happen.
 *
 * Lily's brief on 6 Sep 2026: critical only, never buried. So this file posts
 * exactly three kinds of message to #refery-desk and nothing else:
 *
 *   a submission      one card, with everything needed to judge it: who the
 *                     candidate is, what the partner said, what the search
 *                     wants. :+1: on the card shortlists it; a decline needs a
 *                     reason the partner will read, so that stays on the page.
 *   a declined        one line with the partner's reason, because the search
 *   proposal          now needs someone else and the reason says where to look.
 *   a withdrawal      one line, only when the candidate was already in front of
 *                     the client. A withdrawal before that is the partner's
 *                     business and shows on the page.
 *
 * Everything else stays on the page or in Sunday's digest. Best-effort
 * throughout: nothing here may fail the request that triggered it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { addReaction, esc, postMessage, postThreadReply, type SlackBlock } from '@/lib/slack-bot'
import { submissionStatus } from '@/lib/partners'
import { workAuthLabel } from '@/lib/partners'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

/** #refery-desk, private, created 6 Sep 2026. Invite @Refery Ops once. */
const DESK_CHANNEL = 'C0BVB3YPABB'
/** Until the bot is in #refery-desk, cards fall through to #refery-search-access. */
const FALLBACK_CHANNEL = 'C0BV751LTJS'

export function deskChannels(): string[] {
  return [...new Set([process.env.SLACK_CHANNEL_DESK || DESK_CHANNEL, FALLBACK_CHANNEL].filter(Boolean))]
}

const money = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) ? `$${Math.round(n).toLocaleString('en-US')}` : null

async function postToDesk(text: string, blocks?: SlackBlock[]): Promise<{ ok: boolean; ts?: string; channel?: string; error?: string }> {
  let last: { ok: boolean; ts?: string; channel?: string; error?: string } = { ok: false, error: 'no channel' }
  for (const channel of deskChannels()) {
    last = await postMessage(channel, text, blocks ?? [{ type: 'section', text: { type: 'mrkdwn', text } }])
    if (last.ok && last.ts) return last
  }
  return last
}

// ── 1. a submission ──────────────────────────────────────────────────────────

interface WorkItem {
  title?: unknown
  company?: unknown
}

function currentRole(candidate: Record<string, unknown>): string | null {
  const history = Array.isArray(candidate.work_history)
    ? (candidate.work_history as WorkItem[])
    : Array.isArray((candidate.parsed_data as { work_history?: unknown } | null)?.work_history)
      ? ((candidate.parsed_data as { work_history: WorkItem[] }).work_history)
      : []
  const cur = history[0]
  if (!cur) return null
  const t = typeof cur.title === 'string' ? cur.title.trim() : ''
  const c = typeof cur.company === 'string' ? cur.company.trim() : ''
  return [t, c].filter(Boolean).join(' at ') || null
}

/**
 * One card per submission, posted right after the partner presses Submit.
 * Reads back everything the review needs so Lily can decide from Slack
 * without opening three tabs, and links the two she might still want.
 */
export async function announceSubmission(submissionId: string): Promise<{ sent: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: s } = await admin
    .from('role_submissions_v')
    .select('id, job_id, company_id, candidate_id, candidate_name, candidate_grade, candidate_location, candidate_experience_years, job_title, company_name, submitted_by_name, submitted_by_email, pitch, highlights, work_authorization, current_base, target_base, spoken_to_candidate, acted_by_name')
    .eq('id', submissionId)
    .maybeSingle()
  if (!s) return { sent: false, error: 'submission not found' }

  const [{ data: cand }, { data: role }, { data: claim }, { data: partner }] = await Promise.all([
    admin
      .from('candidates')
      .select('linkedin_url, resume_blob_pathname, work_history, parsed_data, availability_status, email')
      .eq('id', s.candidate_id)
      .maybeSingle(),
    admin
      .from('partner_roles_v')
      .select('headline, search_stage, submission_cap, live_submission_count, hard_requirements, not_for, location, salary_min, salary_max')
      .eq('job_id', s.job_id)
      .maybeSingle(),
    admin
      .from('submission_claims')
      .select('relationship_note')
      .eq('candidate_id', s.candidate_id)
      .eq('client_company_id', s.company_id)
      .eq('status', 'active')
      .order('qualified_submission_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from('users_admin').select('role').eq('email', s.submitted_by_email).maybeSingle(),
  ])

  const c = (cand ?? {}) as Record<string, unknown>
  const title = (role?.headline as string | null) || (s.job_title as string)
  const searchUrl = `${APP_URL}/searches/${s.company_id}/roles/${s.job_id}`
  const candidateUrl = `${APP_URL}/candidates/${s.candidate_id}`
  const cvUrl = c.resume_blob_pathname ? `${APP_URL}/api/file?pathname=${encodeURIComponent(String(c.resume_blob_pathname))}` : null
  const slots =
    role?.submission_cap ? `${role.live_submission_count} of ${role.submission_cap} slots used` : `${role?.live_submission_count ?? 0} live on this search`

  const who = [
    currentRole(c),
    s.candidate_location,
    s.candidate_experience_years ? `${s.candidate_experience_years} yrs` : null,
    c.availability_status ? String(c.availability_status).replace(/_/g, ' ') : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const facts = [
    s.work_authorization ? `Work auth: ${workAuthLabel(s.work_authorization as string) ?? s.work_authorization}` : 'Work auth: not given',
    money(s.current_base) ? `Current base: ${money(s.current_base)}` : null,
    money(s.target_base) ? `Target base: ${money(s.target_base)}` : null,
    s.spoken_to_candidate ? `Spoken to them: ${String(s.spoken_to_candidate).replace(/_/g, ' ')}` : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const partnerLine = `${s.submitted_by_name || s.submitted_by_email}${partner?.role ? ` · ${String(partner.role).replace(/_/g, ' ')}` : ''}${s.acted_by_name ? ` (entered by ${String(s.acted_by_name).split(' ')[0]} for them)` : ''}`

  const wants = [
    Array.isArray(role?.hard_requirements) && role.hard_requirements.length ? `Must: ${(role.hard_requirements as string[]).slice(0, 4).join('; ')}` : null,
    role?.not_for ? `Not for: ${role.not_for}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:inbox_tray: *${esc(s.candidate_name as string)}${s.candidate_grade ? ` · ${esc(String(s.candidate_grade))}` : ''}* submitted to *${esc(title)}* at ${esc(s.company_name as string)}`,
      },
    },
    ...(who ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: esc(who) }] }] : []),
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*From*\n${esc(partnerLine)}` },
        { type: 'mrkdwn', text: `*Search*\n${esc(String(role?.search_stage ?? 'sourcing').replace(/_/g, ' '))} · ${esc(slots)}` },
      ],
    },
    ...(s.pitch ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Why them*\n>${esc(String(s.pitch)).slice(0, 1800).replace(/\n/g, '\n>')}` } }] : []),
    ...(Array.isArray(s.highlights) && s.highlights.length
      ? [{ type: 'section', text: { type: 'mrkdwn', text: (s.highlights as string[]).slice(0, 5).map(h => `• ${esc(h)}`).join('\n') } }]
      : []),
    ...(claim?.relationship_note ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `*How they know them:* ${esc(String(claim.relationship_note))}` }] }] : []),
    { type: 'context', elements: [{ type: 'mrkdwn', text: esc(facts) }] },
    ...(wants ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `*The search wants*\n${esc(wants)}` }] }] : []),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: [
            cvUrl ? `<${cvUrl}|CV>` : 'no CV on file',
            c.linkedin_url ? `<${esc(String(c.linkedin_url))}|LinkedIn>` : null,
            `<${candidateUrl}|candidate>`,
            `<${searchUrl}|search>`,
          ]
            .filter(Boolean)
            .join('  ·  '),
        },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: ':+1: shortlist  ·  to decline, open the search and say why (the partner reads it)' }] },
  ]

  const posted = await postToDesk(`${s.candidate_name} submitted to ${title} at ${s.company_name}`, blocks)
  if (!posted.ok || !posted.ts || !posted.channel) return { sent: false, error: posted.error }

  await admin
    .from('role_submissions')
    .update({ slack_channel_id: posted.channel, slack_message_ts: posted.ts })
    .eq('id', submissionId)
  await addReaction(posted.channel, posted.ts, '+1')
  return { sent: true }
}

/** The submission whose card is this Slack message, if it is one. */
export async function submissionForSlackMessage(channel: string, ts: string): Promise<{ id: string; status: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('role_submissions')
    .select('id, status')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()
  return data ? { id: data.id as string, status: data.status as string } : null
}

/**
 * :+1: on a submission card. Only a fresh submission can be shortlisted this
 * way; anything further along is a page decision. The claim is conditional on
 * status = 'submitted', so a double tap shortlists once.
 */
export async function shortlistFromSlack(input: { id: string; slackUser: string; channel: string; ts: string }): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: claimed, error } = await admin
    .from('role_submissions')
    .update({ status: 'shortlisted', reviewed_at: now, updated_at: now })
    .eq('id', input.id)
    .eq('status', 'submitted')
    .select('id, candidate_id')
  if (error) {
    await postThreadReply(input.channel, input.ts, `:warning: Could not shortlist: ${error.message}`)
    return
  }
  if (!claimed?.length) {
    const { data: row } = await admin.from('role_submissions').select('status').eq('id', input.id).maybeSingle()
    const label = row ? submissionStatus(row.status as string).label.toLowerCase() : 'decided'
    await postThreadReply(input.channel, input.ts, `Already ${label}, so nothing changed.`)
    return
  }
  await admin.from('role_submission_events').insert({
    submission_id: input.id,
    from_status: 'submitted',
    to_status: 'shortlisted',
    note: null,
    actor_user_id: null,
  })
  await postThreadReply(input.channel, input.ts, `:+1: <@${input.slackUser}> shortlisted. The partner sees "Shortlisted" on the search; next step is sending to the client from the page.`)
}

/** :-1: on a submission card: declining needs a reason the partner reads, so point at the page. */
export async function declineNeedsPage(input: { id: string; channel: string; ts: string }): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin.from('role_submissions').select('job_id, company_id').eq('id', input.id).maybeSingle()
  const url = data ? `${APP_URL}/searches/${data.company_id}/roles/${data.job_id}` : `${APP_URL}/searches`
  await postThreadReply(input.channel, input.ts, `A decline carries a reason the partner reads, so it lives on the page: <${url}|open the search>, Decline, one line on why.`)
}

// ── 2. a declined proposal ───────────────────────────────────────────────────

export async function noteProposalDeclined(assignmentId: string, reason: string | null): Promise<void> {
  const admin = createAdminClient()
  const { data: a } = await admin
    .from('search_assignments')
    .select('job_id, company_id, user_id')
    .eq('id', assignmentId)
    .maybeSingle()
  if (!a) return
  const [{ data: role }, { data: partner }] = await Promise.all([
    admin.from('partner_roles_v').select('title, headline, company_name').eq('job_id', a.job_id).maybeSingle(),
    admin.from('users_admin').select('full_name, email').eq('user_id', a.user_id).maybeSingle(),
  ])
  const who = (partner?.full_name as string | null) || (partner?.email as string | null) || 'A partner'
  const where = `${(role?.headline as string | null) || (role?.title as string | null) || 'a search'} at ${(role?.company_name as string | null) ?? 'a client'}`
  const url = `${APP_URL}/searches/${a.company_id}/roles/${a.job_id}/coverage`
  await postToDesk(
    `:no_entry: *${esc(who)}* declined *${esc(where)}*${reason ? `: “${esc(reason)}”` : '.'}  ·  <${url}|propose someone else>`,
  )
}

// ── 3. a withdrawal in front of the client ───────────────────────────────────

const CLIENT_FACING = new Set(['sent_to_client', 'client_interview', 'offer'])

export async function noteWithdrawal(submissionId: string, fromStatus: string): Promise<void> {
  if (!CLIENT_FACING.has(fromStatus)) return
  const admin = createAdminClient()
  const { data: s } = await admin
    .from('role_submissions_v')
    .select('candidate_name, job_title, company_name, company_id, job_id, submitted_by_name, submitted_by_email')
    .eq('id', submissionId)
    .maybeSingle()
  if (!s) return
  const url = `${APP_URL}/searches/${s.company_id}/roles/${s.job_id}`
  await postToDesk(
    `:rotating_light: *${esc(s.submitted_by_name || s.submitted_by_email || 'A partner')}* withdrew *${esc(s.candidate_name as string)}* from *${esc(s.job_title as string)}* at ${esc(s.company_name as string)} while ${esc(submissionStatus(fromStatus).label.toLowerCase())}. The client may need to hear it from us.  ·  <${url}|open the search>`,
  )
}

export type DeskAdmin = SupabaseClient
