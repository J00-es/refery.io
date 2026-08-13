/**
 * Slack Events API endpoint: turns a reaction into a decision.
 *
 * :+1: on an intake message sends the applicant the reply Lily would have
 * written by hand and marks them qualified. :-1: files them as not qualified
 * and sends nothing. The reaction is the whole interface, so the important
 * property is that it behaves the same however many times Slack delivers it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postThreadReply, verifySlackSignature } from '@/lib/slack-bot'
import { hiringLeadEmail, scoutApplicationEmail, sendIntakeEmail } from '@/lib/intake-emails'

export const dynamic = 'force-dynamic'
// The email send happens after the 200, but Vercel still bounds the function.
export const maxDuration = 60

const APPROVE = new Set(['+1', 'thumbsup', 'thumbsup_all'])
const REJECT = new Set(['-1', 'thumbsdown'])

const TABLE_BY_CHANNEL: () => Record<string, 'scout_applications' | 'hiring_manager_leads'> = () => {
  const map: Record<string, 'scout_applications' | 'hiring_manager_leads'> = {}
  const scouts = process.env.SLACK_CHANNEL_SCOUT_APPS
  const leads = process.env.SLACK_CHANNEL_HIRING_LEADS
  if (scouts) map[scouts] = 'scout_applications'
  if (leads) map[leads] = 'hiring_manager_leads'
  return map
}

interface ReactionEvent {
  type: string
  user?: string
  reaction?: string
  bot_id?: string
  item?: { type?: string; channel?: string; ts?: string }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()

  const reason = verifySlackSignature(
    req.headers.get('x-slack-signature'),
    req.headers.get('x-slack-request-timestamp'),
    raw,
    process.env.SLACK_SIGNING_SECRET || '',
  )
  if (reason) {
    console.warn(`[slack-events] rejected: ${reason}`)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { type?: string; challenge?: string; event?: ReactionEvent }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event
  if (event?.type === 'reaction_added' && event.item?.channel && event.item.ts) {
    // Slack retries anything slower than 3s or non-2xx, and sending mail is
    // well over that. Acknowledge now, decide afterwards; the handler itself is
    // idempotent, so a duplicate delivery is harmless either way.
    after(() => handleReaction(event))
  }

  return NextResponse.json({ ok: true })
}

async function handleReaction(event: ReactionEvent): Promise<void> {
  const reaction = event.reaction ?? ''
  const approve = APPROVE.has(reaction)
  const reject = REJECT.has(reaction)
  if (!approve && !reject) return

  // The notifier seeds :+1: and :-1: on every message so triage is one click.
  // Those seeds arrive here as events too, and must not decide anything.
  if (event.bot_id || !event.user) return

  const channel = event.item?.channel ?? ''
  const ts = event.item?.ts ?? ''
  const table = TABLE_BY_CHANNEL()[channel]
  if (!table) return

  const admin = createAdminClient()
  const nameCol = table === 'scout_applications' ? 'email' : 'work_email'

  const { data: row, error: findErr } = await admin
    .from(table)
    .select('*')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()

  if (findErr || !row) {
    console.warn(`[slack-events] no ${table} row for ${channel}/${ts}`)
    return
  }

  // Claim the row before acting. A conditional update on status = 'new' is what
  // makes a double-click, a Slack retry, and a :+1: racing a :-1: all resolve
  // to exactly one outcome and exactly one email.
  const { data: claimed, error: claimErr } = await admin
    .from(table)
    .update({
      status: approve ? 'qualified' : 'not_qualified',
      reviewed_at: new Date().toISOString(),
      reviewed_by: event.user,
    })
    .eq('id', row.id)
    .eq('status', 'new')
    .select('id')

  if (claimErr) {
    console.error(`[slack-events] claim failed for ${table}/${row.id}:`, claimErr.message)
    return
  }
  if (!claimed?.length) {
    // Already decided. Say so rather than staying silent, so a second reaction
    // does not look like the automation quietly failed.
    await postThreadReply(
      channel,
      ts,
      `Already actioned (currently *${row.status}*), so nothing was sent this time.`,
    )
    return
  }

  if (reject) {
    await postThreadReply(
      channel,
      ts,
      `:-1: Marked *not qualified* by <@${event.user}>. No email sent.`,
    )
    return
  }

  const to = String(row[nameCol] ?? '')
  const email =
    table === 'scout_applications'
      ? scoutApplicationEmail(String(row.full_name ?? ''))
      : hiringLeadEmail(
          String(row.full_name ?? ''),
          String(row.company_name ?? ''),
          row.roles_hiring_for ?? null,
        )

  const sent = await sendIntakeEmail(to, email)

  if (sent.sent) {
    await admin
      .from(table)
      .update({ outreach_sent_at: new Date().toISOString(), outreach_error: null })
      .eq('id', row.id)
    await postThreadReply(
      channel,
      ts,
      `:+1: <@${event.user}> approved. Sent "${email.subject}" to ${to}.`,
    )
    return
  }

  // The status stays qualified: the decision was real, only the delivery
  // failed. Surfacing it in-thread is the only way anyone finds out.
  await admin.from(table).update({ outreach_error: sent.error ?? 'unknown' }).eq('id', row.id)
  await postThreadReply(
    channel,
    ts,
    `:warning: Marked qualified, but the email to ${to} did not send: ${sent.error}. Worth sending by hand.`,
  )
}
