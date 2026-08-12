/**
 * Real-time activity alerts for client agreement links.
 *
 * Fires on every logged event up to (and including) signature, so an admin
 * knows the moment a prospect opens the agreement — the highest-signal moment
 * in the whole funnel, and the right time to follow up.
 *
 * Views are deduped upstream in logAgreementEvent(), so a refresh or a second
 * tab does not produce a second email.
 */

import { Resend } from 'resend'
import { describeEvent, ordinal, type AgreementEventType } from '@/lib/agreement-events'

const FROM = 'Refery <agreements@refery.io>'
const ADMIN_INBOX = 'lily@refery.io'

const INK = '#100F0F'
const MUTED = '#6B6A67'
const RULE = '#E4E4DD'
const GREEN = '#2A6B45'
const BG = '#F8F8F3'

export interface ActivityEmailData {
  companyName: string
  recipientLabel: string | null
  eventType: AgreementEventType
  seq: number
  device: string | null
  ipAddress: string | null
  occurredAtHuman: string
  version: string
  feePercent: string
  companyUrl: string
  signUrl: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Short nudge telling the admin what this event means for follow-up. */
function hint(d: ActivityEmailData): string | null {
  if (d.eventType === 'viewed' && d.seq === 1) {
    return 'They just opened it for the first time. This is the warmest the lead will be all week.'
  }
  if (d.eventType === 'viewed' && d.seq >= 3) {
    return `Opened ${ordinal(d.seq)} time without signing — usually means someone else needs to approve it, or a specific term is sticking.`
  }
  if (d.eventType === 'viewed') {
    return 'Back for another read. Worth a short, low-pressure check-in.'
  }
  if (d.eventType === 'signed') {
    return 'Signed. The countersigned PDF is on its way to them separately.'
  }
  return null
}

function subject(d: ActivityEmailData): string {
  switch (d.eventType) {
    case 'viewed':
      return d.seq === 1
        ? `${d.companyName} just opened the agreement`
        : `${d.companyName} opened the agreement again (${ordinal(d.seq)})`
    case 'signed':
      return `${d.companyName} signed the agreement`
    case 'revoked':
      return `${d.companyName} agreement link revoked`
    case 'expired':
      return `${d.companyName} agreement link expired`
    default:
      return `${d.companyName} agreement activity`
  }
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:7px 16px 7px 0; font-size:13px; color:${MUTED}; white-space:nowrap; vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:7px 0; font-size:13px; color:${INK}; vertical-align:top;">${escapeHtml(value)}</td>
  </tr>`
}

function html(d: ActivityEmailData): string {
  const tip = hint(d)
  return `<!doctype html>
<html><body style="margin:0; padding:0; background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}; padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px; background:#ffffff; border:1px solid ${RULE}; border-radius:10px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">

  <tr><td style="padding:26px 28px 0 28px;">
    <div style="font-size:11px; letter-spacing:1px; text-transform:uppercase; font-weight:600; color:${GREEN};">Agreement activity</div>
    <div style="margin-top:10px; font-size:21px; line-height:1.3; color:${INK}; font-weight:600;">
      ${escapeHtml(d.companyName)} — ${escapeHtml(describeEvent({ event_type: d.eventType, seq: d.seq, device: d.device }).toLowerCase())}
    </div>
  </td></tr>

  ${
    tip
      ? `<tr><td style="padding:16px 28px 0 28px;">
    <div style="background:${BG}; border:1px solid ${RULE}; border-radius:8px; padding:13px 15px; font-size:13.5px; line-height:1.55; color:${INK};">
      ${escapeHtml(tip)}
    </div>
  </td></tr>`
      : ''
  }

  <tr><td style="padding:18px 28px 0 28px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      ${row('When', d.occurredAtHuman)}
      ${d.recipientLabel ? row('Sent to', d.recipientLabel) : row('Sent to', 'Open link — signer fills in their own details')}
      ${d.device ? row('Device', d.device) : ''}
      ${d.ipAddress ? row('IP', d.ipAddress) : ''}
      ${row('Terms', `v${d.version} · ${d.feePercent}% fee`)}
    </table>
  </td></tr>

  <tr><td style="padding:22px 28px 28px 28px;">
    <a href="${escapeHtml(d.companyUrl)}" style="display:inline-block; background:${INK}; color:#ffffff; font-size:14px; font-weight:500; text-decoration:none; padding:11px 20px; border-radius:6px;">Open in Refery</a>
    <a href="${escapeHtml(d.signUrl)}" style="display:inline-block; margin-left:10px; color:${MUTED}; font-size:13px; text-decoration:none; padding:11px 0;">View their link</a>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`
}

function text(d: ActivityEmailData): string {
  const tip = hint(d)
  return [
    `${d.companyName} — ${describeEvent({ event_type: d.eventType, seq: d.seq, device: d.device }).toLowerCase()}`,
    '',
    ...(tip ? [tip, ''] : []),
    `When: ${d.occurredAtHuman}`,
    `Sent to: ${d.recipientLabel ?? 'Open link — signer fills in their own details'}`,
    ...(d.device ? [`Device: ${d.device}`] : []),
    ...(d.ipAddress ? [`IP: ${d.ipAddress}`] : []),
    `Terms: v${d.version} · ${d.feePercent}% fee`,
    '',
    `Open in Refery: ${d.companyUrl}`,
    `Their link: ${d.signUrl}`,
  ].join('\n')
}

export async function sendAgreementActivityEmail(
  data: ActivityEmailData,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }

  try {
    const resend = new Resend(apiKey)
    const res = await resend.emails.send({
      from: FROM,
      to: ADMIN_INBOX,
      subject: `[Refery] ${subject(data)}`,
      html: html(data),
      text: text(data),
    })
    if (res.error) {
      return { sent: false, error: res.error.message || JSON.stringify(res.error) }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
