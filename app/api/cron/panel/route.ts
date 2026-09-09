/**
 * The one-minute panel worker. pg_cron rings this every minute; it claims the
 * oldest queued candidates under a lease, runs the panel, and posts the
 * decision card.
 *
 * A candidate who arrived through a partner submission already has a card in
 * #refery-desk, so the panel's read goes into that card's thread instead of
 * making a second card. An automatic re-run (facts updated) only speaks up
 * when the grade crossed the A- bar; a manual re-run always refreshes or
 * posts the card, even for someone already met, because the press is Lily
 * asking for the drafts.
 *
 * Ownership: a claim is exclusive while its lease lives, a targeted rerun
 * cannot take a running item, the panel renews the lease before it writes,
 * and a completion that comes back false (the lease was lost) is logged and
 * nothing outward is done for it.
 *
 * Outcomes are typed (queue.outcome): succeeded, empty, deferred_budget,
 * input_error, provider_error, policy_excluded, skipped, failed, lease_lost.
 * A budget deferral keeps the item queued with a retry time and does not
 * count as an attempt; the person is never rejected because the month ran out.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { buildPanelContext, latestPanel, runPanel } from '@/lib/desk/panel'
import { buildDecisionCard, postDecisionCard, suggestedLine } from '@/lib/desk/card'
import { postThreadReply, updateMessage, esc } from '@/lib/slack-bot'
import { deskSetting, scheduleFollowup } from '@/lib/desk/outbound'
import { meetsBar, pastTheDoor as isPastTheDoor, type PanelGrade } from '@/lib/journey'
import { properName } from '@/lib/desk/people'
import { gradeLabel, stripPercentiles } from '@/lib/engine/grade'
import { claimPanelItems, completePanelItem, LeaseLostError, type PanelQueueItem, type QueueOutcome } from '@/lib/engine/queue'
import { BudgetDeferredError } from '@/lib/engine/ledger'
import { drainOutbox, enqueueOutbox } from '@/lib/engine/outbox'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_PER_RUN = 3
const MAX_ATTEMPTS = 3
const BUDGET_RETRY_SECONDS = 30 * 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (req.nextUrl.searchParams.get('wait') === '1') return NextResponse.json(await work(req))
  after(async () => {
    try {
      const out = await work(req)
      if (out.processed) console.log('[desk:panel]', JSON.stringify(out))
    } catch (err) {
      console.error('[desk:panel] run threw:', err)
    }
  })
  return NextResponse.json({ ok: true, accepted: true })
}

class SkipPanel extends Error {
  constructor(message: string, public readonly outcome: QueueOutcome) {
    super(message)
  }
}

type Admin = ReturnType<typeof createAdminClient>

/** A card whose post failed after the panel was saved: post it from the saved read, no model call. */
async function repostDecisionCard(admin: Admin, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const candidateId = String(payload.candidate_id ?? '')
  const ctx = await buildPanelContext(admin, candidateId)
  if (!ctx) return { ok: true }
  if (ctx.candidate.desk_card_ts) return { ok: true }
  const panel = await latestPanel(admin, candidateId)
  if (!panel || (payload.panel_id && panel.id !== payload.panel_id)) return { ok: true }
  const posted = await postDecisionCard(admin, { candidate: ctx.candidate, panel, owner: ctx.owner, seats: ctx.seats, recipient: ctx.recipient, duplicateOf: null, latencyLine: String(payload.latency_line ?? 'posted after a retry') })
  return posted.ok ? { ok: true } : { ok: false, error: posted.error }
}

async function finish(admin: Admin, item: PanelQueueItem, result: Parameters<typeof completePanelItem>[2]): Promise<void> {
  const done = await completePanelItem(admin, item, result)
  if (!done) console.warn(`[desk:panel] completion refused for ${item.candidate_id}: the lease was lost; another worker owns the item`)
}

