/**
 * "Your week on Refery": the Sunday email to every partner on at least one
 * search.
 *
 * Gina asked for this in so many words: what changed and where sourcing energy
 * is needed, never the job descriptions again. So the email is four short
 * sections and nothing else. What moved (their submissions that changed stage,
 * with the note that explains it). Needs you (proposals unanswered, submissions
 * missing an answer the client asked for). Your searches (one line each, with
 * the search stage). New this week (answers added to a search they are on).
 *
 * It only ever describes the partner's own work. No counts of anyone else.
 */

import { Resend } from 'resend'

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
  amber: '#f5eedd',
  amberInk: '#8a6a1f',
}
const SANS = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export interface DigestLine {
  /** Bold lead, usually a candidate name or a role. */
  lead: string
  text: string
}

export interface DigestSearchLine {
  title: string
  company: string
  href: string
  status: string
}

export interface WeeklyDigest {
  to: string
  firstName: string
  weekLabel: string
  moved: DigestLine[]
  needsYou: DigestLine[]
  searches: DigestSearchLine[]
  fresh: DigestLine[]
}

function lines(items: DigestLine[]): string {
  return items
    .map(
      l => `<tr><td style="padding:0 0 10px 0; font-family:${SANS}; font-size:15px; line-height:1.6; color:${M.body};"><strong>${escapeHtml(l.lead)}</strong> ${escapeHtml(l.text)}</td></tr>`,
    )
    .join('')
}

function section(title: string, inner: string): string {
  if (!inner) return ''
  return `<tr><td style="padding:0 0 22px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:0 0 8px 0; font-family:${SANS}; font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${M.muted};">${escapeHtml(title)}</td></tr>
      ${inner}
    </table>
  </td></tr>`
}

export function renderWeeklyDigest(d: WeeklyDigest): { subject: string; html: string } {
  const movedCount = d.moved.length
  const subject =
    movedCount > 0
      ? `Your week on Refery: ${movedCount} of your candidates moved`
      : d.needsYou.length > 0
        ? 'Your week on Refery: two minutes needed from you'
        : 'Your week on Refery'

  const needs = d.needsYou.length
    ? `<tr><td style="padding:0 0 22px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.amber}; border-radius:8px;"><tr><td style="padding:14px 16px;">
        <p style="margin:0 0 6px 0; font-family:${SANS}; font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:${M.amberInk};">Needs you</p>
        ${d.needsYou.map(l => `<p style="margin:0 0 6px 0; font-family:${SANS}; font-size:14.5px; line-height:1.55; color:${M.amberInk};"><strong>${escapeHtml(l.lead)}</strong> ${escapeHtml(l.text)}</p>`).join('')}
      </td></tr></table></td></tr>`
    : ''

  const searches = d.searches
    .map(
      s => `<tr><td style="padding:9px 0; border-top:1px solid ${M.rule}; font-family:${SANS};">
        <a href="${escapeHtml(s.href)}" style="font-size:14.5px; font-weight:600; color:${M.body}; text-decoration:none;">${escapeHtml(s.title)}</a>
        <span style="font-size:12.5px; color:${M.muted};"> · ${escapeHtml(s.company)}</span>
        <div style="font-size:12.5px; color:${M.muted}; margin-top:2px;">${escapeHtml(s.status)}</div>
      </td></tr>`,
    )
    .join('')

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};"><tr><td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px;">
  <tr><td style="padding:0 0 8px 0; font-family:${SANS}; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.5px;">Refery</td></tr>
  <tr><td style="padding:0 0 28px 0;"><div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:0 0 4px 0; font-family:${SANS}; font-weight:600; font-size:24px; line-height:1.25; color:${M.green};">Your week on Refery, ${escapeHtml(d.firstName)}.</td></tr>
  <tr><td style="padding:0 0 24px 0; font-family:${SANS}; font-size:13px; color:${M.muted};">${escapeHtml(d.weekLabel)} · about your own searches and candidates only</td></tr>
  ${section('What moved', lines(d.moved) || `<tr><td style="padding:0 0 10px 0; font-family:${SANS}; font-size:15px; line-height:1.6; color:${M.muted};">Nothing of yours changed stage this week.</td></tr>`)}
  ${needs}
  ${d.searches.length ? section('Your searches', searches) : ''}
  ${section('New this week', lines(d.fresh))}
  <tr><td style="padding:6px 0 32px 0;"><a href="${APP_URL}/partners" style="display:inline-block; padding:12px 22px; font-family:${SANS}; font-weight:600; font-size:14px; color:#ffffff; background-color:${M.green}; border-radius:999px; text-decoration:none;">Open your searches</a>
  <a href="mailto:${REPLY_TO}" style="display:inline-block; margin-left:10px; padding:12px 22px; font-family:${SANS}; font-weight:600; font-size:14px; color:${M.body}; border:1px solid #d2d1c7; border-radius:999px; text-decoration:none;">Reply to Lily</a></td></tr>
  <tr><td style="border-top:1px solid ${M.rule}; padding-top:18px; font-family:${SANS}; font-size:12px; line-height:1.6; color:${M.muted};">You get this once a week while you are on at least one search. What changed and where sourcing energy is needed, never the job descriptions again. Everything in it is confidential to you. Refery, Inc. &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a></td></tr>
</table></td></tr></table></body></html>`

  return { subject, html }
}

export async function sendWeeklyDigest(d: WeeklyDigest): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }
  if (!d.to) return { sent: false, error: 'No recipient' }
  const { subject, html } = renderWeeklyDigest(d)
  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({ from: FROM, to: d.to, replyTo: REPLY_TO, subject, html })
    if (error) return { sent: false, error: error.message }
    return { sent: true }
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' }
  }
}
