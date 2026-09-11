/**
 * Every moment renders, with every optional fact empty and with all of them
 * filled, and never leaks a brace, a company name before consent, or an em
 * dash. Same reason as tests/voice/templates.test.ts: a render is pure, so a
 * template that would throw at send time cannot reach a candidate.
 */

import { describe, it, expect } from 'vitest'
import { MOMENTS, MissingFact, footerText, renderMoment, type MomentFacts } from '@/lib/messages/templates'

const EMPTY: MomentFacts = {
  candidateFirst: 'Daniel',
  partnerFirst: 'Maya',
  partnerName: 'Maya Okafor',
  signature: null,
  searchHeadline: null,
  companyOrAlias: null,
  city: null,
  bookingLink: null,
  interviewSteps: null,
  reason: null,
  startDate: null,
  consentLink: 'https://refery.xyz/c/abc',
}

const FULL: MomentFacts = {
  ...EMPTY,
  signature: 'Maya Okafor · Okafor Search · +34 600 000 000',
  searchHeadline: 'AI-First Fullstack Engineer, Senior',
  companyOrAlias: 'healthcare marketplace, Barcelona',
  city: 'Barcelona',
  bookingLink: 'https://cal.com/livo/intro',
  interviewSteps: '1. Intro with the CTO\n2. Pairing session',
  reason: 'they went with someone who has run a mobile team',
  startDate: '12 October 2026',
}

describe('every moment renders', () => {
  for (const moment of MOMENTS) {
    for (const [label, facts] of [['empty', EMPTY], ['full', FULL]] as const) {
      it(`${moment} (${label})`, () => {
        const d = renderMoment(moment, facts)
        if (moment !== 'blank') expect(d.subject.trim()).not.toBe('')
        expect(d.body).not.toMatch(/[{}]/)
        expect(d.body).not.toContain('—')
        expect(d.subject).not.toContain('—')
        // Signed by the partner, never by Lily.
        expect(d.body.trimEnd().endsWith(facts.signature ?? facts.partnerName)).toBe(true)
        expect(d.body).not.toMatch(/Best,\nLily$/)
        expect(d.body).not.toContain('undefined')
        expect(d.body).not.toContain('null')
      })
    }
  }
})

describe('the facts that matter', () => {
  it('meet Lily carries her booking link and the search', () => {
    const d = renderMoment('intro', FULL)
    expect(d.body).toContain('cal.com/refery-lily/15')
    expect(d.body).toContain('AI-First Fullstack Engineer, Senior')
    expect(d.subject).toBe('Intro: Daniel <> Lily Joo (Refery)')
  })
  it('received your CV names no company, even when one is known', () => {
    const d = renderMoment('received', FULL)
    expect(d.body).not.toContain('healthcare marketplace')
  })
  it('the consent ask needs its link', () => {
    expect(() => renderMoment('consent', { ...FULL, consentLink: null })).toThrow(MissingFact)
    expect(renderMoment('consent', FULL).body).toContain('https://refery.xyz/c/abc')
  })
  it('the interview note carries the booking link and steps', () => {
    const d = renderMoment('interview', FULL)
    expect(d.body).toContain('https://cal.com/livo/intro')
    expect(d.body).toContain('Pairing session')
    expect(renderMoment('interview', EMPTY).body).toContain('setting up the first call')
  })
  it('the footer names the partner and the stop link', () => {
    const f = footerText('Maya Okafor', 'Maya', 'https://refery.xyz/stop/x')
    expect(f).toContain('Maya Okafor')
    expect(f).toContain('https://refery.xyz/stop/x')
  })
})
