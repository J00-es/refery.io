/**
 * Batch cards: one Slack message that decides many rows at once.
 *
 * The intake cards decide one person per reaction, which is right when a
 * handful arrive a week and wrong when ninety are waiting. A batch card lists
 * up to ten rows, each with the decision the rules would take, numbered. One
 * :+1: applies every line as written; a thread reply such as `3 skip` or
 * `5 decline` changes one line before that; :-1: closes the card and touches
 * nothing. The rules never act on their own: a card that nobody reacts to
 * stays a card.
 *
 * Kinds and their appliers live in lib/backlog/*, lib/agreement-chase.ts and
 * lib/founder-outbound.ts. This module owns the card, the row and the parsing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addReaction, esc, postMessage, postThreadReply, updateMessage, type SlackBlock } from '@/lib/slack-bot'
import { cancelQueued } from '@/lib/comms'

export type BatchKind = 'scout_backlog' | 'lead_backlog' | 'agreement_chase' | 'founder_outreach'

export interface BatchItem {
  /** 1-based line number on the card. */
  n: number
  /** The row this line decides. */
  id: string
  /** What the card shows for the line, Slack mrkdwn. */
  label: string
  /** The decision the applier will take. `skip` always means "leave it alone". */
  decision: string
  /** Anything the applier needs at apply time, kept small. */
  data?: Record<string, unknown>
}

export interface BatchRow {
  id: string
  kind: BatchKind
  slack_channel_id: string
  slack_message_ts: string
  items: BatchItem[]
  status: 'open' | 'applied' | 'skipped'
}

export interface BatchCard {
  kind: BatchKind
  channel: string
  title: string
  /** One or two sentences under the title. */
  intro: string
  items: BatchItem[]
  /** The legend: which decisions a thread reply may set. */
  decisions: string[]
  footer?: string
}

const APPROVE = new Set(['+1', 'thumbsup', 'thumbsup_all'])
const REJECT = new Set(['-1', 'thumbsdown'])

