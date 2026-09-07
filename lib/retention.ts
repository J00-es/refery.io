/**
 * Retention and deletion, per counsel's Document 4.
 *
 * The rule this file exists to enforce is that a candidate profile is kept
 * while it is doing something, and not one day longer. Twenty-four months from
 * genuine contact, matching the window a submission is protected for, so the
 * commercial claim and the data supporting it expire together.
 *
 * Four decisions worth knowing about, because each of them is a way this could
 * have been quietly wrong:
 *
 *   Rescoring is not contact. The nightly panel touches every profile, so
 *   anything keyed on updated_at would keep a record alive for ever without a
 *   person ever seeing it. candidate_last_engagement() counts creation, email,
 *   submission and decision, and ignores machine activity on purpose.
 *
 *   A live fee claim blocks deletion. The profile and the fee evidence are
 *   different records with different purposes, and the claim is the thing a
 *   placement is argued from. Those candidates are reported, never deleted.
 *
 *   Cascades are checked, not assumed. Fourteen tables cascade from candidates
 *   and six are ON DELETE SET NULL, which would leave call transcripts sitting
 *   there with the candidate pointer nulled: technically orphaned, practically
 *   still a transcript about a person. Those are deleted by hand first.
 *
 *   It does nothing unless told to. RETENTION_APPLY must be 'true'. Counsel's
 *   instruction is not to publish a retention promise until the job supports
 *   it, and a dry run that reports honestly is how the promise earns its way in.
 */

import { createHash } from 'node:crypto'
import { del } from '@vercel/blob'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Months a profile survives without genuine contact. */
export const PROFILE_MONTHS = 24

/** Raw call recordings and transcripts, which age out far sooner. */
export const TRANSCRIPT_DAYS = 90

/**
 * Deleting is the exception, not the default.
 *
 * Until this is switched on the job runs, reports exactly what it would remove
 * and removes nothing, which is the only honest way to build up to a promise
 * about deletion.
 */
export function retentionApplies(): boolean {
  return process.env.RETENTION_APPLY === 'true'
}

function sha256(s: string): string {
  return createHash('sha256').update(s.trim().toLowerCase()).digest('hex')
}

export interface RetentionRun {
  dryRun: boolean
  eligible: number
  blockedByClaim: number
  deleted: number
  transcriptsPurged: number
  failures: Array<{ candidateId: string; error: string }>
}

interface Row {
  id: string
  email: string | null
  resume_blob_pathname: string | null
  last_engagement: string
  has_claim: boolean
}

/**
 * Everything past its window, with the reason it is or is not deletable.
 *
 * Done in one query rather than per candidate: the point of a dry run is that
 * the same set is evaluated whether or not anything is removed afterwards.
 */
async function eligibleCandidates(admin: SupabaseClient): Promise<Row[]> {
  const { data, error } = await admin.rpc('retention_candidates', {
    months: PROFILE_MONTHS,
  })
  if (error) throw new Error(`retention query failed: ${error.message}`)
  return (data ?? []) as Row[]
}

/**
 * Removes one candidate and everything hanging off them.
 *
 * Order matters and is not arbitrary. The transcript goes first because its
 * foreign key nulls rather than cascades. The blob goes next, because a file
 * whose database row has gone is a file nobody can ever find again to delete.
 * The log is written before the delete, so a crash leaves evidence that we
 * intended to remove somebody rather than no trace at all. The row goes last.
 */
