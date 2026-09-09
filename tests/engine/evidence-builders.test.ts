import { describe, it, expect } from 'vitest'
import { buildFactBundle } from '../../lib/engine/fact-bundle'
import { draftScorecard } from '../../lib/engine/scorecards'
import { capabilityText } from '../../lib/engine/capability-text'
describe('source-backed engine builders', () => {
 it('never upgrades parsed claims into verified evidence', () => {
   const p = { raw_text: 'Built an API', work_history: [{ title: 'Engineer', description: 'Built an API' }] }
   const b = buildFactBundle(p)
   expect(b.facts.every(f => f.status === 'self_reported')).toBe(true)
   expect(b.facts.find(f => f.fact_key.endsWith('description'))?.span).toBe('Built an API')
   expect(b.facts.find(f => f.fact_key.endsWith('title'))?.span).toBeNull()
   expect(buildFactBundle({ ...p, raw_text: 'Changed' }).contentHash).not.toBe(b.contentHash)
 })
 it('draft role requirements are unconfirmed and cannot become hard gates', () => {
   const s = draftScorecard({ title: 'Engineer', requirements: 'Rust required' }, 'engineering')
   expect(s.content.requirements[0]).toMatchObject({ quote: 'Rust required', hard_gate: false, priority: 'unconfirmed' })
   expect(s.content.priorities_confirmed).toBe(false)
   expect(s.content.dimensions[0].anchors.unknown).toContain('without a score penalty')
 })
 it('identity, grades and logistics do not change capability vectors', () => {
   const p = { skills: ['Rust'], work_history: [{ title: 'Engineer', company: 'FamousCo', description: 'Built resilient APIs' }], education: [{ institution: 'Prestige U' }] }
   const a = capabilityText('candidate', { name: 'Alice', location: 'NYC', parsed_data: p, panel_grade: 'A+' })
   const b = capabilityText('candidate', { name: 'Bob', location: 'Paris', parsed_data: p, panel_grade: 'pass' })
   expect(a.inputHash).toBe(b.inputHash)
   expect(a.text).not.toMatch(/FamousCo|Prestige|NYC|Alice|A\+/)
   expect(a.text).toContain('Built resilient APIs')
 })
 it('removes known identities repeated inside capability prose', () => {
   expect(capabilityText('candidate', { name: 'Alice Jones', parsed_data: { work_history: [{ company: 'FamousCo', description: 'Alice Jones built APIs at FamousCo' }] } }).text).not.toMatch(/Alice Jones|FamousCo/)
 })
 it('thin job requirements are explicit, not replaced with employer marketing', () => {
   expect(capabilityText('job', { title: 'Engineer', description: 'Wonderful team with visas' }).thin).toBe(true)
 })
})
