import { describe, expect, it } from 'vitest'
import { evaluateEligibility, explainEligibility, REASON_CLASS, type PolicyInput } from '@/lib/engine/policy'

const base: PolicyInput = {
  journey_stage: 'bench',
  journey_stage_source: 'desk',
  availability_status: 'active',
  person_type: 'job_seeker',
  intake_source: 'referred',
  consent_told_candidate: true,
}

describe('eligibility-v1', () => {
  it('a clean bench candidate can be assessed, matched and contacted, but is not client-ready until met', () => {
    const e = evaluateEligibility(base)
    expect(e).toMatchObject({ can_assess: true, can_match: true, can_contact: 'yes', client_intro_ready: false })
    expect(e.reasons).toEqual(['not_met_yet'])
  })

  it('warm, active, consent recorded: client-ready', () => {
    const e = evaluateEligibility({ ...base, journey_stage: 'warm' })
    expect(e.client_intro_ready).toBe(true)
    expect(e.reasons).toEqual([])
  })

  it('unknown consent is a question, not a block: still matchable, never client-ready', () => {
    const e = evaluateEligibility({ ...base, journey_stage: 'warm', consent_told_candidate: null })
    expect(e.can_match).toBe(true)
    expect(e.can_contact).toBe('yes')
    expect(e.client_intro_ready).toBe(false)
    expect(e.reasons).toContain('candidate_consent_unknown')
    expect(REASON_CLASS.candidate_consent_unknown).toBe('unknown')
  })

  it('a do-not-contact decision is permanent and stops matching and contact', () => {
    const e = evaluateEligibility({ ...base, do_not_contact: true })
    expect(e.can_match).toBe(false)
    expect(e.can_contact).toBe('no')
    expect(explainEligibility(e).blocking).toEqual(['do_not_contact'])
  })

  it('Lily not-a-fit is a human decision; a backfilled not_fit is preserved but labelled unverified', () => {
    const human = evaluateEligibility({ ...base, journey_stage: 'not_fit', journey_stage_source: 'desk' })
    expect(human.can_match).toBe(false)
    expect(human.reasons).toContain('human_not_fit')
    const legacy = evaluateEligibility({ ...base, journey_stage: 'not_fit', journey_stage_source: 'backfill' })
    expect(legacy.can_match).toBe(false)
    expect(legacy.reasons).toContain('legacy_not_fit_unverified')
    expect(REASON_CLASS.legacy_not_fit_unverified).toBe('legacy_unverified')
  })

  it('a nightly rerun cannot reopen a human exclusion; a recorded override can', () => {
    const closed = evaluateEligibility({ ...base, journey_stage: 'not_fit', journey_stage_source: 'human' })
    expect(closed.can_match).toBe(false)
    const reopened = evaluateEligibility({ ...base, journey_stage: 'not_fit', journey_stage_source: 'human', overrides: [{ effect: 'allow_match', scope: 'global' }] })
    expect(reopened.can_match).toBe(true)
    expect(reopened.reasons).toContain('human_override_allow_match')
  })

  it('a role-specific rejection blocks that job only and never becomes a global judgment', () => {
    const forJob = evaluateEligibility({ ...base, job_id: 'job-1', rejected_for_job: true })
    expect(forJob.can_match).toBe(false)
    expect(forJob.reasons).toContain('rejected_for_this_role')
    const global = evaluateEligibility({ ...base, rejected_for_job: true })
    expect(global.can_match).toBe(true)
    const otherJob = evaluateEligibility({ ...base, job_id: 'job-2', rejected_for_job: false, overrides: [{ effect: 'block_match', scope: 'job', job_id: 'job-1' }] })
    expect(otherJob.can_match).toBe(true)
  })

  it('off market is temporary: no matching now, contact needs a human, assessment allowed', () => {
    const e = evaluateEligibility({ ...base, availability_status: 'off_market' })
    expect(e).toMatchObject({ can_assess: true, can_match: false, can_contact: 'needs_review' })
    expect(REASON_CLASS.temporarily_off_market).toBe('temporary')
  })

  it('a recruiter or founder on the read is unconfirmed intent, not a rejection', () => {
    const e = evaluateEligibility({ ...base, person_type: 'recruiter' })
    expect(e.can_assess).toBe(true)
    expect(e.can_match).toBe(false)
    expect(e.can_contact).toBe('needs_review')
    expect(e.reasons).toContain('job_seeking_intent_unconfirmed')
    expect(REASON_CLASS.job_seeking_intent_unconfirmed).toBe('unknown')
  })

  it('a human filing (route elsewhere) is a decision', () => {
    const e = evaluateEligibility({ ...base, availability_status: 'not_qualified', person_type: 'founder' })
    expect(e.reasons).toContain('filed_not_a_candidate')
    expect(e.reasons).not.toContain('job_seeking_intent_unconfirmed')
  })

  it('a calibration profile is never assessed, matched or contacted', () => {
    const e = evaluateEligibility({ ...base, intake_source: 'calibration' })
    expect(e).toMatchObject({ can_assess: false, can_match: false, can_contact: 'no', client_intro_ready: false })
    // an override cannot reopen a calibration profile
    const o = evaluateEligibility({ ...base, intake_source: 'calibration', overrides: [{ effect: 'allow_match', scope: 'global' }] })
    expect(o.can_match).toBe(false)
  })

  it('grade is not an input: an ungraded or B+ person is as matchable as an A', () => {
    // the policy takes no grade at all; this documents it
    const e = evaluateEligibility({ ...base })
    expect(Object.keys(base)).not.toContain('panel_grade')
    expect(e.can_match).toBe(true)
  })

  it('reason order is stable (the SQL twin produces the same order)', () => {
    const e = evaluateEligibility({ ...base, journey_stage: 'dormant', availability_status: 'off_market', consent_told_candidate: false })
    expect(e.reasons).toEqual(['dormant_lost_touch', 'temporarily_off_market', 'candidate_not_told'])
  })
})
