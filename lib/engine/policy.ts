/**
 * eligibility-v1: the one policy every matcher, the desk, the bench, the
 * nightly job and a manual run read before touching a person.
 *
 * It returns reasons, not a boolean, and it keeps four things apart that the
 * old gates mixed: a permanent contact restriction, a temporary availability
 * state, a role-specific rejection, and "no current role for them". A human
 * decision is preserved; an AI rerun cannot reopen anyone. A human override
 * is recorded with actor, reason, time and scope.
 *
 * The SQL twin is public.candidate_eligibility(uuid, uuid) in
 * scripts/engine/2026-09-09-02-eligibility-and-matching.sql. The two must
 * agree; tests/engine/policy.test.ts holds the fixtures and
 * scripts/engine/policy-parity.ts compares them on every production row.
 */

export const POLICY_VERSION = 'eligibility-v1' as const

export type ReasonCode =
  | 'candidate_not_found'
  | 'calibration_sample'
  | 'do_not_contact'
  | 'filed_not_a_candidate'
  | 'job_seeking_intent_unconfirmed'
  | 'human_not_fit'
  | 'legacy_not_fit_unverified'
  | 'human_not_fit_after_call'
  | 'placed'
  | 'dormant_lost_touch'
  | 'temporarily_off_market'
  | 'candidate_consent_unknown'
  | 'candidate_not_told'
  | 'rejected_for_this_role'
  | 'human_override_allow_match'
  | 'human_override_block_match'
  | 'human_override_block_contact'
  | 'human_override_allow_contact'
  | 'not_met_yet'

export type ReasonClass = 'permanent' | 'human_decision' | 'legacy_unverified' | 'temporary' | 'role_specific' | 'unknown' | 'override' | 'info'

/** What kind of thing each reason is, so a renderer never has to guess. */
export const REASON_CLASS: Record<ReasonCode, ReasonClass> = {
  candidate_not_found: 'permanent',
  calibration_sample: 'permanent',
  do_not_contact: 'permanent',
  filed_not_a_candidate: 'human_decision',
  job_seeking_intent_unconfirmed: 'unknown',
  human_not_fit: 'human_decision',
  legacy_not_fit_unverified: 'legacy_unverified',
  human_not_fit_after_call: 'human_decision',
  placed: 'temporary',
  dormant_lost_touch: 'temporary',
  temporarily_off_market: 'temporary',
  candidate_consent_unknown: 'unknown',
  candidate_not_told: 'unknown',
  rejected_for_this_role: 'role_specific',
  human_override_allow_match: 'override',
  human_override_block_match: 'override',
  human_override_block_contact: 'override',
  human_override_allow_contact: 'override',
  not_met_yet: 'info',
}

export type ContactState = 'yes' | 'needs_review' | 'no'

export type OverrideEffect = 'allow_match' | 'block_match' | 'allow_contact' | 'block_contact' | 'waive_logistics'

export interface Override {
  effect: OverrideEffect
  scope: 'global' | 'job'
  job_id?: string | null
  /** Ordered oldest first by the caller; expired or revoked rows are not passed. */
}

/** A recorded human exception that lets a seat's unresolved logistics not block client readiness. Read by lib/engine/fit.ts, ignored here. */
export function logisticsWaived(overrides: Override[] | undefined, jobId: string | null | undefined): boolean {
  return (overrides ?? []).some(o => o.effect === 'waive_logistics' && (o.scope === 'global' || (!!jobId && o.job_id === jobId)))
}

export interface PolicyInput {
  found?: boolean
  journey_stage: string | null
  journey_stage_source: string | null
  availability_status: string | null
  person_type: string | null
  intake_source: string | null
  consent_told_candidate: boolean | null
  /** An active human decision kind=contact value=do_not_contact exists. */
  do_not_contact?: boolean
  /** A declined submission, a rejected pipeline row or an HM pass exists for `job_id`. */
  rejected_for_job?: boolean
  overrides?: Override[]
  job_id?: string | null
}

export interface Eligibility {
  policy_version: typeof POLICY_VERSION
  found: boolean
  can_assess: boolean
  can_match: boolean
  can_contact: ContactState
  client_intro_ready: boolean
  reasons: ReasonCode[]
}

function downgrade(current: ContactState, to: 'needs_review'): ContactState {
  return current === 'yes' ? to : current
}

