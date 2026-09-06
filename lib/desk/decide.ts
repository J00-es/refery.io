/**
 * A decision on a candidate, from Slack or the web, with every side effect.
 *
 *   intro_now   the email goes (to the partner, or to the candidate when we own
 *               them), the journey moves, the follow-up timers start
 *   bench       the note goes to the owner, the journey moves to bench
 *   not_fit     needs a reason line first; then the note goes and the journey closes
 *   manual      Lily will do it by hand; a reminder in a week
 *   snooze      a week of quiet, then the card comes back as one line
 *   route_elsewhere  not a candidate; filed, nothing sent
 *
 * The journey move is a conditional update, so a double tap or a Slack retry
 * lands exactly once and sends exactly one email.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { postThreadReply, esc } from '@/lib/slack-bot'
import { latestPanel, recipientFor, type PanelRow } from '@/lib/desk/panel'
import { loadOwner, properName, type Owner } from '@/lib/desk/people'
import { loadLiveSeats, seatLabel, type Seat } from '@/lib/desk/seats'
import { missingFactsAsk } from '@/lib/desk/emails'
import { cancelFollowups, deskSetting, logActivity, moveJourney, scheduleFollowup, sendDeskEmail } from '@/lib/desk/outbound'
import { suggestedLine } from '@/lib/desk/card'

export type Decision = 'intro_now' | 'bench' | 'not_fit' | 'manual' | 'snooze' | 'route_elsewhere'

export interface DecisionInput {
  candidateId: string
  decision: Decision
  /** Slack user id or app user id, for the record. */
  by: string
  via: 'slack' | 'web' | 'auto'
  /** For not_fit: Lily's own reason line, replacing the panel's. */
  reasonLine?: string | null
  /** Override the whole email body (from an "edit:" thread reply). */
  bodyOverride?: string | null
  /** Restrict intro_now to these seats (from a bench card). */
  jobIds?: string[]
}

export interface DecisionResult {
  ok: boolean
  /** One line for the Slack thread. */
  message: string
  emailed?: boolean
  error?: string
}

/** From which stages each decision may be taken. Anything else answers "already past that". */
const FROM: Record<Decision, string[] | null> = {
  intro_now: ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro', 'bench', 'not_fit', 'dormant'],
  bench: ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro', 'not_fit', 'dormant'],
  not_fit: ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro', 'bench', 'dormant'],
  route_elsewhere: ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro', 'bench'],
  manual: null,
  snooze: null,
}

const REFERRER_NUDGES_DEFAULT = [3, 7, 12]
const CANDIDATE_NUDGES_DEFAULT = [4, 10]

