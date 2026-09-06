/**
 * Everything a firm and its people get told, and everything you get told.
 *
 * Emails reuse the cream shell the agreement and activation emails already use,
 * because a firm meets Refery through three or four messages in a week and they
 * should read as one company writing, not four.
 *
 * The Slack card reuses the bot poster rather than the webhook, for the same
 * reason partner sign-ups do: a webhook returns no message timestamp, so a
 * reaction could never be traced back to the firm it is about.
 */

import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'
import { addReaction, esc, postMessage, type SlackBlock } from '@/lib/slack-bot'
import type { Firm, FirmRole } from '@/lib/firms'
import { partnerSignupChannel } from '@/lib/partner-signup-slack'

const FROM = 'Refery <agreements@refery.io>'
const REPLY_TO = 'lily@refery.io'

/** Brand tokens, identical to the other transactional emails. */
const M = {
  green: '#1F3A2F',
  cream: '#F2F1EB',
  paper: '#FAF9F5',
  body: '#161613',
  muted: '#6E6E68',
  rule: '#E4E3DC',
}

const SANS = `'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif`

function esc0(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || 'there'
}

/** The shared shell: wordmark, rule, body, sign-off, footer. */
function shell(headline: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc0(headline)}</title></head>
<body style="margin:0;padding:0;background-color:${M.cream};-webkit-font-smoothing:antialiased;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${M.cream};">
<tr><td align="center" style="padding:32px 16px 48px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
  <tr><td style="padding:0 0 8px 0;font-family:${SANS};font-weight:600;font-size:28px;line-height:1;color:${M.green};letter-spacing:-0.5px;">Refery</td></tr>
  <tr><td style="padding:0 0 32px 0;"><div style="width:48px;height:2px;background-color:${M.green};line-height:2px;font-size:0;">&nbsp;</div></td></tr>
  <tr><td style="padding:0 0 14px 0;font-family:${SANS};font-weight:600;font-size:24px;line-height:1.25;color:${M.green};">${headline}</td></tr>
  ${bodyHtml}
  <tr><td style="padding:0 0 6px 0;font-family:${SANS};font-size:15px;line-height:1.4;color:${M.body};">Lily Joo</td></tr>
  <tr><td style="padding:0 0 36px 0;font-family:${SANS};font-size:13px;line-height:1.4;color:${M.muted};">Founding Partner, Refery</td></tr>
  <tr><td style="border-top:1px solid ${M.rule};padding-top:20px;font-family:${SANS};font-size:11px;line-height:1.5;color:${M.muted};">
    Refery, Inc. &middot; <a href="https://refery.io" style="color:${M.muted};text-decoration:none;">refery.io</a>
  </td></tr>
</table></td></tr></table></body></html>`
}

function para(html: string): string {
  return `<tr><td style="padding:0 0 18px 0;font-family:${SANS};font-size:16px;line-height:1.65;color:${M.body};">${html}</td></tr>`
}

function button(href: string, label: string): string {
  return `<tr><td style="padding:6px 0 26px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background-color:${M.green};border-radius:8px;">
      <a href="${esc0(href)}" style="display:inline-block;padding:13px 26px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;">${label}</a>
    </td></tr></table></td></tr>`
}

async function send(to: string, subject: string, html: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }
  try {
    const res = await new Resend(apiKey).emails.send({
      from: FROM,
      to,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
    })
    if (res.error) return { sent: false, error: res.error.message || 'send failed' }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}

// ── emails ──────────────────────────────────────────────────────────────────

/** 1 · Acceptance receipt. Says what was accepted, and that it is not live yet. */
export function sendFirmReceipt(to: string, firm: Firm, signerName: string, versions: {
  partner: string
  submission: string
  addendum: string
}) {
  const html = shell(
    `Thanks, ${esc0(firstName(signerName))}. We have your acceptance.`,
    para(`You accepted on behalf of <b>${esc0(firm.legal_name)}</b>:`) +
      para(
        `Partner Terms v${esc0(versions.partner)}<br />Submission Terms v${esc0(versions.submission)}<br />Firm Addendum v${esc0(versions.addendum)}`,
      ) +
      para(
        `<b>This is a receipt, not an activation.</b> We review every firm by hand. You will hear from us shortly, and your colleagues can join once we have.`,
      ),
  )
  const text = [
    `Thanks, ${firstName(signerName)}. We have your acceptance.`,
    '',
    `You accepted on behalf of ${firm.legal_name}: Partner Terms v${versions.partner}, Submission Terms v${versions.submission}, Firm Addendum v${versions.addendum}.`,
    '',
    'This is a receipt, not an activation. We review every firm by hand.',
    '',
    'Lily Joo, Founding Partner, Refery',
  ].join('\n')
  return send(to, `We have ${firm.name}'s acceptance`, html, text)
}

