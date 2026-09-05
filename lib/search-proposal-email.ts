/**
 * The email a partner gets when Refery puts them on a search.
 *
 * Same shell as the activation and agreement emails: cream ground, DM Sans,
 * forest rule, table layout, inline styles. It carries the three things the
 * partner needs to decide: the role, what it pays them, and why we thought of
 * them. Confirming or declining happens on the Searches page, so the one
 * button opens the search.
 */

import { Resend } from 'resend'
import { feeExplanation, payoutAmount, resolveFee } from '@/lib/fees'

const FROM = 'Refery <agreements@refery.io>'
const REPLY_TO = 'lily@refery.io'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz'

const M = {
  green: '#1f3a2f',
  cream: '#f2f1eb',
  paper: '#faf9f5',
  body: '#161613',
  muted: '#6e6e68',
  rule: '#e4e3dc',
}
const SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface ProposalRole {
  title: string
  headline?: string | null
  company_name?: string | null
  location?: string | null
  salary_min?: number | string | null
  salary_max?: number | string | null
  fee_percentage?: number | string | null
  fee_flat?: number | string | null
  scout_payout?: number | string | null
  scout_share?: number | string | null
}

export async function sendSearchProposalEmail(input: {
  to: string
  fullName: string
  role: ProposalRole
  why: string
  jobId: string
  companyId: string
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }
  if (!input.to) return { sent: false, error: 'No recipient' }

  const first = input.fullName.trim().split(/\s+/)[0] || 'there'
  const title = input.role.headline || input.role.title
  const company = input.role.company_name ?? 'a client'
  const fee = resolveFee(input.role)
  const payout = payoutAmount(fee)
  const url = `${APP_URL}/partners/${input.companyId}/roles/${input.jobId}`

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>You are on a new search</title></head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};"><tr><td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
  <tr><td style="padding:0 0 8px 0; font-family:${SANS}; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.5px;">Refery</td></tr>
  <tr><td style="padding:0 0 32px 0;"><div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:0 0 14px 0; font-family:${SANS}; font-weight:600; font-size:24px; line-height:1.25; color:${M.green};">You are on a new search, ${escapeHtml(first)}.</td></tr>
  <tr><td style="padding:0 0 24px 0; font-family:${SANS}; font-size:16px; line-height:1.65; color:${M.body};">
    <strong>${escapeHtml(title)}</strong> at ${escapeHtml(company)}${input.role.location ? `, ${escapeHtml(input.role.location)}` : ''}.
    ${payout ? `${escapeHtml(payout)} to you on a placement (${escapeHtml(feeExplanation(fee))}).` : ''}
  </td></tr>
  ${input.why ? `<tr><td style="padding:0 0 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.paper}; border:1px solid ${M.rule}; border-radius:8px;"><tr><td style="padding:16px 20px; font-family:${SANS}; font-size:15px; line-height:1.6; color:${M.body};"><span style="color:${M.muted}; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; display:block; margin-bottom:6px;">Why you</span>${escapeHtml(input.why)}</td></tr></table></td></tr>` : ''}
  <tr><td style="padding:0 0 28px 0; font-family:${SANS}; font-size:16px; line-height:1.65; color:${M.body};">Read the brief and the hiring manager&rsquo;s own words, then tell us in one tap whether you will work it. If it is not for you, say why in a line so we know where to look next. Unanswered, it drops off your list after seven days.</td></tr>
  <tr><td style="padding:0 0 36px 0;"><a href="${escapeHtml(url)}" style="display:inline-block; padding:13px 26px; font-family:${SANS}; font-weight:600; font-size:15px; color:#ffffff; background-color:${M.green}; border-radius:999px; text-decoration:none;">Open the search</a></td></tr>
  <tr><td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:${SANS}; font-size:12px; line-height:1.6; color:${M.muted};">Confidential. The client&rsquo;s name and brief are for you and not for candidates until they have signed Refery&rsquo;s confidentiality note. Refery, Inc. &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a></td></tr>
</table></td></tr></table></body></html>`

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      replyTo: REPLY_TO,
      subject: `You are on a new search: ${title} at ${company}`,
      html,
    })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}
