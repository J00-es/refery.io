/**
 * Queue claims with a lease. One statement in the database picks the rows
 * with FOR UPDATE SKIP LOCKED, so two workers never hold the same item and
 * never buy the same assessment. Completion is conditioned on the lease
 * token, and so is every write of a result: a worker renews its lease just
 * before persisting, and a worker whose lease is gone discards its result
 * instead of overwriting the current owner's.
 *
 * There is no unleased fallback. The claim functions are part 3 of the
 * migration and the migration lands before this code does.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PanelQueueItem {
  candidate_id: string
  reason: string
  status: string
  attempts: number
  error: string | null
  enqueued_at: string
  lease_token: string | null
}

export interface MatchQueueItem {
  job_id: string
  trigger: string
  status: string
  attempts: number
  error: string | null
  enqueued_at: string
  lease_token: string | null
}

export type QueueOutcome = 'succeeded' | 'empty' | 'deferred_budget' | 'input_error' | 'provider_error' | 'policy_excluded' | 'skipped' | 'failed' | 'lease_lost'

export class LeaseLostError extends Error {
  constructor(public readonly key: string) {
    super(`lease lost for ${key}: another worker owns this item now`)
    this.name = 'LeaseLostError'
  }
}

export async function claimPanelItems(admin: SupabaseClient, limit: number, only?: string | null, maxAttempts = 3): Promise<PanelQueueItem[]> {
  const { data, error } = await admin.rpc('claim_panel_queue', { p_limit: limit, p_lease_seconds: 360, p_candidate_id: only ?? null, p_max_attempts: maxAttempts })
  if (error) throw new Error(`claim_panel_queue: ${error.message}`)
  return (data ?? []) as PanelQueueItem[]
}

/** Extend the lease; false means it was lost (expired and reclaimed, or completed by someone else). */
export async function renewPanelLease(admin: SupabaseClient, candidateId: string, lease: string, seconds = 300): Promise<boolean> {
  const { data, error } = await admin.rpc('renew_panel_lease', { p_candidate_id: candidateId, p_lease: lease, p_lease_seconds: seconds })
  if (error) throw new Error(`renew_panel_lease: ${error.message}`)
  return data === true
}

export async function completePanelItem(
  admin: SupabaseClient,
  item: PanelQueueItem,
  result: { status: 'done' | 'failed' | 'skipped' | 'queued'; outcome: QueueOutcome; error?: string | null; retryInSeconds?: number | null },
): Promise<boolean> {
  const { data, error } = await admin.rpc('complete_panel_queue', {
    p_candidate_id: item.candidate_id,
    p_lease: item.lease_token,
    p_status: result.status,
    p_outcome: result.outcome,
    p_error: result.error ?? null,
    p_retry_in_seconds: result.retryInSeconds ?? null,
  })
  if (error) throw new Error(`complete_panel_queue: ${error.message}`)
  return data === true
}

export async function claimMatchItems(admin: SupabaseClient, limit: number, maxAttempts = 3): Promise<MatchQueueItem[]> {
  const { data, error } = await admin.rpc('claim_match_queue', { p_limit: limit, p_lease_seconds: 480, p_max_attempts: maxAttempts })
  if (error) throw new Error(`claim_match_queue: ${error.message}`)
  return (data ?? []) as MatchQueueItem[]
}

export async function renewMatchLease(admin: SupabaseClient, jobId: string, lease: string, seconds = 300): Promise<boolean> {
  const { data, error } = await admin.rpc('renew_match_lease', { p_job_id: jobId, p_lease: lease, p_lease_seconds: seconds })
  if (error) throw new Error(`renew_match_lease: ${error.message}`)
  return data === true
}

export async function completeMatchItem(
  admin: SupabaseClient,
  item: MatchQueueItem,
  result: { status: 'done' | 'failed' | 'queued'; outcome: QueueOutcome; error?: string | null; retryInSeconds?: number | null },
): Promise<boolean> {
  const { data, error } = await admin.rpc('complete_match_queue', {
    p_job_id: item.job_id,
    p_lease: item.lease_token,
    p_status: result.status,
    p_outcome: result.outcome,
    p_error: result.error ?? null,
    p_retry_in_seconds: result.retryInSeconds ?? null,
  })
  if (error) throw new Error(`complete_match_queue: ${error.message}`)
  return data === true
}
