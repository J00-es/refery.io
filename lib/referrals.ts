/**
 * Referrals: a person who came through a partner's link.
 *
 * The row is created as the partner's the minute the CV arrives, but Lily
 * does not see the person until the partner stands behind them: the desk
 * card is held while the referral is pending, and posts the moment they
 * confirm (or on day 7, flagged, so a silent partner never buries a good
 * person). "Not from me" parks the person through the decision ledger the
 * eligibility engine already reads: no matching, no card, no mail. Lily can
 * rescue with a reaction; untouched, the CV is deleted after 30 days.
 *
 * No timer decides anything. Day 3 reminds, day 7 escalates, day 30 purges
 * what nobody claimed.
 */

import { randomBytes } from 'node:crypto'
import { del } from '@vercel/blob'
import type { SupabaseClient } from '@supabase/supabase-js'
import { queueEmail } from '@/lib/comms'
import { esc, postThreadReply } from '@/lib/slack-bot'
import { postAlert, postToFeed } from '@/lib/desk-notifications'
import { recordHumanDecision } from '@/lib/engine/decisions'
import { enqueueOutbox } from '@/lib/engine/outbox'
import { latestPanel } from '@/lib/desk/panel'
import { reviewDate } from '@/lib/onboarding/decisions'
import { properName } from '@/lib/desk/people'
import { defaultOwnerUserId } from '@/lib/inbound-resume'
import { referralUrl, resolveCode, rotateCode } from '@/lib/share-codes'
import { templateRL2, templateRL3, templateRS2, templateRS4 } from '@/lib/voice/templates'
import type { ReferralDoor } from '@/lib/apply/profile'

/** A code on a request turned into the partner it belongs to, or null when the door is closed. */
export async function resolveReferralDoor(admin: SupabaseClient, code: string | null, source: 'link' | 'jd', jobId: string | null, userAgent: string | null, candidateNote: string | null): Promise<ReferralDoor | null> {
  if (!code) return null
  const resolved = await resolveCode(admin, code)
  if (!resolved) return null
  const { data: u } = await admin.from('users_admin').select('full_name, email, status').eq('user_id', resolved.userId).maybeSingle()
  if (!u || u.status !== 'active') return null
  const name = ((u.full_name as string | null) ?? '').trim() || (u.email as string)
  return { code: resolved.code, userId: resolved.userId, referrerName: name, referrerEmail: (u.email as string | null) ?? null, source, jobId, userAgent, candidateNote }
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const DAY = 24 * 60 * 60 * 1000
export const TOKEN_DAYS = 30
export const UNDO_MS = 3 * 60 * 1000
const REMIND_AFTER_DAYS = 3
const ESCALATE_AFTER_DAYS = 7
const PURGE_AFTER_DAYS = 30
/** Two disowns inside a week, or five arrivals inside an hour, rotate the code. */
const DISOWN_LIMIT = 2
const BURST_LIMIT = 5

export type ReferralStatus = 'pending' | 'confirmed' | 'disowned' | 'duplicate' | 'escalated'

export interface ReferralRow {
  id: string
  candidate_id: string
  referrer_user_id: string
  code: string
  source: 'link' | 'jd'
  job_id: string | null
  status: ReferralStatus
  relationship: string | null
  why: string | null
  candidate_note: string | null
  token: string
  token_expires_at: string
  confirmed_at: string | null
  disowned_at: string | null
  reminded_at: string | null
  escalated_at: string | null
  purge_after: string | null
  purged_at: string | null
  created_at: string
}

export const newReferralToken = () => randomBytes(18).toString('base64url')
export const referralActionUrl = (token: string, action: 'yes' | 'no') => `${APP_URL}/rf/${token}?a=${action}`

/** The referral row for a candidate, newest first. */
export async function referralFor(admin: SupabaseClient, candidateId: string): Promise<ReferralRow | null> {
  const { data } = await admin.from('referrals').select('*').eq('candidate_id', candidateId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as ReferralRow | null) ?? null
}

export async function referralByToken(admin: SupabaseClient, token: string): Promise<ReferralRow | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(token)) return null
  const { data } = await admin.from('referrals').select('*').eq('token', token).maybeSingle()
  return (data as ReferralRow | null) ?? null
}

