/**
 * Every template renders.
 *
 * This exists because `lateLine` was spread into templates B, D, E and F for
 * two days without ever being defined. TypeScript reported it, but the Next
 * build sets `ignoreBuildErrors`, so it shipped and the first scout approval
 * threw at render time: the decision was recorded, the email was not, and the
 * only trace was a note in a Slack thread. A render is pure, so the whole
 * registry can be exercised here and that class of bug cannot reach an
 * applicant again.
 *
 * A template that gains a required fact should gain a case below.
 */

import { describe, it, expect } from 'vitest'
import * as T from '@/lib/voice/templates'
import type { RenderedEmail } from '@/lib/voice/templates'

const NAME = 'Ada Lovelace'
const LINK = 'https://refery.xyz/auth/sign-up?invite=abc123'

/** Every template with facts good enough to render. */
const CASES: Array<[string, () => RenderedEmail]> = [
  ['A', () => T.templateA({ fullName: NAME, reviewDate: 'Friday' })],
  ['A, no review date', () => T.templateA({ fullName: NAME, reviewDate: null })],
  ['B', () => T.templateB({ fullName: NAME, verifiedDetail: 'the person you mentioned', onboardingLink: LINK })],
  ['C', () => T.templateC({ fullName: NAME, specialty: 'GTM in New York', anonymisedSummary: 'a Series A fintech hiring a first AE', previewLink: LINK })],
  ['D', () => T.templateD({ fullName: NAME, verifiedDetail: 'the 2 people you mentioned', reason: 'Your New York network sits right on the searches we are running now', previewLink: LINK, question: 'the Head of Sales search' })],
  ['E', () => T.templateE({ fullName: NAME, focusLine: 'engineering and GTM, on-site in SF or NY' })],
  ['F', () => T.templateF({ fullName: NAME, strength: 'Your network around Berlin', whereSearchesAre: 'on-site in SF or NY', applied: true })],
  ['F, not from an application', () => T.templateF({ fullName: NAME, strength: 'Your network', whereSearchesAre: 'in London', applied: false })],
  ['G', () => T.templateG({ fullName: NAME, existingSubject: '[Refery] Ada Lovelace | Application received', resumeLink: LINK, incompleteStep: 'the partner terms' })],
  ['H', () => T.templateH({ fullName: NAME, role: 'Head of Sales', city: 'New York', client: 'a Series B fintech', reason: 'you know this market', requirement: 'five years selling to banks', briefLink: LINK })],
  ['H, no city or requirement', () => T.templateH({ fullName: NAME, role: 'Head of Sales', city: null, client: 'a Series B fintech', reason: 'you know this market', requirement: null, briefLink: LINK })],
  ['K', () => T.templateK({ fullName: NAME, candidate: 'Grace Hopper', role: 'Staff Engineer', statusLink: LINK, reviewDate: 'Thursday', attributionConfirmed: true })],
  ['K, attribution unconfirmed', () => T.templateK({ fullName: NAME, candidate: 'Grace Hopper', role: 'Staff Engineer', statusLink: LINK, reviewDate: 'Thursday', attributionConfirmed: false })],
  ['N', () => T.templateN({ fullName: NAME, existingSubject: '[Refery] Ada Lovelace | Application received' })],
  ['P', () => T.templateP({ fullName: NAME, newReviewDate: 'Monday' })],
  ['S', () => T.templateS({ fullName: NAME, existingSubject: '[Refery] Ada Lovelace | A first search', invitationLink: LINK, answer: 'The fee is 20% of first-year base.' })],
  ['S, no answer', () => T.templateS({ fullName: NAME, existingSubject: '[Refery] Ada Lovelace | A first search', invitationLink: LINK, answer: null })],
  ['U', () => T.templateU({ fullName: NAME, role: 'Head of Sales', reason: 'It is the search closest to your network' })],
  ['Ask', () => T.templateAsk({ fullName: NAME, question: 'Which cities is your network strongest in?' })],
  ['CS1', () => T.templateCS1({ fullName: NAME, reviewDate: 'Friday', profileLink: LINK })],
  ['CS1, no review date', () => T.templateCS1({ fullName: NAME, reviewDate: null, profileLink: LINK })],
  ['CS1Dup', () => T.templateCS1Dup({ fullName: NAME, profileLink: LINK })],
  ['CSLink', () => T.templateCSLink({ fullName: NAME, profileLink: LINK })],
  ['CSP', () => T.templateCSP({ fullName: NAME, newReviewDate: 'Monday' })],
  ['CS6', () => T.templateCS6({ fullName: NAME, keptUntil: 'March 2027', lookingLink: LINK, pauseLink: LINK, deleteLink: LINK, lapsed: false })],
  ['CS6, lapsed', () => T.templateCS6({ fullName: NAME, keptUntil: 'March 2027', lookingLink: LINK, pauseLink: LINK, deleteLink: LINK, lapsed: true })],
  ['RL1', () => T.templateRL1({ fullName: NAME, referrerName: 'Grace Hopper', reviewDate: 'Friday', profileLink: LINK })],
  ['RL1, no review date', () => T.templateRL1({ fullName: NAME, referrerName: 'Grace Hopper', reviewDate: null, profileLink: LINK })],
  ['RL2', () => T.templateRL2({ fullName: NAME, referrerName: 'Grace Hopper', reviewDate: 'Friday' })],
  ['RL3', () => T.templateRL3({ fullName: NAME, applyLink: LINK })],
  ['RS1', () => T.templateRS1({ fullName: NAME, candidate: 'Grace Hopper', candidateLine: 'from New York', code: 'ada', confirmLink: LINK, declineLink: LINK, pageLink: LINK })],
  ['RS1, no line', () => T.templateRS1({ fullName: NAME, candidate: 'Grace Hopper', candidateLine: null, code: 'ada', confirmLink: LINK, declineLink: LINK, pageLink: LINK })],
  ['RS2', () => T.templateRS2({ fullName: NAME, candidate: 'Grace Hopper', arrivedOn: 'Friday', readAnywayOn: 'Friday 18 September', confirmLink: LINK, declineLink: LINK })],
  ['RS3', () => T.templateRS3({ fullName: NAME, candidate: 'Grace Hopper' })],
  ['RS4, disowned', () => T.templateRS4({ fullName: NAME, newLink: LINK, reason: 'disowned' })],
  ['RS4, burst', () => T.templateRS4({ fullName: NAME, newLink: LINK, reason: 'burst' })],
]

