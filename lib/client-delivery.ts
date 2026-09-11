/**
 * Candidate delivery to the client, and the client's answer.
 *
 * When Lily moves a submission to "sent to client", the candidate goes to the
 * founder the way they chose on their brief: a card in their private Slack
 * room, an email, or their private candidates page (with an email saying one
 * is waiting). All three carry the same content and the same two decisions,
 * Interview and Not a fit, and every button lands on the candidates page,
 * which is the one place the decision is recorded. Slack link buttons need no
 * interactivity setup, which is why the page is the decision surface and the
 * card is the doorbell.
 *
 * A decision moves the submission (client_interview or declined), tells the
 * partner in plain words with the reason, updates the Slack card in place, and
 * lands on Lily's decision thread. Silence past the client's response window is
 * nudged once by the daily cron, then left alone.
 */

import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { postMessage, postThreadReply, updateMessage, esc, type SlackBlock } from '@/lib/slack-bot'
import { notifySlack } from '@/lib/slack'
import { money, resolveFee, salaryCurrency, type SalaryCurrency } from '@/lib/fees'
import { candidatePath, rolePath } from '@/lib/paths'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const FROM = 'Lily at Refery <hello@refery.io>'
const REPLY_TO = 'lily@refery.io'

export type ClientDecision = 'interview' | 'not_a_fit' | 'later'

/** The five reasons a founder can pick with one tap, plus free text. */
export const REASON_CODES: Record<string, string> = {
  too_senior: 'Too senior for the seat',
  too_junior: 'Not enough experience',
  depth: 'Not enough depth in what matters most',
  comp: 'Compensation does not fit',
  location: 'Location or working pattern',
  already_knew: 'Already in touch with them',
  other: 'Something else',
}

// ── the record behind a card ─────────────────────────────────────────────────