export async function referralById(admin: SupabaseClient, id: string): Promise<ReferralRow | null> {
  const { data } = await admin.from('referrals').select('*').eq('id', id).maybeSingle()
  return (data as ReferralRow | null) ?? null
}

/** True while the desk card must wait for the partner's yes. */
export async function cardHeldForReferral(admin: SupabaseClient, candidateId: string): Promise<boolean> {
  const { data } = await admin.from('referrals').select('id').eq('candidate_id', candidateId).eq('status', 'pending').limit(1)
  return !!data?.length
}

/** Referral facts per candidate, for the list and the card. */
export async function referralsForCandidates(admin: SupabaseClient, candidateIds: string[]): Promise<Map<string, ReferralRow>> {
  const out = new Map<string, ReferralRow>()
  if (!candidateIds.length) return out
  const { data } = await admin.from('referrals').select('*').in('candidate_id', candidateIds).neq('status', 'duplicate').order('created_at', { ascending: true })
  for (const r of (data ?? []) as ReferralRow[]) out.set(r.candidate_id, r)
  return out
}

async function referrerName(admin: SupabaseClient, userId: string): Promise<{ name: string; first: string; email: string | null }> {
  const { data } = await admin.from('users_admin').select('full_name, email').eq('user_id', userId).maybeSingle()
  const name = properName(((data?.full_name as string | null) ?? '').trim() || 'your referrer')
  return { name, first: name.split(/\s+/)[0] || name, email: (data?.email as string | null) ?? null }
}

async function candidateBasics(admin: SupabaseClient, candidateId: string): Promise<{ id: string; name: string; email: string | null; resume_blob_pathname: string | null; desk_card_channel: string | null; desk_card_ts: string | null } | null> {
  const { data } = await admin.from('candidates').select('id, name, email, resume_blob_pathname, desk_card_channel, desk_card_ts').eq('id', candidateId).maybeSingle()
  return (data as { id: string; name: string; email: string | null; resume_blob_pathname: string | null; desk_card_channel: string | null; desk_card_ts: string | null } | null) ?? null
}

/** After a yes: the held card posts from the read that already ran, or from the panel's next pass. */
async function releaseHeldCard(admin: SupabaseClient, candidateId: string, latencyLine: string): Promise<void> {
  const panel = await latestPanel(admin, candidateId)
  if (!panel) return
  await enqueueOutbox(admin, { kind: 'decision_card', idempotencyKey: `decision_card:${panel.id}`, payload: { candidate_id: candidateId, panel_id: panel.id, latency_line: latencyLine } })
}

export type ConfirmInput = { relationship?: string | null; why?: string | null; by: 'email' | 'page' | 'list' }

/** The partner stands behind the person. Idempotent: a second yes changes nothing. */
export async function confirmReferral(admin: SupabaseClient, r: ReferralRow, input: ConfirmInput): Promise<{ ok: boolean; message: string }> {
  if (r.status === 'confirmed') return { ok: true, message: 'Already confirmed.' }
  if (r.status === 'disowned' && r.disowned_at && Date.now() - new Date(r.disowned_at).getTime() > UNDO_MS) return { ok: false, message: 'This one was marked as not yours. Ask Lily if that was a mistake.' }
  if (r.status === 'duplicate') return { ok: false, message: 'This person was already on Refery before your link, so it is not yours to confirm.' }
  const now = new Date()
  const relationship = (input.relationship ?? '').trim().slice(0, 600) || null
  const why = (input.why ?? '').trim().slice(0, 600) || null
  await admin
    .from('referrals')
    .update({ status: 'confirmed', confirmed_at: now.toISOString(), relationship: relationship ?? r.relationship, why: why ?? r.why, disowned_at: null, purge_after: null })
    .eq('id', r.id)
  // If it had been disowned inside the undo window, the block comes off and the person is theirs again.
  await admin.from('candidate_human_decisions').update({ revoked_at: now.toISOString() }).eq('candidate_id', r.candidate_id).eq('kind', 'contact').eq('value', 'disowned_referral').is('revoked_at', null)
  await admin.from('candidates').update({ owner_user_id: r.referrer_user_id, user_id: r.referrer_user_id, uploaded_by_user_id: r.referrer_user_id, intake_source: 'referred', consent_told_candidate: true }).eq('id', r.candidate_id)

  const [c, who] = await Promise.all([candidateBasics(admin, r.candidate_id), referrerName(admin, r.referrer_user_id)])
  if (c?.email) {
    await queueEmail(admin, { to: c.email, toName: c.name, email: templateRL2({ fullName: c.name, referrerName: who.name, reviewDate: reviewDate(now) }), dedupeKey: `RL2:${r.id}`, meta: { candidate_id: c.id } })
  }
  if (c?.desk_card_ts && c.desk_card_channel) {
    await postThreadReply(c.desk_card_channel, c.desk_card_ts, `:white_check_mark: ${esc(who.name)} confirmed the introduction${relationship ? `: "${esc(relationship)}"` : ''}${why ? ` · why: "${esc(why)}"` : ''}`)
  } else {
    await releaseHeldCard(admin, r.candidate_id, `confirmed by ${who.name}, ${input.by}`)
  }
  return { ok: true, message: `Confirmed. ${c ? properName(c.name).split(/\s+/)[0] : 'They'} ${c ? 'is' : 'are'} yours; Lily reads them against every live search.` }
}

