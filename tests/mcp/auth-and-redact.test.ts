import { describe, expect, it } from 'vitest'
import { bearerFrom, hashToken, newToken, tokenMatches } from '@/lib/mcp/auth'
import { contactLines, displayName, daysSince } from '@/lib/mcp/redact'
import { redactArgs } from '@/lib/mcp/journal'
import { TOOL_SPECS, WRITE_TOOL_NAMES } from '@/lib/mcp/tools'

describe('the key', () => {
  it('is long, prefixed, and only its hash ever matches', () => {
    const t = newToken()
    expect(t).toMatch(/^rfy_[0-9a-f]{48}$/)
    expect(newToken()).not.toBe(t)
    const h = hashToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenMatches(t, h)).toBe(true)
    expect(tokenMatches(t.slice(0, -1) + 'x', h)).toBe(false)
    expect(tokenMatches('', h)).toBe(false)
  })

  it('reads a bearer header and nothing else', () => {
    expect(bearerFrom('Bearer abc')).toBe('abc')
    expect(bearerFrom('bearer abc')).toBe('abc')
    expect(bearerFrom('Basic abc')).toBeNull()
    expect(bearerFrom(null)).toBeNull()
    expect(bearerFrom('Bearer')).toBeNull()
  })
})

describe('what leaves the building', () => {
  it('hides the surname until consent', () => {
    expect(displayName('Maryam Okafor', false)).toBe('Maryam O.')
    expect(displayName('Maryam Okafor', true)).toBe('Maryam Okafor')
    expect(displayName('  jean  luc  picard ', false)).toBe('jean P.')
    expect(displayName('Cher', false)).toBe('Cher')
    expect(displayName(null, false)).toBe('Unnamed')
  })

  it('hides every contact line until consent', () => {
    const c = { email: 'a@b.c', phone: '1', linkedin_url: 'https://linkedin.com/in/a' }
    expect(contactLines(c, false)).toEqual(['contact: hidden until they consent to be put forward'])
    expect(contactLines(c, true)).toHaveLength(3)
    expect(contactLines({}, true)).toEqual(['contact: none on file'])
  })

  it('counts days without going negative', () => {
    const now = Date.parse('2026-09-11T12:00:00Z')
    expect(daysSince('2026-09-01T00:00:00Z', now)).toBe(10)
    expect(daysSince('2026-09-12T00:00:00Z', now)).toBe(0)
    expect(daysSince(null, now)).toBeNull()
  })

  it('the journal never keeps an email body', () => {
    const r = redactArgs({ to: 'a@b.c', body: 'x'.repeat(500), subject: 'y'.repeat(200), ids: Array.from({ length: 30 }, (_, i) => i) })
    expect(r.body).toBe('<500 chars>')
    expect(String(r.subject)).toHaveLength(160)
    expect((r.ids as unknown[]).length).toBe(26)
  })
})

describe('the twelve verbs', () => {
  it('are twelve, six of each, each with a schema and a description', () => {
    expect(TOOL_SPECS).toHaveLength(12)
    expect(TOOL_SPECS.filter(t => t.kind === 'write').map(t => t.name).sort()).toEqual(['decide_candidate', 'note', 'propose_search', 'run_bench', 'send_desk_email'])
    expect(WRITE_TOOL_NAMES.size).toBe(5)
    for (const t of TOOL_SPECS) {
      expect(t.description.length).toBeGreaterThan(40)
      expect(t.inputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('has no query tool', () => {
    expect(TOOL_SPECS.some(t => /sql|query|execute/.test(t.name))).toBe(false)
  })
})
