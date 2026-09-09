/**
 * The shared cost authority, from TypeScript.
 *
 * Every paid call reserves a worst case before dispatch and finalises with
 * what the provider reported; a timeout after dispatch is recorded as
 * uncertain and kept on the books until reconciled. The ledger is
 * brain_ai_usage, the envelope is engine_settings (part 3 of the migration).
 *
 * Until the migration is applied the RPCs do not exist; the ledger then logs
 * and lets the call through, so a deploy that lands before the SQL does not
 * take the desk down. `ENGINE_LEDGER=strict` makes a missing ledger a failure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type LedgerSource = 'desk' | 'parser' | 'transcript' | 'brain' | 'embedding' | 'benchmark'

export interface Reservation {
  allowed: boolean
  deferred: boolean
  usageId: string | null
  remainingUsd: number | null
  reason: string
  /** The ledger RPC was missing or failed; the call went ahead unrecorded. */
  unrecorded: boolean
}

export class BudgetDeferredError extends Error {
  constructor(public readonly reservation: Reservation) {
    super(`budget: ${reservation.reason}`)
    this.name = 'BudgetDeferredError'
  }
}

export async function reserve(
  admin: SupabaseClient | null,
  input: { source: LedgerSource; task: string; model: string; estimateUsd: number; discretionary?: boolean; metadata?: Record<string, unknown> },
): Promise<Reservation> {
  if (!admin) return { allowed: true, deferred: false, usageId: null, remainingUsd: null, reason: 'no_ledger_client', unrecorded: true }
  const { data, error } = await admin.rpc('engine_reserve_budget', {
    p_source: input.source,
    p_task: input.task,
    p_model: input.model,
    p_estimated_usd: input.estimateUsd,
    p_discretionary: input.discretionary ?? false,
    p_metadata: input.metadata ?? {},
  })
  if (error) {
    if (process.env.ENGINE_LEDGER === 'strict') throw new Error(`ledger unavailable: ${error.message}`)
    console.warn(`[engine:ledger] reserve failed, call proceeds unrecorded: ${error.message}`)
    return { allowed: true, deferred: false, usageId: null, remainingUsd: null, reason: 'ledger_error', unrecorded: true }
  }
  const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; deferred: boolean; usage_id: string; remaining_usd: number; reason: string } | undefined
  if (!row) return { allowed: true, deferred: false, usageId: null, remainingUsd: null, reason: 'ledger_empty', unrecorded: true }
  return { allowed: !!row.allowed, deferred: !!row.deferred, usageId: row.usage_id ?? null, remainingUsd: row.remaining_usd ?? null, reason: row.reason ?? 'ok', unrecorded: false }
}

export async function finalize(
  admin: SupabaseClient | null,
  usageId: string | null,
  outcome: { status: 'completed' | 'failed' | 'uncertain'; actualUsd: number; inputTokens: number; outputTokens: number; cachedTokens?: number; reasoningTokens?: number; providerRequestId?: string | null; attempts?: number },
): Promise<void> {
  if (!admin || !usageId) return
  const { error } = await admin.rpc('engine_finalize_budget', {
    p_usage_id: usageId,
    p_actual_usd: outcome.actualUsd,
    p_input_tokens: outcome.inputTokens,
    p_output_tokens: outcome.outputTokens,
    p_status: outcome.status,
    p_cached_tokens: outcome.cachedTokens ?? null,
    p_reasoning_tokens: outcome.reasoningTokens ?? null,
    p_provider_request_id: outcome.providerRequestId ?? null,
    p_attempts: outcome.attempts ?? null,
  })
  if (error) console.warn(`[engine:ledger] finalize failed for ${usageId}: ${error.message}`)
}

export async function budgetStatus(admin: SupabaseClient): Promise<Record<string, unknown> | null> {
  const { data, error } = await admin.rpc('engine_budget_status')
  if (error) return null
  return (data as Record<string, unknown>) ?? null
}