async function deleteCandidate(
  admin: SupabaseClient,
  row: Row,
  reason: 'retention_expiry' | 'erasure_request' | 'objection',
): Promise<{ ok: true; transcripts: number } | { ok: false; error: string }> {
  try {
    const { data: transcripts } = await admin
      .from('call_transcripts')
      .delete()
      .eq('candidate_id', row.id)
      .select('id')

    if (row.resume_blob_pathname) {
      try {
        await del(row.resume_blob_pathname)
      } catch (err) {
        // A missing blob is fine. A failing delete is not worth keeping the
        // record alive for, and is logged rather than swallowed.
        console.error('[retention] blob delete failed', row.resume_blob_pathname, err)
      }
    }

    await admin.from('deletion_log').insert({
      candidate_id: row.id,
      email_sha256: row.email ? sha256(row.email) : null,
      reason,
      last_engagement_at: row.last_engagement,
      cascaded: { call_transcripts: transcripts?.length ?? 0, blob: Boolean(row.resume_blob_pathname) },
    })

    const { error } = await admin.from('candidates').delete().eq('id', row.id)
    if (error) return { ok: false, error: error.message }

    return { ok: true, transcripts: transcripts?.length ?? 0 }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Raw transcripts age out on their own clock, whatever the profile is doing. */
async function purgeOldTranscripts(admin: SupabaseClient, dryRun: boolean): Promise<number> {
  const cutoff = new Date(Date.now() - TRANSCRIPT_DAYS * 86_400_000).toISOString()
  if (dryRun) {
    const { count } = await admin
      .from('call_transcripts')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', cutoff)
    return count ?? 0
  }
  const { data } = await admin.from('call_transcripts').delete().lt('created_at', cutoff).select('id')
  return data?.length ?? 0
}

export async function runRetention(admin: SupabaseClient): Promise<RetentionRun> {
  const dryRun = !retentionApplies()
  const rows = await eligibleCandidates(admin)

  const deletable = rows.filter(r => !r.has_claim)
  const blocked = rows.length - deletable.length

  const out: RetentionRun = {
    dryRun,
    eligible: rows.length,
    blockedByClaim: blocked,
    deleted: 0,
    transcriptsPurged: await purgeOldTranscripts(admin, dryRun),
    failures: [],
  }

  if (dryRun) return out

  for (const row of deletable) {
    const res = await deleteCandidate(admin, row, 'retention_expiry')
    if (res.ok) out.deleted++
    else out.failures.push({ candidateId: row.id, error: res.error })
  }

  return out
}

/**
 * A candidate asking to be removed.
 *
 * Separate from the scheduled sweep because it is a different obligation with a
 * different clock, and because it must work whether or not the sweep is
 * switched on: somebody exercising a right should not be waiting on a feature
 * flag we set for our own caution.
 */
export async function eraseCandidate(
  admin: SupabaseClient,
  candidateId: string,
  reason: 'erasure_request' | 'objection' = 'erasure_request',
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data } = await admin
    .from('candidates')
    .select('id, email, resume_blob_pathname')
    .eq('id', candidateId)
    .maybeSingle()

  if (!data) return { ok: false, error: 'No such candidate' }

  const { count } = await admin
    .from('submission_claims')
    .select('id', { count: 'exact', head: true })
    .eq('candidate_id', candidateId)

  if ((count ?? 0) > 0) {
    // Not a refusal, a narrowing: the claim is a lawful reason to keep the
    // minimum, and the person is owed an explanation rather than silence.
    return {
      ok: false,
      error:
        'This candidate has a live submission claim. Restrict use and handle by hand: the claim is a lawful reason to keep minimal evidence, and the requester needs telling that.',
    }
  }

  const res = await deleteCandidate(
    admin,
    {
      id: data.id as string,
      email: (data.email as string) ?? null,
      resume_blob_pathname: (data.resume_blob_pathname as string) ?? null,
      last_engagement: new Date().toISOString(),
      has_claim: false,
    },
    reason,
  )
  return res.ok ? { ok: true } : { ok: false, error: res.error }
}

/** Has this address asked to be left alone? Checked before any import. */
export async function isSuppressed(admin: SupabaseClient, email: string): Promise<boolean> {
  const { count } = await admin
    .from('deletion_log')
    .select('id', { count: 'exact', head: true })
    .eq('email_sha256', sha256(email))
    .in('reason', ['erasure_request', 'objection'])
  return (count ?? 0) > 0
}