export async function applyDecision(admin: SupabaseClient, input: DecisionInput): Promise<DecisionResult> {
  const { data: c } = await admin.from('candidates').select('*').eq('id', input.candidateId).maybeSingle()
  if (!c) return { ok: false, message: 'Candidate not found.', error: 'not_found' }
  const [panel, owner, seats] = await Promise.all([latestPanel(admin, c.id), loadOwner(admin, c.owner_user_id ?? null), loadLiveSeats(admin)])
  const recipient = recipientFor(c, owner)
  const name = properName(c.name)
  const first = name.split(/\s+/)[0]
  const stage = String(c.journey_stage ?? 'uploaded')
  const now = new Date().toISOString()

  const target =
    input.decision === 'intro_now'
      ? recipient === 'owner'
        ? 'intro_requested'
        : 'intro_sent'
      : input.decision === 'bench'
        ? 'bench'
        : input.decision === 'not_fit'
          ? 'not_fit'
          : null

  // The same decision a second time is a no-op, with one exception: if the
  // email for it never went out (credentials, a bounce), pressing the button
  // again resends it. Nothing else moves; the decision already stands.
  let resend = false
  if (target && stage === target) {
    const { data: last } = await admin
      .from('candidate_emails')
      .select('sent_at, error, to_email')
      .eq('candidate_id', c.id)
      .eq('kind', `decision_${input.decision}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (last && !last.sent_at) resend = true
    else if (last?.sent_at) {
      return { ok: false, message: `${first} is already *${stage.replace(/_/g, ' ')}* and the email went to ${last.to_email} on ${String(last.sent_at).slice(0, 10)}. Nothing changed.`, error: 'already_past' }
    }
  }

  const allowed = FROM[input.decision]
  if (!resend && allowed && !allowed.includes(stage)) {
    return { ok: false, message: `${first} is already *${stage.replace(/_/g, ' ')}*, so nothing changed. Later moves happen on the profile.`, error: 'already_past' }
  }

  const record = async (extra: Record<string, unknown> = {}) =>
    admin.from('candidate_decisions').insert({
      candidate_id: c.id,
      decision: input.decision,
      reason: input.reasonLine ?? null,
      decided_by: input.by,
      via: input.via,
      job_ids: input.jobIds ?? [],
      ...extra,
    })

  // ── the quiet ones ─────────────────────────────────────────────────────────
  if (input.decision === 'manual') {
    await record()
    await cancelFollowups(admin, c.id, ['decision_reminder', 'snooze_repost', 'bench_autosend'])
    await scheduleFollowup(admin, { candidateId: c.id, kind: 'decision_reminder', inDays: 7, meta: { manual: true } })
    await logActivity(admin, c.id, 'decision_made', `Lily is handling ${first} by hand.`, { performedBy: null, metadata: { by: input.by } })
    return { ok: true, message: `Noted: you are handling ${first} by hand. Nothing sent. I will ask again in a week if the profile has not moved.` }
  }
  if (input.decision === 'snooze') {
    await record()
    const until = new Date(Date.now() + 7 * 86_400_000).toISOString()
    await admin.from('candidates').update({ desk_snoozed_until: until, updated_at: now }).eq('id', c.id)
    await cancelFollowups(admin, c.id, ['decision_reminder', 'snooze_repost', 'bench_autosend'])
    await scheduleFollowup(admin, { candidateId: c.id, kind: 'snooze_repost', inDays: 7 })
    return { ok: true, message: `Snoozed ${first} for a week. Back as one line on ${until.slice(0, 10)}.` }
  }

  if (!panel && input.decision !== 'route_elsewhere') {
    return { ok: false, message: `No panel on record for ${first} yet, so there is no draft to send. Run the panel first.`, error: 'no_panel' }
  }

  // ── claim the move ─────────────────────────────────────────────────────────
  if (!resend) {
    const { data: claimed } = await admin
      .from('candidates')
      .update({ journey_stage: target ?? 'not_fit', journey_stage_at: now, journey_stage_source: 'desk', updated_at: now, desk_reason_pending_at: null, desk_snoozed_until: null })
      .eq('id', c.id)
      .eq('journey_stage', stage)
      .select('id')
    if (!claimed?.length) return { ok: false, message: 'Someone moved this a moment ago, so nothing changed.', error: 'race' }
    await logActivity(admin, c.id, 'journey_stage_changed', `${input.decision.replace(/_/g, ' ')} by ${input.via === 'auto' ? 'the desk' : 'Lily'}.`, {
      from: stage,
      to: target,
      metadata: { by: input.by, via: input.via, decision: input.decision },
    })
    await cancelFollowups(admin, c.id, ['decision_reminder', 'snooze_repost', 'bench_autosend'])
  }

  if (input.decision === 'route_elsewhere') {
    await record()
    await admin.from('candidates').update({ availability_status: 'not_qualified' }).eq('id', c.id)
    return { ok: true, message: `Filed ${first} as not a candidate (${c.person_type ?? 'unknown type'}). Nothing sent.` }
  }

  // ── the email ──────────────────────────────────────────────────────────────
  const p = panel as PanelRow
  const draft = { ...(p.drafts?.[input.decision] ?? { subject: '', body: '' }) }
  if (input.bodyOverride?.trim()) {
    // A whole email replaces the body. A line or two is a note: the draft is
    // rewritten around it, in Lily's voice, so "not a great fit, and does he
    // have a visa?" comes out as a complete email rather than going as-is.
    draft.body = looksLikeEmail(input.bodyOverride)
      ? input.bodyOverride.trim()
      : await rewriteWithNote(draft, input.bodyOverride.trim(), recipient === 'owner' ? (owner?.firstName ?? 'there') : first, name)
  } else if (input.decision === 'not_fit' && input.reasonLine?.trim()) {
    // A reason typed on the profile or in the card thread is a note too, so
    // it is folded into the draft in Lily's voice, never pasted in raw.
    draft.body = looksLikeEmail(input.reasonLine)
      ? input.reasonLine.trim()
      : await rewriteWithNote(draft, input.reasonLine.trim(), recipient === 'owner' ? (owner?.firstName ?? 'there') : first, name)
  }
  if (recipient === 'owner' && input.decision !== 'not_fit' && !input.bodyOverride) {
    const ask = missingFactsAsk(p.missing_facts ?? [], name)
    if (ask && !draft.body.includes('One quick thing')) draft.body = draft.body.replace(/\n\nBest,\nLily\s*$/, `${ask}\n\nBest,\nLily`)
  }

  const to = recipient === 'owner' ? owner?.email ?? null : (c.email as string | null)
  const toName = recipient === 'owner' ? owner?.name ?? null : name
  // Lily uploading her own sourced person and benching them is a filing, not an email.
  const skipEmail = recipient === 'candidate' && owner?.isUs && c.intake_source !== 'inbound' && input.decision !== 'intro_now'

  let emailed = false
  let emailError: string | null = null
  let threadId: string | null = null
  if (!skipEmail) {
    if (!to) emailError = recipient === 'owner' ? 'the owner has no email on record' : `${first} has no email on record`
    else {
      const sent = await sendDeskEmail(admin, {
        candidateId: c.id,
        kind: `decision_${input.decision}`,
        to,
        toName,
        subject: draft.subject || (recipient === 'owner' ? `[Refery] ${name}` : `${first} / Lily @ Refery`),
        body: draft.body,
        sentBy: input.by,
        meta: { decision: input.decision, recipient, job_ids: input.jobIds ?? strongSeatIds(p, seats) },
      })
      emailed = sent.ok
      emailError = sent.error ?? null
      threadId = sent.threadId
    }
  }

  if (!resend) await record({ job_ids: input.jobIds ?? strongSeatIds(p, seats) })

  // ── what happens next ──────────────────────────────────────────────────────
  if (input.decision === 'intro_now') {
    const jobIds = input.jobIds?.length ? input.jobIds : strongSeatIds(p, seats)
    if (resend) await cancelFollowups(admin, c.id, ['referrer_nudge_1', 'referrer_nudge_2', 'referrer_escalate', 'candidate_book_nudge', 'candidate_book_escalate'], 'resent')
    await admin.from('candidates').update({ availability_status: c.availability_status === 'off_market' ? 'off_market' : 'active' }).eq('id', c.id)
    if (recipient === 'owner') {
      const days = await deskSetting<number[]>(admin, 'referrer_nudge_days', REFERRER_NUDGES_DEFAULT)
      await scheduleFollowup(admin, { candidateId: c.id, kind: 'referrer_nudge_1', inDays: days[0] ?? 3, toEmail: to, threadId, meta: { job_ids: jobIds } })
      await scheduleFollowup(admin, { candidateId: c.id, kind: 'referrer_nudge_2', inDays: days[1] ?? 7, toEmail: to, threadId, meta: { job_ids: jobIds } })
      await scheduleFollowup(admin, { candidateId: c.id, kind: 'referrer_escalate', inDays: days[2] ?? 12, toEmail: to, threadId, meta: { job_ids: jobIds } })
    } else {
      const days = await deskSetting<number[]>(admin, 'candidate_nudge_days', CANDIDATE_NUDGES_DEFAULT)
      await scheduleFollowup(admin, { candidateId: c.id, kind: 'candidate_book_nudge', inDays: days[0] ?? 4, toEmail: to, threadId, meta: { job_ids: jobIds } })
      await scheduleFollowup(admin, { candidateId: c.id, kind: 'candidate_book_escalate', inDays: days[1] ?? 10, toEmail: to, threadId, meta: { job_ids: jobIds } })
    }
  }

  const sentLine = skipEmail
    ? 'Nothing sent (they are ours and not an inbound).'
    : emailed
      ? `${resend ? 'Resent' : 'Sent'} to ${to}.`
      : `:warning: The email to ${to ?? 'nobody'} did not send: ${emailError}. Worth sending by hand; the decision stands.`

  const next =
    input.decision === 'intro_now'
      ? recipient === 'owner'
        ? `${first} is *intro requested*. I nudge ${owner?.firstName ?? 'the owner'} on day 3 and 7 if nothing lands, and ask you on day 12.`
        : `${first} is *intro sent*. I nudge on day 4 if they have not booked, and ask you on day 10.`
      : input.decision === 'bench'
        ? `${first} is on the *bench*. Re-matched automatically when a seat opens.`
        : `${first} is *not a fit*. ${recipient === 'owner' ? `${owner?.firstName ?? 'The owner'} reads the reason on their page and in Sunday's digest.` : ''}`

  return { ok: true, emailed, error: emailError ?? undefined, message: `${sentLine} ${next}` }
}

export function looksLikeEmail(text: string): boolean {
  const t = text.trim()
  return t.length > 280 || (/^(hi|hey|hello|dear)\b/i.test(t) && /\b(best|thanks|cheers|regards),?\s*\n?\s*lily\s*$/i.test(t))
}

/** Fold Lily's note into the drafted email. On any failure the note goes in as the reason line. */
async function rewriteWithNote(draft: { subject: string; body: string }, note: string, recipientFirst: string, candidateName: string): Promise<string> {
  const { structured } = await import('@/lib/desk/model')
  const { z } = await import('zod')
  try {
    const r = await structured('draft', {
      system:
        'You rewrite one short email for Lily Joo at Refery. Keep her voice: short, warm, plain, a smiley where she would put one, never an em dash, never a placeholder, signed "Best,\nLily". Keep the greeting and the sign-off of the draft. Fold the note in as the substance, in her words, not quoted. Any question in the note becomes a real question to the recipient. Return only the body.',
      user: `Recipient first name: ${recipientFirst}. About: ${candidateName}.\n\nDRAFT:\n${draft.body}\n\nLILY'S NOTE (what she actually wants to say):\n${note}`,
      schema: z.object({ body: z.string() }),
      maxOutputTokens: 1500,
    })
    return r.output.body.trim()
  } catch (err) {
    console.warn('[desk:decide] rewrite failed, using the note as the reason:', err instanceof Error ? err.message : err)
    return draft.body.replace(/\n\nBest,\nLily\s*$/, `\n\n${note}\n\nBest,\nLily`)
  }
}

