/**
 * The eight findings of the 2026-09-09 independent review, as regression
 * cases. Numbers match Claude-Code-Release-1-review.md. Findings 1 and 2 are
 * covered in paid.test.ts; the rest are here.
 */
import { describe, expect, it } from 'vitest'
import { classifyVisa, deriveDecision, seatEligibility, seatVerdict, visaDecision, type CandidateFacts, type SeatFacts } from '@/lib/engine/fit'
import { evaluateEligibility, logisticsWaived } from '@/lib/engine/policy'
import { lifecyclePatch, PANEL_MAY_REOPEN_FROM, panelInputHash } from '@/lib/desk/panel'

const TODAY = new Date('2026-09-09T12:00:00Z')
const seat: SeatFacts = { jobId: 'synthetic-seat', visaRequirement: 'us_authorized', location: 'San Francisco', remotePolicy: 'onsite', salaryMin: 180_000, salaryMax: 220_000, salaryCurrency: 'USD', yearsMin: 3, yearsMax: 8 }
const clean: CandidateFacts = { visaStatus: 'US citizen', location: 'San Francisco', relocationOk: null, remotePreference: null, salaryAsk: { amount: 200_000, currency: 'USD', kind: 'base' }, experienceYears: 5, educationEnd: { year: 2019, month: 5 } }
const warmConsented = evaluateEligibility({ journey_stage: 'warm', journey_stage_source: 'human', availability_status: 'active', person_type: 'job_seeker', intake_source: 'referred', consent_told_candidate: true })
const strongRead = { job_id: seat.jobId, fit: 'strong' as const, reason: 'Synthetic evidence', blockers: [] }

describe('3. a panel rerun never reopens a human decision', () => {
  it('the panel may move only from the stages it owns', () => {
    expect([...PANEL_MAY_REOPEN_FROM]).toEqual(['uploaded', 'calibrating', 'decision_pending', 'ready_for_intro'])
    for (const stage of ['not_fit', 'dormant', 'bench', 'post_committee_not_fit', 'intro_requested', 'intro_sent', 'committee_call', 'warm', 'placed']) {
      const p = lifecyclePatch({ priorStage: stage, personType: 'job_seeker', now: '2026-09-09T12:00:00Z' })
      expect(p.lifecycle, stage).toBeNull()
    }
  })
  it('a fresh upload goes to decision_pending; someone already there stays', () => {
    expect(lifecyclePatch({ priorStage: 'uploaded', personType: 'job_seeker', now: 'n' }).lifecycle).toMatchObject({ journey_stage: 'decision_pending', journey_stage_source: 'desk' })
    expect(lifecyclePatch({ priorStage: 'calibrating', personType: 'founder', now: 'n' }).lifecycle).toMatchObject({ journey_stage: 'decision_pending' })
    expect(lifecyclePatch({ priorStage: 'decision_pending', personType: 'job_seeker', now: 'n' }).lifecycle).toBeNull()
  })
})

describe('4. work authorisation parsing keeps negations and jurisdiction', () => {
  it('explicit positive US authorisation', () => {
    expect(classifyVisa('US citizen')).toBe('authorized')
    expect(classifyVisa('U.S. Citizen (W-2) | Authorized to work in the U.S. without sponsorship')).toBe('authorized')
    expect(classifyVisa('Green Card (No VISA Required)')).toBe('authorized')
    expect(classifyVisa('Dual French-US citizen')).toBe('authorized')
    expect(classifyVisa('Lawful Permanent Resident')).toBe('authorized')
  })
  it('explicit negative authorisation is never authorised', () => {
    expect(classifyVisa('not authorized to work in the US')).toBe('needs_sponsorship')
    expect(classifyVisa('No US work authorization')).toBe('not_us')
    expect(classifyVisa('Not US based, no US visa')).toBe('not_us')
    expect(classifyVisa('needs new sponsorship')).toBe('needs_sponsorship')
    expect(classifyVisa('Canadian citizen, no US degree yet so no TN; J-1 or O-1 likely path - VISA IS THE BLOCKER')).toBe('needs_sponsorship')
  })
  it('a foreign citizenship alone establishes nothing about the US', () => {
    expect(classifyVisa('Canadian citizen')).toBe('unknown')
    expect(classifyVisa('EU / Spanish Citizen')).toBe('unknown')
    expect(classifyVisa('British (since 2018); Greek')).toBe('unknown')
    expect(classifyVisa('Clearance: SECRET II')).toBe('unknown')
    expect(classifyVisa('')).toBe('unknown')
    expect(classifyVisa(null)).toBe('unknown')
  })
  it('pending and conflicting statements go to a human', () => {
    expect(classifyVisa('Green card arriving Sept 2026')).toBe('pending')
    expect(classifyVisa('US citizen but needs sponsorship')).toBe('conflicting')
    expect(visaDecision('pending', 'us_authorized')).toMatchObject({ eligibility: 'needs_review' })
    expect(visaDecision('conflicting', 'us_authorized')).toMatchObject({ eligibility: 'needs_review' })
    expect(visaDecision('unknown', 'us_authorized').blocker).toMatchObject({ kind: 'unknown' })
  })
  it('transfers and time-limited authorisation as before', () => {
    expect(classifyVisa('H-1B, transfer needed')).toBe('transfer')
    expect(classifyVisa('H-1B (approval in progress, activation Oct 1 2026; transfer required)')).toBe('transfer')
    expect(classifyVisa('OPT or STEM OPT')).toBe('time_limited')
    expect(classifyVisa('OPT 2026-2029 (needs H-1B or green card sponsorship later)')).toBe('time_limited')
  })
})

