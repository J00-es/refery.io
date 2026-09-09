/**
 * Human decisions, written as they happen, with actor, event, time and scope.
 * The table is candidate_human_decisions (part 2 of the migration); before
 * it exists the write is a no-op and the legacy columns still carry the
 * decision, so nothing is lost either way.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type DecisionKind = 'capability' | 'role_decision' | 'availability' | 'contact' | 'met'

export interface HumanDecision {
  candidateId: string
  kind: DecisionKind
  value: string
  actor: string
  sourceEvent: string
  sourceRef?: Record<string, unknown>
  decidedAt?: string
  jobId?: string | null
  scope?: 'global' | 'job'
  reason?: string | null
  rawText?: string | null
  /** A unique key for the event; the same event twice is one row. */
  dedupeKey: string
}

export async function recordHumanDecision(admin: SupabaseClient, d: HumanDecision): Promise<boolean> {
  const { error } = await admin.from('candidate_human_decisions').upsert(
    {
      candidate_id: d.candidateId,
      job_id: d.jobId ?? null,
      kind: d.kind,
      value: d.value,
      scope: d.scope ?? (d.jobId ? 'job' : 'global'),
      actor: d.actor,
      source_event: d.sourceEvent,
      source_ref: d.sourceRef ?? {},
      decided_at: d.decidedAt ?? new Date().toISOString(),
      reason: d.reason ?? null,
      raw_text: d.rawText ?? null,
      provenance: 'verified',
      dedupe_key: d.dedupeKey,
    },
    { onConflict: 'dedupe_key', ignoreDuplicates: true },
  )
  if (error) {
    console.warn(`[engine:decisions] not recorded (${d.kind}/${d.value}): ${error.message}`)
    return false
  }
  return true
}

/** Attributable evidence that Lily (or the team) actually spoke to the person. */
export async function metEvidence(admin: SupabaseClient, candidateIds: string[]): Promise<Set<string>> {
  const met = new Set<string>()
  if (!candidateIds.length) return met
  const { data, error } = await admin.from('candidate_human_decisions').select('candidate_id').eq('kind', 'met').is('revoked_at', null).in('candidate_id', candidateIds)
  if (!error) for (const r of data ?? []) met.add(r.candidate_id as string)
  else {
    // Before the migration: the same evidence from its original tables.
    const [{ data: notes }, { data: acts }] = await Promise.all([
      admin.from('recruiter_notes').select('candidate_id').eq('note_type', 'call').in('candidate_id', candidateIds),
      admin.from('candidate_activity_log').select('candidate_id').eq('activity_type', 'call_transcript').in('candidate_id', candidateIds),
    ])
    for (const r of notes ?? []) met.add(r.candidate_id as string)
    for (const r of acts ?? []) met.add(r.candidate_id as string)
  }
  return met
}

/** Do-not-contact and job-scoped rejections, the two inputs the policy needs beyond the candidate row. */
export async function policyInputsFor(admin: SupabaseClient, candidateId: string, jobId?: string | null): Promise<{ do_not_contact: boolean; rejected_for_job: boolean; overrides: { effect: 'allow_match' | 'block_match' | 'allow_contact' | 'block_contact'; scope: 'global' | 'job'; job_id: string | null }[] }> {
  const out = { do_not_contact: false, rejected_for_job: false, overrides: [] as { effect: 'allow_match' | 'block_match' | 'allow_contact' | 'block_contact'; scope: 'global' | 'job'; job_id: string | null }[] }
  const { data: dnc } = await admin.from('candidate_human_decisions').select('id').eq('candidate_id', candidateId).eq('kind', 'contact').eq('value', 'do_not_contact').is('revoked_at', null).limit(1)
  out.do_not_contact = !!dnc?.length
  const { data: ov } = await admin
    .from('candidate_eligibility_overrides')
    .select('effect, scope, job_id, expires_at')
    .eq('candidate_id', candidateId)
    .is('revoked_at', null)
    .order('created_at')
  out.overrides = ((ov ?? []) as { effect: 'allow_match' | 'block_match' | 'allow_contact' | 'block_contact'; scope: 'global' | 'job'; job_id: string | null; expires_at: string | null }[])
    .filter(o => !o.expires_at || new Date(o.expires_at) > new Date())
    .map(o => ({ effect: o.effect, scope: o.scope, job_id: o.job_id }))
  if (jobId) {
    const [{ data: sub }, { data: pipe }] = await Promise.all([
      admin.from('role_submissions').select('id').eq('candidate_id', candidateId).eq('job_id', jobId).eq('status', 'declined').limit(1),
      admin.from('job_candidate_pipeline').select('id, stage').eq('candidate_id', candidateId).eq('job_id', jobId),
    ])
    const rejectedPipe = (pipe ?? []).some(p => p.stage === 'rejected')
    let hmPassed = false
    const ids = (pipe ?? []).map(p => p.id as string)
    if (ids.length) {
      const { data: internal } = await admin.from('pipeline_internal_state').select('pipeline_id').in('pipeline_id', ids).eq('internal_stage', 'hm_passed')
      hmPassed = !!internal?.length
    }
    out.rejected_for_job = !!sub?.length || rejectedPipe || hmPassed
  }
  return out
}
