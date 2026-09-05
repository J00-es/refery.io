/**
 * Access requests: the card in Slack, the decision, the email.
 *
 * A partner presses "Request access" on an anonymised search. What happens next
 * used to be nothing: the row sat in company_access_requests until Lily opened
 * /searches/requests, which she had no reason to do. Now the request is a card
 * in Slack with :+1: and :-1: already on it, the same gesture as intake triage
 * and partner sign-ups. Either reaction, or the buttons on the web page, runs
 * `decideAccessRequest`, which is the single place a decision happens:
 *
 *   approve   the partner is assigned to the client (every live search under
 *             it unlocks), the row is closed, they get an email with a link.
 *   deny      the row is closed, they get a short email so the "Access
 *             requested" state does not silently vanish on them.
 *
 * The claim is a conditional update on status = 'pending', so a double-click, a
 * Slack retry, and a :+1: racing a :-1: all settle on exactly one outcome and
 * exactly one email. Everything Slack-side is best-effort: a request must never
 * fail because Slack did.
 */

import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import { addReaction, esc, postMessage, postThreadReply, type SlackBlock } from '@/lib/slack-bot'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'
import { sendAccessDecisionEmail, type AccessDecision } from '@/lib/access-request-email'

export { renderAccessDecisionEmail, sendAccessDecisionEmail, type AccessDecision } from '@/lib/access-request-email'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

/** Seeded on every card so a decision is one click, never a search for the emoji. */
const AFFORDANCES = ['+1', '-1']

/**
 * #refery-search-access, the private channel Lily made for these cards on
 * 5 Sep 2026. The bot has to be invited to it once (/invite @Refery Ops);
 * until it is, chat.postMessage answers not_in_channel and the card falls
 * through to the next channel below.
 */
const SEARCH_ACCESS_CHANNEL = 'C0BV751LTJS'

/**
 * Where the card goes, in order of preference. The dedicated channel first
 * (an env var can override the id), then the partner sign-ups channel (same
 * audience, same gesture), then the scout applications channel, which every
 * environment with the bot has. Posting tries each until one accepts.
 */
export function accessRequestChannels(): string[] {
  const candidates = [
    process.env.SLACK_CHANNEL_ACCESS_REQUESTS || SEARCH_ACCESS_CHANNEL,
    partnerSignupChannel(),
    process.env.SLACK_CHANNEL_SCOUT_APPS || '',
  ]
  return [...new Set(candidates.filter(Boolean))]
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim()
  return clean.length > n ? `${clean.slice(0, n - 1)}...` : clean
}

export interface AccessRequestCard {
  requestId: string
  partnerName: string
  partnerEmail: string
  partnerRole: string
  companyName: string
  liveRoles: number
  message: string | null
}