describe('5. unresolved logistics never certify client readiness', () => {
  it('EUR ask against a USD band: screening allowed, client readiness off, through the final action', () => {
    const v = seatVerdict(strongRead, { ...clean, salaryAsk: { amount: 200_000, currency: 'EUR', kind: 'base' } }, seat, TODAY, { pairPolicy: warmConsented })
    expect(v.blockers[0]).toMatchObject({ kind: 'question', code: 'comp_not_comparable', readiness: 'required' })
    expect(v.eligibility).toBe('needs_review')
    const d = deriveDecision({ seats: [v], policy: warmConsented, personType: 'job_seeker', modelSuggested: 'intro_now' })
    expect(d.client_intro_ready).toBe(false)
    expect(d.next_action).toBe('screening_call')
    expect(d.suggested_decision).toBe('intro_now')
  })
  it('OTE against base, and an unknown start date, the same', () => {
    const ote = seatVerdict(strongRead, { ...clean, salaryAsk: { amount: 250_000, currency: 'USD', kind: 'ote' } }, seat, TODAY, { pairPolicy: warmConsented })
    expect(deriveDecision({ seats: [ote], policy: warmConsented, personType: 'job_seeker', modelSuggested: 'intro_now' }).client_intro_ready).toBe(false)
    const school = seatVerdict(strongRead, { ...clean, educationEnd: { year: 2026, month: 12 } }, seat, TODAY, { pairPolicy: warmConsented })
    expect(school.eligibility).toBe('needs_review')
    expect(deriveDecision({ seats: [school], policy: warmConsented, personType: 'job_seeker', modelSuggested: 'intro_now' }).next_action).toBe('screening_call')
  })
  it('verified compatible terms clear it; a recorded human exception clears it; a hard blocker is never waived', () => {
    const fine = seatVerdict(strongRead, clean, seat, TODAY, { pairPolicy: warmConsented })
    expect(deriveDecision({ seats: [fine], policy: warmConsented, personType: 'job_seeker', modelSuggested: 'intro_now' })).toMatchObject({ next_action: 'client_intro', client_intro_ready: true })
    const waived = seatVerdict(strongRead, { ...clean, salaryAsk: { amount: 200_000, currency: 'EUR', kind: 'base' } }, seat, TODAY, { pairPolicy: warmConsented, logisticsWaived: true })
    expect(waived.eligibility).toBe('eligible')
    expect(deriveDecision({ seats: [waived], policy: warmConsented, personType: 'job_seeker', modelSuggested: 'intro_now' }).client_intro_ready).toBe(true)
    const hard = seatVerdict(strongRead, { ...clean, visaStatus: 'needs new sponsorship' }, seat, TODAY, { pairPolicy: warmConsented, logisticsWaived: true })
    expect(hard.eligibility).toBe('ineligible')
    expect(seatEligibility([{ kind: 'hard', code: 'x', detail: 'x' }], true)).toBe('ineligible')
    expect(logisticsWaived([{ effect: 'waive_logistics', scope: 'job', job_id: 'synthetic-seat' }], 'synthetic-seat')).toBe(true)
    expect(logisticsWaived([{ effect: 'waive_logistics', scope: 'job', job_id: 'other' }], 'synthetic-seat')).toBe(false)
  })
  it('optional screening topics never gate', () => {
    expect(seatEligibility([{ kind: 'question', code: 'x', detail: 'x', readiness: 'optional' }])).toBe('eligible')
    expect(seatEligibility([{ kind: 'preference', code: 'x', detail: 'x' }])).toBe('eligible')
  })
})

