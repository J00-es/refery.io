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
 *
 * An access-request card is the same gesture again: :+1: puts the partner on
 * the client and emails them, :-1: closes the request with a short email. See
 * handleAccessRequest and lib/access-requests.ts.
 *
 * A question card adds one more move: a typed reply in its thread publishes
 * the answer to every partner on the search, and :see_no_evil: hides the
 * question. See lib/search-questions.ts.
 *
 * A submission card in #refery-desk: :+1: shortlists it. Declining stays on
 * the page because it needs a reason. See lib/desk-notifications.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { botUserId, postThreadReply, verifySlackSignature } from '@/lib/slack-bot'
import { hiringLeadEmail, scoutApplicationEmail, sendIntakeEmail } from '@/lib/intake-emails'
import { sendPartnerActivationEmail } from '@/lib/partner-activation-email'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'
import { decideAccessRequest } from '@/lib/access-requests'
import { declineNeedsPage, shortlistFromSlack, submissionForSlackMessage } from '@/lib/desk-notifications'
import { HIDE_REACTIONS, publishAnswer, questionForSlackMessage, setQuestionVisibility } from '@/lib/search-questions'

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

/** A `message` event. Only thread replies from people are acted on. */
interface MessageEvent {
  type: string
  subtype?: string
  user?: string
  bot_id?: string
  channel?: string
  ts?: string
  thread_ts?: string
  text?: string
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

  let body: { type?: string; challenge?: string; event?: ReactionEvent | MessageEvent }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  const event = body.event
  if (event?.type === 'reaction_added') {
    const r = event as ReactionEvent
    if (r.item?.channel && r.item.ts) {
      // Slack retries anything slower than 3s or non-2xx, and sending mail is
      // well over that. Acknowledge now, decide afterwards; the handler itself is
      // idempotent, so a duplicate delivery is harmless either way.
      after(() => handleReaction(r))
    }
  } else if (event?.type === 'message') {
    const m = event as MessageEvent
    // A reply in a thread, typed by a person. Edits, deletions, joins and bot
    // posts all carry a subtype or a bot_id and are ignored.
    if (m.thread_ts && m.ts !== m.thread_ts && m.channel && m.user && !m.bot_id && !m.subtype && m.text?.trim()) {
      after(() => handleThreadReply(m))
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * A typed reply in a question's thread becomes the published answer.
 *
 * Only threads rooted at a question card count; a reply on an access-request
 * or intake card does nothing. A later reply replaces the earlier answer, which
 * is how Lily edits from Slack. The bot echoes what was published and to how
 * many partners, so a stray reply is caught the moment it lands.
 */
async function handleThreadReply(m: MessageEvent): Promise<void> {
  const self = await botUserId()
  if (!self || m.user === self) return

  const q = await questionForSlackMessage(m.channel!, m.thread_ts!)
  if (!q) return

  const result = await publishAnswer({
    id: q.id,
    answer: m.text!,
    answeredBy: null,
    via: `slack:${m.user}`,
    actorLabel: `<@${m.user}>`,
  })
  if (!result.ok) {
    await postThreadReply(m.channel!, m.thread_ts!, `:warning: Could not publish that: ${result.error}`)
  }
}

async function handleReaction(event: ReactionEvent): Promise<void> {
  // A thumbs up with a skin tone arrives as "+1::skin-tone-2". Same gesture,
  // so the suffix is dropped before matching. Lily's first approval of an
  // access request was ignored for exactly this reason (6 Sep 2026).
  const reaction = (event.reaction ?? '').replace(/::skin-tone-\d$/, '')
  const approve = APPROVE.has(reaction)
  const reject = REJECT.has(reaction)
  const hide = HIDE_REACTIONS.has(reaction)
  if (!approve && !reject && !hide) return

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

  // Question cards: :see_no_evil: hides the question from partners. Recognised
  // by the message, not the channel.
  if (await handleQuestionReaction(event, channel, ts, hide)) return
  if (hide) return

  // Submission cards in #refery-desk: :+1: shortlists, :-1: points at the page
  // because a decline carries a reason the partner reads.
  const sub = await submissionForSlackMessage(channel, ts)
  if (sub) {
    if (approve) await shortlistFromSlack({ id: sub.id, slackUser: event.user, channel, ts })
    else await declineNeedsPage({ id: sub.id, channel, ts })
    return
  }

  // Access-request cards can share a channel with sign-ups or intake, so they
  // are recognised by the message itself rather than by where it was posted.
  if (await handleAccessRequest(event, channel, ts, approve)) return

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
 * Reactions on a question card.
 *
 * Returns false when the message is not a question card, so the caller carries
 * on. :see_no_evil: hides the question from partners; :+1: and :-1: on a card
 * do nothing, because the answer is whatever gets typed in the thread.
 */
async function handleQuestionReaction(
  event: ReactionEvent,
  channel: string,
  ts: string,
  hide: boolean,
): Promise<boolean> {
  const q = await questionForSlackMessage(channel, ts)
  if (!q) return false

  if (hide) {
    const result = await setQuestionVisibility({ id: q.id, visible: false, actorLabel: `<@${event.user}>` })
    if (!result.ok) await postThreadReply(channel, ts, `:warning: Could not hide that: ${result.error}`)
  }
  return true
}

/**
 * Approve or decline a partner's request to be put on a client.
 *
 * Returns false when the message is not an access-request card, so the caller
 * can carry on to the other handlers. The decision itself lives in
 * lib/access-requests.ts and is shared with the web buttons, which is what
 * keeps the two surfaces from ever disagreeing.
 */
async function handleAccessRequest(
  event: ReactionEvent,
  channel: string,
  ts: string,
  approve: boolean,
): Promise<boolean> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('company_access_requests')
    .select('id, status')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()
  if (!row) return false

  const result = await decideAccessRequest({
    id: row.id as string,
    decision: approve ? 'approved' : 'denied',
    decidedBy: null,
    via: `slack:${event.user}`,
  })

  if (!result.ok) {
    if (result.reason === 'already_decided') {
      await postThreadReply(channel, ts, `Already actioned (currently *${result.status}*), so nothing was sent this time.`)
    } else if (result.reason === 'error') {
      await postThreadReply(channel, ts, `:warning: Could not decide this one: ${result.error}. Try again from /searches/requests.`)
    }
    return true
  }

  const mail = result.emailed
    ? `and has been emailed at ${result.partnerEmail}.`
    : `but the email to ${result.partnerEmail} did not send: ${result.emailError ?? 'unknown'}. Worth sending by hand.`
  await postThreadReply(
    channel,
    ts,
    approve
      ? `:+1: <@${event.user}> approved. *${result.partnerName}* is on ${result.companyName} ${mail}`
      : `:-1: <@${event.user}> declined. *${result.partnerName}* stays off ${result.companyName} ${result.emailed ? 'and has been told.' : mail}`,
  )
  return true
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
