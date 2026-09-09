/**
 * Side effects that must not repurchase the model call when they fail.
 *
 * A bench run whose Slack post fails is saved first, then its card is
 * queued here under an idempotency key; the next cron claims due items
 * under a lease (one statement, SKIP LOCKED, so two drainers never send the
 * same message) and posts from the saved run. Completion is conditioned on
 * the lease. A handler that cannot tell whether its send landed returns
 * `uncertain`; the item is parked for a human rather than resent.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface OutboxItem {
  id: string
  kind: string
  idempotency_key: string
  payload: Record<string, unknown>
  attempts: number
  lease_token: string | null
}

export type OutboxResult = { ok: true } | { ok: false; error?: string; uncertain?: boolean }

export async function enqueueOutbox(admin: SupabaseClient, item: { kind: string; idempotencyKey: string; payload: Record<string, unknown> }): Promise<boolean> {
  const { error } = await admin.from('desk_outbox').upsert({ kind: item.kind, idempotency_key: item.idempotencyKey, payload: item.payload }, { onConflict: 'idempotency_key', ignoreDuplicates: true })
  if (error) {
    console.warn(`[engine:outbox] could not queue ${item.kind}: ${error.message}`)
    return false
  }
  return true
}

/** Claim due items under a lease and run each through its handler. */
export async function drainOutbox(admin: SupabaseClient, handlers: Record<string, (payload: Record<string, unknown>) => Promise<OutboxResult>>, limit = 10): Promise<{ delivered: number; failed: number; uncertain: number }> {
  const out = { delivered: 0, failed: 0, uncertain: 0 }
  const { data, error } = await admin.rpc('claim_outbox', { p_limit: limit, p_lease_seconds: 120 })
  if (error) {
    console.warn(`[engine:outbox] claim failed: ${error.message}`)
    return out
  }
  for (const row of (data ?? []) as OutboxItem[]) {
    const handler = handlers[row.kind]
    let result: OutboxResult
    if (!handler) result = { ok: false, error: `no handler for ${row.kind}` }
    else {
      try {
        result = await handler(row.payload)
      } catch (err) {
        result = { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
    const status = result.ok ? 'delivered' : result.uncertain ? 'uncertain' : 'queued'
    if (result.ok) out.delivered++
    else if (result.uncertain) out.uncertain++
    else out.failed++
    const { data: done, error: completeError } = await admin.rpc('complete_outbox', {
      p_id: row.id,
      p_lease: row.lease_token,
      p_status: status,
      p_error: result.ok ? null : (result.error ?? 'unknown').slice(0, 400),
    })
    if (completeError) console.warn(`[engine:outbox] complete failed for ${row.id}: ${completeError.message}`)
    else if (done !== true) console.warn(`[engine:outbox] lease lost for ${row.id}; outcome not recorded by this worker`)
  }
  return out
}
