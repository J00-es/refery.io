/**
 * Post-signing emails for the client Recruitment Services Agreement.
 *
 * Two emails are sent on a successful sign:
 *   A) Branded confirmation to the company signer (cream background, DM Sans
 *      heading, forest green accent rule, table-based layout for broad
 *      email-client support, inline styles only).
 *   B) Plain admin notification to lily@refery.io.
 *
 * Both attach the signed PDF.
 */

import { Resend } from 'resend'
import { clientTermsSummary } from '@/lib/agreements'

const FROM_DEFAULT = 'Refery <agreements@refery.io>'
const ADMIN_INBOX = 'lily@refery.io'
const REPLY_TO = 'lily@refery.io'

// Partner (scout/recruiter) agreement emails. The admin notification goes to
// Lily directly so she sees every new partner sign-up in her primary inbox;
// from/reply-to stay on the dedicated agreements mailbox so threaded replies
// land in the shared archive.
const PARTNER_FROM = 'Refery <agreements@refery.io>'
const PARTNER_ADMIN_INBOX = 'lily@refery.io'
const PARTNER_REPLY_TO = 'agreements@refery.io'

export interface AgreementEmailData {
  signerName: string
  signerTitle: string | null
  signerEmail: string
  companyName: string
  feePercent: string // pre-formatted ("20" or "17.5")
  version: string
  signedAtIso: string
  signedAtHuman: string // human-readable, e.g. "May 11, 2026 at 18:42 UTC"
  ipAddress: string | null
  termsHash: string
  agreementLinkId: string
  adminUrl: string
  pdfBuffer: Buffer
  pdfFilename: string
}

function envFrom(): string {
  return process.env.RESEND_FROM_EMAIL
    ? `Refery <${process.env.RESEND_FROM_EMAIL}>`
    : FROM_DEFAULT
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || full
}

// Brand tokens for the signer email (kept identical to the spec).
// Same cream palette as the app, so a signed agreement email and the page it
// was signed on read as one product. Values mirror the tokens in globals.css.
const M = {
  green: '#1f3a2f',
  cream: '#f2f1eb',
  paper: '#faf9f5',
  body: '#161613',
  muted: '#6e6e68',
  rule: '#e4e3dc',
}

