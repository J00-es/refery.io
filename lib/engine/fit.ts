/**
 * Fit is not an action.
 *
 *   role_fit          strong / possible / not_supported / not_assessed: the
 *                     evidence read, from the model.
 *   eligibility       eligible / ineligible / needs_review: the logistics,
 *                     from code, with typed blockers.
 *   next_action       screening_call / request_information / human_review /
 *                     client_intro / hold / no_current_role.
 *   client_intro_ready  a deterministic boolean under the policy.
 *
 * A confirmed non-negotiable mismatch cannot be cancelled by a strong read. A
 * missing fact is a question, never a mark against the person. Missing
 * evidence is not proof they lack the skill (audit findings 5, 8, 9).
 */

import { compareAskToBand, normalizeCurrency, type Band, type Money } from '@/lib/engine/money'
import { describeEducationTiming, educationTiming, parseEducationEnd, type EducationEnd } from '@/lib/engine/dates'
import type { Eligibility } from '@/lib/engine/policy'

export const FIT_VERSION = 'fit-v1' as const

export type BlockerKind = 'hard' | 'preference' | 'unknown' | 'question'

export interface Blocker {
  kind: BlockerKind
  code: string
  detail: string
  /** For unknowns and questions: what to ask on the call. */
  question?: string
  /**
   * For questions: `required` means client readiness waits for the answer
   * (a comparison the engine could not make, an unknown start date);
   * `optional` is a screening topic that never gates anything.
   */
  readiness?: 'required' | 'optional'
}

export type RoleFit = 'strong' | 'possible' | 'not_supported' | 'not_assessed'
export type SeatEligibility = 'eligible' | 'ineligible' | 'needs_review'
export type NextAction = 'screening_call' | 'request_information' | 'human_review' | 'client_intro' | 'hold' | 'no_current_role'

export interface SeatFacts {
  jobId: string
  visaRequirement: string | null
  location: string | null
  remotePolicy: string | null
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency?: string | null
  yearsMin: number | null
  yearsMax: number | null
}

export interface CandidateFacts {
  visaStatus: string | null
  location: string | null
  relocationOk: boolean | null
  remotePreference: string | null
  salaryAsk: Money | null
  experienceYears: number | null
  educationEnd: EducationEnd | null
}

// ── work authorisation ──────────────────────────────────────────────────────

export type VisaClass = 'authorized' | 'transfer' | 'time_limited' | 'pending' | 'needs_sponsorship' | 'not_us' | 'conflicting' | 'unknown'

// Statements that deny US authorisation or say sponsorship is needed. Read first.
const VISA_NEGATIVE: [RegExp, VisaClass][] = [
  [/\b(not|no|without|un)\s*-?\s*(authori[sz]ed|authori[sz]ation|permitted|eligible)\b[^.;|]*(us|u\.s\.|united states|america)/, 'needs_sponsorship'],
  [/\b(not|no|without|un)\s*-?\s*(authori[sz]ed|authori[sz]ation)\b/, 'needs_sponsorship'],
  [/not\s+(us|u\.s\.)[- ]based|no\s+(us|u\.s\.)\s+(work\s+)?(visa|auth|permit)|\bno visa\b(?!\s+(required|needed|necessary))|autonomo/, 'not_us'],
  // "needs sponsorship later" on an OPT holder is a future need, read below as time-limited; a present need is a negative.
  [/needs?( a)?( new)?\s+(us\s+)?(visa|sponsor)(?![^.;|]*\b(later|eventually|down the line|in the future|in \d+ years?))|\bneeds?\b[^.;|]*\bsponsor(?![^.;|]*\b(later|eventually|down the line|in the future|in \d+ years?))|sponsorship\s+(required|needed)|requires?\s+sponsorship|(?<!no )visa\s+required|needs_us_sponsorship|visa is the blocker/, 'needs_sponsorship'],
]

// "needs H-1B or green card sponsorship later": a future need. Not a denial of
// today's authorisation, and not a statement of it either; the clause is set
// aside so the visa names inside it do not read as possession.
const VISA_FUTURE_NEED = /\bneeds?\b[^.;|]*\bsponsor[^.;|]*\b(later|eventually|down the line|in the future|in \d+ years?)[^.;|]*/

