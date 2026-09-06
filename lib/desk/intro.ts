/**
 * The warm intro, made easy for the partner.
 *
 * When Lily asks a partner for an intro, the email carries an "intro kit":
 * the person's email and LinkedIn, their page in Refery, a three-line intro
 * the partner can forward as-is, a pre-filled mailto, and one link that has
 * Lily reach out herself. The same kit sits on the candidate's page.
 *
 * The "have Lily reach out" link is a single-use token in desk_links. Opening
 * it shows a confirm page (a GET never sends anything, so mail scanners that
 * prefetch links cannot trigger an email); pressing the button runs the same
 * sendIntroForPartner that the page button runs. Tokens expire in 30 days and
 * die the moment the person leaves intro_requested, so a stale link can only
 * ever say "already handled". Nothing here is scheduled, so there is nothing
 * to maintain.
 */

import { randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { directAfterReferrer } from '@/lib/desk/emails'
import { cancelFollowups, deskSetting, logActivity, moveJourney, scheduleFollowup, sendDeskEmail } from '@/lib/desk/outbound'
import { latestPanel } from '@/lib/desk/panel'
import { loadLiveSeats, seatLabel, type Seat } from '@/lib/desk/seats'
import { loadOwner, properName, type Owner } from '@/lib/desk/people'
import { postThreadReply } from '@/lib/slack-bot'
import { esc, textToHtml } from '@/lib/desk/html'

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
export const DESK_FROM = 'lily@refery.io'

const LINK_DAYS = 30

// ── the kit ──────────────────────────────────────────────────────────────────

export interface IntroKit {
  candidateFirst: string
  candidateEmail: string | null
  linkedin: string | null
  pageUrl: string
  /** The three lines the partner can forward without writing anything. */
  forwardable: string
  /** mailto: to the candidate, Lily in copy, subject and body filled. */
  mailto: string | null
  /** The confirm page that has Lily reach out. Null when no email to write to. */
  sendForMeUrl: string | null
}

/** The three lines. Focus comes from the first strong seat's headline, never a client name. */
export function forwardableIntro(candidateName: string, focusHeadline: string | null): string {
  const first = properName(candidateName).split(/\s+/)[0]
  const focus = focusHeadline ? `on a ${focusHeadline} search` : 'on a few early-stage searches'
  return `${first}, meet Lily from Refery. Lily works with a few early-stage teams ${focus} and asked about you after I shared your background. Lily, ${first} is the one I mentioned. I will let you two take it from here.`
}

export function mailtoFor(candidateEmail: string, candidateName: string, forwardable: string): string {
  const first = properName(candidateName).split(/\s+/)[0]
  const q = new URLSearchParams({ cc: DESK_FROM, subject: `Intro: ${first} <> Lily Joo (Refery)`, body: `${forwardable}\n\n` })
  // URLSearchParams encodes spaces as "+", which mail clients read literally.
  return `mailto:${candidateEmail}?${q.toString().replace(/\+/g, '%20')}`
}

export async function buildIntroKit(admin: SupabaseClient, c: Record<string, unknown>, opts: { withLink: boolean; ownerUserId: string | null; strongSeats?: Seat[] }): Promise<IntroKit> {
  const name = properName(c.name as string)
  const first = name.split(/\s+/)[0]
  const email = ((c.email as string | null) ?? '').trim().toLowerCase() || null
  const seat = opts.strongSeats?.[0]
  const forwardable = forwardableIntro(name, seat ? seat.headline || seat.title : null)
  let sendForMeUrl: string | null = null
  if (opts.withLink && email) {
    const token = await createIntroLink(admin, c.id as string, 'send_for_me', opts.ownerUserId)
    sendForMeUrl = `${APP_URL}/intro/${token}`
  }
  return {
    candidateFirst: first,
    candidateEmail: email,
    linkedin: ((c.linkedin_url as string | null) ?? '').trim() || null,
    pageUrl: `${APP_URL}/candidates/${c.id}`,
    forwardable,
    mailto: email ? mailtoFor(email, name, forwardable) : null,
    sendForMeUrl,
  }
}

/** The kit as the plain-text block appended under the ask. */
export function kitText(k: IntroKit): string {
  const lines = [
    `Everything you need for the intro:`,
    `- ${k.candidateFirst}: ${k.candidateEmail ?? 'no email on record'}${k.linkedin ? ` · ${k.linkedin}` : ''}`,
    `- [${k.candidateFirst}'s page in Refery](${k.pageUrl})`,
    `- Forward this to ${k.candidateFirst} with me in copy, or write your own:`,
    `  "${k.forwardable}"`,
  ]
  if (k.mailto) lines.push(`- Open a pre-filled intro email: ${k.mailto}`)
  if (k.sendForMeUrl) lines.push(`- Or have me reach out, saying it came from you: ${k.sendForMeUrl}`)
  return lines.join('\n')
}

/** The same kit as HTML, for the multipart version of the email. */
export function kitHtml(k: IntroKit): string {
  const btn = (href: string, label: string, solid: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:9px 14px;border-radius:999px;font-weight:600;font-size:13px;text-decoration:none;border:1px solid #1F3A2F;${solid ? 'background:#1F3A2F;color:#ffffff' : 'background:#ffffff;color:#1F3A2F'}">${esc(label)}</a>`
  return `<div style="margin:14px 0;border:1px solid #E4E3DC;border-radius:12px;background:#FAFAF7;padding:12px 14px;font-size:14px;line-height:1.5">
<div style="font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:#9C9C95;font-weight:600;margin-bottom:6px">Intro kit</div>
<div>${esc(k.candidateFirst)}: ${k.candidateEmail ? `<a href="mailto:${esc(k.candidateEmail)}" style="color:#1F3A2F">${esc(k.candidateEmail)}</a>` : 'no email on record'}${k.linkedin ? ` &nbsp;·&nbsp; <a href="${esc(k.linkedin)}" style="color:#1F3A2F">LinkedIn</a>` : ''} &nbsp;·&nbsp; <a href="${esc(k.pageUrl)}" style="color:#1F3A2F">${esc(k.candidateFirst)}'s page in Refery</a></div>
<div style="margin-top:10px;border-left:3px solid #D2D1C7;padding:8px 12px;background:#ffffff;border-radius:0 10px 10px 0;color:#2A2A26">Forward this to ${esc(k.candidateFirst)} with me in copy, or write your own:<br><br>“${esc(k.forwardable)}”</div>
<div style="margin-top:10px">${k.mailto ? btn(k.mailto, 'Open a pre-filled intro email', true) : ''}${k.mailto && k.sendForMeUrl ? ' &nbsp; ' : ''}${k.sendForMeUrl ? btn(k.sendForMeUrl, 'Have Lily reach out, saying it came from you', false) : ''}</div>
</div>`
}

/**
 * Put the kit under the ask and above the sign-off. Returns both versions so
 * the email reads the same in plain text and in HTML.
 */
export function withKit(body: string, k: IntroKit): { text: string; html: string } {
  const signoff = /\n\nBest,\nLily\s*$/
  const text = signoff.test(body) ? body.replace(signoff, `\n\n${kitText(k)}\n\nBest,\nLily`) : `${body}\n\n${kitText(k)}`
  const before = signoff.test(body) ? body.replace(signoff, '') : body
  const html = `${textToHtml(before)}${kitHtml(k)}${signoff.test(body) ? textToHtml('Best,\nLily') : ''}`
  return { text, html }
}

// ── the links ────────────────────────────────────────────────────────────────

export type IntroLinkAction = 'send_for_me'

export async function createIntroLink(admin: SupabaseClient, candidateId: string, action: IntroLinkAction, ownerUserId: string | null): Promise<string> {
  const token = randomBytes(18).toString('base64url')
  await admin.from('desk_links').insert({
    token,
    candidate_id: candidateId,
    action,
    owner_user_id: ownerUserId,
    expires_at: new Date(Date.now() + LINK_DAYS * 86_400_000).toISOString(),
  })
  return token
}

export type IntroLinkState =
  | { state: 'ready'; candidate: Record<string, unknown>; owner: Owner | null; link: Record<string, unknown> }
  | { state: 'used'; candidate: Record<string, unknown>; link: Record<string, unknown> }
  | { state: 'expired'; candidate: Record<string, unknown> }
  | { state: 'moved_on'; candidate: Record<string, unknown> }
  | { state: 'invalid' }

/** What a link can do right now. Read-only; nothing here changes a row. */
export async function resolveIntroLink(admin: SupabaseClient, token: string): Promise<IntroLinkState> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { state: 'invalid' }
  const { data: link } = await admin.from('desk_links').select('*').eq('token', token).maybeSingle()
  if (!link) return { state: 'invalid' }
  const { data: candidate } = await admin.from('candidates').select('*').eq('id', link.candidate_id).maybeSingle()
  if (!candidate) return { state: 'invalid' }
  if (link.used_at) return { state: 'used', candidate, link }
  if (new Date(link.expires_at as string).getTime() < Date.now()) return { state: 'expired', candidate }
  if (String(candidate.journey_stage) !== 'intro_requested') return { state: 'moved_on', candidate }
  const owner = await loadOwner(admin, (candidate.owner_user_id as string) ?? null)
  return { state: 'ready', candidate, owner, link }
}

// ── the two actions ──────────────────────────────────────────────────────────

/**
 * Refery writes to the candidate saying it came from the partner, with the
 * partner cc'd. Used by the page button, the emailed link and the :raising_hand:
 * reaction on an escalation. The person moves to intro sent and the candidate
 * timers start.
 */
export async function sendIntroForPartner(
  admin: SupabaseClient,
  c: Record<string, unknown>,
  input: { by: string; via: 'page' | 'link' | 'slack'; ownerHint?: string | null },
): Promise<{ ok: boolean; message: string; error?: string }> {
  const id = c.id as string
  const name = properName(c.name as string)
  const first = name.split(/\s+/)[0]
  if (String(c.journey_stage) !== 'intro_requested') return { ok: false, message: `We are not waiting on an intro for ${first} right now.`, error: 'moved_on' }
  if (!c.email) return { ok: false, message: `There is no email address on ${first}'s profile to write to.`, error: 'no_email' }

  const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)
  const panel = await latestPanel(admin, id)
  const seats = await loadLiveSeats(admin)
  const byId = new Map(seats.map(s => [s.jobId, s]))
  const lines = (panel?.seat_fits ?? []).filter(f => f.fit === 'strong' && byId.has(f.job_id)).map(f => seatLabel(byId.get(f.job_id)!, false))
  const mail = directAfterReferrer({
    candidateName: name,
    referrerName: owner?.name ?? owner?.firstName ?? input.ownerHint ?? 'A mutual contact',
    seatLines: lines.length ? lines : ['a couple of early-stage searches in SF and NY'],
  })
  const sent = await sendDeskEmail(admin, {
    candidateId: id,
    kind: 'direct_for_partner',
    to: c.email as string,
    toName: name,
    cc: owner && !owner.isUs ? [owner.email] : [],
    subject: mail.subject,
    body: mail.body,
    sentBy: input.by,
    meta: { via: input.via },
  })
  if (!sent.ok) {
    if (c.desk_card_channel && c.desk_card_ts) {
      await postThreadReply(c.desk_card_channel as string, c.desk_card_ts as string, `:warning: ${owner?.firstName ?? 'The partner'} asked me to write to ${first} (via ${input.via}) but the email did not send: ${sent.error}. Worth sending by hand.`)
    }
    return { ok: false, message: `Could not send the email: ${sent.error}. Lily has been told and will write by hand.`, error: sent.error }
  }
  await moveJourney(admin, id, 'intro_sent', `Refery wrote to them on ${owner?.firstName ?? 'the partner'}'s behalf (${input.via}).`, { by: input.by })
  await cancelFollowups(admin, id, ['referrer_nudge_1', 'referrer_nudge_2', 'referrer_escalate'], 'partner asked us to send')
  const days = await deskSetting<number[]>(admin, 'candidate_nudge_days', [4, 10])
  await scheduleFollowup(admin, { candidateId: id, kind: 'candidate_book_nudge', inDays: days[0] ?? 4, toEmail: c.email as string, threadId: sent.threadId })
  await scheduleFollowup(admin, { candidateId: id, kind: 'candidate_book_escalate', inDays: days[1] ?? 10, toEmail: c.email as string, threadId: sent.threadId })
  await admin.from('desk_links').update({ used_at: new Date().toISOString() }).eq('candidate_id', id).is('used_at', null)
  if (c.desk_card_channel && c.desk_card_ts) {
    await postThreadReply(c.desk_card_channel as string, c.desk_card_ts as string, `:email: ${owner?.firstName ?? 'The partner'} asked me to write to ${first} directly (${input.via === 'link' ? 'from the link in the email' : input.via === 'page' ? 'from the page' : 'from Slack'}), so I did, with them cc'd. *Intro sent.* I nudge on day ${days[0] ?? 4} if they have not booked.`)
  }
  return { ok: true, message: `Sent. ${first} has Lily's email with you in copy. Lily follows up from here.` }
}

/** The partner says they made the intro themselves. */
export async function markIntroMade(admin: SupabaseClient, c: Record<string, unknown>, by: string): Promise<{ ok: boolean; message: string }> {
  const first = properName(c.name as string).split(/\s+/)[0]
  if (String(c.journey_stage) !== 'intro_requested') return { ok: false, message: `We are not waiting on an intro for ${first} right now.` }
  const { onIntroLanded } = await import('@/lib/desk/followups')
  const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)
  await onIntroLanded(admin, c, { threadId: '', from: owner?.email ?? by, at: Date.now() }, by)
  await logActivity(admin, c.id as string, 'signal_seen', `${owner?.firstName ?? 'The partner'} said they made the intro.`, { source: 'page' })
  await admin.from('desk_links').update({ used_at: new Date().toISOString() }).eq('candidate_id', c.id).is('used_at', null)
  return { ok: true, message: `Thanks. ${first} is marked as introduced; Lily takes it from here.` }
}
