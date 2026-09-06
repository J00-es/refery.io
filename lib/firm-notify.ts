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
import { isRestrictedJurisdiction, type Firm, type FirmRole } from '@/lib/firms'
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

/**
 * 1b · Please sign for your company.
 *
 * Goes to someone who may never have heard of Refery, sent on the say-so of a
 * colleague, asking them to bind their company. So it opens by saying who asked
 * and what for, states plainly what is not being asked of them, and does not
 * pretend to be a favour. Somebody forwarding this to their MD is the normal
 * case, not the edge one.
 */
export function sendFirmSignatureRequest(
  to: string,
  firm: Firm,
  requestedBy: string,
  signUrl: string,
  days: number,
  versions: { partner: string; submission: string; addendum: string },
) {
  const html = shell(
    `${esc0(requestedBy)} has asked you to sign for ${esc0(firm.name)}.`,
    para(
      `${esc0(requestedBy)} is setting <b>${esc0(firm.legal_name)}</b> up on Refery, where recruiting firms introduce people they know to roles at venture-backed companies. They have told us you are the person who can sign for the company.`,
    ) +
      para(
        `You would be accepting the Partner Terms v${esc0(versions.partner)}, the Submission Terms v${esc0(versions.submission)} and the Firm Addendum v${esc0(versions.addendum)} on behalf of the company. <b>The firm keeps 70% of each placement fee</b>, and Refery pays the firm rather than individuals.`,
      ) +
      button(signUrl, 'Read and sign') +
      para(
        `<b>This does not create an account for you</b> and costs nothing. ${esc0(requestedBy)} runs the workspace; you are signing the agreement it operates under.`,
      ) +
      para(
        `<span style="color:${M.muted};font-size:14px;">This link works once and expires in ${days} days. If you were not expecting it, or ${esc0(requestedBy)} is not authorised to ask, ignore this email and nothing happens. You can also reply and tell us.</span>`,
      ),
  )
  const text = [
    `${requestedBy} has asked you to sign for ${firm.name}.`,
    '',
    `${requestedBy} is setting ${firm.legal_name} up on Refery and has told us you are the person who can sign for the company.`,
    '',
    `You would be accepting the Partner Terms v${versions.partner}, Submission Terms v${versions.submission} and Firm Addendum v${versions.addendum} on behalf of the company.`,
    '',
    signUrl,
    '',
    `This link works once and expires in ${days} days. If you were not expecting it, ignore this email.`,
  ].join('\n')
  return send(to, `${requestedBy} has asked you to sign for ${firm.name} on Refery`, html, text)
}

/** 1c · Your signer signed. Tells the person who has been waiting. */
export function sendFirmSignedNotice(
  to: string,
  firm: Firm,
  signerName: string,
) {
  const html = shell(
    `${esc0(signerName)} signed for ${esc0(firm.name)}.`,
    para(
      `The agreement for <b>${esc0(firm.legal_name)}</b> is signed. We review every firm by hand, so there is one more step at our end before you can invite your colleagues.`,
    ) + para(`You will hear from us shortly.`),
  )
  return send(
    to,
    `${signerName} signed for ${firm.name}`,
    html,
    `${signerName} signed the agreement for ${firm.legal_name}. We review every firm by hand and will be in touch shortly.`,
  )
}

/**
 * The countersigned record, to the person who signed.
 *
 * An individual partner has always received this: their name, the time, the IP
 * and a reference number, on a PDF they can keep. The firm signer, who binds a
 * company rather than themselves, was getting a receipt and nothing to file.
 */
