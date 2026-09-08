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
 * A submission card in #refery-desk: :+1: shortlists, :outbox_tray: marks it
 * sent to the client, :-1: arms a decline and the next thread reply is the
 * reason. See lib/desk-notifications.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { botUserId, postThreadReply, verifySlackSignature } from '@/lib/slack-bot'
import { hiringLeadEmail, sendIntakeEmail } from '@/lib/intake-emails'
import { DECISION_LABEL, decideApplication, type Decision } from '@/lib/onboarding/decisions'
import { cancelQueued, queueEmail } from '@/lib/comms'
import { templateAsk } from '@/lib/voice/templates'
import { sendPartnerActivationEmail } from '@/lib/partner-activation-email'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'
import { sendFirmActivated } from '@/lib/firm-notify'
import type { Firm } from '@/lib/firms'
import { decideAccessRequest } from '@/lib/access-requests'
import { armDeclineFromSlack, declineFromThread, moveSubmissionFromSlack, submissionForSlackMessage } from '@/lib/desk-notifications'
import { HIDE_REACTIONS, publishAnswer, questionForSlackMessage, setQuestionVisibility } from '@/lib/search-questions'
import { candidateForSlackMessage } from '@/lib/desk/card'
import { handleDecisionReaction, handleDecisionThreadReply } from '@/lib/desk/decide'
import { handleEscalationReaction } from '@/lib/desk/followups'
import { handleBenchReaction } from '@/lib/desk/bench'
import { handleDraftReaction, handleRecapReaction, handleRecapThreadReply } from '@/lib/desk/verdict'
import { discardRun, publishRun, runForSlackMessage } from '@/lib/client-onboarding/run'
import { handleBatchReaction, handleBatchThreadReply } from '@/lib/batches'
// Side-effect imports: each registers its applier for handleBatchReaction.
import '@/lib/backlog/scouts'
import '@/lib/backlog/leads'
import '@/lib/agreement-chase'
import '@/lib/founder-outbound'

export const dynamic = 'force-dynamic'
// The email send happens after the 200, but Vercel still bounds the function.
export const maxDuration = 60

const APPROVE = new Set(['+1', 'thumbsup', 'thumbsup_all'])
const REJECT = new Set(['-1', 'thumbsdown'])
/**
 * The five admission decisions on a scout application card. :+1: and :-1: are
 * shared with every other card; the three in the middle are intake's own.
 */
const INTAKE_DECISIONS: Record<string, Decision> = {
  '+1': 'approve',
  thumbsup: 'approve',
  thumbsup_all: 'approve',
  raised_hands: 'approve_call',
  question: 'clarify',
  world_map: 'no_match',
  '-1': 'decline',
  thumbsdown: 'decline',
}
const INTAKE_ONLY = new Set(['raised_hands', 'question', 'world_map'])

/**
 * Who may decide. SLACK_REVIEWER_IDS is a comma-separated list of Slack user
 * ids; when unset every human in the channel may react, which is how it has
 * always worked, so an unconfigured environment does not go dark.
 */