/**
 * Not from the partner: parked, never credited, undoable for three minutes.
 * The partner's own list loses the person the same second (owner cleared to
 * Lily); the block stops matching, cards and mail; Lily gets one feed line.
 */
export async function disownReferral(admin: SupabaseClient, r: ReferralRow, by: 'email' | 'page' | 'list'): Promise<{ ok: boolean; message: string; rotated: string | null }> {
  if (r.status === 'disowned') return { ok: true, message: 'Already marked as not yours.', rotated: null }
  if (r.status === 'duplicate') return { ok: false, message: 'This person was already on Refery before your link; nothing to do.', rotated: null }
  const now = new Date()
  const lily = await defaultOwnerUserId(admin)
  await admin
    .from('referrals')
    .update({ status: 'disowned', disowned_at: now.toISOString(), purge_after: new Date(now.getTime() + PURGE_AFTER_DAYS * DAY).toISOString() })
    .eq('id', r.id)
  await admin.from('candidates').update({ owner_user_id: lily, user_id: lily, uploaded_by_user_id: lily }).eq('id', r.candidate_id)
  await recordHumanDecision(admin, {
    candidateId: r.candidate_id,
    kind: 'contact',
    value: 'disowned_referral',
    actor: `referrer:${r.referrer_user_id}`,
    sourceEvent: 'referral_disowned',
    sourceRef: { referral_id: r.id, code: r.code, by },
    reason: 'The partner whose link was used says the person did not come from them.',
    dedupeKey: `disowned_referral:${r.id}:${now.toISOString().slice(0, 16)}`,
  })

  const [c, who] = await Promise.all([candidateBasics(admin, r.candidate_id), referrerName(admin, r.referrer_user_id)])
  const since = new Date(now.getTime() - 7 * DAY).toISOString()
  const { count } = await admin.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_user_id', r.referrer_user_id).eq('status', 'disowned').gt('disowned_at', since)
  const nth = count ?? 1
  let rotated: string | null = null
  if (nth >= DISOWN_LIMIT) {
    rotated = await rotateCode(admin, r.referrer_user_id)
    if (who.email) await queueEmail(admin, { to: who.email, toName: who.name, userId: r.referrer_user_id, email: templateRS4({ fullName: who.name, newLink: referralUrl(rotated), reason: 'disowned' }), dedupeKey: `RS4:${r.referrer_user_id}:${now.toISOString().slice(0, 10)}` })
    await postAlert(`:rotating_light: ${esc(who.name)}'s link was rotated: ${nth} "not from me" answers this week (was ${esc(r.code)}, now ${esc(rotated)}).`)
  }
  if (c?.desk_card_ts && c.desk_card_channel) {
    await postThreadReply(c.desk_card_channel, c.desk_card_ts, `:no_entry_sign: ${esc(who.name)} says ${esc(properName(c.name))} did not come from them. Parked: no matching, no mail. React :+1: on the feed line to keep them as a self-submission.`)
  }
  await postToFeed(
    `:no_entry_sign: *${esc(who.name)}* says *${esc(properName(c?.name ?? 'someone'))}* did not come from them (via link ${esc(r.code)}${nth > 1 ? `, ${nth}${nth === 2 ? 'nd' : nth === 3 ? 'rd' : 'th'} this week` : ''}). Parked: not matched, not on the desk, no emails. React :+1: to keep them as a self-submission owned by you; otherwise the CV is deleted in ${PURGE_AFTER_DAYS} days.  ·  <${APP_URL}/candidates/${r.candidate_id}|profile>`,
  )
  return { ok: true, message: 'Understood. They are off your list and nothing is credited to you.', rotated }
}