async function work(req: NextRequest): Promise<{ ok: boolean; processed: number; results: Record<string, unknown>[] }> {
  const admin = createAdminClient()
  const only = req.nextUrl.searchParams.get('candidate')
  await drainOutbox(admin, { decision_card: payload => repostDecisionCard(admin, payload) }, 5)
  const items = await claimPanelItems(admin, MAX_PER_RUN, only, MAX_ATTEMPTS)
  if (only && !items.length) return { ok: true, processed: 0, results: [{ id: only, skipped: 'not claimable now: not queued, or another worker holds it' }] }

  const results: Record<string, unknown>[] = []
  for (const item of items) {
    const id = item.candidate_id
    try {
      const outcome = await panelOne(admin, item, String(item.reason ?? 'created'))
      await finish(admin, item, { status: outcome.skipped ? 'skipped' : 'done', outcome: outcome.skipped ? 'skipped' : (outcome.outcome as QueueOutcome) ?? 'succeeded', error: outcome.skipped ?? null })
      results.push({ id, ...outcome })
    } catch (err) {
      if (err instanceof LeaseLostError) {
        // The result was discarded before any write; the current owner's run stands.
        results.push({ id, outcome: 'lease_lost' })
        continue
      }
      if (err instanceof BudgetDeferredError) {
        // Queue with a visible reason; not an attempt, not a rejection.
        await finish(admin, item, { status: 'queued', outcome: 'deferred_budget', error: err.message.slice(0, 400), retryInSeconds: BUDGET_RETRY_SECONDS })
        results.push({ id, deferred: err.reservation.reason })
        continue
      }
      if (err instanceof SkipPanel) {
        await finish(admin, item, { status: 'skipped', outcome: err.outcome, error: err.message })
        results.push({ id, skipped: err.message })
        continue
      }
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[desk:panel] ${id} threw:`, err)
      const outcome: QueueOutcome = /no model answered|timeout|abort|429|quota/i.test(message) ? 'provider_error' : 'failed'
      const giveUp = item.attempts >= MAX_ATTEMPTS
      await finish(admin, item, { status: giveUp ? 'failed' : 'queued', outcome, error: message.slice(0, 500) })
      if (giveUp) {
        const { data: c } = await admin.from('candidates').select('name, desk_card_channel, desk_card_ts').eq('id', id).maybeSingle()
        const { postAlert } = await import('@/lib/desk-notifications')
        await postAlert(`:warning: The panel failed three times on *${esc(properName(c?.name as string))}*: ${esc(message.slice(0, 200))}. Open the profile and press "Run the panel" once the cause is fixed.`)
      }
      results.push({ id, error: message, outcome })
    }
  }
  return { ok: true, processed: results.length, results }
}

async function panelOne(admin: Admin, item: PanelQueueItem, reason: string): Promise<Record<string, unknown> & { skipped?: string; outcome?: QueueOutcome }> {
  const candidateId = item.candidate_id
  const ctx = await buildPanelContext(admin, candidateId)
  if (!ctx) return { skipped: 'candidate not found', outcome: 'input_error' }
  const c = ctx.candidate
  if (!ctx.policy.can_assess) throw new SkipPanel(`policy: ${ctx.policy.reasons.join(', ')}`, 'policy_excluded')
  const hasText = Boolean(ctx.parsed?.raw_text) || (ctx.parsed?.work_history?.length ?? 0) > 0 || (Array.isArray(c.work_history) && (c.work_history as unknown[]).length > 0) || Boolean(c.ai_analysis)
  if (!hasText) throw new SkipPanel('no résumé text on record', 'input_error')

  const before = await latestPanel(admin, candidateId)
  const priorGrade = (c.panel_grade as PanelGrade | null) ?? null
  const startedAt = Date.now()
  const panel = await runPanel(admin, ctx, { reason, lease: item.lease_token ? { candidateId, token: item.lease_token } : null })
  const reused = Boolean((panel.engine as { reused?: boolean } | undefined)?.reused)
  const secondsSinceArrival = Math.max(1, Math.round((Date.now() - new Date(String(c.created_at)).getTime()) / 1000))
  const latencyLine = reused
    ? 'same read as before: nothing it reads has changed'
    : reason === 'created'
      ? secondsSinceArrival < 180
        ? `graded ${secondsSinceArrival} s after upload`
        : `graded ${Math.round(secondsSinceArrival / 60)} min after upload`
      : `re-graded (${reason.replace(/_/g, ' ')}) in ${Math.round((Date.now() - startedAt) / 1000)} s`

  // A partner submission already produced a card; the panel joins its thread.
  const { data: sub } = await admin
    .from('role_submissions')
    .select('id, slack_channel_id, slack_message_ts, created_at')
    .eq('candidate_id', candidateId)
    .not('slack_message_ts', 'is', null)
    .gt('created_at', new Date(Date.now() - 6 * 3_600_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const pastTheDoor = isPastTheDoor(String(c.journey_stage))
  const crossed = priorGrade && meetsBar(priorGrade) !== meetsBar(panel.grade as PanelGrade)

  if (sub?.slack_channel_id && sub.slack_message_ts) {
    if (!reused) {
      await postThreadReply(
        sub.slack_channel_id as string,
        sub.slack_message_ts as string,
        `:brain: *Panel: ${esc(gradeLabel(panel.grade))} · ${esc(stripPercentiles(panel.positioning ?? ''))}.* ${esc(stripPercentiles(panel.summary ?? ''))}\n${panel.highlights.map(h => `• ${esc(stripPercentiles(h))}`).join('\n')}${panel.flags.length ? `\n${panel.flags.map(f => `:warning: ${esc(stripPercentiles(f))}`).join('   ')}` : ''}\n${suggestedLine(panel, ctx.recipient, ctx.owner)}`,
      )
    }
    return { grade: panel.grade, posted: reused ? 'nothing (reused)' : 'submission thread', cost: panel.cost_usd, reused }
  }

  const manualRerun = reason === 'manual'
  if (before && c.desk_card_channel && c.desk_card_ts && (pastTheDoor || !crossed)) {
    // Still undecided: the card is rewritten in place so what Lily reads is
    // what the latest panel said, drafts included. Decided: a thread note only.
    // Lily pressing "Run the panel" on someone already met also gets the
    // card refreshed, since that press is her asking for the drafts again.
    const undecided = ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro'].includes(String(c.journey_stage)) || (pastTheDoor && manualRerun)
    if (undecided) {
      const card = buildDecisionCard({ candidate: c, panel, owner: ctx.owner, seats: ctx.seats, recipient: ctx.recipient, duplicateOf: null, latencyLine })
      await updateMessage(c.desk_card_channel as string, c.desk_card_ts as string, card.text, card.blocks)
    }
    if (priorGrade !== panel.grade) {
      await postThreadReply(c.desk_card_channel as string, c.desk_card_ts as string, `:brain: Re-graded after ${reason.replace(/_/g, ' ')}: *${esc(priorGrade ?? '?')} → ${esc(panel.grade)}*. ${esc(stripPercentiles(panel.suggested_reason ?? ''))}`)
    }
    return { grade: panel.grade, posted: undecided ? 'card updated' : 'thread note', cost: panel.cost_usd, reused }
  }
  // Past the door the panel only speaks when asked: the door decisions no
  // longer apply on their own, but Lily pressing "Run the panel" wants the
  // card, drafts and all. The reactions then hold the stage (see decide.ts).
  if (pastTheDoor && !manualRerun) return { grade: panel.grade, posted: 'nothing (past the door)', cost: panel.cost_usd, reused }
  // A person a human closed or parked gets no new card from an automatic rerun either.
  if (['not_fit', 'dormant', 'bench'].includes(String(c.journey_stage)) && !manualRerun) return { grade: panel.grade, posted: `nothing (${String(c.journey_stage)} stays)`, cost: panel.cost_usd, reused }

  // Already known under another owner?
  let duplicateOf: { name: string; ownerName: string | null; since: string } | null = null
  const email = (c.email as string | null)?.toLowerCase()
  const li = (c.linkedin_url as string | null)?.toLowerCase().replace(/\/$/, '')
  if (email || li) {
    let dq = admin.from('candidates').select('id, name, owner_user_id, created_at').neq('id', candidateId).lt('created_at', String(c.created_at)).limit(1)
    dq = email && li ? dq.or(`email.ilike.${email},linkedin_url.ilike.${li}%`) : email ? dq.ilike('email', email) : dq.ilike('linkedin_url', `${li}%`)
    const { data: dup } = await dq
    if (dup?.[0]) {
      const { data: o } = dup[0].owner_user_id ? await admin.from('users_admin').select('full_name, email').eq('user_id', dup[0].owner_user_id).maybeSingle() : { data: null }
      duplicateOf = { name: properName(dup[0].name as string), ownerName: (o?.full_name as string) ?? (o?.email as string) ?? null, since: String(dup[0].created_at).slice(0, 10) }
    }
  }

  const posted = await postDecisionCard(admin, { candidate: c, panel, owner: ctx.owner, seats: ctx.seats, recipient: ctx.recipient, duplicateOf, latencyLine })
  if (!posted.ok) {
    // The assessment is saved and paid for; only the card failed. Retry the card, not the call.
    await enqueueOutbox(admin, { kind: 'decision_card', idempotencyKey: `decision_card:${panel.id}`, payload: { candidate_id: candidateId, panel_id: panel.id, latency_line: latencyLine } })
    throw new Error(`card not posted: ${posted.error}`)
  }

  // Reminders and the bench autosend are for people at the door. Someone
  // already met is Lily's call, on her clock.
  if (!pastTheDoor) {
    const reminderDays = await deskSetting<number[]>(admin, 'decision_reminder_days', [2, 7])
    await scheduleFollowup(admin, { candidateId, kind: 'decision_reminder', inDays: reminderDays[0] ?? 2 })
    const autosend = await deskSetting<number | null>(admin, 'bench_autosend_hours', null)
    if (autosend !== null && panel.suggested_decision === 'bench') {
      await scheduleFollowup(admin, { candidateId, kind: 'bench_autosend', inHours: autosend })
    }
  }
  return { grade: panel.grade, posted: 'card', cost: panel.cost_usd, suggested: panel.suggested_decision, reused }
}