export function strongSeatIds(panel: PanelRow, seats: Seat[]): string[] {
  const live = new Set(seats.map(s => s.jobId))
  return (panel.seat_fits ?? []).filter(f => f.fit === 'strong' && live.has(f.job_id)).map(f => f.job_id)
}

export function seatLinesFor(panel: PanelRow, seats: Seat[], named: boolean): string[] {
  const by = new Map(seats.map(s => [s.jobId, s]))
  return strongSeatIds(panel, seats)
    .map(id => by.get(id))
    .filter((s): s is Seat => !!s)
    .map(s => seatLabel(s, named))
}

// ── Slack glue ───────────────────────────────────────────────────────────────

const REACTION_TO_DECISION: Record<string, Decision | 'arm_not_fit'> = {
  fire: 'intro_now',
  '+1': 'bench',
  thumbsup: 'bench',
  '-1': 'arm_not_fit',
  thumbsdown: 'arm_not_fit',
  raising_hand: 'manual',
  zzz: 'snooze',
}

/** A reaction on a decision card. Returns false when the reaction is not one the card understands. */
export async function handleDecisionReaction(
  admin: SupabaseClient,
  input: { candidate: Record<string, unknown>; reaction: string; slackUser: string; channel: string; ts: string },
): Promise<boolean> {
  const mapped = REACTION_TO_DECISION[input.reaction]
  if (!mapped) return false
  const c = input.candidate
  const first = properName(c.name as string).split(/\s+/)[0]

  if (mapped === 'arm_not_fit') {
    if (c.person_type && c.person_type !== 'job_seeker') {
      const r = await applyDecision(admin, { candidateId: c.id as string, decision: 'route_elsewhere', by: input.slackUser, via: 'slack' })
      await postThreadReply(input.channel, input.ts, `<@${input.slackUser}> ${r.message}`)
      return true
    }
    await admin.from('candidates').update({ desk_reason_pending_at: new Date().toISOString() }).eq('id', c.id)
    await postThreadReply(
      input.channel,
      input.ts,
      `<@${input.slackUser}>, reply in this thread with one line on why (${first}'s owner reads it), or "send" to use the draft as it is. To change your mind, react :fire: or :+1: instead.`,
    )
    return true
  }

  // :+1: on someone who is not a job seeker files them rather than benching them.
  const decision: Decision = mapped === 'bench' && c.person_type && c.person_type !== 'job_seeker' ? 'route_elsewhere' : mapped
  const r = await applyDecision(admin, {
    candidateId: c.id as string,
    decision,
    by: input.slackUser,
    via: 'slack',
    bodyOverride: (c.desk_draft_override as string | null) ?? null,
  })
  await postThreadReply(input.channel, input.ts, `${r.ok ? ':white_check_mark:' : ':warning:'} <@${input.slackUser}> ${r.message}`)
  return true
}