/** A "not from me" taken back inside three minutes. */
export async function undoDisown(admin: SupabaseClient, r: ReferralRow): Promise<{ ok: boolean; message: string }> {
  if (r.status !== 'disowned' || !r.disowned_at) return { ok: false, message: 'Nothing to undo.' }
  if (Date.now() - new Date(r.disowned_at).getTime() > UNDO_MS) return { ok: false, message: 'The undo window has passed. Ask Lily if this was a mistake.' }
  await admin.from('referrals').update({ status: 'pending', disowned_at: null, purge_after: null }).eq('id', r.id)
  await admin.from('candidate_human_decisions').update({ revoked_at: new Date().toISOString() }).eq('candidate_id', r.candidate_id).eq('kind', 'contact').eq('value', 'disowned_referral').is('revoked_at', null)
  await admin.from('candidates').update({ owner_user_id: r.referrer_user_id, user_id: r.referrer_user_id, uploaded_by_user_id: r.referrer_user_id }).eq('id', r.candidate_id)
  await postToFeed(`:leftwards_arrow_with_hook: The "not from me" on <${APP_URL}/candidates/${r.candidate_id}|this person> was taken back within the undo window. Back to waiting for the partner's yes.`)
  return { ok: true, message: 'Undone. They are back on your list, waiting for your yes.' }
}

/** Lily's :+1: on the feed line: keep a disowned person as a self-submission owned by her. */
export async function rescueReferral(admin: SupabaseClient, r: ReferralRow): Promise<boolean> {
  if (r.status !== 'disowned') return false
  await admin.from('referrals').update({ status: 'escalated', purge_after: null }).eq('id', r.id)
  await admin.from('candidate_human_decisions').update({ revoked_at: new Date().toISOString() }).eq('candidate_id', r.candidate_id).eq('kind', 'contact').eq('value', 'disowned_referral').is('revoked_at', null)
  await admin.from('candidates').update({ intake_source: 'self' }).eq('id', r.candidate_id)
  await releaseHeldCard(admin, r.candidate_id, 'rescued by Lily from a disowned referral')
  return true
}

/** Five arrivals inside an hour on one code: rotate it before the sixth lands. */
export async function checkBurst(admin: SupabaseClient, code: string, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count } = await admin.from('referrals').select('id', { count: 'exact', head: true }).eq('code', code).gt('created_at', since)
  if ((count ?? 0) < BURST_LIMIT) return false
  const fresh = await rotateCode(admin, userId)
  const who = await referrerName(admin, userId)
  if (who.email) await queueEmail(admin, { to: who.email, toName: who.name, userId, email: templateRS4({ fullName: who.name, newLink: referralUrl(fresh), reason: 'burst' }), dedupeKey: `RS4:${userId}:${new Date().toISOString().slice(0, 10)}` })
  await postAlert(`:rotating_light: ${esc(who.name)}'s link ${esc(code)} had ${count} arrivals in an hour and was rotated to ${esc(fresh)}.`)
  return true
}

// ── timers, from the daily cron ───────────────────────────────────────────

