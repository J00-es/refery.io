/**
 * Queue claims with a lease. One statement in the database picks the rows
 * with FOR UPDATE SKIP LOCKED, so two workers never hold the same item and
 * never buy the same assessment. Completion is conditioned on the lease
 * token, so a worker that lost its lease cannot overwrite a newer owner's
 * result.
 *
 * Before the migration lands the claim RPC is missing; the helpers then fall
 * back to the old select-then-update path, which is racy but is what runs
 * today. The fallback is logged so it is visible.
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

export type QueueOutcome = 'succeeded' | 'empty' | 'deferred_budget' | 'input_error' | 'provider_error' | 'policy_excluded' | 'skipped' | 'failed'

const missingRpc = (msg: string) => /could not find the function|does not exist|PGRST202/i.test(msg)

export async function claimPanelItems(admin: SupabaseClient, limit: number, only?: string | null, maxAttempts = 3): Promise<{ items: PanelQueueItem[]; leased: boolean }> {
  const { data, error } = await admin.rpc('claim_panel_queue', { p_limit: limit, p_lease_seconds: 360, p_candidate_id: only ?? null, p_max_attempts: maxAttempts })
  if (!error) return { items: (data ?? []) as PanelQueueItem[], leased: true }
  if (!missingRpc(error.message)) throw new Error(`claim_panel_queue: ${error.message}`)
  console.warn('[engine:queue] claim_panel_queue missing; using the unleased path')
  // legacy path
  await admin.from('candidate_panel_queue').update({ status: 'queued' }).eq('status', 'running').lt('started_at', new Date(Date.now() - 6 * 60_000).toISOString())
  let q = admin.from('candidate_panel_queue').select('*').eq('status', 'queued').lt('attempts', maxAttempts).order('enqueued_at').limit(limit)
  if (only) q = admin.from('candidate_panel_queue').select('*').eq('candidate_id', only).limit(1)
  const { data: rows } = await q
  const items: PanelQueueItem[] = []
  for (const item of (rows ?? []) as PanelQueueItem[]) {
    await admin.from('candidate_panel_queue').update({ status: 'running', started_at: new Date().toISOString(), attempts: item.attempts + 1 }).eq('candidate_id', item.candidate_id)
    items.push({ ...item, attempts: item.attempts + 1, lease_token: null })
  }
  return { items, leased: false }
}

export async function completePanelItem(
  admin: SupabaseClient,
  item: PanelQueueItem,
  result: { status: 'done' | 'failed' | 'skipped' | 'queued'; outcome: QueueOutcome; error?: string | null; retryInSeconds?: number | null },
): Promise<boolean> {
  if (item.lease_token) {
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
  const patch: Record<string, unknown> = { status: result.status, error: result.error ?? null, finished_at: ['done', 'failed', 'skipped'].includes(result.status) ? new Date().toISOString() : null }
  await admin.from('candidate_panel_queue').update(patch).eq('candidate_id', item.candidate_id)
  return true
}

export async function claimMatchItems(admin: SupabaseClient, limit: number, maxAttempts = 3): Promise<{ items: MatchQueueItem[]; leased: boolean }> {
  const { data, error } = await admin.rpc('claim_match_queue', { p_limit: limit, p_lease_seconds: 480, p_max_attempts: maxAttempts })
  if (!error) return { items: (data ?? []) as MatchQueueItem[], leased: true }
  if (!missingRpc(error.message)) throw new Error(`claim_match_queue: ${error.message}`)
  console.warn('[engine:queue] claim_match_queue missing; using the unleased path')
  await admin.from('search_match_queue').update({ status: 'queued' }).eq('status', 'running').lt('enqueued_at', new Date(Date.now() - 8 * 60_000).toISOString())
  const { data: rows } = await admin.from('search_match_queue').select('*').eq('status', 'queued').lt('attempts', maxAttempts).order('enqueued_at').limit(limit)
  const items: MatchQueueItem[] = []
  for (const item of (rows ?? []) as MatchQueueItem[]) {
    await admin.from('search_match_queue').update({ status: 'running', attempts: item.attempts + 1, enqueued_at: new Date().toISOString() }).eq('job_id', item.job_id)
    items.push({ ...item, attempts: item.attempts + 1, lease_token: null })
  }
  return { items, leased: false }
}

export async function completeMatchItem(
  admin: SupabaseClient,
  item: MatchQueueItem,
  result: { status: 'done' | 'failed' | 'queued'; outcome: QueueOutcome; error?: string | null; retryInSeconds?: number | null },
): Promise<boolean> {
  if (item.lease_token) {
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
  await admin.from('search_match_queue').update({ status: result.status, error: result.error ?? null, finished_at: result.status === 'queued' ? null : new Date().toISOString() }).eq('job_id', item.job_id)
  return true
}