/** A typed reply in a decision card's thread. */
export async function handleDecisionThreadReply(
  admin: SupabaseClient,
  input: { candidate: Record<string, unknown>; text: string; slackUser: string; channel: string; ts: string },
): Promise<void> {
  const c = input.candidate
  const text = input.text.trim()
  const first = properName(c.name as string).split(/\s+/)[0]

  const edit = text.match(/^edit\s*[:：]\s*([\s\S]+)$/i)
  if (edit) {
    const body = edit[1].trim()
    await admin.from('candidates').update({ desk_draft_override: body }).eq('id', c.id)
    await postThreadReply(
      input.channel,
      input.ts,
      looksLikeEmail(body)
        ? `:pencil2: Got it. This replaces the email body when you react:\n>${esc(body).replace(/\n/g, '\n>')}`
        : `:pencil2: Got it. I will fold that into the email in your voice when you react (a full email here would replace the draft outright):\n>${esc(body).replace(/\n/g, '\n>')}`,
    )
    return
  }

  if (text.toLowerCase() === 'suggest' || text.toLowerCase() === 'why') {
    const panel = await latestPanel(admin, c.id as string)
    const owner = await loadOwner(admin, (c.owner_user_id as string) ?? null)
    if (panel) await postThreadReply(input.channel, input.ts, suggestedLine(panel, recipientFor(c, owner), owner))
    return
  }

  if (c.desk_reason_pending_at) {
    const useDraft = /^send\.?$/i.test(text)
    const r = await applyDecision(admin, {
      candidateId: c.id as string,
      decision: 'not_fit',
      by: input.slackUser,
      via: 'slack',
      reasonLine: useDraft ? null : text,
      bodyOverride: (c.desk_draft_override as string | null) ?? null,
    })
    await postThreadReply(input.channel, input.ts, `${r.ok ? ':white_check_mark:' : ':warning:'} <@${input.slackUser}> ${r.message}`)
    return
  }
  // Anything else in the thread is conversation. Say nothing rather than guess.
  void first
}

export type { Owner }