/** 2 · The firm is live. */
export function sendFirmActivated(to: string, firm: Firm, signerName: string, appUrl: string) {
  const html = shell(
    `${esc0(firm.name)} is live.`,
    para(`Your firm is active, ${esc0(firstName(signerName))}, and the agreement is in force.`) +
      para(
        `The next thing worth doing is inviting your colleagues. They each accept short access terms of their own, then you all see the same candidates and the same submissions.`,
      ) +
      button(`${appUrl}/firm/members`, 'Invite your team') +
      para(`Anything at all, just reply to this email.`),
  )
  const text = [
    `${firm.name} is live.`,
    '',
    `Your firm is active, ${firstName(signerName)}, and the agreement is in force.`,
    '',
    `Invite your colleagues: ${appUrl}/firm/members`,
    '',
    'Lily Joo, Founding Partner, Refery',
  ].join('\n')
  return send(to, `${firm.name} is live on Refery`, html, text)
}

/** 3 · The invitation. The only way into a firm. */
export function sendFirmInvite(
  to: string,
  firm: Firm,
  inviterName: string,
  joinUrl: string,
  days: number,
) {
  const html = shell(
    `You have been added to ${esc0(firm.name)}.`,
    para(
      `${esc0(inviterName)} set up <b>${esc0(firm.legal_name)}</b> on Refery and added you to the team.`,
    ) +
      para(
        `The firm has accepted the commercial terms. Before you can open its workspace, <b>you need to accept the Team access terms yourself</b>. They cover confidentiality, how you use the platform, and what continues after your access ends.`,
      ) +
      button(joinUrl, 'Read and accept') +
      para(
        `<span style="color:${M.muted};font-size:14px;">This link works once and expires in ${days} days. If you were not expecting it, ignore this email and nothing happens.</span>`,
      ),
  )
  const text = [
    `You have been added to ${firm.name}.`,
    '',
    `${inviterName} set up ${firm.legal_name} on Refery and added you to the team.`,
    '',
    'The firm has accepted the commercial terms. Before you can open its workspace, you need to accept the Team access terms yourself.',
    '',
    joinUrl,
    '',
    `This link works once and expires in ${days} days.`,
  ].join('\n')
  return send(to, `${inviterName} added you to ${firm.name} on Refery`, html, text)
}

/** 4 · Welcome, once they have accepted. */
export function sendFirmWelcome(to: string, firm: Firm, name: string, appUrl: string) {
  const html = shell(
    `You are in, ${esc0(firstName(name))}.`,
    para(
      `You now have access to <b>${esc0(firm.name)}</b>'s workspace on Refery. You and your colleagues share the same candidates and the same submissions.`,
    ) +
      para(
        `Anything you introduce is recorded for the firm, and Refery pays the firm rather than individuals. What you earn is between you and ${esc0(firm.name)}.`,
      ) +
      button(`${appUrl}/candidates`, 'Open the workspace'),
  )
  const text = [
    `You are in, ${firstName(name)}.`,
    '',
    `You now have access to ${firm.name}'s workspace on Refery.`,
    '',
    `${appUrl}/candidates`,
  ].join('\n')
  return send(to, `You are in: ${firm.name} on Refery`, html, text)
}

/** 5 · A seat filled. The admin should never learn this by noticing it. */
export function sendFirmMemberJoined(
  to: string,
  firm: Firm,
  memberName: string,
  memberEmail: string,
  role: FirmRole,
) {
  const html = shell(
    `${esc0(memberName)} joined ${esc0(firm.name)}.`,
    para(
      `They accepted the Team access terms and now have ${esc0(role)} access to your workspace.`,
    ) + para(`<span style="color:${M.muted};font-size:14px;">${esc0(memberEmail)}</span>`),
  )
  return send(
    to,
    `${memberName} joined ${firm.name}`,
    html,
    `${memberName} (${memberEmail}) joined ${firm.name} as ${role}.`,
  )
}

/**
 * 6 · Access ended, to both sides.
 *
 * Counsel called this security evidence rather than courtesy, and they are
 * right: it is how an unauthorised removal, or a compromised admin account,
 * gets noticed by the one person who would know it was wrong.
 *
 * It also restates what continues, because the obligations that outlive access
 * are exactly the ones somebody assumes ended with it.
 */
