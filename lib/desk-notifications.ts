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
import { submissionStatus, workAuthLabel } from '@/lib/partners'
import { GRADE_TO_VERDICT, VERDICT_GRADES } from '@/lib/candidate-ui'

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
      .select('linkedin_url, resume_blob_pathname, work_history, parsed_data, availability_status, email, panel_grade, recruiter_verdict, lily_verdict')
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

  // The panel's read, already on the record: the grade with its label, the
  // two-sentence verdict, and Lily's own call after the intro call if she made
  // one. Nothing is generated here; the card only repeats what the page shows.
  const grade = typeof c.panel_grade === 'string' ? c.panel_grade : null
  const gradeMeta = grade ? VERDICT_GRADES[GRADE_TO_VERDICT[grade] ?? ''] : null
  const take = typeof c.recruiter_verdict === 'string' ? c.recruiter_verdict.replace(/\s+/g, ' ').trim() : ''
  const lilyCall = typeof c.lily_verdict === 'string' ? c.lily_verdict.trim().split(/\s+/)[0]?.replace(/_/g, ' ') : ''
  const panelHead = grade ? `*Panel: ${esc(gradeMeta?.grade ?? grade)}${gradeMeta ? ` · ${esc(gradeMeta.label)}` : ''}*` : '*Panel: not graded yet*'
  const panelLine = [
    panelHead + (take ? `  ${esc(take.length > 320 ? `${take.slice(0, 319)}…` : take)}` : ''),
    lilyCall && lilyCall !== 'null' ? `_Lily after the intro call: ${esc(lilyCall)}_` : null,
  ]
    .filter(Boolean)
    .join('\n')

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
    { type: 'section', text: { type: 'mrkdwn', text: panelLine } },
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
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: ':+1: shortlist  ·  :outbox_tray: sent to client  ·  :-1: then reply in the thread with the reason to decline (the partner reads it)',
        },
      ],
    },
  ]

  const posted = await postToDesk(`${s.candidate_name} submitted to ${title} at ${s.company_name}`, blocks)
  if (!posted.ok || !posted.ts || !posted.channel) return { sent: false, error: posted.error }

  await admin
    .from('role_submissions')
    .update({ slack_channel_id: posted.channel, slack_message_ts: posted.ts })
    .eq('id', submissionId)
  for (const name of ['+1', 'outbox_tray', '-1']) await addReaction(posted.channel, posted.ts, name)
  return { sent: true }
}

/** The submission whose card is this Slack message, if it is one. */
export async function submissionForSlackMessage(
  channel: string,
  ts: string,
): Promise<{ id: string; status: string; declinePending: boolean } | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('role_submissions')
    .select('id, status, slack_decline_pending_at')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()
  return data
    ? { id: data.id as string, status: data.status as string, declinePending: Boolean(data.slack_decline_pending_at) }
    : null
}

/** Which moves a reaction may make, and from where. Everything else is a page decision. */
const SLACK_MOVES: Record<string, { from: string[]; label: string }> = {
  shortlisted: { from: ['submitted'], label: 'shortlisted' },
  sent_to_client: { from: ['submitted', 'shortlisted'], label: 'sent to the client' },
  declined: { from: ['submitted', 'shortlisted', 'sent_to_client', 'client_interview'], label: 'declined' },
}

/**
 * Moves a submission from Slack, with the same side effects the page applies.
 *
 * The claim is conditional on the current status being one the move allows,
 * so a double tap or a Slack retry lands once. Declining requires a note: it is
 * the line the partner reads and the reason they stop sourcing that profile.
 */