function signerEmailHtml(d: AgreementEmailData): string {
  const greeting = firstName(d.signerName)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Refery services agreement is signed</title>
</head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};">
    <tr>
      <td align="center" style="padding:32px 16px 48px 16px;">

        <!-- Container -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; background-color:${M.cream};">

          <!-- Header: wordmark + forest green rule -->
          <tr>
            <td style="padding:0 0 8px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.8px;">
              Refery<span style="font-style:italic;">.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px 0;">
              <div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Greeting + confirmation -->
          <tr>
            <td style="padding:0 0 18px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.6; color:${M.body};">
              Hi ${escapeHtml(greeting)},
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              Thanks for signing the Refery recruitment services agreement on behalf of <strong style="color:${M.body}; font-weight:600;">${escapeHtml(d.companyName)}</strong>. You&rsquo;re all set, and we&rsquo;re looking forward to getting started on your roles.
            </td>
          </tr>

          <!-- At a glance card -->
          <tr>
            <td style="padding:0 0 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.paper}; border:1px solid ${M.rule}; border-radius:8px;">
                <tr>
                  <td style="padding:18px 24px; border-bottom:1px solid ${M.rule}; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600; width:38%;">Fee</td>
                        <td style="font-size:15px; line-height:1.5; color:${M.body}; text-align:right;">${escapeHtml(d.feePercent)}% of first-year base salary</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 24px; border-bottom:1px solid ${M.rule}; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600; width:38%;">Payment</td>
                        <td style="font-size:15px; line-height:1.5; color:${M.body}; text-align:right;">${escapeHtml(clientTermsSummary(d.version).payment)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 24px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600; width:38%;">Guarantee</td>
                        <td style="font-size:15px; line-height:1.5; color:${M.body}; text-align:right;">${escapeHtml(clientTermsSummary(d.version).guarantee)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Signature details block -->
          <tr>
            <td style="padding:0 0 28px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 0 8px 0; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">Signed by</td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px 0; font-size:14px; line-height:1.5; color:${M.body};">
                    ${escapeHtml(d.signerName)}${d.signerTitle ? `, ${escapeHtml(d.signerTitle)}` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 8px 0; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">Signed on</td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px 0; font-size:14px; line-height:1.5; color:${M.body};">
                    ${escapeHtml(d.signedAtHuman)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 8px 0; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">Version</td>
                </tr>
                <tr>
                  <td style="padding:0 0 0 0; font-size:14px; line-height:1.5; color:${M.body};">
                    v${escapeHtml(d.version)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- PDF attachment note -->
          <tr>
            <td style="padding:0 0 24px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:14px; line-height:1.6; color:${M.muted};">
              A signed PDF copy is attached to this email for your records.
            </td>
          </tr>

          <!-- Reply / contact line -->
          <tr>
            <td style="padding:0 0 32px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:14px; line-height:1.65; color:${M.body};">
              Any questions, reply to this email or reach <a href="mailto:legal@refery.io" style="color:${M.green}; text-decoration:underline;">legal@refery.io</a>.
            </td>
          </tr>

          <!-- Sign-off -->
          <tr>
            <td style="padding:0 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:15px; line-height:1.4; color:${M.body};">
              Lily Joo
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 36px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:13px; line-height:1.4; color:${M.muted};">
              Founding Partner, Refery
            </td>
          </tr>

          <!-- Footer hairline rule -->
          <tr>
            <td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:11px; line-height:1.5; color:${M.muted};">
              Refery &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`
}

function adminEmailHtml(d: AgreementEmailData): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;font-size:14px;line-height:1.55;">
<p style="margin:0 0 12px 0;"><strong>${escapeHtml(d.companyName)}</strong> just signed the v${escapeHtml(d.version)} services agreement.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; font-size:14px;">
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Signer</td><td style="padding:2px 0;">${escapeHtml(d.signerName)}${d.signerTitle ? ` (${escapeHtml(d.signerTitle)})` : ''}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Email</td><td style="padding:2px 0;">${escapeHtml(d.signerEmail)}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Fee</td><td style="padding:2px 0;">${escapeHtml(d.feePercent)}%</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Signed at</td><td style="padding:2px 0;">${escapeHtml(d.signedAtIso)}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">IP</td><td style="padding:2px 0;">${escapeHtml(d.ipAddress || 'Not recorded')}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Hash</td><td style="padding:2px 0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;">${escapeHtml(d.termsHash)}</td></tr>
</table>
<p style="margin:0;"><a href="${escapeHtml(d.adminUrl)}" style="color:#1f3a2f;">Admin view</a></p>
</body></html>`
}

function adminEmailText(d: AgreementEmailData): string {
  return [
    `${d.companyName} just signed the v${d.version} services agreement.`,
    '',
    `Signer: ${d.signerName}${d.signerTitle ? ` (${d.signerTitle})` : ''}`,
    `Email: ${d.signerEmail}`,
    `Fee: ${d.feePercent}%`,
    `Signed at: ${d.signedAtIso}`,
    `IP: ${d.ipAddress ?? 'Not recorded'}`,
    `Hash: ${d.termsHash}`,
    '',
    `Admin view: ${d.adminUrl}`,
  ].join('\n')
}

function signerEmailText(d: AgreementEmailData): string {
  return [
    `Hi ${firstName(d.signerName)},`,
    '',
    `Thanks for signing the Refery recruitment services agreement on behalf of ${d.companyName}. You're all set, and we're looking forward to getting started on your roles.`,
    '',
    'At a glance',
    `  Fee: ${d.feePercent}% of first-year base salary`,
    `  Payment: ${clientTermsSummary(d.version).payment}`,
    `  Guarantee: ${clientTermsSummary(d.version).guarantee}`,
    '',
    `Signed by: ${d.signerName}${d.signerTitle ? `, ${d.signerTitle}` : ''}`,
    `Signed on: ${d.signedAtHuman}`,
    `Version: v${d.version}`,
    '',
    'A signed PDF copy is attached for your records.',
    '',
    'Any questions, reply to this email or reach legal@refery.io.',
    '',
    'Lily Joo',
    'Founding Partner, Refery',
  ].join('\n')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* ----------------------------------------------------------------------------
 * Partner (scout/recruiter) agreement emails
 *
 * Same brand template family as the client services email, but intentionally
 * simpler: no "At a glance" card, shorter body. Spec wording matched verbatim.
 * -------------------------------------------------------------------------- */

export type PartnerType = 'scout' | 'recruiter' | null

export interface PartnerAgreementEmailData {
  signerName: string
  signerEmail: string
  partnerType: PartnerType
  version: string
  signedAtIso: string
  signedAtHuman: string
  ipAddress: string | null
  termsHash: string
  agreementLinkId: string
  adminUrl: string
  pdfBuffer: Buffer
  pdfFilename: string
}

function partnerLabel(t: PartnerType): string {
  if (t === 'scout') return 'scout'
  if (t === 'recruiter') return 'recruiter'
  return 'partner'
}

function partnerSignerEmailHtml(d: PartnerAgreementEmailData): string {
  const greeting = firstName(d.signerName)
  const label = partnerLabel(d.partnerType)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Refery partner agreement is signed</title>
</head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};">
    <tr>
      <td align="center" style="padding:32px 16px 48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; background-color:${M.cream};">

          <!-- Header: wordmark + forest green rule -->
          <tr>
            <td style="padding:0 0 8px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-weight:600; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.8px;">
              Refery<span style="font-style:italic;">.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px 0;">
              <div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Welcome headline -->
          <tr>
            <td style="padding:0 0 14px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-weight:600; font-size:24px; line-height:1.25; color:${M.green};">
              Welcome to Refery, ${escapeHtml(greeting)}.
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 18px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              You&rsquo;re officially a Refery <strong style="color:${M.body}; font-weight:600;">${escapeHtml(label)}</strong> partner, and we&rsquo;re genuinely glad to have you. Your agreement is signed and a countersigned PDF is attached for your records.
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              From here, we handle the business side: clients, contracts, invoicing, and the guarantee. That leaves you free to focus on surfacing great people. Your candidate submissions are protected for 24 months, and you earn 70% on every successful placement.
            </td>
          </tr>

          <!-- Signature details block -->
          <tr>
            <td style="padding:0 0 28px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:0 0 8px 0; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">Signed by</td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px 0; font-size:14px; line-height:1.5; color:${M.body};">
                    ${escapeHtml(d.signerName)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 8px 0; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">Signed on</td>
                </tr>
                <tr>
                  <td style="padding:0 0 14px 0; font-size:14px; line-height:1.5; color:${M.body};">
                    ${escapeHtml(d.signedAtHuman)}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 8px 0; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">Version</td>
                </tr>
                <tr>
                  <td style="padding:0 0 0 0; font-size:14px; line-height:1.5; color:${M.body};">
                    v${escapeHtml(d.version)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 24px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:14px; line-height:1.6; color:${M.muted};">
              A signed PDF copy is attached to this email for your records.
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 32px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:14px; line-height:1.65; color:${M.body};">
              Any questions, reply to this email or reach <a href="mailto:legal@refery.io" style="color:${M.green}; text-decoration:underline;">legal@refery.io</a>.
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 6px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:15px; line-height:1.4; color:${M.body};">
              Lily Joo
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 36px 0; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:13px; line-height:1.4; color:${M.muted};">
              Founding Partner, Refery
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:11px; line-height:1.5; color:${M.muted};">
              Refery &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function partnerSignerEmailText(d: PartnerAgreementEmailData): string {
  const label = partnerLabel(d.partnerType)
  return [
    `Welcome to Refery, ${firstName(d.signerName)}.`,
    '',
    `You're officially a Refery ${label} partner, and we're genuinely glad to have you. Your agreement is signed and a countersigned PDF is attached for your records.`,
    '',
    'From here, we handle the business side: clients, contracts, invoicing, and the guarantee. That leaves you free to focus on surfacing great people. Your candidate submissions are protected for 24 months, and you earn 70% on every successful placement.',
    '',
    `Signed by: ${d.signerName}`,
    `Signed on: ${d.signedAtHuman}`,
    `Version: v${d.version}`,
    '',
    'A signed PDF copy is attached for your records.',
    '',
    'Any questions, reply to this email or reach legal@refery.io.',
    '',
    'Lily Joo',
    'Founding Partner, Refery',
  ].join('\n')
}

function partnerAdminEmailHtml(d: PartnerAgreementEmailData): string {
  const label = partnerLabel(d.partnerType)
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;font-size:14px;line-height:1.55;">
<p style="margin:0 0 12px 0;"><strong>${escapeHtml(d.signerName)}</strong> just signed the v${escapeHtml(d.version)} ${escapeHtml(label)} agreement.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0; font-size:14px;">
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Email</td><td style="padding:2px 0;">${escapeHtml(d.signerEmail)}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Signed at</td><td style="padding:2px 0;">${escapeHtml(d.signedAtIso)}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">IP</td><td style="padding:2px 0;">${escapeHtml(d.ipAddress || 'Not recorded')}</td></tr>
  <tr><td style="padding:2px 12px 2px 0; color:#666;">Hash</td><td style="padding:2px 0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px;">${escapeHtml(d.termsHash)}</td></tr>
</table>
<p style="margin:0;"><a href="${escapeHtml(d.adminUrl)}" style="color:#1f3a2f;">Admin view</a></p>
</body></html>`
}

function partnerAdminEmailText(d: PartnerAgreementEmailData): string {
  const label = partnerLabel(d.partnerType)
  return [
    `${d.signerName} just signed the v${d.version} ${label} agreement.`,
    '',
    `Email: ${d.signerEmail}`,
    `Signed at: ${d.signedAtIso}`,
    `IP: ${d.ipAddress ?? 'Not recorded'}`,
    `Hash: ${d.termsHash}`,
    '',
    `Admin view: ${d.adminUrl}`,
  ].join('\n')
}

export async function sendPartnerAgreementEmails(
  data: PartnerAgreementEmailData,
): Promise<{ signerSent: boolean; adminSent: boolean; errors: string[] }> {
  const errors: string[] = []
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return {
      signerSent: false,
      adminSent: false,
      errors: ['RESEND_API_KEY not set'],
    }
  }

  const resend = new Resend(apiKey)
  const attachment = { filename: data.pdfFilename, content: data.pdfBuffer }
  const label = partnerLabel(data.partnerType)

  let signerSent = false
  try {
    const res = await resend.emails.send({
      from: PARTNER_FROM,
      to: data.signerEmail,
      replyTo: PARTNER_REPLY_TO,
      subject: 'Welcome to Refery, your partner agreement is signed',
      html: partnerSignerEmailHtml(data),
      text: partnerSignerEmailText(data),
      attachments: [attachment],
    })
    if (res.error) {
      errors.push(`signer: ${res.error.message || JSON.stringify(res.error)}`)
    } else {
      signerSent = true
    }
  } catch (err) {
    errors.push(`signer: ${(err as Error).message}`)
  }

  let adminSent = false
  try {
    const res = await resend.emails.send({
      from: PARTNER_FROM,
      to: PARTNER_ADMIN_INBOX,
      replyTo: PARTNER_REPLY_TO,
      subject: `[Refery] ${data.signerName} signed v${data.version} ${label} agreement`,
      html: partnerAdminEmailHtml(data),
      text: partnerAdminEmailText(data),
      attachments: [attachment],
    })
    if (res.error) {
      errors.push(`admin: ${res.error.message || JSON.stringify(res.error)}`)
    } else {
      adminSent = true
    }
  } catch (err) {
    errors.push(`admin: ${(err as Error).message}`)
  }

  return { signerSent, adminSent, errors }
}

export async function sendAgreementEmails(data: AgreementEmailData): Promise<{
  signerSent: boolean
  adminSent: boolean
  errors: string[]
}> {
  const errors: string[] = []
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return {
      signerSent: false,
      adminSent: false,
      errors: ['RESEND_API_KEY not set'],
    }
  }

  const resend = new Resend(apiKey)
  const from = envFrom()
  const attachment = {
    filename: data.pdfFilename,
    content: data.pdfBuffer,
  }

  // Signer email
  let signerSent = false
  try {
    const res = await resend.emails.send({
      from,
      to: data.signerEmail,
      replyTo: REPLY_TO,
      subject: 'Your Refery services agreement is signed',
      html: signerEmailHtml(data),
      text: signerEmailText(data),
      attachments: [attachment],
    })
    if (res.error) {
      errors.push(`signer: ${res.error.message || JSON.stringify(res.error)}`)
    } else {
      signerSent = true
    }
  } catch (err) {
    errors.push(`signer: ${(err as Error).message}`)
  }

  // Admin email
  let adminSent = false
  try {
    const res = await resend.emails.send({
      from,
      to: ADMIN_INBOX,
      subject: `[Refery] ${data.companyName} signed v${data.version} services agreement`,
      html: adminEmailHtml(data),
      text: adminEmailText(data),
      attachments: [attachment],
    })
    if (res.error) {
      errors.push(`admin: ${res.error.message || JSON.stringify(res.error)}`)
    } else {
      adminSent = true
    }
  } catch (err) {
    errors.push(`admin: ${(err as Error).message}`)
  }

  return { signerSent, adminSent, errors }
}