export async function sendFirmMemberRemoved(
  memberEmail: string,
  adminEmail: string,
  firm: Firm,
  memberName: string,
) {
  const on = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const toMember = shell(
    `Your access to ${esc0(firm.name)} has ended.`,
    para(
      `Your access to <b>${esc0(firm.name)}</b>'s Refery workspace ended on ${on}. You no longer see its candidates or submissions.`,
    ) +
      para(
        `Confidentiality continues, as do the other obligations identified in the Team access terms you accepted, for the periods stated there.`,
      ) +
      para(
        `<span style="color:${M.muted};font-size:14px;">If you were not expecting this, reply to this email and tell us.</span>`,
      ),
  )
  await send(
    memberEmail,
    `Your access to ${firm.name} on Refery has ended`,
    toMember,
    [
      `Your access to ${firm.name}'s Refery workspace ended on ${on}.`,
      '',
      'Confidentiality continues, as do the other obligations in the Team access terms you accepted.',
      '',
      'If you were not expecting this, reply and tell us.',
    ].join('\n'),
  )

  const toAdmin = shell(
    `${esc0(memberName)} was removed from ${esc0(firm.name)}.`,
    para(`Their access ended immediately, and anything they owned is now yours.`) +
      para(
        `<span style="color:${M.muted};font-size:14px;">If this was not you, reply to this email straight away.</span>`,
      ),
  )
  return send(
    adminEmail,
    `${memberName} was removed from ${firm.name}`,
    toAdmin,
    `${memberName} was removed from ${firm.name}. Their access ended immediately. If this was not you, reply straight away.`,
  )
}

// ── slack ───────────────────────────────────────────────────────────────────

/** Firms land beside partners, so there is one place to approve either. */
export function firmSignupChannel(): string {
  return partnerSignupChannel()
}

/**
 * Posts the firm's approval card and records where it landed, so the reaction
 * handler can find the firm it refers to. Best effort: a sign-up must never
 * fail because Slack did.
 */
export async function announceFirmSignup(opts: {
  firm: Firm
  signerName: string
  signerEmail: string
  signerTitle?: string | null
  jurisdiction?: string | null
  companyNumber?: string | null
  versions: { partner: string; submission: string; addendum: string }
}): Promise<{ sent: boolean; error?: string }> {
  const channel = firmSignupChannel()
  if (!channel) return { sent: false, error: 'SLACK_CHANNEL_PARTNER_SIGNUPS not set' }

  const entity = [opts.jurisdiction, opts.companyNumber].filter(Boolean).join(' · ') || 'Not given'

  /**
   * Counsel's one live condition: no EU or UK firm until the data-sharing
   * terms, candidate privacy notice and AI assessment exist. Sign-up is open to
   * anyone, so the condition is held here, at the moment of approval, by making
   * a non-US firm impossible to thumb up without noticing.
   *
   * Deliberately reads "not recognisably US" rather than "recognisably EU": an
   * unfamiliar or blank jurisdiction should prompt a look, not sail through.
   */
  const nonUS = !/\b(u\.?s\.?a?|united states|delaware|california|new york|texas|florida|nevada|washington|massachusetts|illinois|colorado|georgia|virginia|wyoming)\b/i.test(
    opts.jurisdiction || '',
  )

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:office: *${esc(opts.firm.legal_name)} signed up as a firm*` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Signed by*\n${esc(opts.signerName)}${opts.signerTitle ? `, ${esc(opts.signerTitle)}` : ''}` },
        { type: 'mrkdwn', text: `*Entity*\n${esc(entity)}` },
        { type: 'mrkdwn', text: `*Email*\n${esc(opts.signerEmail)}` },
        {
          type: 'mrkdwn',
          text: `*Accepted*\nPartner v${opts.versions.partner} · Submission v${opts.versions.submission} · Addendum v${opts.versions.addendum}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: nonUS
            ? `:warning: *${esc(opts.jurisdiction || 'Jurisdiction not given')}.* Do not activate until the data-sharing terms, candidate privacy notice and AI assessment are done. US firms only for now.`
            : 'Firm and signer are pending. Colleagues join by invitation and accept their own terms.',
        },
      ],
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: ':+1: activate the firm and the signer  ·  :-1: leave it pending, no email' },
      ],
    },
  ]

  const posted = await postMessage(channel, `${opts.firm.legal_name} signed up as a firm`, blocks)
  if (!posted.ok || !posted.ts) {
    return { sent: false, error: posted.error || 'chat.postMessage returned no ts' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('partner_orgs')
    .update({ slack_channel_id: posted.channel ?? channel, slack_message_ts: posted.ts })
    .eq('id', opts.firm.id)

  if (error) console.error('[firm-notify] could not link slack message to firm:', error.message)

  for (const name of ['+1', '-1']) {
    await addReaction(posted.channel ?? channel, posted.ts, name)
  }

  return { sent: true }
}