export interface DeliveryRecord {
  id: string
  jobId: string
  companyId: string
  candidateId: string
  /** Short URL segments; null only when the row behind them is gone. */
  companySlug: string | null
  roleSlug: string | null
  candidateSlug: string | null
  status: string
  candidateName: string
  currentRole: string | null
  location: string | null
  years: number | null
  pitch: string | null
  highlights: string[]
  workAuth: string | null
  targetBase: number | null
  currency: SalaryCurrency
  linkedinUrl: string | null
  hasCv: boolean
  roleTitle: string
  companyName: string
  partnerName: string
  partnerEmail: string | null
  briefSlug: string | null
  clientChannel: 'slack' | 'email' | 'platform'
  clientContactName: string | null
  clientContactEmail: string | null
  clientSlackChannel: string | null
  bookingUrl: string | null
  responseHours: number
  deskSlack: { channel: string; ts: string } | null
  clientSlack: { channel: string; ts: string } | null
  decision: ClientDecision | null
  decisionAt: string | null
  decisionBy: string | null
  reasonCode: string | null
  reason: string | null
  deliveredAt: string | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function currentRoleOf(c: Record<string, unknown>): string | null {
  const pd = (c.parsed_data ?? {}) as Record<string, unknown>
  const title = str(pd.current_title) ?? str(pd.title)
  const company = str(pd.current_company) ?? str(pd.company)
  if (title && company) return `${title} at ${company}`
  return title ?? company
}

export async function loadDelivery(admin: SupabaseClient, submissionId: string): Promise<DeliveryRecord | null> {
  const { data: s } = await admin
    .from('role_submissions_v')
    .select('id, job_id, company_id, candidate_id, status, candidate_name, candidate_location, candidate_experience_years, job_title, company_name, submitted_by_name, submitted_by_email, pitch, highlights, work_authorization, target_base')
    .eq('id', submissionId)
    .maybeSingle()
  if (!s) return null

  const [{ data: raw }, { data: cand }, { data: role }, { data: client }, { data: brief }] = await Promise.all([
    admin
      .from('role_submissions')
      .select('slack_channel_id, slack_message_ts, client_channel, client_slack_channel, client_slack_ts, client_decision, client_decision_at, client_decision_by, client_reason_code, client_reason, client_delivered_at')
      .eq('id', submissionId)
      .maybeSingle(),
    admin.from('candidates').select('slug, linkedin_url, resume_blob_pathname, parsed_data, location, experience_years').eq('id', s.candidate_id).maybeSingle(),
    admin.from('partner_roles_v').select('headline, salary_currency, slug, company_slug').eq('job_id', s.job_id).maybeSingle(),
    admin
      .from('client_companies')
      .select('contact_name, contact_email, candidate_delivery, booking_url, response_hours, slack_channel_id')
      .eq('company_id', s.company_id)
      .maybeSingle(),
    admin.from('hm_briefs').select('slug').eq('company_id', s.company_id).eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const c = (cand ?? {}) as Record<string, unknown>
  let slackChannel = str(client?.slack_channel_id)
  if (!slackChannel) {
    // The room the founder was invited to from the brief, if any.
    const { data: inv } = await admin
      .from('hm_brief_invites')
      .select('channel_id')
      .eq('company_id', s.company_id)
      .not('channel_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    slackChannel = str(inv?.channel_id)
  }

  const chosen = str(client?.candidate_delivery) as 'slack' | 'email' | 'platform' | null
  const contactEmail = str(client?.contact_email)
  const clientChannel: 'slack' | 'email' | 'platform' =
    chosen === 'slack' && slackChannel ? 'slack'
    : chosen === 'email' && contactEmail ? 'email'
    : chosen === 'platform' ? 'platform'
    : slackChannel ? 'slack'
    : contactEmail ? 'email'
    : 'platform'

  return {
    id: s.id as string,
    jobId: s.job_id as string,
    companyId: s.company_id as string,
    candidateId: s.candidate_id as string,
    companySlug: str(role?.company_slug),
    roleSlug: str(role?.slug),
    candidateSlug: str(c.slug),
    status: s.status as string,
    candidateName: (s.candidate_name as string) || 'Candidate',
    currentRole: currentRoleOf(c),
    location: str(s.candidate_location) ?? str(c.location),
    years: typeof s.candidate_experience_years === 'number' ? s.candidate_experience_years : typeof c.experience_years === 'number' ? c.experience_years : null,
    pitch: str(s.pitch),
    highlights: Array.isArray(s.highlights) ? (s.highlights as string[]).filter(Boolean) : [],
    workAuth: str(s.work_authorization),
    targetBase: typeof s.target_base === 'number' ? s.target_base : s.target_base ? Number(s.target_base) : null,
    currency: salaryCurrency(role?.salary_currency),
    linkedinUrl: str(c.linkedin_url),
    hasCv: Boolean(str(c.resume_blob_pathname)),
    roleTitle: (role?.headline as string | null) || (s.job_title as string),
    companyName: s.company_name as string,
    partnerName: (s.submitted_by_name as string) || (s.submitted_by_email as string) || 'Your partner',
    partnerEmail: str(s.submitted_by_email),
    briefSlug: str(brief?.slug),
    clientChannel,
    clientContactName: str(client?.contact_name),
    clientContactEmail: contactEmail,
    clientSlackChannel: slackChannel,
    bookingUrl: str(client?.booking_url),
    responseHours: typeof client?.response_hours === 'number' ? client.response_hours : 48,
    deskSlack: raw?.slack_channel_id && raw?.slack_message_ts ? { channel: raw.slack_channel_id as string, ts: raw.slack_message_ts as string } : null,
    clientSlack: raw?.client_slack_channel && raw?.client_slack_ts ? { channel: raw.client_slack_channel as string, ts: raw.client_slack_ts as string } : null,
    decision: (raw?.client_decision as ClientDecision | null) ?? null,
    decisionAt: (raw?.client_decision_at as string | null) ?? null,
    decisionBy: (raw?.client_decision_by as string | null) ?? null,
    reasonCode: (raw?.client_reason_code as string | null) ?? null,
    reason: (raw?.client_reason as string | null) ?? null,
    deliveredAt: (raw?.client_delivered_at as string | null) ?? null,
  }
}

// ── the card, in words ───────────────────────────────────────────────────────

/** /searches/<company>/roles/<role> for this delivery, short slugs first. */
function searchLink(d: DeliveryRecord): string {
  return rolePath({ id: d.companyId, slug: d.companySlug }, { id: d.jobId, slug: d.roleSlug })
}

export function candidatesUrl(slug: string, submissionId?: string, decide?: ClientDecision): string {
  const base = `${APP_URL}/b/${slug}/candidates`
  const params = new URLSearchParams()
  if (submissionId) params.set('c', submissionId)
  if (decide) params.set('decide', decide)
  const q = params.toString()
  return q ? `${base}?${q}` : base
}

export function cvUrl(slug: string, submissionId: string): string {
  return `${APP_URL}/api/b/${slug}/candidates/${submissionId}/cv`
}

export function workAuthLabel(v: string | null): string | null {
  if (!v) return null
  return v.replace(/_/g, ' ').replace(/(eu|us|uk|h1b|opt|stem)/gi, m => m.toUpperCase())
}

function factsLine(d: DeliveryRecord): string {
  return [
    d.location,
    d.years ? `${d.years} yrs` : null,
    d.targetBase ? `asks ${money(d.targetBase, d.currency)}` : null,
    workAuthLabel(d.workAuth),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The three lines the partner wrote, or the highlights, never both twice. */
function whyLines(d: DeliveryRecord): string[] {
  if (d.pitch) return d.pitch.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 5)
  return d.highlights.slice(0, 5)
}

function slackBlocks(d: DeliveryRecord, slug: string): SlackBlock[] {
  const why = whyLines(d)
  const links = [
    d.linkedinUrl ? `<${d.linkedinUrl}|LinkedIn>` : null,
    d.hasCv ? `<${cvUrl(slug, d.id)}|CV>` : null,
    `<${candidatesUrl(slug, d.id)}|All your candidates>`,
  ]
    .filter(Boolean)
    .join(' · ')
  return [
    { type: 'context', elements: [{ type: 'mrkdwn', text: `*${esc(d.roleTitle)}* · from ${esc(d.partnerName)} via Refery` }] },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${esc(d.candidateName)}*${d.currentRole ? ` · ${esc(d.currentRole)}` : ''}\n${why.map(l => `• ${esc(l)}`).join('\n')}`,
      },
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${esc(factsLine(d) || 'Details on the page')}\n${links}` }] },
    {
      type: 'actions',
      block_id: `client_decision:${d.id}`,
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Interview' }, url: candidatesUrl(slug, d.id, 'interview') },
        { type: 'button', text: { type: 'plain_text', text: 'Not a fit' }, url: candidatesUrl(slug, d.id, 'not_a_fit') },
        { type: 'button', text: { type: 'plain_text', text: 'Ask Lily' }, url: `${candidatesUrl(slug, d.id)}#ask` },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `One tap on the page is enough. A reason on a no makes the next one sharper. ${esc(d.candidateName.split(' ')[0])} hears nothing until you say Interview.` }] },
  ]
}

