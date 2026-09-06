import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { DESK_BETA_ONLY, PROPOSAL_DAYS, searchStageMeta, submissionStatus, type SearchAssignmentRow } from '@/lib/partners'
import { renderWeeklyDigest, sendWeeklyDigest, type WeeklyDigest } from '@/lib/weekly-digest-email'
import { notifySlack } from '@/lib/slack'
import { esc, postMessage, type SlackBlock } from '@/lib/slack-bot'

/**
 * #refery-daily, where the super admin reads what went out. The bot has to
 * be invited once; until then the recap falls back to the daily webhook.
 */
const DAILY_CHANNEL = process.env.SLACK_CHANNEL_DAILY || 'C0BPW4T3HEZ'

interface RecipientRecap {
  name: string
  email: string
  moved: number
  needsYou: number
  searches: number
  fresh: number
  sent: boolean
  error?: string
  /** The one line worth Lily's eye: the first "what moved" item, or the first need. */
  headline: string | null
}

/**
 * One card to Lily after the Sunday send: who got it, what each digest held,
 * and anything she should act on. Built from the digests already assembled,
 * so it costs nothing and never disagrees with what was sent.
 */
async function postDigestRecap(input: {
  weekLabel: string
  recipients: RecipientRecap[]
  swept: number
  skippedNotBeta: number
  skippedNothingOn: number
}): Promise<void> {
  const { recipients } = input
  const sent = recipients.filter(r => r.sent)
  const failed = recipients.filter(r => !r.sent)
  const title = sent.length
    ? `Sunday digest went to ${sent.length} ${sent.length === 1 ? 'partner' : 'partners'}`
    : 'Sunday digest: nobody to send to'

  const lines = recipients.map(r => {
    const counts = [
      r.moved ? `${r.moved} moved` : null,
      r.needsYou ? `${r.needsYou} needs them` : null,
      `${r.searches} ${r.searches === 1 ? 'search' : 'searches'}`,
      r.fresh ? `${r.fresh} new answers` : null,
    ]
      .filter(Boolean)
      .join(' · ')
    const status = r.sent ? '' : ` :warning: not sent: ${r.error ?? 'unknown'}`
    return `• *${esc(r.name)}* — ${esc(counts)}${status}${r.headline ? `\n   _${esc(r.headline)}_` : ''}`
  })

  const notable: string[] = []
  if (input.swept) notable.push(`${input.swept} unanswered ${input.swept === 1 ? 'proposal' : 'proposals'} lapsed after ${PROPOSAL_DAYS} days and dropped back to "on request".`)
  const quiet = recipients.filter(r => r.sent && r.moved === 0)
  if (quiet.length) notable.push(`${quiet.length} of the ${sent.length} had nothing move this week: ${quiet.map(r => r.name.split(' ')[0]).join(', ')}.`)
  const needs = recipients.filter(r => r.needsYou > 0)
  if (needs.length) notable.push(`${needs.length} ${needs.length === 1 ? 'has' : 'have'} something waiting on them (a proposal to answer or a missing work authorisation).`)
  if (input.skippedNotBeta) notable.push(`${input.skippedNotBeta} ${input.skippedNotBeta === 1 ? 'partner is' : 'partners are'} on a search but not in the beta, so got nothing. Flip them on in Users when ready.`)
  if (failed.length) notable.push(`${failed.length} ${failed.length === 1 ? 'email' : 'emails'} did not send. Worth a manual nudge.`)

  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `:newspaper: *${esc(title)}*  ·  ${esc(input.weekLabel)}` } },
    ...(lines.length ? [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } }] : []),
    ...(notable.length
      ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Worth knowing*\n${notable.map(n => `• ${esc(n)}`).join('\n')}` } }]
      : []),
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'What moved, what needs them, their searches, new answers. Each partner only ever sees their own work. Nothing in this card is generated.',
        },
      ],
    },
  ]

  const posted = await postMessage(DAILY_CHANNEL, title, blocks)
  if (posted.ok) return
  // Bot not in the channel yet: the webhook still lands the words.
  await notifySlack({
    stream: 'daily',
    emoji: ':newspaper:',
    title: `${title} · ${input.weekLabel}`,
    body: [...lines, ...(notable.length ? ['', 'Worth knowing:', ...notable.map(n => `• ${n}`)] : [])].join('\n'),
  })
}

/**
 * Sunday: the partner digest, and the proposal sweep.
 *
 * Two jobs share this cron because they run on the same rhythm and read the
 * same tables:
 *
 *   the sweep    a proposal nobody answered inside PROPOSAL_DAYS becomes a
 *                declined row with a stated reason, so the search drops back to
 *                "open to you, on request" and coverage stops counting a yes
 *                that never came. Re-proposing later is one click.
 *   the digest   one email per partner on at least one search: what moved,
 *                what needs them, where each search stands, what is new.
 *                Nobody with nothing on gets nothing.
 *
 * `?dry=1` renders without sending and returns the emails, which is how the
 * copy gets checked before a Sunday.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz'

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function firstName(full: string | null | undefined, email: string): string {
  const name = (full ?? '').trim().split(/\s+/)[0]
  return name || email.split('@')[0] || 'there'
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const only = request.nextUrl.searchParams.get('to') // one address, for a test send

  const adminClient = createAdminClient()
  const now = new Date()
  const since = new Date(now.getTime() - 7 * DAY_MS).toISOString()

  // ── the sweep ─────────────────────────────────────────────────────────────
  const { data: expired } = await adminClient
    .from('search_assignments')
    .select('id')
    .eq('status', 'proposed')
    .lt('expires_at', now.toISOString())
  let swept = 0
  if (expired?.length && !dry) {
    const { error } = await adminClient
      .from('search_assignments')
      .update({
        status: 'declined',
        declined_at: now.toISOString(),
        declined_reason: `No answer within ${PROPOSAL_DAYS} days`,
        updated_at: now.toISOString(),
      })
      .in('id', expired.map(e => e.id as string))
    if (!error) swept = expired.length
  }

  // ── who gets one ──────────────────────────────────────────────────────────
  const { data: assignmentRows } = await adminClient
    .from('search_assignments')
    .select('*')
    .in('status', ['proposed', 'working'])
  const assignments = (assignmentRows ?? []) as SearchAssignmentRow[]
  const userIds = [...new Set(assignments.map(a => a.user_id))]
  if (!userIds.length) return NextResponse.json({ swept, sent: 0, skipped: 'nobody is on a search' })

  const jobIds = [...new Set(assignments.map(a => a.job_id))]

  const [{ data: users }, { data: roles }, { data: submissions }, { data: events }, { data: answers }] =
    await Promise.all([
      adminClient.from('users_admin').select('user_id, email, full_name, status, is_beta').in('user_id', userIds),
      adminClient
        .from('partner_roles_v')
        .select('job_id, company_id, title, headline, company_name, search_stage, stage_moved_at, is_live, job_status')
        .in('job_id', jobIds),
      adminClient
        .from('role_submissions_v')
        .select('id, job_id, company_id, candidate_name, status, submitted_by_user_id, updated_at, work_authorization, hm_rating, hm_note, decline_reason, review_note, job_title, company_name')
        .in('submitted_by_user_id', userIds),
      adminClient
        .from('role_submission_events')
        .select('submission_id, to_status, note, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: true }),
      adminClient
        .from('search_questions')
        .select('job_id, question, answer, answered_at')
        .in('job_id', jobIds)
        .eq('is_visible', true)
        .gte('answered_at', since),
    ])

  const roleById = new Map((roles ?? []).map(r => [r.job_id as string, r]))
  const eventsBySubmission = new Map<string, { to_status: string; note: string | null; created_at: string }[]>()
  for (const e of events ?? []) {
    const list = eventsBySubmission.get(e.submission_id as string) ?? []
    list.push({ to_status: e.to_status as string, note: (e.note as string | null) ?? null, created_at: e.created_at as string })
    eventsBySubmission.set(e.submission_id as string, list)
  }

  const weekLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const results: { to: string; sent: boolean; error?: string; subject?: string; html?: string }[] = []
  const recap: RecipientRecap[] = []
  let skippedNotBeta = 0
  let skippedNothingOn = 0

  for (const user of users ?? []) {
    if (user.status !== 'active' || !user.email) continue
    // Every link in the digest opens the desk. While the desk is in beta, a
    // partner outside it would land on a 404, so they get no digest yet.
    if (DESK_BETA_ONLY && !user.is_beta) {
      skippedNotBeta += 1
      continue
    }
    if (only && user.email !== only) continue
    const uid = user.user_id as string
    const mine = assignments.filter(a => a.user_id === uid)
    if (!mine.length) {
      skippedNothingOn += 1
      continue
    }

    const digest: WeeklyDigest = {
      to: user.email as string,
      firstName: firstName(user.full_name as string | null, user.email as string),
      weekLabel,
      moved: [],
      needsYou: [],
      searches: [],
      fresh: [],
    }

    // What moved: their submissions with an event this week. The latest event
    // wins, and its note comes along, because the note is the point.
    for (const s of (submissions ?? []).filter(x => x.submitted_by_user_id === uid)) {
      const trail = eventsBySubmission.get(s.id as string)
      if (!trail?.length) continue
      const last = trail[trail.length - 1]
      const meta = submissionStatus(last.to_status)
      const where = `${s.job_title} at ${s.company_name}`
      let text = `${meta.label.toLowerCase()} · ${where}.`
      if (last.to_status === 'declined') {
        text = `is not moving forward at ${s.company_name}.${s.decline_reason || last.note ? ` Reason: ${s.decline_reason ?? last.note}.` : ''}`
      } else if (last.note) {
        text += ` ${last.note}`
      }
      if (s.hm_rating || s.hm_note) {
        const read = s.hm_rating ? ['', 'strong no', 'no', 'yes', 'strong yes'][s.hm_rating as number] : null
        text += ` The hiring manager's read${read ? `: ${read}` : ''}${s.hm_note ? `. "${s.hm_note}"` : '.'}`
      }
      digest.moved.push({ lead: (s.candidate_name as string) ?? 'A candidate', text })
    }

    // A search of theirs that ended this week belongs in "what moved" too, so
    // they stop sourcing on it. This is the only place they hear it: Lily's
    // call on 6 Sep 2026 was one Sunday email over same-day ones.
    for (const a of mine) {
      const r = roleById.get(a.job_id)
      if (!r) continue
      const stage = r.search_stage as string
      const movedAt = r.stage_moved_at as string | null
      if ((stage === 'filled' || stage === 'closed') && movedAt && movedAt >= since) {
        digest.moved.unshift({
          lead: `${r.headline || r.title} at ${r.company_name}`,
          text: stage === 'filled' ? 'is filled. Nothing more to source there; anyone you submitted keeps their protection.' : 'is closed. The client paused or withdrew it; anyone you submitted keeps their protection.',
        })
      }
    }

    // Needs you: proposals without an answer, and open submissions missing the
    // one field every client asks about.
    const pending = mine.filter(a => a.status === 'proposed')
    if (pending.length) {
      const names = pending
        .map(a => roleById.get(a.job_id))
        .filter(Boolean)
        .map(r => `${r!.headline || r!.title} at ${r!.company_name}`)
      digest.needsYou.push({
        lead: pending.length === 1 ? 'One search is proposed to you.' : `${pending.length} searches are proposed to you.`,
        text: `Confirm or decline: ${names.join('; ')}. Unanswered, it lapses after ${PROPOSAL_DAYS} days.`,
      })
    }
    for (const s of (submissions ?? []).filter(
      x => x.submitted_by_user_id === uid && !x.work_authorization && ['submitted', 'shortlisted', 'sent_to_client'].includes(x.status as string),
    )) {
      digest.needsYou.push({
        lead: `${s.candidate_name}`,
        text: `is missing work authorisation on ${s.job_title} at ${s.company_name}. Clients ask on the first read.`,
      })
    }

    // Your searches: one line each with the stage and your own in-play count.
    for (const a of mine) {
      const r = roleById.get(a.job_id)
      if (!r) continue
      const open = r.is_live && r.job_status === 'open'
      const inPlay = (submissions ?? []).filter(
        x => x.submitted_by_user_id === uid && x.job_id === a.job_id && !['declined', 'withdrawn'].includes(x.status as string),
      ).length
      digest.searches.push({
        title: (r.headline as string) || (r.title as string),
        company: r.company_name as string,
        href: `${APP_URL}/searches/${r.company_id}/roles/${r.job_id}`,
        status: [
          a.status === 'proposed' ? 'proposed to you' : null,
          searchStageMeta(r.search_stage as string).label,
          open ? 'still open' : 'closed',
          inPlay ? `${inPlay} of yours in play` : 'nothing from you yet',
        ]
          .filter(Boolean)
          .join(' · '),
      })
    }

    // New this week: answers added on their searches.
    for (const q of answers ?? []) {
      if (!mine.some(a => a.job_id === q.job_id)) continue
      const r = roleById.get(q.job_id as string)
      digest.fresh.push({
        lead: `Q&A on ${r ? `${r.headline || r.title}` : 'a search'}:`,
        text: `"${q.question}" ${q.answer}`,
      })
    }

    let outcome: { sent: boolean; error?: string }
    if (dry) {
      const rendered = renderWeeklyDigest(digest)
      results.push({ to: digest.to, sent: false, subject: rendered.subject, html: rendered.html })
      outcome = { sent: false, error: 'dry run' }
    } else {
      outcome = await sendWeeklyDigest(digest)
      results.push({ to: digest.to, ...outcome })
    }

    const first = digest.moved[0] ?? digest.needsYou[0] ?? null
    recap.push({
      name: (user.full_name as string | null) || (user.email as string),
      email: user.email as string,
      moved: digest.moved.length,
      needsYou: digest.needsYou.length,
      searches: digest.searches.length,
      fresh: digest.fresh.length,
      sent: outcome.sent,
      error: outcome.error,
      headline: first ? `${first.lead} ${first.text}`.slice(0, 160) : null,
    })
  }

  // The recap to Lily, only for a real send. A dry run is someone checking copy.
  if (!dry && !only) {
    await postDigestRecap({ weekLabel, recipients: recap, swept, skippedNotBeta, skippedNothingOn })
  }

  return NextResponse.json({
    swept,
    skipped: { notBeta: skippedNotBeta, nothingOn: skippedNothingOn },
    sent: results.filter(r => r.sent).length,
    results: dry ? results : results.map(({ html: _html, ...rest }) => rest),
  })
}