// Statements that establish US work authorisation. A citizenship word alone
// does not: "Canadian citizen" is a fact about Canada.
const VISA_POSITIVE = /\b(us|u\.s\.|united states|american)[- ]citizen|\bus_citizen\b|green[ _]card|permanent resident|\bgc\b|\blpr\b|\beb-?\d\b|\bus_authorized\b|authori[sz]ed to work (in|for)[^.;|]*(us|u\.s\.|united states|any employer)|\bead\b|\bw-?2\b/
const VISA_PENDING = /arriving|pending|in progress|applied|awaiting|approval in progress|activation/
const VISA_TRANSFER = /h-?1b1?|\btn\b|\bo-?1\b|\bl-?1\b|transfer/
const VISA_TIME_LIMITED = /\bopt\b|f-?1\b|\bstem\b|\bcpt\b|\bj-?1\b/

/**
 * From the free text on record. Negations and sponsorship needs are read
 * before anything positive; a positive and a negative statement together
 * are a contradiction for a human, not a certification. Nothing here is
 * inferred from a school, a name or a country of education: an empty,
 * foreign-only or unrecognised field is unknown.
 */
export function classifyVisa(raw: string | null | undefined): VisaClass {
  const t = (raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return 'unknown'

  let negative: VisaClass | null = null
  let rest = t.replace(VISA_FUTURE_NEED, ' ')
  for (const [re, cls] of VISA_NEGATIVE) {
    if (re.test(rest)) {
      negative = negative ?? cls
      rest = rest.replace(re, ' ')
    }
  }
  const positive = VISA_POSITIVE.test(rest)
  const pending = VISA_PENDING.test(t) && (positive || /green|card|residen|h-?1b|visa/.test(t))
  const transfer = VISA_TRANSFER.test(rest)
  const timeLimited = VISA_TIME_LIMITED.test(rest)

  // A statement of authorisation next to a denial is a contradiction for a
  // human. A visa merely mentioned as a possible path ("O-1 likely") is not.
  if (negative && positive) return 'conflicting'
  if (negative) return negative
  if (pending && !transfer) return 'pending'
  if (positive) return 'authorized'
  if (transfer) return 'transfer'
  if (timeLimited) return 'time_limited'
  return 'unknown'
}

export function visaDecision(candidate: VisaClass, seatRequirement: string | null): { eligibility: SeatEligibility; blocker: Blocker | null } {
  const req = (seatRequirement ?? '').toLowerCase()
  if (!req || req === 'no_restriction' || req === 'sponsorship_available') return { eligibility: 'eligible', blocker: null }
  // us_authorized: the company will not file a new petition
  switch (candidate) {
    case 'authorized':
    case 'transfer':
      return { eligibility: 'eligible', blocker: null }
    case 'time_limited':
      return {
        eligibility: 'needs_review',
        blocker: { kind: 'unknown', code: 'visa_time_limited', detail: 'OPT or STEM OPT on record; how long it runs is not', question: 'How long does the current work authorisation run, and does an employer training plan apply?' },
      }
    case 'pending':
      return {
        eligibility: 'needs_review',
        blocker: { kind: 'unknown', code: 'visa_pending', detail: 'authorisation on record is pending or in progress', question: 'When does the pending authorisation take effect, and what can you work on until then?' },
      }
    case 'conflicting':
      return {
        eligibility: 'needs_review',
        blocker: { kind: 'unknown', code: 'visa_conflicting', detail: 'the record both asserts and denies US authorisation', question: 'What exactly is your current US work authorisation?' },
      }
    case 'needs_sponsorship':
    case 'not_us':
      return { eligibility: 'ineligible', blocker: { kind: 'hard', code: 'visa_needs_sponsorship', detail: 'seat is US-authorised only and the person needs new sponsorship' } }
    default:
      return {
        eligibility: 'needs_review',
        blocker: { kind: 'unknown', code: 'visa_unknown', detail: 'work authorisation not on record', question: 'What is your current US work authorisation, and will you need sponsorship now or later?' },
      }
  }
}

// ── location ────────────────────────────────────────────────────────────────

const CITY_KEYS: [RegExp, string][] = [
  [/san francisco|\bsf\b|bay area|palo alto|mountain view|oakland|berkeley|san jose|menlo park|burlingame|san mateo|sunnyvale|santa clara|redwood city/i, 'sf'],
  [/new york|\bnyc?\b|brooklyn|manhattan/i, 'nyc'],
  [/london/i, 'london'],
  [/berlin/i, 'berlin'],
  [/paris/i, 'paris'],
  [/madrid|barcelona/i, 'spain'],
  [/boston/i, 'boston'],
  [/seattle/i, 'seattle'],
  [/austin/i, 'austin'],
  [/los angeles|\bla\b/i, 'la'],
]

function cityKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  for (const [re, key] of CITY_KEYS) if (re.test(raw)) return key
  return null
}

