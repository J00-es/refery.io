/**
 * The email a partner gets when Refery answers their question on a search.
 *
 * Sent once, on the first answer. A later edit to the answer updates the page
 * but does not email again: the partner has the link, and two emails for one
 * question reads as churn. Pure: no database, no Next.js imports.
 */

import { Resend } from 'resend'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const FROM = 'Refery <hello@refery.io>'
const REPLY_TO = 'lily@refery.io'

const M = { green: '#1f3a2f', cream: '#f2f1eb', paper: '#faf9f5', body: '#161613', muted: '#6e6e68', rule: '#e4e3dc' }
const SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface QuestionAnsweredEmailInput {
  fullName: string
  question: string
  answer: string
  roleTitle: string
  companyName: string
  companyId: string
  jobId: string
}

export function renderQuestionAnsweredEmail(input: QuestionAnsweredEmailInput): { subject: string; html: string } {
  const first = input.fullName.trim().split(/\s+/)[0] || 'there'
  const where = `${input.roleTitle} at ${input.companyName}`
  const url = `${APP_URL}/searches/${input.companyId}/roles/${input.jobId}#questions`
  const subject = `Answered: your question on ${where}`

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};"><tr><td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
  <tr><td style="padding:0 0 8px 0; font-family:${SANS}; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.5px;">Refery</td></tr>
  <tr><td style="padding:0 0 32px 0;"><div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:0 0 14px 0; font-family:${SANS}; font-weight:600; font-size:24px; line-height:1.25; color:${M.green};">Your question is answered, ${escapeHtml(first)}.</td></tr>
  <tr><td style="padding:0 0 20px 0; font-family:${SANS}; font-size:14px; color:${M.muted};">${escapeHtml(where)}</td></tr>
  <tr><td style="padding:0 0 12px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.paper}; border:1px solid ${M.rule}; border-radius:8px;"><tr><td style="padding:14px 18px; font-family:${SANS}; font-size:15px; line-height:1.6; color:${M.body};"><span style="color:${M.muted}; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; display:block; margin-bottom:6px;">You asked</span>${escapeHtml(input.question)}</td></tr></table></td></tr>
  <tr><td style="padding:0 0 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border:1px solid ${M.rule}; border-radius:8px;"><tr><td style="padding:14px 18px; font-family:${SANS}; font-size:15px; line-height:1.6; color:${M.body};"><span style="color:${M.muted}; font-size:12px; text-transform:uppercase; letter-spacing:0.08em; display:block; margin-bottom:6px;">Refery</span>${escapeHtml(input.answer).replace(/\n/g, '<br/>')}</td></tr></table></td></tr>
  <tr><td style="padding:0 0 36px 0;"><a href="${escapeHtml(url)}" style="display:inline-block; padding:13px 26px; font-family:${SANS}; font-weight:600; font-size:15px; color:#ffffff; background-color:${M.green}; border-radius:999px; text-decoration:none;">Open the search</a></td></tr>
  <tr><td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:${SANS}; font-size:12px; line-height:1.6; color:${M.muted};">The answer is now on the search for every partner working it. Nobody but Refery sees who asked. Refery &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a></td></tr>
</table></td></tr></table></body></html>`

  return { subject, html }
}

export async function sendQuestionAnsweredEmail(
  input: QuestionAnsweredEmailInput & { to: string },
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }
  if (!input.to) return { sent: false, error: 'No recipient' }
  const { subject, html } = renderQuestionAnsweredEmail(input)
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: FROM, to: input.to, replyTo: REPLY_TO, subject, html })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}
