/**
 * The email a partner gets when their account is approved.
 *
 * Sign-up leaves them `pending`, which means they can log in and see nothing
 * they can act on. Until now the only thing that told them the wait was over
 * was noticing the app had changed, so this is the first message that actually
 * says "you're in, here is what to do".
 *
 * Deliberately the same shell as the partner agreement email in
 * lib/send-agreement-emails.ts: cream ground, Georgia wordmark, forest rule,
 * inline styles and table layout for the email clients that need them. The two
 * arrive days apart and should read as the same company writing twice.
 */

import { Resend } from 'resend'

const FROM = 'Refery <agreements@refery.io>'
const REPLY_TO = 'lily@refery.io'

/** Brand tokens, kept identical to the agreement emails. */
const M = {
  green: '#1f3a2f',
  cream: '#faf9f5',
  body: '#2a2a2a',
  muted: '#6b6b6b',
  rule: '#e5e2d8',
}

export type PartnerRole = 'scout' | 'recruiter' | 'hiring_manager' | 'admin' | 'viewer' | string

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || 'there'
}

function roleLabel(role: PartnerRole): string {
  if (role === 'scout') return 'scout'
  if (role === 'recruiter') return 'recruiter'
  return 'partner'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface ActivationEmailData {
  fullName: string
  role: PartnerRole
  /** Absolute origin, e.g. https://refery.xyz. No trailing slash. */
  appUrl: string
}

export function partnerActivationSubject(): string {
  return 'Your Refery account is live'
}

export function partnerActivationHtml(d: ActivationEmailData): string {
  const greeting = firstName(d.fullName)
  const label = roleLabel(d.role)
  const candidatesUrl = `${d.appUrl}/candidates`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Your Refery account is live</title>
</head>
<body style="margin:0; padding:0; background-color:${M.cream}; -webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};">
    <tr>
      <td align="center" style="padding:32px 16px 48px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:560px; background-color:${M.cream};">

          <!-- Header: wordmark + forest green rule -->
          <tr>
            <td style="padding:0 0 8px 0; font-family:Georgia, 'Times New Roman', serif; font-size:28px; line-height:1; color:${M.green}; letter-spacing:-0.5px;">
              Refery<span style="font-style:italic;">.</span>
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 32px 0;">
              <div style="width:48px; height:2px; background-color:${M.green}; line-height:2px; font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <!-- Headline -->
          <tr>
            <td style="padding:0 0 14px 0; font-family:Georgia, 'Times New Roman', serif; font-size:24px; line-height:1.25; color:${M.green};">
              You&rsquo;re approved, ${escapeHtml(greeting)}.
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 18px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              Your Refery ${escapeHtml(label)} account is active. You can sign in now and start introducing people.
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 28px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              You do not need an open role to refer someone. Introduce people you would personally vouch for, and we match them against the roles we are working on now and the ones that come next.
            </td>
          </tr>

          <!-- Primary action -->
          <tr>
            <td style="padding:0 0 30px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background-color:${M.green}; border-radius:8px;">
                    <a href="${escapeHtml(candidatesUrl)}" style="display:inline-block; padding:13px 26px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:15px; font-weight:600; line-height:1; color:#ffffff; text-decoration:none;">
                      Introduce someone
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Who we can place -->
          <tr>
            <td style="padding:0 0 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border:1px solid ${M.rule}; border-radius:8px;">
                <tr>
                  <td style="padding:20px 24px 8px 24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:12px; line-height:1.5; color:${M.muted}; letter-spacing:1px; text-transform:uppercase; font-weight:600;">
                    Who we place
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px 24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:15px; line-height:1.65; color:${M.body};">
                    Hands-on builders and sellers, usually two to five years in, at the individual contributor level. Ex-founders and early startup operators. Engineering and go-to-market, in or moving to the role&rsquo;s city, mostly San Francisco and New York.
                    <br /><br />
                    <span style="color:${M.muted};">The full list, including what we cannot place, sits at the top of your candidates page.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 32px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              You can also email a CV straight to <a href="mailto:lily@refery.io" style="color:${M.green}; text-decoration:underline;">lily@refery.io</a>, copying <a href="mailto:candidates@refery.io" style="color:${M.green}; text-decoration:underline;">candidates@refery.io</a>, and it lands in your candidate list automatically.
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 32px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:16px; line-height:1.65; color:${M.body};">
              Anything at all, just reply to this email.
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 6px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:15px; line-height:1.4; color:${M.body};">
              Lily Joo
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 36px 0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:13px; line-height:1.4; color:${M.muted};">
              Founding Partner, Refery
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid ${M.rule}; padding-top:20px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; font-size:11px; line-height:1.5; color:${M.muted};">
              Refery, Inc. &middot; <a href="https://refery.io" style="color:${M.muted}; text-decoration:none;">refery.io</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function partnerActivationText(d: ActivationEmailData): string {
  return [
    `You're approved, ${firstName(d.fullName)}.`,
    '',
    `Your Refery ${roleLabel(d.role)} account is active. You can sign in now and start introducing people.`,
    '',
    'You do not need an open role to refer someone. Introduce people you would personally vouch for, and we match them against the roles we are working on now and the ones that come next.',
    '',
    `Introduce someone: ${d.appUrl}/candidates`,
    '',
    'Who we place: hands-on builders and sellers, usually two to five years in, at the individual contributor level. Ex-founders and early startup operators. Engineering and go-to-market, in or moving to the role’s city, mostly San Francisco and New York. The full list, including what we cannot place, sits at the top of your candidates page.',
    '',
    'You can also email a CV straight to lily@refery.io, copying candidates@refery.io, and it lands in your candidate list automatically.',
    '',
    'Anything at all, just reply to this email.',
    '',
    'Lily Joo',
    'Founding Partner, Refery',
  ].join('\n')
}

/**
 * Sends the activation email. Never throws: the approval already happened, and
 * a failed send is reported back into the Slack thread rather than losing the
 * decision.
 */
export async function sendPartnerActivationEmail(
  to: string,
  d: ActivationEmailData,
): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }

  try {
    const resend = new Resend(apiKey)
    const res = await resend.emails.send({
      from: FROM,
      to,
      replyTo: REPLY_TO,
      subject: partnerActivationSubject(),
      html: partnerActivationHtml(d),
      text: partnerActivationText(d),
    })
    if (res.error) {
      return { sent: false, error: res.error.message || JSON.stringify(res.error) }
    }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
