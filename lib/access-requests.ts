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

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'
import { addReaction, esc, postMessage, postThreadReply, type SlackBlock } from '@/lib/slack-bot'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const FROM = 'Refery <agreements@refery.io>'
const REPLY_TO = 'lily@refery.io'

/** Seeded on every card so a decision is one click, never a search for the emoji. */
const AFFORDANCES = ['+1', '-1']

/**
 * Where the card goes. A dedicated channel if one is configured, otherwise the
 * partner sign-ups channel (same audience, same gesture), otherwise the scout
 * applications channel, which every environment with the bot has.
 */
export function accessRequestChannel(): string {
  return (
    process.env.SLACK_CHANNEL_ACCESS_REQUESTS ||
    partnerSignupChannel() ||
    process.env.SLACK_CHANNEL_SCOUT_APPS ||
    ''
  )
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
  const channel = accessRequestChannel()
  const title = `${c.partnerName} asks to be put on ${c.companyName}`

  if (!channel) {
    const res = await notifySlack({
      stream: 'partners',
      emoji: ':key:',
      title,
      context: 'Approve or decline on /searches/requests.',
      body: c.message ?? undefined,
      links: [{ label: 'Open requests', url: `${APP_URL}/searches/requests` }],
    })
    return { sent: res.sent, error: res.error }
  }

  const posted = await postMessage(channel, title, cardBlocks(c))
  if (!posted.ok || !posted.ts) return { sent: false, error: posted.error || 'chat.postMessage returned no ts' }

  // Written before the affordances are seeded: the reaction handler refuses to
  // act on a card it cannot resolve.
  const admin = createAdminClient()
  const { error } = await admin
    .from('company_access_requests')
    .update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts })
    .eq('id', c.requestId)
  if (error) console.error('[access-requests] could not link slack message:', error.message)

  for (const name of AFFORDANCES) await addReaction(posted.channel ?? channel, posted.ts, name)
  return { sent: true }
}

export type AccessDecision = 'approved' | 'denied'

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

// ── the email ────────────────────────────────────────────────────────────────

const M = { green: '#1f3a2f', cream: '#f2f1eb', body: '#161613', muted: '#6e6e68', rule: '#e4e3dc' }
const SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderAccessDecisionEmail(input: {
  fullName: string
  decision: AccessDecision
  companyName: string
  companyId: string
}): { subject: string; html: string } {
  const first = input.fullName.trim().split(/\s+/)[0] || 'there'
  const company = escapeHtml(input.companyName)
  const approved = input.decision === 'approved'
  const url = `${APP_URL}/searches/${input.companyId}`

  const subject = approved ? `You are on ${input.companyName}` : `About ${input.companyName}`
  const heading = approved ? `You are on ${company}, ${escapeHtml(first)}.` : `Not this one for now, ${escapeHtml(first)}.`
  const body = approved
    ? `The client&rsquo;s name, their brief and every live search under it are open to you now. Read the brief first: it says who they hire and who they do not, in the hiring manager&rsquo;s own words.`
    : `We are keeping ${company} with the partners already on it. That is about coverage, not about you. Other searches are open to you on request, and we will keep proposing the ones that fit your network.`
  const button = approved
    ? `<tr><td style="padding:0 0 36px 0;"><a href="${escapeHtml(url)}" style="display:inline-block; padding:13px 26px; font-family:${SANS}; font-weight:600; font-size:15px; color:#ffffff; background-color:${M.green}; border-radius:999px; text-decoration:none;">Open the client</a></td></tr>`
    : `<tr><td style="padding:0 0 36px 0;"><a href="${APP_URL}/searches" style="display:inline-block; padding:13px 26px; font-family:${SANS}; font-weight:600; font-size:15px; color:#ffffff; background-color:${M.green}; border-radius:999px; text-decoration:none;">See open searches</a></td></tr>`

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};"><tr><td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
  <tr><td style="padding:0 0 8px 0; font-family:${SANS}; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.5px;">Refery</td></tr>
  <tr><td style="padding:0 0 32px 0;"><div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:0 0 14px 0; font-family:${SANS}; font-weight:600; font-size:24px; line-height:1.25; color:${M.green};">${heading}</td></tr>
  <tr><td style="padding:0 0 28px 0; font-family:${SANS}; font-size:16px; line-height:1.65; color:${M.body};">${body}</td></tr>
  ${button}
  <tr><td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:${SANS}; font-size:12px; line-height:1.6; color:${M.muted};">Confidential. A client&rsquo;s name and brief are for you and not for candidates until they have signed Refery&rsquo;s confidentiality note. Refery, Inc. &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a></td></tr>
</table></td></tr></table></body></html>`

  return { subject, html }
}

export async function sendAccessDecisionEmail(input: {
  to: string
  fullName: string
  decision: AccessDecision
  companyName: string
  companyId: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }
  if (!input.to) return { sent: false, error: 'No recipient' }
  const { subject, html } = renderAccessDecisionEmail(input)
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: FROM, to: input.to, replyTo: REPLY_TO, subject, html })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}