function isReviewer(slackUser: string): boolean {
  const raw = (process.env.SLACK_REVIEWER_IDS ?? '').split(',').map(x => x.trim()).filter(Boolean)
  return raw.length === 0 || raw.includes(slackUser)
}
/** On a submission card only: the candidate has gone to the client. */
const SEND_TO_CLIENT = new Set(['outbox_tray'])
/** Everything the candidate desk understands, on any of its cards. */
const DESK_REACTIONS = new Set(['fire', 'raising_hand', 'zzz', 'white_check_mark', 'email', 'one', 'two', 'three', 'four', 'five', 'six'])

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

  // Candidate desk: a decision card's thread ("edit: ...", the not-a-fit reason,
  // "send") and a recap card's thread (Lily's note on the record).
  const deskAdmin = createAdminClient()
  const deskCandidate = await candidateForSlackMessage(deskAdmin, m.channel!, m.thread_ts!)
  if (deskCandidate) {
    await handleDecisionThreadReply(deskAdmin, { candidate: deskCandidate, text: m.text!, slackUser: m.user!, channel: m.channel!, ts: m.thread_ts! })
    return
  }
  if (await handleRecapThreadReply(deskAdmin, { text: m.text!, slackUser: m.user!, channel: m.channel!, threadTs: m.thread_ts! })) return
  // A batch card's thread: `3 skip` changes one line before the :+1:.
  if (await handleBatchThreadReply(deskAdmin, { text: m.text!, slackUser: m.user!, channel: m.channel!, threadTs: m.thread_ts! })) return

  // A submission card with a decline armed: this reply is the reason. Without
  // the :-1: first, a reply on a submission card is just conversation.
  const sub = await submissionForSlackMessage(m.channel!, m.thread_ts!)
  if (sub) {
    if (sub.declinePending) {
      await declineFromThread({ id: sub.id, text: m.text!, slackUser: m.user!, channel: m.channel!, ts: m.thread_ts! })
    }
    return
  }

  // An intake card's thread: `cancel` stops a queued email; while the row is
  // waiting on clarification, any other reply goes to the applicant as Lily's
  // question. Recognised by the message, so it costs nothing on other threads.
  if (await handleIntakeThreadReply(m)) return

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
  const send = SEND_TO_CLIENT.has(reaction)
  const deskReaction = DESK_REACTIONS.has(reaction)
  const intakeOnly = INTAKE_ONLY.has(reaction)
  if (!approve && !reject && !hide && !send && !deskReaction && !intakeOnly) return

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

  if (!isReviewer(event.user)) {
    await postThreadReply(channel, ts, `<@${event.user}> is not on the reviewer list, so that reaction changed nothing.`)
    return
  }

  // Candidate desk, recognised by the message. In order: a decision card, an
  // escalation line in a card thread, a draft awaiting :+1:, a bench card, a
  // recap card. Each returns false when the message is not its own.
  const deskAdmin = createAdminClient()
  const deskCandidate = await candidateForSlackMessage(deskAdmin, channel, ts)
  if (deskCandidate) {
    await handleDecisionReaction(deskAdmin, { candidate: deskCandidate, reaction, slackUser: event.user, channel, ts })
    return
  }
  if (await handleEscalationReaction(deskAdmin, { reaction, slackUser: event.user, channel, ts })) return
  if (await handleDraftReaction(deskAdmin, { reaction, slackUser: event.user, channel, ts })) return
  if (await handleBenchReaction(deskAdmin, { reaction, slackUser: event.user, channel, ts })) return
  if (await handleRecapReaction(deskAdmin, { reaction, slackUser: event.user, channel, ts })) return
  // Batch cards: :+1: applies every line, :-1: closes the card.
  if (await handleBatchReaction(deskAdmin, { reaction, slackUser: event.user, channel, ts })) return
  if (!approve && !reject && !hide && !send && !intakeOnly) return

  // Question cards: :see_no_evil: hides the question from partners. Recognised
  // by the message, not the channel.
  if (await handleQuestionReaction(event, channel, ts, hide)) return
  if (hide) return

  // An onboarding review card: :+1: publishes the client, :-1: leaves it unpublished.
  const run = await runForSlackMessage(channel, ts)
  if (run) {
    if (approve) await publishRun(run.id, event.user)
    else if (reject) await discardRun(run.id, event.user)
    return
  }

  // Submission cards in #refery-desk: :+1: shortlists, :outbox_tray: marks sent
  // to the client, :-1: arms a decline whose reason is the next thread reply.
  const sub = await submissionForSlackMessage(channel, ts)
  if (sub) {
    const base = { id: sub.id, slackUser: event.user, channel, ts }
    if (approve) await moveSubmissionFromSlack({ ...base, to: 'shortlisted', note: null })
    else if (send) await moveSubmissionFromSlack({ ...base, to: 'sent_to_client', note: null })
    else if (reject) await armDeclineFromSlack({ ...base, status: sub.status })
    return
  }
  if (send) return

  // Access-request cards can share a channel with sign-ups or intake, so they
  // are recognised by the message itself rather than by where it was posted.
  if (await handleAccessRequest(event, channel, ts, approve)) return

  // Partner sign-ups live in users_admin, not an intake table, and the decision
  // is an account status rather than a conversation. Different row, different
  // vocabulary, so it gets its own handler.
  const signups = partnerSignupChannel()
  if (signups && channel === signups) {
    // A firm card and a partner card live in the same channel, so the message
    // timestamp decides which this is. Firms first: a firm row and a
    // users_admin row can both exist for the same person, and only one of them
    // carries this ts.
    const handled = await handleFirmSignup(event, channel, ts, approve)
    if (!handled) await handlePartnerSignup(event, channel, ts, approve)
    return
  }

  const table = TABLE_BY_CHANNEL()[channel]
  if (!table) return

  const admin = createAdminClient()

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

  // Scout applications: five decisions, each queuing its email for three
  // minutes so a thread reply can still cancel it. See lib/onboarding/decisions.
  if (table === 'scout_applications') {
    const decision = INTAKE_DECISIONS[reaction]
    if (!decision) return
    const result = await decideApplication(admin, { applicationId: row.id, decision, by: event.user, slack: { channel, ts } })
    if (!result.ok) {
      await postThreadReply(channel, ts, `Already decided (${row.status}), so nothing changed. ${result.error ?? ''}`.trim())
      return
    }
    const when = new Date(Date.now() + 3 * 60 * 1000).toISOString().slice(11, 16)
    const lines = [`<@${event.user}> decided: *${DECISION_LABEL[decision]}*.`]
    if (result.queued) lines.push(`Email ${result.queued} is *queued* and sends at ${when} UTC. Reply \`cancel\` here before then to stop it.`)
    if (result.note) lines.push(result.note)
    await postThreadReply(channel, ts, lines.join('\n'))
    return
  }

  // Hiring leads keep the original two-reaction flow.
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
    await postThreadReply(channel, ts, `Already actioned (currently *${row.status}*), so nothing was sent this time.`)
    return
  }
  if (reject) {
    await postThreadReply(channel, ts, `:-1: Marked *rejected* by <@${event.user}>. No email sent.`)
    return
  }

  const to = String(row.work_email ?? '')
  const email = hiringLeadEmail(String(row.full_name ?? ''), String(row.company_name ?? ''), row.roles_hiring_for ?? null)
  const sent = await sendIntakeEmail(to, email)
  if (sent.sent) {
    await admin.from(table).update({ outreach_sent_at: new Date().toISOString(), outreach_error: null }).eq('id', row.id)
    await postThreadReply(channel, ts, `:+1: <@${event.user}> approved. Sent "${email.subject}" to ${to}.`)
    return
  }
  await admin.from(table).update({ outreach_error: sent.error ?? 'unknown' }).eq('id', row.id)
  await postThreadReply(channel, ts, `:warning: Approved, but the email to ${to} did not send: ${sent.error}. Worth sending by hand.`)
}

