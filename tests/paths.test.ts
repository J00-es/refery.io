import { describe, expect, it } from 'vitest'
import { candidatePath, isUuid, rolePath, rolePathFrom, searchPath } from '@/lib/paths'

const UUID = '0d07ebfa-06b9-49b1-bb18-2e74b5a33e8e'

describe('short paths', () => {
  it('recognises a uuid and nothing else', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid(UUID.toUpperCase())).toBe(true)
    expect(isUuid('applied-ai-engineer-7kq3')).toBe(false)
    expect(isUuid('frznf6z')).toBe(false)
    expect(isUuid(null)).toBe(false)
  })

  it('prefers the slug and falls back to the id', () => {
    expect(searchPath('k7m2qxf')).toBe('/searches/k7m2qxf')
    expect(searchPath({ id: UUID, slug: 'k7m2qxf' })).toBe('/searches/k7m2qxf')
    expect(searchPath({ id: UUID, slug: null })).toBe(`/searches/${UUID}`)
    expect(searchPath({ id: UUID, slug: '  ' })).toBe(`/searches/${UUID}`)
  })

  it('keeps hash and tail suffixes', () => {
    expect(rolePath('k7m2qxf', 'applied-ai-engineer-7kq3', '#questions')).toBe('/searches/k7m2qxf/roles/applied-ai-engineer-7kq3#questions')
    expect(rolePath('k7m2qxf', 'applied-ai-engineer-7kq3', '/coverage')).toBe('/searches/k7m2qxf/roles/applied-ai-engineer-7kq3/coverage')
    expect(candidatePath('frznf6z', '/edit')).toBe('/candidates/frznf6z/edit')
    expect(candidatePath({ id: UUID, slug: 'frznf6z' }, '?write=pass')).toBe('/candidates/frznf6z?write=pass')
  })

  it('reads a partner_roles_v row straight', () => {
    expect(rolePathFrom({ job_id: UUID, company_id: UUID, slug: 'applied-ai-engineer-7kq3', company_slug: 'k7m2qxf' })).toBe('/searches/k7m2qxf/roles/applied-ai-engineer-7kq3')
    // a row without slugs still links, to the id form the page redirects
    expect(rolePathFrom({ job_id: 'j', company_id: 'c' })).toBe('/searches/c/roles/j')
  })
})
