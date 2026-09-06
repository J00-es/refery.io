/**
 * Submission claims: the contractual right that a confirmed submission creates.
 *
 * Four questions have been answered by `candidates.owner_user_id` until now,
 * and they are not the same question:
 *
 *   who may open this record     membership and role
 *   who submitted it             `originating_user_id`, audit only
 *   who holds the economic right this table
 *   who receives the money       the verified payee on the holder
 *
 * Keeping them apart is what lets a firm hold a claim later without a migration
 * that rewrites every candidate row.
 *
 * ── When a claim is created ──────────────────────────────────────────────────
 *
 * At submission, mechanically, not when someone gets round to reviewing it.
 * The Submission Terms define a qualified submission by completeness ("a name on
 * its own, or a forwarded CV with no context, does not start your protection"),
 * which is a test code can apply. Tying it to review instead would rank two
 * partners who submitted the same person by whichever one we happened to open
 * first, which is a dispute generator and unfair to the one who was quicker.
 *
 * A later `declined` does NOT end the claim. A candidate we passed on, whom the
 * client hires anyway inside 24 months, is exactly the case the protection
 * exists for.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'

/** The protection window in the Submission Terms. */
export const PROTECTION_MONTHS = 24

/**
 * How long a partner has to make good on "I can introduce them now".
 *
 * Not a deadline that voids anything by itself: it is the point at which an
 * unfulfilled attestation becomes visible and reviewable.
 */
export const INTRO_DUE_DAYS = 21

/** A pitch shorter than this is not a reason, it is a shrug. Mirrors the route. */
export const MIN_PITCH = 40

/** Enough words to describe a real relationship. One line is plenty. */
export const MIN_RELATIONSHIP = 25

export interface ClaimCandidate {
  id: string
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  resume_blob_pathname?: string | null
}

export interface ClaimDraft {
  /** Their own words on how they know this person. */
  relationship: string
  /** They confirm they can introduce this person to Refery now. */
  canIntroduce: boolean
}

export type Gate = { ok: true } | { ok: false; reason: string }

/**
 * Does this submission qualify?
 *
 * Every failure names the missing piece, because "rejected" with no reason is
 * how a partner decides the desk is broken rather than that their submission was.
 */
export function qualifies(candidate: ClaimCandidate, draft: ClaimDraft): Gate {
  if (!candidate.resume_blob_pathname) {
    return { ok: false, reason: 'Needs a CV on file before it counts as a submission' }
  }
  if (!candidate.email && !candidate.phone && !candidate.linkedin_url) {
    return { ok: false, reason: 'Needs a way to reach them: email, phone or LinkedIn' }
  }
  // How they know the person and that they can introduce them are stated
  // above the Submit button rather than gated here: pressing Submit is the
  // attestation. Lily's call on 5 Sep 2026, so a partner is never blocked by
  // a box. `draft` stays in the signature so the record of what was attested
  // travels with the claim.
  void draft
  return { ok: true }
}

function addMonths(from: Date, months: number): Date {
  const d = new Date(from)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 86_400_000)
}

export interface RecordClaimInput {
  /** Exactly one of these. A firm member's submission belongs to the firm. */
  holderUserId?: string | null
  holderFirmId?: string | null
  originatingUserId: string
  candidateId: string
  clientCompanyId: string
  relationship: string
  /** Defaults to now. Passed in so a batch shares one timestamp. */
  at?: Date
}

/**
 * Writes the claim, and the first line of its audit history.
 *
 * Never throws. A submission that succeeded must not fail because the claim
 * write did, so a failure is returned and logged rather than propagated: the
 * partner's work is saved either way, and a missing claim is recoverable from
 * the submission row.
 *
 * The unique index on (holder, candidate, client group) is what collapses two
 * colleagues submitting the same person to the same client into one claim. A
 * conflict here is the rule working, not an error.
 *
 * When the submitter is in an active firm the holder is the firm, per section 7
 * of the Firm Addendum: submissions vest in the firm, and the submitting member
 * is recorded for audit only. That is what stops a departing employee and their
 * old firm both claiming the same placement.
 */
export async function recordClaim(
  admin: SupabaseClient,
  input: RecordClaimInput,
): Promise<{ ok: boolean; claimId?: string; error?: string }> {
  const at = input.at ?? new Date()

  const { data, error } = await admin
    .from('submission_claims')
    .insert({
      holder_user_id: input.holderFirmId ? null : input.holderUserId,
      holder_firm_id: input.holderFirmId ?? null,
      originating_user_id: input.originatingUserId,
      candidate_id: input.candidateId,
      client_company_id: input.clientCompanyId,
      qualified_submission_at: at.toISOString(),
      confirmed_at: at.toISOString(),
      protected_through: addMonths(at, PROTECTION_MONTHS).toISOString(),
      partner_terms_version: AGREEMENT_VERSIONS.partner,
      submission_terms_version: AGREEMENT_VERSIONS.partnerSubmission,
      relationship_note: input.relationship.trim() ? input.relationship.slice(0, 2000) : null,
      intro_attested_at: at.toISOString(),
      intro_due_by: addDays(at, INTRO_DUE_DAYS).toISOString(),
      status: 'active',
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // 23505 is the pairing rule doing its job: the holder already has a claim
    // on this person with this client. The earlier one stands.
    if (error.code === '23505') return { ok: true }
    console.error('[submission-claims] could not record claim:', error.message)
    return { ok: false, error: error.message }
  }

  if (data?.id) {
    await admin.from('submission_claim_events').insert({
      claim_id: data.id,
      event: 'created',
      actor_user_id: input.originatingUserId,
      reason: 'Qualified submission confirmed',
      new_value: {
        protected_through: addMonths(at, PROTECTION_MONTHS).toISOString(),
        intro_due_by: addDays(at, INTRO_DUE_DAYS).toISOString(),
      },
    })
  }

  return { ok: true, claimId: data?.id }
}