export function evaluateEligibility(input: PolicyInput): Eligibility {
  if (input.found === false) {
    return { policy_version: POLICY_VERSION, found: false, can_assess: false, can_match: false, can_contact: 'no', client_intro_ready: false, reasons: ['candidate_not_found'] }
  }
  const reasons: ReasonCode[] = []
  let canAssess = true
  let canMatch = true
  let contact: ContactState = 'yes'

  // permanent
  if ((input.intake_source ?? '') === 'calibration') {
    reasons.push('calibration_sample'); canAssess = false; canMatch = false; contact = 'no'
  }
  if (input.do_not_contact) {
    reasons.push('do_not_contact'); canMatch = false; contact = 'no'
  }

  // who they are: a human filing is a decision; a profession is not intent
  if (input.availability_status === 'not_qualified') {
    reasons.push('filed_not_a_candidate'); canMatch = false; contact = downgrade(contact, 'needs_review')
  } else if (input.person_type != null && input.person_type !== 'job_seeker') {
    reasons.push('job_seeking_intent_unconfirmed'); canMatch = false; contact = downgrade(contact, 'needs_review')
  }

  // journey
  const stage = input.journey_stage
  if (stage === 'not_fit') {
    reasons.push(input.journey_stage_source === 'desk' || input.journey_stage_source === 'human' ? 'human_not_fit' : 'legacy_not_fit_unverified')
    canMatch = false
  } else if (stage === 'post_committee_not_fit') {
    reasons.push('human_not_fit_after_call'); canMatch = false
  } else if (stage === 'placed') {
    reasons.push('placed'); canMatch = false
  } else if (stage === 'dormant') {
    reasons.push('dormant_lost_touch'); canMatch = false; contact = downgrade(contact, 'needs_review')
  }

  // temporary
  if (input.availability_status === 'off_market') {
    reasons.push('temporarily_off_market'); canMatch = false; contact = downgrade(contact, 'needs_review')
  }

  // unknowns: never adverse on their own; they gate client readiness
  if (input.consent_told_candidate == null) reasons.push('candidate_consent_unknown')
  else if (input.consent_told_candidate === false) reasons.push('candidate_not_told')

  // role-specific, only for the job asked about
  if (input.job_id && input.rejected_for_job) {
    reasons.push('rejected_for_this_role'); canMatch = false
  }

  // human overrides, oldest first
  for (const o of input.overrides ?? []) {
    if (o.scope === 'job' && (!input.job_id || o.job_id !== input.job_id)) continue
    if (o.effect === 'allow_match' && canAssess) { canMatch = true; reasons.push('human_override_allow_match') }
    else if (o.effect === 'block_match') { canMatch = false; reasons.push('human_override_block_match') }
    else if (o.effect === 'block_contact') { contact = 'no'; canMatch = false; reasons.push('human_override_block_contact') }
    else if (o.effect === 'allow_contact' && canAssess) { contact = 'yes'; reasons.push('human_override_allow_contact') }
  }

  if (canMatch && stage !== 'warm') reasons.push('not_met_yet')

  const availability = input.availability_status ?? 'active'
  const clientIntroReady =
    canMatch && contact === 'yes' && stage === 'warm' && (availability === 'active' || availability === 'not_yet_talked') && input.consent_told_candidate === true

  return { policy_version: POLICY_VERSION, found: true, can_assess: canAssess, can_match: canMatch, can_contact: contact, client_intro_ready: clientIntroReady, reasons }
}

/** The blocking reasons, by class, for a card or a thread reply. */
export function explainEligibility(e: Eligibility): { blocking: ReasonCode[]; unknown: ReasonCode[]; info: ReasonCode[] } {
  const blocking: ReasonCode[] = []
  const unknown: ReasonCode[] = []
  const info: ReasonCode[] = []
  for (const r of e.reasons) {
    const c = REASON_CLASS[r]
    if (c === 'unknown') unknown.push(r)
    else if (c === 'info' || (c === 'override' && (r === 'human_override_allow_match' || r === 'human_override_allow_contact'))) info.push(r)
    else blocking.push(r)
  }
  return { blocking, unknown, info }
}

export const REASON_TEXT: Record<ReasonCode, string> = {
  candidate_not_found: 'no such candidate',
  calibration_sample: 'a calibration profile, not someone we place',
  do_not_contact: 'asked not to be contacted',
  filed_not_a_candidate: 'filed as not a candidate',
  job_seeking_intent_unconfirmed: 'reads as a founder, recruiter or investor; job-seeking intent not confirmed',
  human_not_fit: 'Lily decided not a fit',
  legacy_not_fit_unverified: 'marked not a fit before the desk existed; reason not on record',
  human_not_fit_after_call: 'not a fit after the call',
  placed: 'placed',
  dormant_lost_touch: 'lost touch',
  temporarily_off_market: 'off the market for now',
  candidate_consent_unknown: 'not on record whether they know they are being shared',
  candidate_not_told: 'has not been told they are being shared',
  rejected_for_this_role: 'already declined for this role',
  human_override_allow_match: 'reopened by hand',
  human_override_block_match: 'blocked by hand',
  human_override_block_contact: 'contact blocked by hand',
  human_override_allow_contact: 'contact allowed by hand',
  not_met_yet: 'not met yet',
}
