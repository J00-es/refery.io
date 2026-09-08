/**
 * The scout application backlog, ten at a time.
 *
 * Rows that never reached Slack (they predate the trigger) and rows that did
 * and were never decided are the same problem: somebody applied and heard
 * nothing. This plans a decision per row with the same rules the single card
 * shows, posts them as batch cards, and applies them through decideApplication
 * on Lily's :+1:, so the emails, the three-minute cancel window and the ledger
 * are the ones intake already uses.
 *
 * Defaults, in order:
 *   test or internal          invalid, closed now, no card, no email
 *   already an active partner already_partner, closed now, no email
 *   no SF or NY in reach      no_match (email F)
 *   otherwise                 approve (email B, or C for a recruiter with a preview)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ageDays, ageLabel, postBatch, registerBatchApplier, type BatchItem } from '@/lib/batches'
import { scoutPriority, type ScoutApplication } from '@/lib/intake'
import { reconcile } from '@/lib/onboarding/identity'
import { DECISION_LABEL, LATE_AFTER_DAYS, contributionMode, decideApplication, type Decision } from '@/lib/onboarding/decisions'
import { esc } from '@/lib/slack-bot'

const PER_CARD = 10
const DECISIONS = ['approve', 'call', 'clarify', 'no_match', 'decline']
const CALL_MAP: Record<string, Decision> = { approve: 'approve', call: 'approve_call', clarify: 'clarify', no_match: 'no_match', decline: 'decline' }

type Row = ScoutApplication & { status: string | null; slack_message_ts: string | null; hiring_roles: string[] | null }

function defaultFor(a: Row): { decision: string; why: string } {
  const p = scoutPriority(a)
  const sfny = p.reasons.includes('SF/NY in reach')
  if (!sfny) return { decision: 'no_match', why: 'no SF or NY' }
  const mode = contributionMode(a)
  return { decision: 'approve', why: `${p.priority.toLowerCase()} priority, ${mode === 'recruit' ? 'recruiter' : 'scout'}${p.reasons.length > 1 ? `: ${p.reasons.filter(r => r !== 'SF/NY in reach').join(', ')}` : ''}` }
}

export interface ScoutBacklogPlan {
  closedNow: { invalid: number; alreadyPartner: number }
  cards: number
  rows: number
  errors: string[]
}

export async function postScoutBacklog(admin: SupabaseClient, channel: string, limit = 60): Promise<ScoutBacklogPlan> {
  const out: ScoutBacklogPlan = { closedNow: { invalid: 0, alreadyPartner: 0 }, cards: 0, rows: 0, errors: [] }

  // Rows already on an open batch card are not listed twice.
  const { data: open } = await admin.from('slack_batches').select('items').eq('kind', 'scout_backlog').eq('status', 'open')
  const onCards = new Set<string>()
  for (const b of open ?? []) for (const i of (b.items as BatchItem[]) ?? []) onCards.add(i.id)

  const { data: rows, error } = await admin
    .from('scout_applications')
    .select('*')
    .in('status', ['new', 'clarification'])
    .order('created_at', { ascending: true })
    .limit(limit + onCards.size)
  if (error) {
    out.errors.push(error.message)
    return out
  }

  const items: BatchItem[] = []
  for (const r of (rows ?? []) as Row[]) {
    if (onCards.has(r.id)) continue
    const recon = await reconcile(admin, { email: r.email, linkedin_url: r.linkedin_url, full_name: r.full_name }, r.id)
    const now = new Date().toISOString()
    if (recon.isTest || recon.isInternal) {
      await admin.from('scout_applications').update({ status: 'invalid', decision: 'invalid', decided_by: 'backlog', decided_at: now }).eq('id', r.id)
      out.closedNow.invalid++
      continue
    }
    if (recon.account?.matchedBy === 'email' && recon.account.status === 'active') {
      await admin.from('scout_applications').update({ status: 'already_partner', decision: 'already_partner', decided_by: 'backlog', decided_at: now, partner_user_id: recon.account.userId }).eq('id', r.id)
      out.closedNow.alreadyPartner++
      continue
    }
    const d = defaultFor(r)
    const p = scoutPriority(r)
    const cities = [...(r.cities_us ?? []), ...(r.cities_europe ?? []), ...(r.cities_row ?? [])].slice(0, 3).join(', ')
    const hint = recon.account ? ` · _may be <mailto:${esc(recon.account.email)}|${esc(recon.account.email)}> (${recon.account.status}), by LinkedIn_` : recon.earlier ? ` · _applied before (${recon.earlier.status ?? 'unknown'})_` : ''
    items.push({
      n: 0,
      id: r.id,
      label: `<${esc(r.linkedin_url)}|${esc(r.full_name)}> · ${ageLabel(r.created_at)} · ${p.priority} · ${esc(cities || 'no cities')} · ${esc((r.hiring_roles ?? [])[0] ?? 'background not given')}${hint} · _${esc(d.why)}_`,
      decision: d.decision,
    })
    if (items.length >= limit) break
  }
  out.rows = items.length

  for (let i = 0; i < items.length; i += PER_CARD) {
    const slice = items.slice(i, i + PER_CARD).map((it, k) => ({ ...it, n: k + 1 }))
    const oldest = slice[0]
    const res = await postBatch(admin, {
      kind: 'scout_backlog',
      channel,
      title: `Scout applications waiting · ${slice.length} of ${items.length}${oldest ? `, oldest ${ageLabel((rows as Row[]).find(r => r.id === oldest.id)?.created_at ?? new Date().toISOString())}` : ''}`,
      intro: 'Each line is what the rules would decide. approve sends the start email, call adds the 15 minutes, no_match says where our searches are, decline says no. Applications older than ten days get one line apologising for the wait.',
      items: slice,
      decisions: DECISIONS,
      footer: 'Emails queue three minutes after :+1: and can still be stopped with `cancel` in this thread, one line per application.',
    })
    if (res.ok) out.cards++
    else out.errors.push(res.error ?? 'post failed')
  }
  return out
}

registerBatchApplier('scout_backlog', async (admin, { batch, slackUser }) => {
  const lines: string[] = []
  const counts: Record<string, number> = {}
  for (const item of batch.items) {
    if (item.decision === 'skip') {
      lines.push(`${item.n}. skipped`)
      counts.skip = (counts.skip ?? 0) + 1
      continue
    }
    const decision = CALL_MAP[item.decision]
    if (!decision) {
      lines.push(`${item.n}. unknown decision \`${item.decision}\`, left alone`)
      continue
    }
    const { data: row } = await admin.from('scout_applications').select('created_at, full_name, status').eq('id', item.id).maybeSingle()
    if (!row) {
      lines.push(`${item.n}. row is gone`)
      continue
    }
    const late = ageDays(row.created_at as string) > LATE_AFTER_DAYS
    const r = await decideApplication(admin, { applicationId: item.id, decision, by: slackUser, slack: { channel: batch.slack_channel_id, ts: batch.slack_message_ts }, late })
    counts[item.decision] = (counts[item.decision] ?? 0) + 1
    lines.push(
      r.ok
        ? `${item.n}. ${esc(row.full_name as string)}: *${DECISION_LABEL[decision]}*${r.queued ? `, email ${r.queued} queued` : ''}${r.note ? ` (${esc(r.note)})` : ''}`
        : `${item.n}. ${esc(row.full_name as string)}: not applied, ${esc(r.error ?? 'unknown')}`,
    )
  }
  return { lines, summary: { counts } }
})
