import { describe, expect, it } from 'vitest'
import { sanitizeFirmDraft } from '@/lib/firm-drafts'
import { accountStateFor } from '@/lib/account-state'

describe('sanitizeFirmDraft', () => {
  it('keeps only the sign-up fields, trimmed', () => {
    const d = sanitizeFirmDraft({
      name: '  HireForYou ',
      legal_name: 'HireForYou.pro sp. z o.o.',
      role: 'super_admin',
      password: 'nope',
      jurisdiction: 'Poland',
    })
    expect(d).toEqual({ name: 'HireForYou', legal_name: 'HireForYou.pro sp. z o.o.', jurisdiction: 'Poland' })
  })

  it('accepts signer_self as the form parks it and as the route receives it', () => {
    expect(sanitizeFirmDraft({ name: 'X', signer_self: false })?.signer_self).toBe('no')
    expect(sanitizeFirmDraft({ name: 'X', signer_self: 'yes' })?.signer_self).toBe('yes')
    expect(sanitizeFirmDraft({ name: 'X', signer_self: 'maybe' })?.signer_self).toBeUndefined()
  })

  it('is null when there is no firm in it', () => {
    expect(sanitizeFirmDraft(null)).toBeNull()
    expect(sanitizeFirmDraft('string')).toBeNull()
    expect(sanitizeFirmDraft({ jurisdiction: 'Poland' })).toBeNull()
    expect(sanitizeFirmDraft({ name: '   ' })).toBeNull()
  })

  it('caps every value', () => {
    const d = sanitizeFirmDraft({ name: 'a'.repeat(500) })
    expect(d?.name).toHaveLength(200)
  })
})

describe('accountStateFor', () => {
  it('routes every kind of account', () => {
    expect(accountStateFor(null, null)).toEqual({ state: 'none' })
    expect(accountStateFor({ role: 'hiring_manager', status: 'active' }, null)).toEqual({ state: 'not_partner' })
    expect(accountStateFor({ role: 'recruiter', status: 'pending', full_name: 'Svetlana Turchenik' }, null)).toEqual({
      state: 'pending',
      firstName: 'Svetlana',
    })
    expect(accountStateFor({ role: 'scout', status: 'active', full_name: 'Jonny Q' }, 'Founders Connect')).toEqual({
      state: 'in_firm',
      firmName: 'Founders Connect',
    })
    expect(accountStateFor({ role: 'recruiter', status: 'active', full_name: 'Jonny Q' }, null)).toEqual({
      state: 'partner',
      firstName: 'Jonny',
    })
  })
})