function decidedBlocks(d: DeliveryRecord, slug: string): SlackBlock[] {
  const when = d.decisionAt ? new Date(d.decisionAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const who = d.decisionBy ?? 'the client'
  const line =
    d.decision === 'interview'
      ? `:white_check_mark: *Interview*, ${esc(who)}, ${when}. Lily is arranging the first call.`
      : d.decision === 'not_a_fit'
        ? `:no_entry_sign: *Not a fit*, ${esc(who)}, ${when}${d.reasonCode ? ` · ${esc(REASON_CODES[d.reasonCode] ?? d.reasonCode)}` : ''}`
        : `:hourglass_flowing_sand: *Later*, ${esc(who)}, ${when}`
  const base = slackBlocks(d, slug)
  return [...base.slice(0, 3), { type: 'section', text: { type: 'mrkdwn', text: line } }]
}

function emailHtml(d: DeliveryRecord, slug: string, opening: string): string {
  const why = whyLines(d)
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const links = [
    d.linkedinUrl ? `<a href="${e(d.linkedinUrl)}" style="color:#1F3A2F;">LinkedIn</a>` : null,
    d.hasCv ? `<a href="${cvUrl(slug, d.id)}" style="color:#1F3A2F;">CV</a>` : null,
    `<a href="${candidatesUrl(slug, d.id)}" style="color:#1F3A2F;">All your candidates</a>`,
  ]
    .filter(Boolean)
    .join(' &middot; ')
  const btn = (label: string, url: string, primary: boolean) =>
    `<a href="${url}" style="display:inline-block; margin:0 8px 8px 0; padding:12px 20px; font-weight:600; font-size:14px; border-radius:999px; text-decoration:none; ${primary ? 'color:#ffffff; background:#1F3A2F;' : 'color:#161613; border:1px solid #D2D1C7;'}">${label}</a>`
  return `<!doctype html><html><body style="margin:0; background:#F2F1EB; font-family:'DM Sans', Helvetica, Arial, sans-serif; color:#161613;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">
  <tr><td style="font-size:15px; line-height:1.6; padding-bottom:18px;">${e(opening)}</td></tr>
  <tr><td style="background:#ffffff; border:1px solid #E4E3DC; border-radius:12px; padding:18px 20px;">
    <div style="font-size:12.5px; color:#6E6E68; padding-bottom:6px;">${e(d.roleTitle)}</div>
    <div style="font-size:17px; font-weight:700; padding-bottom:6px;">${e(d.candidateName)}${d.currentRole ? ` &middot; ${e(d.currentRole)}` : ''}</div>
    <ul style="margin:0 0 10px; padding-left:18px; font-size:14.5px; line-height:1.6;">${why.map(l => `<li>${e(l)}</li>`).join('')}</ul>
    <div style="font-size:13px; color:#6E6E68; padding-bottom:8px;">${e(factsLine(d))}</div>
    <div style="font-size:13.5px;">${links}</div>
  </td></tr>
  <tr><td style="padding:18px 0 6px;">${btn('Interview', candidatesUrl(slug, d.id, 'interview'), true)}${btn('Not a fit', candidatesUrl(slug, d.id, 'not_a_fit'), false)}${btn('Ask Lily', `${candidatesUrl(slug, d.id)}#ask`, false)}</td></tr>
  <tr><td style="font-size:12.5px; color:#9C9C95; line-height:1.6;">Each button opens your private page with this candidate selected; no login. Replying to this email works too. ${e(d.candidateName.split(' ')[0])} has not been told the company name; that happens when you say Interview.</td></tr>
  <tr><td style="font-size:15px; line-height:1.6; padding-top:20px;">Best,<br>Lily</td></tr>
</table></td></tr></table></body></html>`
}

async function sendEmail(to: string, subject: string, html: string, text: string): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[client-delivery] RESEND_API_KEY not set; email to', to, 'not sent')
    return { sent: false, error: 'RESEND_API_KEY not set' }
  }
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: FROM, to, replyTo: REPLY_TO, subject, html, text })
    if (error) console.error('[client-delivery] email failed:', to, subject, error.message)
    else console.log('[client-delivery] email sent:', to, subject)
    return error ? { sent: false, error: error.message } : { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}

// ── delivery ─────────────────────────────────────────────────────────────────

/**
 * Sends the card the way the client chose. Idempotent per submission: a second
 * call after a successful delivery does nothing.
 */
export async function deliverSubmission(submissionId: string): Promise<{ delivered: boolean; channel?: string; error?: string }> {
  const admin = createAdminClient()
  const d = await loadDelivery(admin, submissionId)
  if (!d) return { delivered: false, error: 'submission not found' }
  if (d.deliveredAt) return { delivered: false, channel: d.clientChannel, error: 'already delivered' }
  if (!d.briefSlug) return { delivered: false, error: 'no published founder brief for this client; the page needs one' }

  const slug = d.briefSlug
  const now = new Date().toISOString()
  const first = d.clientContactName?.split(/\s+/)[0] ?? null
  let channel = d.clientChannel
  let slackRef: { channel: string; ts: string } | null = null
  let error: string | undefined

  if (channel === 'slack' && d.clientSlackChannel) {
    const res = await postMessage(d.clientSlackChannel, `${d.candidateName} for ${d.roleTitle}: ${candidatesUrl(slug, d.id)}`, slackBlocks(d, slug))
    if (res.ok && res.ts) slackRef = { channel: res.channel ?? d.clientSlackChannel, ts: res.ts }
    else {
      error = `slack: ${res.error}`
      channel = d.clientContactEmail ? 'email' : 'platform'
    }
  }

  if (channel === 'email' || channel === 'platform') {
    const to = d.clientContactEmail
    if (to) {
      const opening = `${first ? `Hi ${first},` : 'Hi,'} one for the ${d.roleTitle} seat. A yes or no in a line is all I need, and a reason helps the next one :)`
      const subject = `[Refery] ${d.companyName} | ${d.candidateName} for ${d.roleTitle}`
      const text = `${opening}\n\n${d.candidateName}${d.currentRole ? ` · ${d.currentRole}` : ''}\n${whyLines(d).map(l => `- ${l}`).join('\n')}\n${factsLine(d)}\n\nInterview: ${candidatesUrl(slug, d.id, 'interview')}\nNot a fit: ${candidatesUrl(slug, d.id, 'not_a_fit')}\nAll your candidates: ${candidatesUrl(slug, d.id)}\n\nBest,\nLily`
      const sent = await sendEmail(to, subject, emailHtml(d, slug, opening), text)
      if (!sent.sent) error = [error, `email: ${sent.error}`].filter(Boolean).join('; ')
    } else if (channel === 'email') {
      channel = 'platform'
      error = [error, 'no client email on record'].filter(Boolean).join('; ')
    }
  }

  await admin
    .from('role_submissions')
    .update({
      client_channel: channel,
      client_delivered_at: now,
      client_slack_channel: slackRef?.channel ?? null,
      client_slack_ts: slackRef?.ts ?? null,
      updated_at: now,
    })
    .eq('id', d.id)

  if (d.deskSlack) {
    await postThreadReply(
      d.deskSlack.channel,
      d.deskSlack.ts,
      `:outbox_tray: Delivered to ${esc(d.companyName)} by ${channel}${error ? ` (${esc(error)})` : ''}. Their decision lands here.`,
    )
  }
  return { delivered: true, channel, error }
}

// ── the decision ─────────────────────────────────────────────────────────────

export async function recordClientDecision(input: {
  submissionId: string
  slug: string
  decision: ClientDecision
  reasonCode: string | null
  reason: string | null
  decidedBy: string | null
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const d = await loadDelivery(admin, input.submissionId)
  if (!d || d.briefSlug !== input.slug) return { ok: false, error: 'not found' }
  if (!['sent_to_client', 'client_interview'].includes(d.status) && d.decision !== 'later') {
    return { ok: false, error: 'This one is already closed.' }
  }

  const now = new Date().toISOString()
  const reasonLabel = input.reasonCode ? REASON_CODES[input.reasonCode] ?? input.reasonCode : null
  const reasonText = [reasonLabel, input.reason].filter(Boolean).join(': ')

  const patch: Record<string, unknown> = {
    client_decision: input.decision,
    client_decision_at: now,
    client_decision_by: input.decidedBy,
    client_reason_code: input.reasonCode,
    client_reason: input.reason,
    updated_at: now,
  }
  let toStatus: string | null = null
  if (input.decision === 'interview') toStatus = 'client_interview'
  if (input.decision === 'not_a_fit') {
    toStatus = 'declined'
    patch.decline_reason = reasonText || 'The client passed'
    patch.decided_at = now
  }
  if (toStatus) patch.status = toStatus

  const { error } = await admin.from('role_submissions').update(patch).eq('id', d.id)
  if (error) return { ok: false, error: error.message }

  if (toStatus) {
    await admin.from('role_submission_events').insert({
      submission_id: d.id,
      from_status: d.status,
      to_status: toStatus,
      note: `${input.decidedBy ?? d.companyName} on the candidates page${reasonText ? `: ${reasonText}` : ''}`,
      actor_user_id: null,
    })
  }

  const updated = { ...d, decision: input.decision, decisionAt: now, decisionBy: input.decidedBy, reasonCode: input.reasonCode, reason: input.reason }

  // The card in the client's room says what happened, in place.
  if (d.clientSlack) {
    await updateMessage(d.clientSlack.channel, d.clientSlack.ts, `${d.candidateName}: ${input.decision.replace('_', ' ')}`, decidedBlocks(updated, input.slug))
  }

  // Lily's thread.
  const who = input.decidedBy ?? d.companyName
  const deskLine =
    input.decision === 'interview'
      ? `:white_check_mark: *${esc(who)} wants to interview ${esc(d.candidateName)}.*${d.bookingUrl ? ` Booking link: ${esc(d.bookingUrl)}` : ' No booking link on the client yet; arrange the first call.'} The partner has been emailed.`
      : input.decision === 'not_a_fit'
        ? `:no_entry_sign: *${esc(who)} passed on ${esc(d.candidateName)}.* ${esc(reasonText || 'No reason given.')} The partner has been emailed with the reason.`
        : `:hourglass_flowing_sand: *${esc(who)} put ${esc(d.candidateName)} on hold.* Still with the client; the nudge clock keeps running.`
  if (d.deskSlack) await postThreadReply(d.deskSlack.channel, d.deskSlack.ts, deskLine)
  await notifySlack({
    stream: 'clients',
    emoji: input.decision === 'interview' ? ':white_check_mark:' : input.decision === 'not_a_fit' ? ':no_entry_sign:' : ':hourglass_flowing_sand:',
    title: `${d.companyName}: ${who} said ${input.decision === 'interview' ? 'Interview' : input.decision === 'not_a_fit' ? 'Not a fit' : 'Later'} on ${d.candidateName}`,
    context: reasonText || (input.decision === 'interview' ? 'Arrange the first call.' : undefined),
    fields: [
      { label: 'Search', value: d.roleTitle },
      { label: 'Partner', value: d.partnerName },
    ],
    links: [{ label: 'Open the search', url: `${APP_URL}${searchLink(d)}` }],
  })

  // The partner, in plain words.
  if (d.partnerEmail && input.decision !== 'later') {
    const first = d.partnerName.split(/\s+/)[0]
    const candFirst = d.candidateName.split(/\s+/)[0]
    const subject = `[Refery] ${d.candidateName} | ${input.decision === 'interview' ? `${d.companyName} wants to interview` : `${d.companyName} passed`}`
    const body =
      input.decision === 'interview'
        ? `Hi ${first},\n\nGood news: ${d.companyName} wants to interview ${d.candidateName} for ${d.roleTitle}.\n\n${d.bookingUrl ? `Their booking link is ${d.bookingUrl}. Send it to ${candFirst} with the company name and the brief; I am on the thread if anything is needed.` : `I am arranging the first call with them now and will come back to you with the slots for ${candFirst}.`}\n\nTell ${candFirst} from Refery, with the link and their steps already filled in: ${APP_URL}${candidatePath({ id: d.candidateId, slug: d.candidateSlug }, '?write=interview')}\n\nThe search shows Interviewing from now.\n\nBest,\nLily`
        : `Hi ${first},\n\n${d.companyName} passed on ${d.candidateName} for ${d.roleTitle}.${reasonText ? ` Their reason: ${reasonText}.` : ''}\n\nPlease let ${candFirst} know today; a line from you lands better than silence. A draft in your words is ready here: ${APP_URL}${candidatePath({ id: d.candidateId, slug: d.candidateSlug }, '?write=pass')}\n\n${candFirst} stays on your bench for other searches.\n\nBest,\nLily`
    await sendEmail(d.partnerEmail, subject, `<pre style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`, body)
  }

  return { ok: true }
}

// ── the hire, and its three clocks ───────────────────────────────────────────

export interface PlacementClock {
  startDate: string
  /** Client v2.8: invoice on day one, due 30 calendar days after the start. */
  invoiceDue: string
  /** Client v2.8: one free replacement search if they leave within 90 days. */
  guaranteeEnds: string
  /** Partner terms: paid within 14 business days after day 90, once the client has paid. */
  payoutBy: string
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function addBusinessDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  let left = days
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d.toISOString().slice(0, 10)
}

/** The dates the two agreements fix, from a start date. */
export function placementClock(startDate: string): PlacementClock {
  const guaranteeEnds = addDays(startDate, 90)
  return { startDate, invoiceDue: addDays(startDate, 30), guaranteeEnds, payoutBy: addBusinessDays(guaranteeEnds, 14) }
}

export function clockDate(iso: string, withYear = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

/**
 * The founder confirms an accepted offer with the start date and base salary.
 * The submission becomes placed, the candidate hired, and everyone who has
 * money riding on the dates gets them: Lily on the desk, the partner by email.
 */
export async function recordOfferAccepted(input: {
  submissionId: string
  slug: string
  startDate: string
  baseSalary: number
  decidedBy: string | null
}): Promise<{ ok: boolean; error?: string; clock?: PlacementClock }> {
  const admin = createAdminClient()
  const d = await loadDelivery(admin, input.submissionId)
  if (!d || d.briefSlug !== input.slug) return { ok: false, error: 'not found' }
  if (!['client_interview', 'offer', 'sent_to_client'].includes(d.status)) return { ok: false, error: 'This one is already closed.' }

  const now = new Date().toISOString()
  const clock = placementClock(input.startDate)
  const { error } = await admin
    .from('role_submissions')
    .update({ status: 'placed', offer_accepted_at: now, start_date: input.startDate, base_salary: input.baseSalary, placed_by: input.decidedBy, decided_at: now, updated_at: now })
    .eq('id', d.id)
  if (error) return { ok: false, error: error.message }
  await admin.from('candidates').update({ status: 'hired', updated_at: now }).eq('id', d.candidateId)
  await admin.from('role_submission_events').insert({
    submission_id: d.id,
    from_status: d.status,
    to_status: 'placed',
    note: `${input.decidedBy ?? d.companyName} confirmed the hire on the candidates page: starts ${clockDate(input.startDate, true)}, base ${money(input.baseSalary, d.currency)}`,
    actor_user_id: null,
  })

  // The fee and the partner's share, from the search's terms.
  const { data: terms } = await admin.from('partner_roles_v').select('fee_percentage, fee_flat, scout_share, scout_payout, salary_currency').eq('job_id', d.jobId).maybeSingle()
  const fee = resolveFee({ ...(terms ?? {}), salary_min: input.baseSalary, salary_max: input.baseSalary })
  const feeText = money(fee.feeLow, fee.currency)
  const payoutText = money(fee.payoutLow, fee.currency)

  const who = input.decidedBy ?? d.companyName
  const timeline = `Starts ${clockDate(clock.startDate, true)} · invoice due ${clockDate(clock.invoiceDue)} · guarantee clears ${clockDate(clock.guaranteeEnds)} · partner paid by ${clockDate(clock.payoutBy)}`

  if (d.clientSlack) {
    const base = slackBlocks(d, input.slug)
    await updateMessage(d.clientSlack.channel, d.clientSlack.ts, `${d.candidateName}: hired`, [
      ...base.slice(0, 3),
      { type: 'section', text: { type: 'mrkdwn', text: `:tada: *Hired*, ${esc(who)}. Starts ${esc(clockDate(clock.startDate, true))}. Invoice due ${esc(clockDate(clock.invoiceDue))}; free replacement if they leave before ${esc(clockDate(clock.guaranteeEnds))}.` } },
    ])
  }
  if (d.deskSlack) {
    await postThreadReply(d.deskSlack.channel, d.deskSlack.ts, `:tada: *${esc(who)} confirmed ${esc(d.candidateName)} is hired.* Base ${esc(money(input.baseSalary, d.currency) ?? '')}${feeText ? `, fee ${esc(feeText)}` : ''}${payoutText ? `, partner payout ${esc(payoutText)}` : ''}. ${esc(timeline)}. Invoice on the first day.`)
  }
  await notifySlack({
    stream: 'clients',
    emoji: ':tada:',
    title: `${d.companyName} hired ${d.candidateName} for ${d.roleTitle}`,
    context: `${timeline}. Invoice on the first day.`,
    fields: [
      { label: 'Base', value: money(input.baseSalary, d.currency) ?? String(input.baseSalary) },
      { label: 'Fee', value: feeText ?? 'see terms' },
      { label: 'Partner', value: `${d.partnerName}${payoutText ? ` · ${payoutText}` : ''}` },
    ],
    links: [{ label: 'Open the search', url: `${APP_URL}${searchLink(d)}` }],
  })

  if (d.partnerEmail) {
    const first = d.partnerName.split(/\s+/)[0]
    const candFirst = d.candidateName.split(/\s+/)[0]
    const subject = `[Refery] ${d.candidateName} | hired at ${d.companyName}`
    const body = `Hi ${first},\n\n${d.companyName} confirmed it: ${d.candidateName} accepted the ${d.roleTitle} offer and starts on ${clockDate(clock.startDate, true)}.\n\n${payoutText ? `Your payout on this one is ${payoutText}. ` : ''}It is paid within 14 business days after ${candFirst} completes 90 days, so by ${clockDate(clock.payoutBy, true)}, once the client has paid. If ${candFirst} leaves before ${clockDate(clock.guaranteeEnds, true)} we run a replacement search for the client and nothing is paid or owed on this one.\n\nA congratulations note to ${candFirst}, in your words, is ready here: ${APP_URL}${candidatePath({ id: d.candidateId, slug: d.candidateSlug }, '?write=hired')}\n\nThank you. This is the whole point.\n\nBest,\nLily`
    await sendEmail(d.partnerEmail, subject, `<pre style="font-family: 'DM Sans', Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`, body)
  }

  return { ok: true, clock }
}

