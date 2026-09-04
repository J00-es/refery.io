/**
 * Slack Events API endpoint: turns a reaction into a decision.
 *
 * :+1: on an intake message sends the applicant the reply Lily would have
 * written by hand and moves them to in_conversation. :-1: rejects them and
 * sends nothing. The reaction is the whole interface, so the important property
 * is that it behaves the same however many times Slack delivers it.
 *
 * A partner sign-up card is the same gesture over a different row: :+1: turns
 * the account active and emails them, :-1: leaves it inactive and sends
 * nothing. See handlePartnerSignup.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { botUserId, postThreadReply, verifySlackSignature } from '@/lib/slack-bot'
import { hiringLeadEmail, scoutApplicationEmail, sendIntakeEmail } from '@/lib/intake-emails'
import { sendPartnerActivationEmail } from '@/lib/partner-activation-email'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'

export const dynamic = 'force-dynamic'
// The email send happens after the 200, but Vercel still bounds the function.
export const maxDuration = 60

const APPROVE = new Set(['+1', 'thumbsup', 'thumbsup_all'])
const REJECT = new Set(['-1', 'thumbsdown'])

/**
 * Both tables already had a status vocabulary, so triage reuses it instead of
 * adding a parallel one. An approval means the intro email went out and a
 * conversation has started, which is what in_conversation already meant.
 */
const APPROVED_STATUS = 'in_conversation'
const REJECTED_STATUS = 'rejected'

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

  if (!event.user) return

  // The notifier seeds :+1: and :-1: on every message so triage is one click.
  // Those seeds come back as reaction_added events carrying the bot's own user
  // ID and no bot_id, so they are indistinguishable from a human reaction
  // unless we know that ID. Left unchecked, the seed approves the application
  // and emails the applicant a second after they submit the form.
  //
  // Unverifiable means stop. The only realistic reason auth.test fails is a
  // broken token, in which case the email and the thread reply were going to
  // fail anyway, and silently doing nothing beats silently sending.
  const self = await botUserId()
  if (!self) {
    console.error('[slack-events] cannot resolve bot user id, skipping to avoid acting on our own reaction')
    return
  }
  if (event.user === self || event.bot_id) return

  const channel = event.item?.channel ?? ''
  const ts = event.item?.ts ?? ''

  // Partner sign-ups live in users_admin, not an intake table, and the decision
  // is an account status rather than a conversation. Different row, different
  // vocabulary, so it gets its own handler.
  const signups = partnerSignupChannel()
  if (signups && channel === signups) {
    await handlePartnerSignup(event, channel, ts, approve)
    return
  }

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
      status: approve ? APPROVED_STATUS : REJECTED_STATUS,
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
      `:-1: Marked *rejected* by <@${event.user}>. No email sent.`,
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

  // The status stays approved: the decision was real, only the delivery failed.
  // Surfacing it in-thread is the only way anyone finds out.
  await admin.from(table).update({ outreach_error: sent.error ?? 'unknown' }).eq('id', row.id)
  await postThreadReply(
    channel,
    ts,
    `:warning: Approved, but the email to ${to} did not send: ${sent.error}. Worth sending by hand.`,
  )
}

/**
 * Approve or hold a partner sign-up.
 *
 * :+1: sets the account active and sends the activation email, which is the
 * first thing that actually tells them the wait is over. :-1: leaves them
 * inactive and sends nothing, matching how an intake rejection behaves.
 *
 * The claim is a conditional update on status = 'pending'. That single
 * condition is what makes a double-click, a Slack retry, and a :+1: racing a
 * :-1: all settle on exactly one outcome and exactly one email. It also means a
 * partner an admin already activated by hand cannot be re-emailed by a stray
 * reaction weeks later.
 */
async function handlePartnerSignup(
  event: ReactionEvent,
  channel: string,
  ts: string,
  approve: boolean,
): Promise<void> {
  const admin = createAdminClient()

  const { data: row, error: findErr } = await admin
    .from('users_admin')
    .select('id, email, full_name, role, status')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()

  if (findErr || !row) {
    console.warn(`[slack-events] no users_admin row for ${channel}/${ts}`)
    return
  }

  const who = String(row.full_name ?? '').trim() || String(row.email ?? '')

  const { data: claimed, error: claimErr } = await admin
    .from('users_admin')
    .update({
      status: approve ? 'active' : 'inactive',
      reviewed_at: new Date().toISOString(),
      reviewed_by: event.user,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id')

  if (claimErr) {
    console.error(`[slack-events] claim failed for users_admin/${row.id}:`, claimErr.message)
    return
  }
  if (!claimed?.length) {
    await postThreadReply(
      channel,
      ts,
      `Already actioned (${who} is currently *${row.status}*), so nothing was sent this time.`,
    )
    return
  }

  if (!approve) {
    await postThreadReply(
      channel,
      ts,
      `:-1: <@${event.user}> left *${who}* inactive. No email sent.`,
    )
    return
  }

  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://refery.xyz'
  ).replace(/\/$/, '')

  const to = String(row.email ?? '')
  const sent = await sendPartnerActivationEmail(to, {
    fullName: String(row.full_name ?? '') || to,
    role: String(row.role ?? 'partner'),
    appUrl: origin,
  })

  if (sent.sent) {
    await admin
      .from('users_admin')
      .update({ activation_email_sent_at: new Date().toISOString(), activation_email_error: null })
      .eq('id', row.id)
    await postThreadReply(
      channel,
      ts,
      `:+1: <@${event.user}> approved. ${who} is *active* and has been emailed at ${to}.`,
    )
    return
  }

  // The activation stands: the decision was real, only the delivery failed.
  // Saying so in-thread is the only way anyone finds out they were let in
  // without ever being told.
  await admin
    .from('users_admin')
    .update({ activation_email_error: sent.error ?? 'unknown' })
    .eq('id', row.id)
  await postThreadReply(
    channel,
    ts,
    `:warning: ${who} is now *active*, but the email to ${to} did not send: ${sent.error}. Worth sending by hand.`,
  )
}