function cardBlocks(c: AccessRequestCard): SlackBlock[] {
  const title = `${c.partnerName} asks to be put on ${c.companyName}`
  const out: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `:key: *${esc(truncate(title, 200))}*` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Partner*\n${esc(c.partnerName)} · ${esc(c.partnerRole.replace(/_/g, ' '))}\n${esc(c.partnerEmail)}` },
        { type: 'mrkdwn', text: `*Client*\n${esc(c.companyName)} · ${c.liveRoles} live ${c.liveRoles === 1 ? 'search' : 'searches'}` },
      ],
    },
  ]
  if (c.message) {
    out.push({ type: 'section', text: { type: 'mrkdwn', text: `>${esc(truncate(c.message, 1500)).replace(/\n/g, '\n>')}` } })
  }
  out.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `:+1: put them on the client and email them  ·  :-1: not this one, short email  ·  <${APP_URL}/searches/requests|open in Refery>`,
      },
    ],
  })
  return out
}

/**
 * Posts the card and records where it landed, so a later reaction can find the
 * request it refers to. Falls back to the plain webhook when no bot channel is
 * configured, so the notification still arrives even if it cannot be acted on.
 */
export async function announceAccessRequest(c: AccessRequestCard): Promise<{ sent: boolean; error?: string }> {
  const title = `${c.partnerName} asks to be put on ${c.companyName}`

  let posted: Awaited<ReturnType<typeof postMessage>> | null = null
  let lastError = 'no Slack channel configured'
  for (const channel of accessRequestChannels()) {
    const attempt = await postMessage(channel, title, cardBlocks(c))
    if (attempt.ok && attempt.ts) {
      posted = attempt
      break
    }
    lastError = attempt.error || 'chat.postMessage returned no ts'
  }

  if (!posted?.ts || !posted.channel) {
    // No bot channel took it. The webhook cannot be reacted to, but a card
    // nobody sees is worse than one that has to be decided on the web.
    const res = await notifySlack({
      stream: 'partners',
      emoji: ':key:',
      title,
      context: `Approve or decline on /searches/requests. (Bot post failed: ${lastError})`,
      body: c.message ?? undefined,
      links: [{ label: 'Open requests', url: `${APP_URL}/searches/requests` }],
    })
    return { sent: res.sent, error: res.error ?? lastError }
  }

  // Written before the affordances are seeded: the reaction handler refuses to
  // act on a card it cannot resolve.
  const admin = createAdminClient()
  const { error } = await admin
    .from('company_access_requests')
    .update({ slack_channel_id: posted.channel, slack_message_ts: posted.ts })
    .eq('id', c.requestId)
  if (error) console.error('[access-requests] could not link slack message:', error.message)

  for (const name of AFFORDANCES) await addReaction(posted.channel, posted.ts, name)
  return { sent: true }
}

export type DecideResult =
  | {
      ok: true
      decision: AccessDecision
      partnerName: string
      partnerEmail: string
      companyName: string
      companyId: string
      emailed: boolean
      emailError?: string
    }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'already_decided'; status: string }
  | { ok: false; reason: 'error'; error: string }

/**
 * The one place an access request is decided. `decidedBy` is the auth user id
 * when the decision came from the web; a reaction carries only a Slack user id,
 * which goes in `via` ("slack:U0…") and leaves decided_by null.
 */
export async function decideAccessRequest(input: {
  id: string
  decision: AccessDecision
  decidedBy: string | null
  via: string
}): Promise<DecideResult> {
  const admin = createAdminClient()

  const { data: request } = await admin
    .from('company_access_requests')
    .select('id, company_id, user_id, status, slack_channel_id, slack_message_ts')
    .eq('id', input.id)
    .maybeSingle()
  if (!request) return { ok: false, reason: 'not_found' }
  if (request.status !== 'pending') return { ok: false, reason: 'already_decided', status: request.status as string }

  // Claim first. The conditional update is what makes two decisions one.
  const { data: claimed, error: claimErr } = await admin
    .from('company_access_requests')
    .update({
      status: input.decision,
      decided_by: input.decidedBy,
      decided_via: input.via,
      decided_at: new Date().toISOString(),
    })
    .eq('id', input.id)
    .eq('status', 'pending')
    .select('id')
  if (claimErr) return { ok: false, reason: 'error', error: claimErr.message }
  if (!claimed?.length) return { ok: false, reason: 'already_decided', status: 'decided' }

  if (input.decision === 'approved') {
    const { error } = await admin.from('company_assignments').upsert(
      {
        company_id: request.company_id,
        user_id: request.user_id,
        assigned_by: input.decidedBy,
        note: `Approved from an access request (${input.via})`,
      },
      { onConflict: 'company_id,user_id', ignoreDuplicates: true },
    )
    if (error) return { ok: false, reason: 'error', error: error.message }
  }

  const [{ data: partner }, { data: company }] = await Promise.all([
    admin.from('users_admin').select('email, full_name').eq('user_id', request.user_id).maybeSingle(),
    admin.from('companies').select('name').eq('id', request.company_id).maybeSingle(),
  ])
  const partnerEmail = (partner?.email as string | undefined) ?? ''
  const partnerName = ((partner?.full_name as string | undefined) ?? '').trim() || partnerEmail
  const companyName = (company?.name as string | undefined) ?? 'the client'

  const emailed = await sendAccessDecisionEmail({
    to: partnerEmail,
    fullName: partnerName,
    decision: input.decision,
    companyName,
    companyId: request.company_id as string,
  })

  return {
    ok: true,
    decision: input.decision,
    partnerName,
    partnerEmail,
    companyName,
    companyId: request.company_id as string,
    emailed: emailed.sent,
    emailError: emailed.error,
  }
}

/** Says in the card's thread what the web decision was, so Slack never lags the truth. */
export async function noteDecisionInSlack(requestId: string, text: string): Promise<void> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('company_access_requests')
    .select('slack_channel_id, slack_message_ts')
    .eq('id', requestId)
    .maybeSingle()
  if (data?.slack_channel_id && data?.slack_message_ts) {
    await postThreadReply(data.slack_channel_id as string, data.slack_message_ts as string, text)
  }
}