function blocksFor(card: BatchCard, status: BatchRow['status'] = 'open', by?: string | null): SlackBlock[] {
  const lines = card.items.map(i => `*${i.n}.* ${i.label}  →  \`${i.decision}\``)
  const head = status === 'open' ? card.title : status === 'applied' ? `${card.title}  ·  applied${by ? ` by <@${by}>` : ''}` : `${card.title}  ·  skipped`
  const legend =
    status === 'open'
      ? `:+1: applies every line as written  ·  :-1: closes the card, nothing happens  ·  reply \`3 skip\` or \`3 ${card.decisions[0] ?? 'decline'}\` to change one line first (${card.decisions.map(d => `\`${d}\``).join(', ')}, \`skip\`)`
      : 'Closed. Reactions here change nothing now.'
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${esc(head)}*\n${esc(card.intro)}` } },
    ...chunk(lines, 2800).map(text => ({ type: 'section', text: { type: 'mrkdwn', text } })),
    ...(card.footer ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: card.footer }] }] : []),
    { type: 'context', elements: [{ type: 'mrkdwn', text: legend }] },
  ]
}

/** Slack caps a section at 3000 characters; a card with ten long lines can pass it. */
function chunk(lines: string[], max: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const l of lines) {
    if (cur && cur.length + l.length + 1 > max) {
      out.push(cur)
      cur = ''
    }
    cur = cur ? `${cur}\n${l}` : l
  }
  if (cur) out.push(cur)
  return out
}

export async function postBatch(admin: SupabaseClient, card: BatchCard): Promise<{ ok: boolean; id?: string; ts?: string; error?: string }> {
  if (!card.items.length) return { ok: false, error: 'no items' }
  const posted = await postMessage(card.channel, card.title, blocksFor(card))
  if (!posted.ok || !posted.ts) return { ok: false, error: posted.error ?? 'post failed' }
  const channel = posted.channel ?? card.channel
  const { data, error } = await admin
    .from('slack_batches')
    .insert({ kind: card.kind, slack_channel_id: channel, slack_message_ts: posted.ts, items: card.items, result: { title: card.title, intro: card.intro, decisions: card.decisions, footer: card.footer ?? null } })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  await addReaction(channel, posted.ts, '+1')
  await addReaction(channel, posted.ts, '-1')
  return { ok: true, id: data.id as string, ts: posted.ts }
}

export async function batchForSlackMessage(admin: SupabaseClient, channel: string, ts: string): Promise<(BatchRow & { card: Omit<BatchCard, 'items' | 'kind' | 'channel'> }) | null> {
  const { data } = await admin.from('slack_batches').select('*').eq('slack_channel_id', channel).eq('slack_message_ts', ts).maybeSingle()
  if (!data) return null
  const r = data as { result?: { title?: string; intro?: string; decisions?: string[]; footer?: string | null } | null }
  return {
    ...(data as BatchRow),
    card: { title: r.result?.title ?? 'Batch', intro: r.result?.intro ?? '', decisions: r.result?.decisions ?? [], footer: r.result?.footer ?? undefined },
  }
}

export type BatchApplier = (
  admin: SupabaseClient,
  input: { batch: BatchRow; slackUser: string },
) => Promise<{ lines: string[]; summary: Record<string, unknown> }>

const appliers: Partial<Record<BatchKind, BatchApplier>> = {}

/** Each kind registers once, at module load, from the file that owns it. */
export function registerBatchApplier(kind: BatchKind, fn: BatchApplier): void {
  appliers[kind] = fn
}

/**
 * :+1: applies, :-1: skips. Returns false when the message is not a batch card
 * so the router moves on. The claim is the status flip, so a second reaction
 * or a Slack retry finds the card already closed.
 */
export async function handleBatchReaction(
  admin: SupabaseClient,
  input: { reaction: string; slackUser: string; channel: string; ts: string },
): Promise<boolean> {
  const batch = await batchForSlackMessage(admin, input.channel, input.ts)
  if (!batch) return false
  const approve = APPROVE.has(input.reaction)
  const reject = REJECT.has(input.reaction)
  if (!approve && !reject) return true

  const { data: claimed } = await admin
    .from('slack_batches')
    .update({ status: approve ? 'applied' : 'skipped', applied_by: input.slackUser, applied_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', batch.id)
    .eq('status', 'open')
    .select('id')
    .maybeSingle()
  if (!claimed) {
    await postThreadReply(input.channel, input.ts, `Already ${batch.status}, so that reaction changed nothing.`)
    return true
  }

  if (reject) {
    await updateMessage(input.channel, input.ts, batch.card.title, blocksFor({ ...batch.card, kind: batch.kind, channel: input.channel, items: batch.items }, 'skipped'))
    await postThreadReply(input.channel, input.ts, `:-1: <@${input.slackUser}> closed this card. Nothing was sent or changed.`)
    return true
  }

  const apply = appliers[batch.kind]
  if (!apply) {
    await postThreadReply(input.channel, input.ts, `:warning: No applier is registered for ${batch.kind}. Nothing happened.`)
    return true
  }
  try {
    const out = await apply(admin, { batch, slackUser: input.slackUser })
    await admin.from('slack_batches').update({ result: { ...(batch as unknown as { result?: Record<string, unknown> }).result, ...out.summary } }).eq('id', batch.id)
    await updateMessage(input.channel, input.ts, batch.card.title, blocksFor({ ...batch.card, kind: batch.kind, channel: input.channel, items: batch.items }, 'applied', input.slackUser))
    for (const text of chunk(out.lines, 3500)) await postThreadReply(input.channel, input.ts, text)
  } catch (err) {
    await postThreadReply(input.channel, input.ts, `:warning: Applying stopped part way: ${err instanceof Error ? err.message : 'unknown error'}. Lines above this one went through; the rest did not.`)
  }
  return true
}

/**
 * `3 skip`, `3 decline`, `3, 5 and 7 skip`, `all skip`. Anything else on a
 * batch thread is conversation. Returns false when the thread is not a batch.
 */
export async function handleBatchThreadReply(
  admin: SupabaseClient,
  input: { text: string; slackUser: string; channel: string; threadTs: string },
): Promise<boolean> {
  const batch = await batchForSlackMessage(admin, input.channel, input.threadTs)
  if (!batch) return false
  if (batch.status !== 'open' && !/^cancel\b/i.test(input.text.trim())) {
    await postThreadReply(input.channel, input.threadTs, `This card is already ${batch.status}; edits no longer apply.`)
    return true
  }
  const allowed = new Set([...batch.card.decisions, 'skip'])
  const text = input.text.trim().toLowerCase()

  // `cancel` or `cancel 3, 5`: stop the emails an applied scout card queued,
  // inside their three-minute window. The decisions stand, as on a single card.
  if (/^cancel\b/.test(text)) {
    if (batch.kind !== 'scout_backlog') {
      await postThreadReply(input.channel, input.threadTs, 'Nothing here is queued; the sends on this card go out at once.')
      return true
    }
    const numbers = [...text.matchAll(/\d+/g)].map(x => Number(x[0]))
    const targets = batch.items.filter(i => !numbers.length || numbers.includes(i.n))
    let n = 0
    for (const item of targets) n += await cancelQueued(admin, { applicationId: item.id }, `cancelled by <@${input.slackUser}> on the batch card`)
    await postThreadReply(input.channel, input.threadTs, n ? `:no_entry_sign: Cancelled ${n} queued email${n === 1 ? '' : 's'}. The decisions stand; nothing was sent.` : 'Nothing was queued, so nothing to cancel.')
    return true
  }

  const m = text.match(/^(all|[\d\s,and]+?)\s*[:=→-]?\s*([a-z_]+)\s*$/)
  if (!m || !allowed.has(m[2])) {
    await postThreadReply(input.channel, input.threadTs, `I read edits as \`<line> <decision>\`, for example \`3 skip\`. Decisions here: ${[...allowed].map(d => `\`${d}\``).join(', ')}.`)
    return true
  }
  const decision = m[2]
  const numbers = m[1] === 'all' ? batch.items.map(i => i.n) : [...m[1].matchAll(/\d+/g)].map(x => Number(x[0]))
  const changed: number[] = []
  const items = batch.items.map(i => {
    if (!numbers.includes(i.n) || i.decision === decision) return i
    changed.push(i.n)
    return { ...i, decision }
  })
  if (!changed.length) {
    await postThreadReply(input.channel, input.threadTs, 'No line changed; those were already set that way or do not exist.')
    return true
  }
  await admin.from('slack_batches').update({ items, updated_at: new Date().toISOString() }).eq('id', batch.id)
  await updateMessage(input.channel, input.threadTs, batch.card.title, blocksFor({ ...batch.card, kind: batch.kind, channel: input.channel, items }))
  await postThreadReply(input.channel, input.threadTs, `Line${changed.length === 1 ? '' : 's'} ${changed.join(', ')} now \`${decision}\`. :+1: on the card when it reads right.`)
  return true
}

export function ageDays(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

export function ageLabel(iso: string): string {
  const d = ageDays(iso)
  if (d < 1) return 'today'
  if (d < 14) return `${d}d`
  if (d < 60) return `${Math.round(d / 7)}w`
  return `${Math.round(d / 30)}mo`
}