export function locationDecision(c: CandidateFacts, s: SeatFacts): Blocker | null {
  const policy = (s.remotePolicy ?? '').toLowerCase()
  if (policy === 'remote') return null
  const seatCity = cityKey(s.location)
  const candCity = cityKey(c.location)
  if (!seatCity) return null
  if (!c.location) {
    return { kind: 'unknown', code: 'location_unknown', detail: 'location not on record for an onsite seat', question: `Are you in or able to be in ${s.location?.split(/[,(]/)[0].trim() ?? 'the seat city'}?` }
  }
  if (candCity === seatCity) return null
  if (c.relocationOk === true) return { kind: 'preference', code: 'relocation_needed', detail: `based in ${c.location}; open to relocating` }
  if (c.relocationOk === false) return { kind: 'hard', code: 'will_not_relocate', detail: `based in ${c.location} and will not relocate; seat is onsite in ${s.location}` }
  return { kind: 'unknown', code: 'relocation_unknown', detail: `based in ${c.location}; seat is onsite in ${s.location}`, question: `Would you relocate to ${s.location?.split(/[,(]/)[0].trim()}?` }
}

// ── pay ─────────────────────────────────────────────────────────────────────

const PAY_WARNING_GAP = 30_000

export function payDecision(c: CandidateFacts, s: SeatFacts): Blocker | null {
  if (!c.salaryAsk) {
    return { kind: 'unknown', code: 'comp_unknown', detail: 'compensation expectation not on record', question: 'What base are you targeting, and in which currency?' }
  }
  const band: Band = { min: s.salaryMin, max: s.salaryMax, currency: normalizeCurrency(s.salaryCurrency), kind: 'base' }
  const cmp = compareAskToBand({ ...c.salaryAsk, kind: c.salaryAsk.kind === 'unknown' ? 'base' : c.salaryAsk.kind }, band)
  switch (cmp.position) {
    case 'above':
      return cmp.gapToMax != null && cmp.gapToMax > PAY_WARNING_GAP
        ? { kind: 'preference', code: 'ask_above_band', detail: cmp.detail }
        : null
    case 'not_comparable':
      // The engine itself says it could not compare: client readiness waits for the answer.
      return { kind: 'question', code: 'comp_not_comparable', detail: cmp.detail, question: 'Can you confirm base versus total, and the currency?', readiness: 'required' }
    case 'unknown':
      return null
    default:
      // inside, at the edges, or below: a low ask is the person's preference, never a mark against them
      return null
  }
}

// ── years ───────────────────────────────────────────────────────────────────

export function yearsDecision(c: CandidateFacts, s: SeatFacts): Blocker | null {
  if (c.experienceYears == null || (s.yearsMin == null && s.yearsMax == null)) return null
  const y = c.experienceYears
  if (s.yearsMin != null && y < s.yearsMin - 3) return { kind: 'preference', code: 'years_under_range', detail: `${y} years against ${s.yearsMin}+ asked` }
  if (s.yearsMax != null && y > s.yearsMax + 3) return { kind: 'preference', code: 'years_over_range', detail: `${y} years against up to ${s.yearsMax} asked` }
  return null
}

// ── education timing ────────────────────────────────────────────────────────

export function availabilityDecision(c: CandidateFacts, today: Date): Blocker | null {
  if (!c.educationEnd || c.educationEnd.year == null) return null
  const t = educationTiming(c.educationEnd, today)
  if (t === 'in_progress') return { kind: 'question', code: 'education_in_progress', detail: describeEducationTiming(c.educationEnd, today), question: 'When could you start full time?', readiness: 'required' }
  if (t === 'ends_this_year_month_unknown') return { kind: 'question', code: 'education_end_month_unknown', detail: describeEducationTiming(c.educationEnd, today), question: 'When does the programme finish?', readiness: 'required' }
  return null
}

// ── the seat verdict ────────────────────────────────────────────────────────

export interface ModelSeatRead {
  job_id: string
  fit: 'strong' | 'possible' | 'no'
  reason: string
  /** The model's free-text blockers, kept as observations only. */
  blockers: string[]
}