export async function runReferralTimers(admin: SupabaseClient): Promise<{ reminded: number; escalated: number; purged: number }> {
  const out = { reminded: 0, escalated: 0, purged: 0 }
  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const { data: pending } = await admin.from('referrals').select('*').eq('status', 'pending').lt('created_at', iso(now - REMIND_AFTER_DAYS * DAY))
  const { data: prefRows } = await admin.from('notification_prefs').select('user_id, needs_you')
  const quiet = new Set((prefRows ?? []).filter(p => p.needs_you === false).map(p => p.user_id as string))

  for (const r of (pending ?? []) as ReferralRow[]) {
    const age = (now - new Date(r.created_at).getTime()) / DAY
    const c = await candidateBasics(admin, r.candidate_id)
    if (!c) continue
    const who = await referrerName(admin, r.referrer_user_id)
    if (age >= ESCALATE_AFTER_DAYS && !r.escalated_at) {
      await admin.from('referrals').update({ status: 'escalated', escalated_at: iso(now) }).eq('id', r.id)
      await postToFeed(`:hourglass: *${esc(who.name)}* has not said whether *${esc(properName(c.name))}* came from them (${Math.round(age)} days). The card posts flagged; they keep ownership unless you say otherwise.  ·  <${APP_URL}/candidates/${c.id}|profile>`)
      await releaseHeldCard(admin, c.id, `unconfirmed by ${who.name} after ${Math.round(age)} days`)
      out.escalated++
      continue
    }
    if (!r.reminded_at && !quiet.has(r.referrer_user_id) && who.email) {
      const arrived = new Date(r.created_at).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
      const readAnyway = new Date(new Date(r.created_at).getTime() + ESCALATE_AFTER_DAYS * DAY).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
      const q = await queueEmail(admin, {
        to: who.email,
        toName: who.name,
        userId: r.referrer_user_id,
        email: templateRS2({ fullName: who.name, candidate: properName(c.name), arrivedOn: arrived, readAnywayOn: readAnyway, confirmLink: referralActionUrl(r.token, 'yes'), declineLink: referralActionUrl(r.token, 'no') }),
        dedupeKey: `RS2:${r.id}`,
        meta: { candidate_id: c.id },
      })
      if (q.ok) {
        await admin.from('referrals').update({ reminded_at: iso(now) }).eq('id', r.id)
        out.reminded++
      }
    }
  }

  // Disowned and unrescued for 30 days: the CV goes, the person is told once.
  const { data: stale } = await admin.from('referrals').select('*').eq('status', 'disowned').is('purged_at', null).lt('purge_after', iso(now))
  for (const r of (stale ?? []) as ReferralRow[]) {
    const c = await candidateBasics(admin, r.candidate_id)
    if (c?.email) await queueEmail(admin, { to: c.email, toName: c.name, email: templateRL3({ fullName: c.name, applyLink: `${APP_URL}/apply` }), dedupeKey: `RL3:${r.id}` })
    if (c?.resume_blob_pathname) await del(c.resume_blob_pathname).catch(() => undefined)
    await admin.from('referrals').update({ purged_at: iso(now) }).eq('id', r.id)
    if (c) await admin.from('candidates').delete().eq('id', c.id)
    out.purged++
  }
  return out
}

// ── stats for the partner ─────────────────────────────────────────────────

export interface LinkStats {
  opens: number
  arrivals: number
  confirmed: number
  waiting: number
}

export async function linkStats(admin: SupabaseClient, userId: string, codes: string[], since?: string): Promise<LinkStats> {
  const out: LinkStats = { opens: 0, arrivals: 0, confirmed: 0, waiting: 0 }
  if (codes.length) {
    let q = admin.from('candidate_page_events').select('id', { count: 'exact', head: true }).eq('kind', 'view').in('via_code', codes)
    if (since) q = q.gt('created_at', since)
    const { count } = await q
    out.opens = count ?? 0
  }
  let rq = admin.from('referrals').select('status, created_at').eq('referrer_user_id', userId).neq('status', 'duplicate')
  if (since) rq = rq.gt('created_at', since)
  const { data } = await rq
  for (const r of data ?? []) {
    out.arrivals++
    if (r.status === 'confirmed') out.confirmed++
    if (r.status === 'pending' || r.status === 'escalated') out.waiting++
  }
  return out
}

/** For the desk card: who the person came through and what the partner said. */
export async function referralForCard(admin: SupabaseClient, candidateId: string): Promise<{ referrerName: string; status: ReferralStatus; relationship: string | null; why: string | null; source: 'link' | 'jd' } | null> {
  const r = await referralFor(admin, candidateId)
  if (!r || r.status === 'duplicate') return null
  const who = await referrerName(admin, r.referrer_user_id)
  return { referrerName: who.name, status: r.status, relationship: r.relationship, why: r.why, source: r.source }
}
