/**
 * The email a partner gets when their request to be put on a client is decided.
 *
 * Same shell as the proposal and activation emails: cream ground, DM Sans,
 * forest rule, inline styles. Two versions, one per decision. The decline is
 * short and kind on purpose: the alternative is the "Access requested" state
 * silently vanishing on them, which reads as a bug or a snub.
 *
 * Pure: no database, no Next.js imports, so it can be rendered from a script
 * or a preview page as well as from the decision handler.
 */

import { Resend } from 'resend'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const FROM = 'Refery <agreements@refery.io>'
const REPLY_TO = 'lily@refery.io'

const M = { green: '#1f3a2f', cream: '#f2f1eb', body: '#161613', muted: '#6e6e68', rule: '#e4e3dc' }
const SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export type AccessDecision = 'approved' | 'denied'

export interface AccessDecisionEmailInput {
  fullName: string
  decision: AccessDecision
  companyName: string
  companyId: string
}

export function renderAccessDecisionEmail(input: AccessDecisionEmailInput): { subject: string; html: string } {
  const first = input.fullName.trim().split(/\s+/)[0] || 'there'
  const company = escapeHtml(input.companyName)
  const approved = input.decision === 'approved'
  const url = approved ? `${APP_URL}/searches/${input.companyId}` : `${APP_URL}/searches`

  const subject = approved ? `You are on ${input.companyName}` : `About ${input.companyName}`
  const heading = approved
    ? `You are on ${company}, ${escapeHtml(first)}.`
    : `Not this one for now, ${escapeHtml(first)}.`
  const body = approved
    ? `The client&rsquo;s name, their brief and every live search under it are open to you now. Read the brief first: it says who they hire and who they do not, in the hiring manager&rsquo;s own words.`
    : `We are keeping ${company} with the partners already on it. That is about coverage, not about you. Other searches are open to you on request, and we will keep proposing the ones that fit your network.`
  const button = approved ? 'Open the client' : 'See open searches'

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};"><tr><td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
  <tr><td style="padding:0 0 8px 0; font-family:${SANS}; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.5px;">Refery</td></tr>
  <tr><td style="padding:0 0 32px 0;"><div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:0 0 14px 0; font-family:${SANS}; font-weight:600; font-size:24px; line-height:1.25; color:${M.green};">${heading}</td></tr>
  <tr><td style="padding:0 0 28px 0; font-family:${SANS}; font-size:16px; line-height:1.65; color:${M.body};">${body}</td></tr>
  <tr><td style="padding:0 0 36px 0;"><a href="${escapeHtml(url)}" style="display:inline-block; padding:13px 26px; font-family:${SANS}; font-weight:600; font-size:15px; color:#ffffff; background-color:${M.green}; border-radius:999px; text-decoration:none;">${button}</a></td></tr>
  <tr><td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:${SANS}; font-size:12px; line-height:1.6; color:${M.muted};">Confidential. A client&rsquo;s name and brief are for you and not for candidates until they have signed Refery&rsquo;s confidentiality note. Refery, Inc. &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a></td></tr>
</table></td></tr></table></body></html>`

  return { subject, html }
}

export async function sendAccessDecisionEmail(
  input: AccessDecisionEmailInput & { to: string },
): Promise<{ sent: boolean; error?: string }> {
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