export async function sendFirmSignedPdf(
  to: string,
  firm: Firm,
  signerName: string,
  signedAtIso: string,
  reference: string,
  pdf: Buffer,
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, error: 'RESEND_API_KEY not set' }

  const when = new Date(signedAtIso).toUTCString().replace(' GMT', ' UTC')
  const html = shell(
    `Signed. Here is your copy.`,
    para(
      `Thank you, ${esc0(firstName(signerName))}. You accepted the Partner Terms, the Submission Terms and the Firm Addendum on behalf of <b>${esc0(firm.legal_name)}</b>.`,
    ) +
      para(
        `The signed agreement is attached. It carries your name, the exact time you signed, the address you signed from and a reference number, which together are the record of the signature.`,
      ) +
      para(
        `<b>This is a receipt, not an activation.</b> We review every firm by hand, and your colleague will hear from us shortly.`,
      ) +
      para(
        `<span style="color:${M.muted};font-size:14px;">Signed ${esc0(when)}<br />Reference ${esc0(reference)}</span>`,
      ),
  )

  try {
    const res = await new Resend(apiKey).emails.send({
      from: FROM,
      to,
      replyTo: REPLY_TO,
      subject: `Signed: ${firm.name} on Refery`,
      html,
      text: [
        `Signed. Here is your copy.`,
        '',
        `You accepted the Partner Terms, Submission Terms and Firm Addendum on behalf of ${firm.legal_name}.`,
        '',
        `Signed ${when}. Reference ${reference}.`,
        '',
        'This is a receipt, not an activation. We review every firm by hand.',
        '',
        'Lily Joo, Founding Partner, Refery',
      ].join('\n'),
      attachments: [
        {
          filename: `Refery-Firm-Agreement-${firm.slug}.pdf`,
          content: pdf,
        },
      ],
    })
    if (res.error) return { sent: false, error: res.error.message || 'send failed' }
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
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

// \u2500\u2500 reminders \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * N2a \u00b7 the signer, at day 3, 7 and 13.
 *
 * Says who is waiting rather than what we want, because the thing that moves a
 * busy director is a colleague being blocked, not a platform being patient.
 * There is no fresh link: the one they were sent is single use and still live.
 */
export function sendFirmSignatureReminder(
  to: string,
  firm: Firm,
  championName: string,
  daysLeft: number,
) {
  const urgent = daysLeft <= 1
  const html = shell(
    urgent
      ? `Last day to sign for ${esc0(firm.name)}.`
      : `Still waiting on your signature for ${esc0(firm.name)}.`,
    para(
      `${esc0(championName)} set <b>${esc0(firm.legal_name)}</b> up on Refery and cannot invite the rest of the team until the agreement is signed.`,
    ) +
      para(
        `It takes about a minute, and <b>you do not need an account</b>. Use the link in the email we sent you when they set it up.`,
      ) +
      para(
        urgent
          ? `<b>That link expires tomorrow.</b> If it has already gone, reply and we will send a fresh one.`
          : `<span style="color:${M.muted};font-size:14px;">The link expires in ${daysLeft} days. If you are not the right person for this, reply and tell us who is.</span>`,
      ),
  )
  const text = [
    urgent ? `Last day to sign for ${firm.name}.` : `Still waiting on your signature for ${firm.name}.`,
    '',
    `${championName} set ${firm.legal_name} up on Refery and cannot invite the rest of the team until the agreement is signed.`,
    '',
    `Use the link in the email we sent you. It expires in ${daysLeft} day(s).`,
    '',
    'If you are not the right person for this, reply and tell us who is.',
  ].join('\n')
  return send(
    to,
    urgent ? `Last day to sign for ${firm.name}` : `Still waiting on your signature for ${firm.name}`,
    html,
    text,
  )
}

/**
 * N2b \u00b7 the champion, from day 7.
 *
 * They have done everything asked of them and are stuck behind a colleague. The
 * useful thing we can offer is permission to go and ask in person, plus the
 * fact that a third email from us will not help.
 */
export function sendFirmSignatureStalledToChampion(
  to: string,
  firm: Firm,
  signerName: string,
  daysLeft: number,
) {
  const html = shell(
    `${esc0(signerName)} has not signed yet.`,
    para(
      `We have emailed ${esc0(signerName)} about signing for <b>${esc0(firm.legal_name)}</b> and have not heard back. Nothing is wrong at our end, and in our experience this is almost always an inbox rather than a decision.`,
    ) +
      para(
        `A word in person tends to be faster than another email from us. ${daysLeft > 0 ? `The link we sent them expires in ${daysLeft} days.` : 'The link we sent them expires today.'}`,
      ) +
      para(
        `<span style="color:${M.muted};font-size:14px;">If somebody else should be signing, reply and tell us who, and we will send it to them instead.</span>`,
      ),
  )
  return send(
    to,
    `${signerName} has not signed for ${firm.name} yet`,
    html,
    `We have emailed ${signerName} about signing for ${firm.legal_name} and have not heard back. A word in person tends to be faster than another email from us. The link expires in ${daysLeft} days. If somebody else should be signing, reply and tell us who.`,
  )
}

/**
 * N3 \u00b7 the link ran out.
 *
 * Not framed as a failure. A firm that let a link lapse is still a firm that
 * wanted in, and the only thing between them and signing is a working URL.
 */
export function sendFirmSignatureExpired(
  to: string,
  firm: Firm,
  signerName: string,
  membersUrl: string,
) {
  const html = shell(
    `The signing link for ${esc0(firm.name)} has expired.`,
    para(
      `Nobody signed within fourteen days, so the link we sent ${esc0(signerName)} no longer works. <b>Your account and everything you set up are untouched.</b>`,
    ) +
      para(`Send a new one whenever you are ready, to the same person or a different one.`) +
      button(membersUrl, 'Send a new link') +
      para(
        `<span style="color:${M.muted};font-size:14px;">If a firm account is not right for you after all, you can carry on as an individual partner and nothing changes.</span>`,
      ),
  )
  return send(
    to,
    `The signing link for ${firm.name} has expired`,
    html,
    `Nobody signed within fourteen days, so the link we sent ${signerName} no longer works. Your account and everything you set up are untouched. Send a new one whenever you are ready: ${membersUrl}`,
  )
}

/** N5a \u00b7 the invited colleague, at day 3. */
export function sendFirmInviteReminder(
  to: string,
  firm: Firm,
  daysLeft: number,
  fallbackUrl: string,
) {
  const html = shell(
    `Your invitation to ${esc0(firm.name)} expires soon.`,
    para(
      `You were added to <b>${esc0(firm.name)}</b> on Refery a few days ago. The invitation is still open but expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
    ) +
      para(
        `Joining takes a minute. You accept short access terms of your own, then you see the same candidates and the same searches as the rest of the team.`,
      ) +
      para(
        `Use the link in the invitation we sent you. It only works once, so it has to be that one.`,
      ) +
      para(
        `<span style="color:${M.muted};font-size:14px;">If this was not meant for you, ignore it and it lapses on its own.</span>`,
      ),
  )
  return send(
    to,
    `Your invitation to ${firm.name} on Refery expires soon`,
    html,
    `You were added to ${firm.name} on Refery a few days ago and the invitation expires in ${daysLeft} day(s). Use the link in the original invitation; it only works once. If this was not meant for you, ignore it.`,
  )
}

/** N5b \u00b7 the admin, at day 6, with something they can actually do. */
export function sendFirmInviteStalledToAdmin(
  to: string,
  firm: Firm,
  inviteeEmail: string,
  membersUrl: string,
) {
  const html = shell(
    `${esc0(inviteeEmail)} has not accepted yet.`,
    para(
      `The invitation you sent to <b>${esc0(inviteeEmail)}</b> expires tomorrow and has not been accepted. We reminded them once.`,
    ) +
      para(`You can send a fresh one from your team page, to the same address or a different one.`) +
      button(membersUrl, 'Open your team'),
  )
  return send(
    to,
    `${inviteeEmail} has not accepted their invitation`,
    html,
    `The invitation you sent to ${inviteeEmail} expires tomorrow and has not been accepted. Send a fresh one from ${membersUrl}`,
  )
}

/**
 * N6 \u00b7 live for days, still a team of one.
 *
 * Ends by giving them permission to ignore it, because a one-person firm is a
 * legitimate choice and there is no second email to make the point again.
 */
export function sendFirmEmptyTeam(to: string, firm: Firm, membersUrl: string) {
  const html = shell(
    `Bring your team into ${esc0(firm.name)}.`,
    para(
      `<b>${esc0(firm.name)}</b> has been live for a few days and it is still just you. The agreement covers everyone at the firm, so your colleagues do not need to sign anything of their own.`,
    ) +
      para(
        `Adding someone takes an email address and about ten seconds. They accept short access terms, and then you all see the same book.`,
      ) +
      button(membersUrl, 'Invite your team') +
      para(
        `<span style="color:${M.muted};font-size:14px;">Working solo on purpose? Then ignore this, nothing is wrong, and we will not ask again.</span>`,
      ),
  )
  return send(
    to,
    `Bring your team into ${firm.name}`,
    html,
    `${firm.name} has been live for a few days and it is still just you. The agreement covers everyone at the firm. Invite them: ${membersUrl}. Working solo on purpose? Ignore this, we will not ask again.`,
  )
}

// ── slack ───────────────────────────────────────────────────────────────────

/** Firms land beside partners, so there is one place to approve either. */
/**
 * N4 - a signed firm nobody has approved yet.
 *
 * Replies inside the original card's thread rather than posting a new one, so a
 * firm still has exactly one place it gets approved. A second top-level card
 * would be a second set of reactions and a race between them.
 *
 * The only reminder that repeats, because the person being chased can act.
 */
export async function announceFirmAwaitingReview(opts: {
  firm: Firm
  signerName: string
  signedAt: string
  daysWaiting: number
  jurisdiction?: string | null
}): Promise<{ sent: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('partner_orgs')
    .select('slack_channel_id, slack_message_ts')
    .eq('id', opts.firm.id)
    .single()

  const channel = (row?.slack_channel_id as string) || firmSignupChannel()
  if (!channel) return { sent: false, error: 'no channel' }

  const since =
    opts.daysWaiting <= 1 ? 'since yesterday' : `for ${opts.daysWaiting} days`

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:hourglass_flowing_sand: *${esc(opts.firm.legal_name)} has been waiting on approval ${since}*`,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Signed by ${esc(opts.signerName || 'the signer')}. Their team cannot be invited until this is activated.`,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: isRestrictedJurisdiction(opts.jurisdiction)
            ? `:warning: ${esc(opts.jurisdiction || '')} is EU/UK. The hold still applies: do not activate yet.`
            : ':+1: on the card above activates it  \u00b7  :-1: leaves it pending',
        },
      ],
    },
  ]

  const posted = await postMessage(
    channel,
    `${opts.firm.legal_name} is waiting on approval`,
    blocks,
    (row?.slack_message_ts as string) || undefined,
  )
  return posted.ok ? { sent: true } : { sent: false, error: posted.error }
}

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
   * anyone, so the condition is held at the moment of approval instead.
   */
  const restricted = isRestrictedJurisdiction(opts.jurisdiction)

  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `:office: *${esc(opts.firm.legal_name)} signed up as a firm*` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Signed by*\n${esc(opts.signerName)}${opts.signerTitle ? `, ${esc(opts.signerTitle)}` : ''}` },
        // Only when they differ. On a self-signed firm this line would only
        // repeat the one above it.
        ...(opts.setUpBy
          ? [{ type: 'mrkdwn' as const, text: `*Set up by*\n${esc(opts.setUpBy)}` }]
          : []),
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
          text: restricted
            ? `:warning: *${esc(opts.jurisdiction || '')} is EU/UK.* Counsel's hold: activate only once the data-sharing terms, candidate privacy notice and AI assessment are signed off.`
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