export interface SeatVerdict {
  job_id: string
  role_fit: RoleFit
  eligibility: SeatEligibility
  blockers: Blocker[]
  questions: string[]
  /** The candidate-role policy this seat was judged under (global plus this job's rejections and overrides). */
  pair_policy: Eligibility | null
  /** A recorded human exception waived unresolved logistics for this seat. */
  logistics_waived: boolean
  /** What the model wrote, for the record; never the control input. */
  model_reason: string
  model_blockers: string[]
}

export function seatBlockers(c: CandidateFacts, s: SeatFacts, today: Date): Blocker[] {
  const out: Blocker[] = []
  const visa = visaDecision(classifyVisa(c.visaStatus), s.visaRequirement)
  if (visa.blocker) out.push(visa.blocker)
  const loc = locationDecision(c, s)
  if (loc) out.push(loc)
  const pay = payDecision(c, s)
  if (pay) out.push(pay)
  const years = yearsDecision(c, s)
  if (years) out.push(years)
  const avail = availabilityDecision(c, today)
  if (avail) out.push(avail)
  return out
}

/**
 * hard → ineligible; an unknown, or a question the engine says must be
 * answered first → needs_review; anything else → eligible. A recorded
 * waiver clears unknowns and required questions, never a hard blocker.
 */
export function seatEligibility(blockers: Blocker[], waived = false): SeatEligibility {
  if (blockers.some(b => b.kind === 'hard')) return 'ineligible'
  if (waived) return 'eligible'
  if (blockers.some(b => b.kind === 'unknown' || (b.kind === 'question' && b.readiness === 'required'))) return 'needs_review'
  return 'eligible'
}

export interface SeatVerdictOptions {
  /** The policy for this candidate and this job. When it excludes the pair, the seat is ineligible with the reason, whatever the read said. */
  pairPolicy?: Eligibility | null
  logisticsWaived?: boolean
}

export function seatVerdict(read: ModelSeatRead | null, c: CandidateFacts, s: SeatFacts, today: Date, opts: SeatVerdictOptions = {}): SeatVerdict {
  const blockers = seatBlockers(c, s, today)
  const pair = opts.pairPolicy ?? null
  if (pair && !pair.can_match) {
    const roleSpecific = pair.reasons.filter(r => r === 'rejected_for_this_role' || r === 'human_override_block_match')
    blockers.unshift({ kind: 'hard', code: roleSpecific.length ? 'rejected_for_this_role' : 'policy_excluded', detail: (roleSpecific.length ? roleSpecific : pair.reasons).join(', ') })
  }
  const waived = !!opts.logisticsWaived
  return {
    job_id: s.jobId,
    role_fit: read ? (read.fit === 'no' ? 'not_supported' : read.fit) : 'not_assessed',
    eligibility: seatEligibility(blockers, waived),
    blockers,
    questions: blockers.map(b => b.question).filter((q): q is string => !!q),
    pair_policy: pair,
    logistics_waived: waived,
    model_reason: read?.reason ?? '',
    model_blockers: read?.blockers ?? [],
  }
}

// ── the decision ────────────────────────────────────────────────────────────

export type LegacyDecision = 'intro_now' | 'bench' | 'not_fit' | 'route_elsewhere'

export interface Derived {
  fit_version: typeof FIT_VERSION
  next_action: NextAction
  client_intro_ready: boolean
  suggested_decision: LegacyDecision
  /** The model's own suggestion, kept so disagreement is visible. */
  model_suggested: LegacyDecision
  overridden: boolean
  override_reason: string | null
  strong_eligible: string[]
  strong_needs_review: string[]
  strong_ineligible: string[]
  possible: string[]
  questions: string[]
}