export async function moveSubmissionFromSlack(input: {
  id: string
  to: 'shortlisted' | 'sent_to_client' | 'declined'
  note: string | null
  slackUser: string
  channel: string
  ts: string
}): Promise<void> {
  const admin = createAdminClient()
  const move = SLACK_MOVES[input.to]
  const now = new Date().toISOString()

  const { data: before } = await admin
    .from('role_submissions')
    .select('status, job_id, candidate_id, submitted_by_user_id')
    .eq('id', input.id)
    .maybeSingle()
  if (!before) return
  const from = before.status as string

  if (!move.from.includes(from)) {
    await postThreadReply(
      input.channel,
      input.ts,
      `Already *${submissionStatus(from).label.toLowerCase()}*, so nothing changed. Later moves happen on the page.`,
    )
    return
  }

  const patch: Record<string, unknown> = {
    status: input.to,
    reviewed_at: now,
    updated_at: now,
    slack_decline_pending_at: null,
    decided_at: input.to === 'declined' ? now : null,
  }
  if (input.note) patch.review_note = input.note
  if (input.to === 'declined') patch.decline_reason = input.note

  const { data: claimed, error } = await admin
    .from('role_submissions')
    .update(patch)
    .eq('id', input.id)
    .eq('status', from)
    .select('id')
  if (error) {
    await postThreadReply(input.channel, input.ts, `:warning: Could not move that: ${error.message}`)
    return
  }
  if (!claimed?.length) {
    await postThreadReply(input.channel, input.ts, 'Someone moved it a moment ago, so nothing changed.')
    return
  }

  await admin.from('role_submission_events').insert({
    submission_id: input.id,
    from_status: from,
    to_status: input.to,
    note: input.note,
    actor_user_id: null,
  })

  // The same side effect the page applies: the dashboard and the job page count
  // "sent to client" from the pipeline table.
  if (input.to === 'sent_to_client') {
    await admin.from('job_candidate_pipeline').upsert(
      {
        job_id: before.job_id,
        candidate_id: before.candidate_id,
        stage: 'hm_shared',
        owner_user_id: before.submitted_by_user_id,
        added_by_user_id: null,
        match_reason: 'Submitted through the partner desk',
        updated_at: now,
      },
      { onConflict: 'job_id,candidate_id' },
    )
  }

  const tail =
    input.to === 'declined'
      ? `The partner reads this reason on the search and in Sunday's digest:\n>${esc(input.note ?? '')}`
      : input.to === 'shortlisted'
        ? 'The partner sees "Shortlisted" on the search. :outbox_tray: when it goes to the client.'
        : 'The partner sees "Sent to client". Interview, offer and placed are set on the page, with the hiring manager\'s read.'
  await postThreadReply(input.channel, input.ts, `:white_check_mark: <@${input.slackUser}> ${move.label}. ${tail}`)
}

/**
 * :-1: on a submission card arms a decline and asks for the reason. The next
 * human reply in the thread completes it (see declineFromThread). Arming
 * rather than declining at once is what keeps the reason mandatory.
 */
export async function armDeclineFromSlack(input: { id: string; status: string; slackUser: string; channel: string; ts: string }): Promise<void> {
  if (!SLACK_MOVES.declined.from.includes(input.status)) {
    await postThreadReply(input.channel, input.ts, `Already *${submissionStatus(input.status).label.toLowerCase()}*, so there is nothing to decline.`)
    return
  }
  const admin = createAdminClient()
  await admin.from('role_submissions').update({ slack_decline_pending_at: new Date().toISOString() }).eq('id', input.id)
  await postThreadReply(
    input.channel,
    input.ts,
    `<@${input.slackUser}>, reply in this thread with one line on why and that declines it. The partner reads that line, so write it for them. To change your mind, react :+1: or :outbox_tray: instead.`,
  )
}

/** A thread reply on a submission card with a decline armed: the reply is the reason. */
export async function declineFromThread(input: { id: string; text: string; slackUser: string; channel: string; ts: string }): Promise<void> {
  const note = input.text.trim().slice(0, 2000)
  if (!note) return
  await moveSubmissionFromSlack({ id: input.id, to: 'declined', note, slackUser: input.slackUser, channel: input.channel, ts: input.ts })
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
