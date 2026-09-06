/**
 * The one-minute panel worker. pg_cron rings this every minute; it takes the
 * oldest queued candidates, runs the panel, and posts the decision card.
 *
 * A candidate who arrived through a partner submission already has a card in
 * #refery-desk, so the panel's read goes into that card's thread instead of
 * making a second card. A re-run (facts updated, manual re-panel) only speaks
 * up when the grade crossed the A- bar.
 */

import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { buildPanelContext, latestPanel, runPanel } from '@/lib/desk/panel'
import { buildDecisionCard, postDecisionCard, suggestedLine } from '@/lib/desk/card'
import { postThreadReply, updateMessage, esc } from '@/lib/slack-bot'
import { deskSetting, scheduleFollowup } from '@/lib/desk/outbound'
import { meetsBar, type PanelGrade } from '@/lib/journey'
import { properName } from '@/lib/desk/people'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MAX_PER_RUN = 3
const MAX_ATTEMPTS = 3

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

async function work(req: NextRequest): Promise<{ ok: boolean; processed: number; results: Record<string, unknown>[] }> {
  const admin = createAdminClient()

  // Stale "running" rows are a worker that died mid-call. Give them back.
  await admin
    .from('candidate_panel_queue')
    .update({ status: 'queued' })
    .eq('status', 'running')
    .lt('started_at', new Date(Date.now() - 6 * 60_000).toISOString())

  const only = req.nextUrl.searchParams.get('candidate')
  let q = admin.from('candidate_panel_queue').select('*').eq('status', 'queued').lt('attempts', MAX_ATTEMPTS).order('enqueued_at').limit(MAX_PER_RUN)
  if (only) q = admin.from('candidate_panel_queue').select('*').eq('candidate_id', only).limit(1)
  const { data: queued } = await q

  const results: Record<string, unknown>[] = []
  for (const item of queued ?? []) {
    const id = item.candidate_id as string
    await admin.from('candidate_panel_queue').update({ status: 'running', started_at: new Date().toISOString(), attempts: (item.attempts as number) + 1 }).eq('candidate_id', id)
    try {
      const outcome = await panelOne(admin, id, String(item.reason ?? 'created'))
      await admin.from('candidate_panel_queue').update({ status: outcome.skipped ? 'skipped' : 'done', error: outcome.skipped ?? null, finished_at: new Date().toISOString() }).eq('candidate_id', id)
      results.push({ id, ...outcome })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[desk:panel] ${id} threw:`, err)
      const giveUp = (item.attempts as number) + 1 >= MAX_ATTEMPTS
      await admin.from('candidate_panel_queue').update({ status: giveUp ? 'failed' : 'queued', error: message.slice(0, 500), finished_at: giveUp ? new Date().toISOString() : null }).eq('candidate_id', id)
      if (giveUp) {
        const { data: c } = await admin.from('candidates').select('name, desk_card_channel, desk_card_ts').eq('id', id).maybeSingle()
        const { postToDesk } = await import('@/lib/desk-notifications')
        await postToDesk(`:warning: The panel failed three times on *${esc(properName(c?.name as string))}*: ${esc(message.slice(0, 200))}. Open the profile and press "Run the panel" once the cause is fixed.`)
      }
      results.push({ id, error: message })
    }
  }
  return { ok: true, processed: results.length, results }
}

type Admin = ReturnType<typeof createAdminClient>

async function panelOne(admin: Admin, candidateId: string, reason: string): Promise<Record<string, unknown> & { skipped?: string }> {
  const ctx = await buildPanelContext(admin, candidateId)
  if (!ctx) return { skipped: 'candidate not found' }
  const c = ctx.candidate
  if (c.intake_source === 'calibration') return { skipped: 'calibration sample' }
  const hasText = Boolean(ctx.parsed?.raw_text) || (ctx.parsed?.work_history?.length ?? 0) > 0 || Boolean(c.ai_analysis)
  if (!hasText) return { skipped: 'no résumé text on record' }

  const before = await latestPanel(admin, candidateId)
  const priorGrade = (c.panel_grade as PanelGrade | null) ?? null
  const startedAt = Date.now()
  const panel = await runPanel(admin, ctx)
  const secondsSinceArrival = Math.max(1, Math.round((Date.now() - new Date(String(c.created_at)).getTime()) / 1000))
  const latencyLine =
    reason === 'created'
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

  const pastTheDoor = ['intro_requested', 'intro_sent', 'committee_call', 'warm', 'placed', 'post_committee_not_fit'].includes(String(c.journey_stage))
  const crossed = priorGrade && meetsBar(priorGrade) !== meetsBar(panel.grade as PanelGrade)

  if (sub?.slack_channel_id && sub.slack_message_ts) {
    await postThreadReply(
      sub.slack_channel_id as string,
      sub.slack_message_ts as string,
      `:brain: *Panel: ${esc(panel.grade)} · ${esc(panel.positioning ?? '')}.* ${esc(panel.summary ?? '')}\n${panel.highlights.map(h => `• ${esc(h)}`).join('\n')}${panel.flags.length ? `\n${panel.flags.map(f => `:warning: ${esc(f)}`).join('   ')}` : ''}\n${suggestedLine(panel, ctx.recipient, ctx.owner)}`,
    )
    return { grade: panel.grade, posted: 'submission thread', cost: panel.cost_usd }
  }

  if (before && c.desk_card_channel && c.desk_card_ts && (pastTheDoor || !crossed)) {
    // Still undecided: the card is rewritten in place so what Lily reads is
    // what the latest panel said, drafts included. Decided: a thread note only.
    const undecided = ['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro'].includes(String(c.journey_stage))
    if (undecided) {
      const card = buildDecisionCard({ candidate: c, panel, owner: ctx.owner, seats: ctx.seats, recipient: ctx.recipient, duplicateOf: null, latencyLine })
      await updateMessage(c.desk_card_channel as string, c.desk_card_ts as string, card.text, card.blocks)
    }
    if (priorGrade !== panel.grade) {
      await postThreadReply(c.desk_card_channel as string, c.desk_card_ts as string, `:brain: Re-graded after ${reason.replace(/_/g, ' ')}: *${esc(priorGrade ?? '?')} → ${esc(panel.grade)}*. ${esc(panel.suggested_reason ?? '')}`)
    }
    return { grade: panel.grade, posted: undecided ? 'card updated' : 'thread note', cost: panel.cost_usd }
  }
  if (pastTheDoor) return { grade: panel.grade, posted: 'nothing (past the door)', cost: panel.cost_usd }

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
  if (!posted.ok) throw new Error(`card not posted: ${posted.error}`)

  const reminderDays = await deskSetting<number[]>(admin, 'decision_reminder_days', [2, 7])
  await scheduleFollowup(admin, { candidateId, kind: 'decision_reminder', inDays: reminderDays[0] ?? 2 })
  const autosend = await deskSetting<number | null>(admin, 'bench_autosend_hours', null)
  if (autosend !== null && panel.suggested_decision === 'bench') {
    await scheduleFollowup(admin, { candidateId, kind: 'bench_autosend', inHours: autosend })
  }
  return { grade: panel.grade, posted: 'card', cost: panel.cost_usd, suggested: panel.suggested_decision }
}