export function deriveDecision(input: { seats: SeatVerdict[]; policy: Eligibility; personType: string; modelSuggested: LegacyDecision }): Derived {
  const strongEligible = input.seats.filter(s => s.role_fit === 'strong' && s.eligibility === 'eligible').map(s => s.job_id)
  const strongReview = input.seats.filter(s => s.role_fit === 'strong' && s.eligibility === 'needs_review').map(s => s.job_id)
  const strongIneligible = input.seats.filter(s => s.role_fit === 'strong' && s.eligibility === 'ineligible').map(s => s.job_id)
  const possible = input.seats.filter(s => s.role_fit === 'possible').map(s => s.job_id)
  const questions = [...new Set(input.seats.flatMap(s => s.questions))]
  const base = { fit_version: FIT_VERSION, model_suggested: input.modelSuggested, strong_eligible: strongEligible, strong_needs_review: strongReview, strong_ineligible: strongIneligible, possible, questions } as const

  const finish = (next: NextAction, decision: LegacyDecision, reason: string | null): Derived => ({
    ...base,
    next_action: next,
    client_intro_ready: next === 'client_intro',
    suggested_decision: decision,
    overridden: decision !== input.modelSuggested,
    override_reason: decision !== input.modelSuggested ? reason : null,
  })

  if (input.personType !== 'job_seeker') return finish('human_review', 'route_elsewhere', 'not a job seeker on the read')
  if (input.policy.can_contact === 'no') return finish('hold', 'bench', 'contact is not allowed for this person')
  if (!input.policy.can_match) return finish('hold', 'bench', 'the eligibility policy excludes this person from matching')

  if (strongEligible.length || strongReview.length) {
    // Client-ready only when the person is (policy), every strong seat's logistics are resolved,
    // and every strong seat's own candidate-role policy agrees.
    const pairsReady = input.seats.filter(s => s.role_fit === 'strong' && s.eligibility === 'eligible').every(s => (s.pair_policy ?? input.policy).client_intro_ready)
    if (input.policy.client_intro_ready && strongEligible.length && !strongReview.length && pairsReady) return finish('client_intro', 'intro_now', 'strong, eligible and client-ready')
    // Lily's screening call is the next step; unknown logistics are questions for it.
    return finish('screening_call', 'intro_now', 'a strong seat with no confirmed blocker')
  }
  if (strongIneligible.length) return finish('hold', 'bench', 'a strong seat with a confirmed hard blocker')
  if (possible.length) {
    const onlyUnknowns = input.seats.filter(s => s.role_fit === 'possible').every(s => s.eligibility !== 'ineligible')
    return finish(onlyUnknowns && questions.length ? 'request_information' : 'human_review', 'bench', 'possible seats only')
  }
  // No seat: the model's capability read decides between bench and not a fit; grade does not gate it.
  const decision: LegacyDecision = input.modelSuggested === 'not_fit' ? 'not_fit' : 'bench'
  return finish('no_current_role', decision, null)
}

export function candidateFactsFrom(c: Record<string, unknown>, parsed: { location?: string | null; work_authorization?: string | null; willing_to_relocate?: boolean | null; experience_years?: number | null; salary_expectation_min?: number | null; salary_currency?: string | null; education?: { end_year?: string | null; year?: string | null }[] } | null): CandidateFacts {
  const askAmount = (typeof c.salary_expectation_min === 'number' && c.salary_expectation_min > 0 ? c.salary_expectation_min : null) ?? (typeof parsed?.salary_expectation_min === 'number' && parsed.salary_expectation_min > 0 ? parsed.salary_expectation_min : null)
  const latestEdu = (parsed?.education ?? []).map(e => parseEducationEnd(e.end_year ?? e.year ?? null)).filter(e => e.year != null).sort((a, b) => (b.year ?? 0) - (a.year ?? 0))[0] ?? null
  return {
    visaStatus: (c.visa_status as string | null) ?? parsed?.work_authorization ?? null,
    location: (c.location as string | null) ?? parsed?.location ?? null,
    relocationOk: typeof c.relocation_ok === 'boolean' ? c.relocation_ok : typeof parsed?.willing_to_relocate === 'boolean' ? parsed.willing_to_relocate : null,
    remotePreference: (c.remote_preference as string | null) ?? null,
    salaryAsk: askAmount ? { amount: askAmount, currency: normalizeCurrency(parsed?.salary_currency ?? 'USD'), kind: 'base' } : null,
    experienceYears: typeof c.experience_years === 'number' ? c.experience_years : typeof parsed?.experience_years === 'number' ? parsed.experience_years : null,
    educationEnd: latestEdu,
  }
}

/** Only entries whose id is one we gave the model; anything else is dropped and counted. */
export function keepKnownIds<T extends { [k: string]: unknown }>(rows: T[], key: keyof T, known: Set<string>): { kept: T[]; dropped: number } {
  const kept = rows.filter(r => typeof r[key] === 'string' && known.has(r[key] as string))
  return { kept, dropped: rows.length - kept.length }
}
