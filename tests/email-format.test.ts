import { describe, expect, it } from 'vitest'
import { emailProblem, isPlausibleEmail } from '@/lib/email-format'

describe('email format', () => {
  it('accepts ordinary addresses, with surrounding space and mixed case', () => {
    for (const ok of ['jane@example.com', 'aliaksei.charakhovich@hireforyou.pro', ' Kim@10kVentures.co ', 'a+b@sub.domain.co.uk']) {
      expect(isPlausibleEmail(ok), ok).toBe(true)
      expect(emailProblem(ok), ok).toBeNull()
    }
  })

  it('rejects a surname typed into the email box and quotes it', () => {
    expect(isPlausibleEmail('Turchenik')).toBe(false)
    const msg = emailProblem('Turchenik', 'your email')
    expect(msg).toContain('"Turchenik"')
    expect(msg).toContain('needs an @')
  })

  it('rejects a bare local part, a bare domain, a missing TLD, spaces, and a one-letter TLD', () => {
    for (const bad of ['svetlana@', '@hireforyou.pro', 'svetlana@hireforyou', 'sve tlana@hireforyou.pro', 'svetlana@hireforyou.p']) {
      expect(isPlausibleEmail(bad), bad).toBe(false)
      expect(emailProblem(bad, 'their email'), bad).not.toBeNull()
    }
  })

  it('asks for the address when the box is empty', () => {
    expect(emailProblem('', 'their email')).toBe('Please enter their email')
    expect(emailProblem(null)).toBe('Please enter your email')
  })
})
