import { describe, expect, it } from 'vitest'
import { compareAskToBand, parseMoney } from '@/lib/engine/money'
import { describeEducationTiming, educationTiming, parseEducationEnd } from '@/lib/engine/dates'
import { GRADES, gradeLabel, hasPercentile, positioningLine, stripPercentiles } from '@/lib/engine/grade'
import { LEGACY_MAPPINGS, parseLegacyVerdict } from '@/lib/engine/labels'
import { ROUTES, costOf, effortOptions, isApprovedForCandidateData, worstCaseCost } from '@/lib/engine/routes'
import { stableHash, sha256 } from '@/lib/engine/evidence'

describe('money', () => {
  it('$200k in a $180k to $220k band is inside, not at the maximum', () => {
    const c = compareAskToBand({ amount: 200_000, currency: 'USD', kind: 'base' }, { min: 180_000, max: 220_000, currency: 'USD', kind: 'base' })
    expect(c.position).toBe('inside')
    expect(c.detail).toMatch(/inside/)
    expect(compareAskToBand({ amount: 220_000, currency: 'USD', kind: 'base' }, { min: 180_000, max: 220_000, currency: 'USD', kind: 'base' }).position).toBe('at_maximum')
  })
  it('refuses cross-currency and base-versus-OTE comparisons', () => {
    expect(compareAskToBand({ amount: 120_000, currency: 'EUR', kind: 'base' }, { min: 150_000, max: 200_000, currency: 'USD', kind: 'base' }).position).toBe('not_comparable')
    expect(compareAskToBand({ amount: 250_000, currency: 'USD', kind: 'ote' }, { min: 150_000, max: 200_000, currency: 'USD', kind: 'base' }).position).toBe('not_comparable')
    expect(compareAskToBand({ amount: 250_000, currency: 'USD', kind: 'unknown' }, { min: 150_000, max: 200_000, currency: 'USD', kind: 'base' }).position).toBe('not_comparable')
  })
  it('parses the shapes people type', () => {
    expect(parseMoney('$180k')).toEqual({ amount: 180_000, currency: 'USD', kind: 'unknown' })
    expect(parseMoney('€120k base')).toEqual({ amount: 120_000, currency: 'EUR', kind: 'base' })
    expect(parseMoney('OTE 300k')).toMatchObject({ amount: 300_000, kind: 'ote' })
    expect(parseMoney(200000)).toMatchObject({ amount: 200_000 })
    expect(parseMoney('')).toBeNull()
  })
})

describe('dates', () => {
  const sep2026 = new Date('2026-09-09T00:00:00Z')
  it('May 2026 is finished by September 2026', () => {
    expect(educationTiming(parseEducationEnd('May 2026'), sep2026)).toBe('completed')
    expect(describeEducationTiming(parseEducationEnd('May 2026'), sep2026)).toMatch(/finished/)
  })
  it('December 2026 is in progress; a bare 2026 is a question about the month', () => {
    expect(educationTiming(parseEducationEnd('Expected Dec 2026'), sep2026)).toBe('in_progress')
    expect(educationTiming(parseEducationEnd('2026'), sep2026)).toBe('ends_this_year_month_unknown')
    expect(educationTiming(parseEducationEnd('2027-05'), sep2026)).toBe('in_progress')
    expect(educationTiming(parseEducationEnd('present'), sep2026)).toBe('unknown')
  })
})

describe('grade contract', () => {
  it('renders a label from one contract and never a percentile', () => {
    expect(gradeLabel('A-')).toBe('A- · strong, the intro bar')
    expect(GRADES['B+'].meetsBar).toBe(false)
    const line = positioningLine({ grade: 'A-', level: 'L4', fn: 'product', peerLine: 'Top 10% of L4 fintech product leaders' })
    expect(hasPercentile(line)).toBe(false)
    expect(line).toContain('L4 product')
  })
  it('strips top-N% claims from legacy text', () => {
    expect(stripPercentiles('Top 35% of L2 engineers; strong competitive-programming signal')).toBe('L2 engineers; strong competitive-programming signal')
    expect(hasPercentile('Top 5% of L1 systems and AI engineers')).toBe(true)
    expect(hasPercentile('strong evidence for senior backend ownership')).toBe(false)
  })
})

describe('legacy labels', () => {
  it('parses a first-line token and keeps the prose, with provenance unverified', () => {
    const p = parseLegacyVerdict('strong\n\nReal production LLM craft, but comp is a question.')
    expect(p).toMatchObject({ token: 'strong', multiline: true, provenance: 'legacy_unverified' })
    expect(p?.prose).toMatch(/comp is a question/)
  })
  it('low is an alias of weak and is recorded as such', () => {
    expect(parseLegacyVerdict('low')).toMatchObject({ token: 'weak', aliasOf: 'low' })
  })
  it('prose is not a grade', () => {
    expect(parseLegacyVerdict('Top 1% backend engineer, green card, targets Series D')?.token).toBeNull()
  })
  it('keeps both historical mappings visible instead of choosing one', () => {
    expect(LEGACY_MAPPINGS.desk_2026_09.moderate).toBe('A-')
    expect(LEGACY_MAPPINGS.skill_v3_1.moderate).toBe('B+')
  })
})

describe('route register', () => {
  it('production routes are approved for candidate data; the proposed OpenAI routes are benchmark-only', () => {
    expect(isApprovedForCandidateData('anthropic/claude-opus-5')).toBe(true)
    expect(isApprovedForCandidateData('openai/gpt-5.6-terra')).toBe(false)
    expect(isApprovedForCandidateData('openai/gpt-5.6-luna')).toBe(false)
    expect(isApprovedForCandidateData('openai/gpt-5.4-mini')).toBe(false)
    expect(ROUTES['openai/gpt-5.6-terra'].benchmark).toBe(true)
  })
  it('Sol is priced at the official 4/20, not the stale 2/12', () => {
    expect(ROUTES['openai/gpt-5.6-sol'].price).toMatchObject({ input: 4, output: 20 })
    expect(costOf('openai/gpt-5.6-sol', 1_000_000, 0)).toBe(4)
  })
  it('an unknown route is priced at the most expensive known one', () => {
    expect(costOf('vendor/unknown', 1_000_000, 1_000_000)).toBe(30)
  })
  it('a worst case never flatters: no cache, the full output budget', () => {
    expect(worstCaseCost('anthropic/claude-opus-5', 35_000, 12_000)).toBeGreaterThan(0.3)
  })
  it('effort is forwarded only in the option the route understands', () => {
    expect(effortOptions('anthropic/claude-opus-5', 'medium')).toEqual({ anthropic: { effort: 'medium' } })
    expect(effortOptions('openai/gpt-5.6-terra', 'low')).toEqual({ openai: { reasoningEffort: 'low' } })
    expect(effortOptions('google/gemini-3.6-flash', 'low')).toEqual({})
    expect(effortOptions('anthropic/claude-opus-5', 'none')).toEqual({})
  })
})

describe('evidence versions', () => {
  it('hashes content, key order independent', () => {
    expect(stableHash({ a: 1, b: [1, 2] })).toBe(stableHash({ b: [1, 2], a: 1 }))
    expect(sha256('a')).not.toBe(sha256('b'))
  })
})
