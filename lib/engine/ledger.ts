/**
 * The shared cost authority, from TypeScript.
 *
 * Every paid call reserves a worst case before dispatch and finalises with
 * what the provider reported; a timeout after dispatch is recorded as
 * uncertain and kept on the books until reconciled. The ledger is
 * brain_ai_usage, the envelope is engine_settings (part 3 of the migration).
 *
 * The ledger is not optional. No client, a missing RPC, an error, an empty
 * or malformed row: each one defers the call without dispatching it. A
 * deferral is never a rejection of a person; callers queue the work with the
 * reason and retry later. Tests inject an in-memory adapter through
 * lib/engine/paid.ts; nothing here opens a network connection on its own.
 */

export type LedgerSource = 'desk' | 'parser' | 'transcript' | 'brain' | 'embedding' | 'benchmark' | 'legacy_api' | 'onboarding'

/** The one method the ledger needs from a Supabase client. */
export interface LedgerAdapter {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>
}

export interface Reservation {
  allowed: boolean
  /** Not allowed, and the right response is to queue and retry, not to fail the person. */
  deferred: boolean
  usageId: string | null
  remainingUsd: number | null
  reason: string
}

export class BudgetDeferredError extends Error {
  constructor(public readonly reservation: Reservation) {
    super(`budget: ${reservation.reason}`)
    this.name = 'BudgetDeferredError'
  }
}

const deferred = (reason: string): Reservation => ({ allowed: false, deferred: true, usageId: null, remainingUsd: null, reason })

export async function reserve(
  ledger: LedgerAdapter | null,
  input: { source: LedgerSource; task: string; model: string; estimateUsd: number; discretionary?: boolean; metadata?: Record<string, unknown> },
): Promise<Reservation> {
  if (!ledger) return deferred('no_ledger_client')
  let res: { data: unknown; error: { message: string } | null }
  try {
    res = await ledger.rpc('engine_reserve_budget', {
      p_source: input.source,
      p_task: input.task,
      p_model: input.model,
      p_estimated_usd: input.estimateUsd,
      p_discretionary: input.discretionary ?? false,
      p_metadata: input.metadata ?? {},
    })
  } catch (err) {
    return deferred(`ledger_error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`)
  }
  if (res.error) return deferred(`ledger_error: ${res.error.message.slice(0, 120)}`)
  const row = (Array.isArray(res.data) ? res.data[0] : res.data) as Record<string, unknown> | null | undefined
  if (!row || typeof row !== 'object' || typeof row.allowed !== 'boolean') return deferred('ledger_malformed')
  if (row.allowed && typeof row.usage_id !== 'string') return deferred('ledger_malformed')
  return {
    allowed: row.allowed,
    deferred: !row.allowed,
    usageId: typeof row.usage_id === 'string' ? row.usage_id : null,
    remainingUsd: typeof row.remaining_usd === 'number' ? row.remaining_usd : row.remaining_usd != null ? Number(row.remaining_usd) : null,
    reason: typeof row.reason === 'string' ? row.reason : row.allowed ? 'ok' : 'refused',
  }
}

export interface FinalizeOutcome {
  status: 'completed' | 'failed' | 'uncertain'
  actualUsd: number
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  reasoningTokens?: number
  providerRequestId?: string | null
  attempts?: number
}

/** Returns false when the ledger could not be told; the caller logs it and the row stays reserved for reconciliation. */
export async function finalize(ledger: LedgerAdapter | null, usageId: string | null, outcome: FinalizeOutcome): Promise<boolean> {
  if (!ledger || !usageId) return false
  try {
    const { error } = await ledger.rpc('engine_finalize_budget', {
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
    if (error) {
      console.warn(`[engine:ledger] finalize failed for ${usageId}: ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(`[engine:ledger] finalize threw for ${usageId}: ${err instanceof Error ? err.message : err}`)
    return false
  }
}

export async function budgetStatus(ledger: LedgerAdapter): Promise<Record<string, unknown> | null> {
  const { data, error } = await ledger.rpc('engine_budget_status')
  if (error) return null
  return (data as Record<string, unknown>) ?? null
}