/**
 * Replies in a scout application's thread.
 *
 * `cancel` inside the three-minute window stops the queued email and leaves
 * the decision standing. When the application is in clarification, the reply
 * text is the question, and it goes out as an email from Lily immediately.
 */
async function handleIntakeThreadReply(m: MessageEvent): Promise<boolean> {
  const admin = createAdminClient()
  const { data: app } = await admin
    .from('scout_applications')
    .select('id, full_name, email, status')
    .eq('slack_channel_id', m.channel!)
    .eq('slack_message_ts', m.thread_ts!)
    .maybeSingle()
  if (!app) return false

  const text = (m.text ?? '').trim()
  if (/^cancel\b/i.test(text)) {
    const n = await cancelQueued(admin, { applicationId: app.id }, `cancelled by <@${m.user}> in thread`)
    await postThreadReply(m.channel!, m.thread_ts!, n ? `:no_entry_sign: Cancelled ${n} queued email${n === 1 ? '' : 's'}. The decision stands; nothing was sent.` : 'Nothing was queued, so nothing to cancel.')
    return true
  }

  if (app.status === 'clarification') {
    const email = templateAsk({ fullName: app.full_name, question: text })
    const q = await queueEmail(admin, { to: app.email, toName: app.full_name, applicationId: app.id, email, slack: { channel: m.channel!, ts: m.thread_ts! } })
    await postThreadReply(m.channel!, m.thread_ts!, q.ok ? `:envelope: Your question is going to ${app.email} now. Their reply lands in your inbox; decide here when it does.` : `:warning: Could not queue the question: ${q.reason ?? q.error}`)
    return true
  }
  return true
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

/**
 * Approve or hold a firm.
 *
 * :+1: activates the firm and its signer, and nobody else. A pending invitee
 * has accepted nothing yet, and activating them would be activating someone
 * into obligations they have never seen.
 *
 * Returns false when this card is not a firm, so the caller can try the
 * partner handler instead.
 */
async function handleFirmSignup(
  event: ReactionEvent,
  channel: string,
  ts: string,
  approve: boolean,
): Promise<boolean> {
  const admin = createAdminClient()

  const { data: firm } = await admin
    .from('partner_orgs')
    .select('id, name, legal_name, slug, status, signer_user_id')
    .eq('slack_channel_id', channel)
    .eq('slack_message_ts', ts)
    .maybeSingle()

  if (!firm) return false

  const { data: claimed, error: claimErr } = await admin
    .from('partner_orgs')
    .update({
      status: approve ? 'active' : 'pending',
      reviewed_at: new Date().toISOString(),
      reviewed_by: event.user,
      activated_at: approve ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', firm.id)
    .eq('status', 'pending')
    .select('id')

  if (claimErr) {
    console.error(`[slack-events] firm claim failed for ${firm.id}:`, claimErr.message)
    return true
  }
  if (!claimed?.length) {
    await postThreadReply(
      channel,
      ts,
      `Already actioned (${firm.name} is currently *${firm.status}*), so nothing was sent this time.`,
    )
    return true
  }

  if (!approve) {
    await postThreadReply(
      channel,
      ts,
      `:-1: <@${event.user}> left *${firm.name}* pending. No email sent, and nobody can join it yet.`,
    )
    return true
  }

  // The signer is the only account activated here. Their users_admin row has to
  // be active too, or they would be approved as a firm and still bounced to the
  // pending screen by the dashboard layout.
  let signerEmail = ''
  let signerName = ''
  if (firm.signer_user_id) {
    const { data: signer } = await admin
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', firm.signer_user_id)
      .maybeSingle()
    signerEmail = (signer?.email as string) ?? ''
    signerName = (signer?.full_name as string) || signerEmail

    await admin
      .from('users_admin')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('user_id', firm.signer_user_id)
      .eq('status', 'pending')
  }

  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://refery.xyz'
  ).replace(/\/$/, '')

  if (signerEmail) {
    const sent = await sendFirmActivated(signerEmail, firm as Firm, signerName, origin)
    await admin
      .from('partner_orgs')
      .update(
        sent.sent
          ? { activation_email_sent_at: new Date().toISOString(), activation_email_error: null }
          : { activation_email_error: sent.error ?? 'unknown' },
      )
      .eq('id', firm.id)

    await postThreadReply(
      channel,
      ts,
      sent.sent
        ? `:+1: <@${event.user}> approved. *${firm.name}* is active and ${signerName} has been emailed at ${signerEmail}.`
        : `:warning: *${firm.name}* is active, but the email to ${signerEmail} did not send: ${sent.error}. Worth sending by hand.`,
    )
  } else {
    await postThreadReply(
      channel,
      ts,
      `:+1: <@${event.user}> approved *${firm.name}*, but it has no signer on file so no email went out.`,
    )
  }

  return true
}