// ── the nudge ────────────────────────────────────────────────────────────────

/** One reminder per submission after the client's response window, then silence. */
export async function nudgeWaitingClients(): Promise<{ nudged: number }> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('role_submissions')
    .select('id, client_delivered_at, company_id')
    .eq('status', 'sent_to_client')
    .is('client_decision', null)
    .is('client_nudged_at', null)
    .not('client_delivered_at', 'is', null)
    .limit(100)

  let nudged = 0
  for (const r of rows ?? []) {
    const d = await loadDelivery(admin, r.id as string)
    if (!d || !d.deliveredAt || !d.briefSlug) continue
    const ageH = (Date.now() - new Date(d.deliveredAt).getTime()) / 3_600_000
    if (ageH < d.responseHours) continue
    const first = d.clientContactName?.split(/\s+/)[0]
    const days = Math.round(ageH / 24)
    const text = `${first ? `${first}, ` : ''}${d.candidateName} has been waiting ${days} ${days === 1 ? 'day' : 'days'}. A yes or no keeps them; no reply by the end of the week and I tell them we passed. ${candidatesUrl(d.briefSlug, d.id)}`
    let sent = false
    if (d.clientSlack) {
      const res = await postThreadReply(d.clientSlack.channel, d.clientSlack.ts, text)
      sent = res.ok
    }
    if (!sent && d.clientContactEmail) {
      const r2 = await sendEmail(d.clientContactEmail, `[Refery] ${d.companyName} | ${d.candidateName} is waiting on you`, `<p style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">${text.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p><p>Best,<br>Lily</p>`, `${text}\n\nBest,\nLily`)
      sent = r2.sent
    }
    await admin.from('role_submissions').update({ client_nudged_at: new Date().toISOString() }).eq('id', d.id)
    if (d.deskSlack) await postThreadReply(d.deskSlack.channel, d.deskSlack.ts, `:alarm_clock: Nudged ${esc(d.companyName)} after ${days} days${sent ? '' : ' (could not reach them; no Slack card or email)'}.`)
    nudged++
  }
  return { nudged }
}