describe('6. reuse versions everything the model read; policy is recomputed', () => {
  const source = { id: null, kind: 'resume_text' as const, contentHash: 'abc', chars: 10, unrecorded: false }
  it('the calibration text and the recipient block are part of the version', () => {
    const a = panelInputHash({ source, system: 'RUBRIC + seats', user: 'facts + RECIPIENT: the partner, signed + CV' })
    const b = panelInputHash({ source, system: 'RUBRIC + seats + CALIBRATION', user: 'facts + RECIPIENT: the partner, signed + CV' })
    const c = panelInputHash({ source, system: 'RUBRIC + seats', user: 'facts + RECIPIENT: the partner, NOT signed + CV' })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(panelInputHash({ source, system: 'RUBRIC + seats', user: 'facts + RECIPIENT: the partner, signed + CV' })).toBe(a)
  })
  it('a restriction or override changes the action without changing the version', () => {
    // The hash takes no policy input at all; the decision is derived from today's policy.
    const blocked = evaluateEligibility({ journey_stage: 'warm', journey_stage_source: 'human', availability_status: 'active', person_type: 'job_seeker', intake_source: 'referred', consent_told_candidate: true, do_not_contact: true })
    const v = seatVerdict(strongRead, clean, seat, TODAY, { pairPolicy: blocked })
    const d = deriveDecision({ seats: [v], policy: blocked, personType: 'job_seeker', modelSuggested: 'intro_now' })
    expect(d).toMatchObject({ next_action: 'hold', client_intro_ready: false })
    expect(v.blockers[0]).toMatchObject({ kind: 'hard', code: 'policy_excluded' })
  })
})

describe('8. each seat is judged under its own candidate-role policy', () => {
  it('a rejection for one role holds that seat; the other stays eligible', () => {
    const base = { journey_stage: 'warm', journey_stage_source: 'human', availability_status: 'active', person_type: 'job_seeker', intake_source: 'referred', consent_told_candidate: true }
    const seatA: SeatFacts = { ...seat, jobId: 'job-a' }
    const seatB: SeatFacts = { ...seat, jobId: 'job-b' }
    const pairA = evaluateEligibility({ ...base, job_id: 'job-a', rejected_for_job: true })
    const pairB = evaluateEligibility({ ...base, job_id: 'job-b', rejected_for_job: false })
    const va = seatVerdict({ ...strongRead, job_id: 'job-a' }, clean, seatA, TODAY, { pairPolicy: pairA })
    const vb = seatVerdict({ ...strongRead, job_id: 'job-b' }, clean, seatB, TODAY, { pairPolicy: pairB })
    expect(va.eligibility).toBe('ineligible')
    expect(va.blockers[0]).toMatchObject({ kind: 'hard', code: 'rejected_for_this_role' })
    expect(va.role_fit).toBe('strong')
    expect(vb.eligibility).toBe('eligible')
    const d = deriveDecision({ seats: [va, vb], policy: evaluateEligibility(base), personType: 'job_seeker', modelSuggested: 'intro_now' })
    expect(d.strong_eligible).toEqual(['job-b'])
    expect(d.strong_ineligible).toEqual(['job-a'])
    expect(d.next_action).toBe('client_intro')
  })
  it('a job-scoped block override does the same, with provenance', () => {
    const base = { journey_stage: 'bench', journey_stage_source: 'human', availability_status: 'active', person_type: 'job_seeker', intake_source: 'referred', consent_told_candidate: true }
    const pairA = evaluateEligibility({ ...base, job_id: 'job-a', overrides: [{ effect: 'block_match', scope: 'job', job_id: 'job-a' }] })
    const v = seatVerdict({ ...strongRead, job_id: 'job-a' }, clean, { ...seat, jobId: 'job-a' }, TODAY, { pairPolicy: pairA })
    expect(v.blockers[0]).toMatchObject({ kind: 'hard', code: 'rejected_for_this_role', detail: 'human_override_block_match' })
    expect(v.pair_policy?.reasons).toContain('human_override_block_match')
  })
})
