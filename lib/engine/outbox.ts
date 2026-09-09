/**
 * Side effects that must not repurchase the model call when they fail.
 *
 * A bench run whose Slack post fails is saved first, then its card is
 * queued here under an idempotency key; the next bench cron drains the queue
 * and posts from the saved run. The table is desk_outbox.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OutboxItem {
  id: string
  kind: string
  idempotency_key: string
  payload: Record<string, unknown>
  attempts: number
}

export async function enqueueOutbox(admin: SupabaseClient, item: { kind: string; idempotencyKey: string; payload: Record<string, unknown> }): Promise<boolean> {
  const { error } = await admin.from('desk_outbox').upsert({ kind: item.kind, idempotency_key: item.idempotencyKey, payload: item.payload }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  if (error) {
    console.warn(`[engine:outbox] could not queue ${item.kind}: ${error.message}`)
    return false
  }
  return true
}

const MAX_ATTEMPTS = 8

/** Run each due item through its handler; failures back off and are retried. */
export async function drainOutbox(admin: SupabaseClient, handlers: Record<string, (payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>>, limit = 10): Promise<{ delivered: number; failed: number }> {
  const { data, error } = await admin.from('desk_outbox').select('*').eq('status', 'queued').lte('next_attempt_at', new Date().toISOString()).order('created_at').limit(limit)
  if (error) return { delivered: 0, failed: 0 }
  let delivered = 0
  let failed = 0
  for (const row of (data ?? []) as OutboxItem[]) {
    const handler = handlers[row.kind]
    if (!handler) continue
    let result: { ok: boolean; error?: string }
    try {
      result = await handler(row.payload)
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
    const attempts = row.attempts + 1
    if (result.ok) {
      delivered++
      await admin.from('desk_outbox').update({ status: 'delivered', attempts, delivered_at: new Date().toISOString(), last_error: null }).eq('id', row.id)
    } else {
      failed++
      const giveUp = attempts >= MAX_ATTEMPTS
      await admin
        .from('desk_outbox')
        .update({ status: giveUp ? 'failed' : 'queued', attempts, last_error: (result.error ?? 'unknown').slice(0, 400), next_attempt_at: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString() })
        .eq('id', row.id)
    }
  }
  return { delivered, failed }
}
