/**
 * Every subject the desk writes, in one place, so the inbox row already says
 * the next step. Lily's format:
 *
 *   to a partner     [Refery] <Full name> | <step>
 *   to a candidate   [Refery] <First name> / Lily | <step>
 *
 * Replies and nudges go into the same Gmail thread, so they inherit the first
 * subject as "Re:" and the step stays visible on every reminder.
 */

import { firstNameOf } from '@/lib/desk/people'

export type DeskDecision = 'intro_now' | 'bench' | 'not_fit'

const PARTNER_STEP: Record<DeskDecision, string> = {
  intro_now: 'warm intro request',
  bench: 'kept in the pool',
  not_fit: 'passing, with the reason',
}

const CANDIDATE_STEP: Record<DeskDecision, string> = {
  intro_now: '15 min this week?',
  bench: 'keeping you in mind',
  not_fit: 'a candid note',
}

export function partnerSubject(candidateName: string, step: string): string {
  return `[Refery] ${candidateName} | ${step}`
}

export function candidateSubject(candidateName: string, step: string): string {
  return `[Refery] ${firstNameOf(candidateName)} / Lily | ${step}`
}

/** The subject for one of the three decisions, by who receives it. */
export function decisionSubject(decision: DeskDecision, recipient: 'owner' | 'candidate', candidateName: string): string {
  return recipient === 'owner' ? partnerSubject(candidateName, PARTNER_STEP[decision]) : candidateSubject(candidateName, CANDIDATE_STEP[decision])
}

/** Lily writing to the candidate herself: after a partner asked her to, or after a partner never connected them. */
export function directSubject(candidateName: string): string {
  return candidateSubject(candidateName, CANDIDATE_STEP.intro_now)
}

/** A fresh note to the partner about where their person is, when there is no thread to reply into. */
export function partnerUpdateSubject(candidateName: string, outcome: 'went_direct' | 'dormant' | 'booked' | 'spoke'): string {
  const step = { went_direct: 'I reached out directly', dormant: 'parked for now', booked: 'call booked', spoke: 'we spoke' }[outcome]
  return partnerSubject(candidateName, step)
}

/** The rubric line the panel reads, so its drafts carry the same subjects the desk will send. */
export const SUBJECT_RULE = `Subject lines, exactly: to a partner "[Refery] <Candidate full name> | warm intro request" for intro_now, "[Refery] <Candidate full name> | kept in the pool" for bench, "[Refery] <Candidate full name> | passing, with the reason" for not_fit; to the candidate "[Refery] <First name> / Lily | 15 min this week?" for intro_now, "[Refery] <First name> / Lily | keeping you in mind" for bench, "[Refery] <First name> / Lily | a candid note" for not_fit.`