describe('every template renders', () => {
  for (const [label, render] of CASES) {
    it(`${label} renders and is signed`, () => {
      const email = render()
      expect(email.templateId).toBeTruthy()
      expect(email.subject.trim()).not.toBe('')
      expect(email.text.trim()).not.toBe('')
      expect(email.version).toBe(T.VOICE_VERSION)
      // Lily signs every one of them.
      expect(email.text.endsWith('Best,\nLily')).toBe(true)
      // A brace means a fact was written into the copy but never filled.
      expect(email.text).not.toMatch(/[{}]/)
      // The greeting uses the first name only.
      expect(email.text.startsWith('Hi Ada')).toBe(true)
    })
  }
})

describe('the late line', () => {
  // The exact regression: these four spread lateLine(p.late).
  const late: Array<[string, (l: boolean) => RenderedEmail]> = [
    ['B', l => T.templateB({ fullName: NAME, verifiedDetail: 'the person you mentioned', onboardingLink: LINK, late: l })],
    ['D', l => T.templateD({ fullName: NAME, verifiedDetail: 'the person you mentioned', reason: 'Your network fits', previewLink: LINK, question: 'the Head of Sales search', late: l })],
    ['E', l => T.templateE({ fullName: NAME, focusLine: 'engineering and GTM', late: l })],
    ['F', l => T.templateF({ fullName: NAME, strength: 'Your network', whereSearchesAre: 'in SF', applied: true, late: l })],
  ]

  for (const [label, render] of late) {
    it(`${label} apologises only when the reply is late`, () => {
      expect(render(true).text).toContain('Sorry for the slow reply on this one.')
      expect(render(false).text).not.toContain('Sorry for the slow reply')
    })
  }
})

describe('a missing fact stops the send', () => {
  it('throws MissingFact rather than emailing a gap', () => {
    expect(() => T.templateB({ fullName: NAME, verifiedDetail: '', onboardingLink: LINK })).toThrow(T.MissingFact)
    expect(() => T.templateB({ fullName: NAME, verifiedDetail: 'something true', onboardingLink: '   ' })).toThrow(T.MissingFact)
  })

  it('names the fact it wanted', () => {
    try {
      T.templateE({ fullName: NAME, focusLine: '' })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(T.MissingFact)
      expect((e as T.MissingFact).fact).toBe('current_focus_line')
    }
  })
})
