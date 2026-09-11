/**
 * Smoke test for the sourcing desk against production, model-free unless
 * asked. Reads Gmail, never sends. Writes only: the desk mailbox row and,
 * with --brief, one draft profile version for the given seat.
 *
 *   npx tsx scripts/sourcing-smoke.ts <jobId>            # sources + mailbox + sync
 *   npx tsx scripts/sourcing-smoke.ts <jobId> --brief    # also draft a profile (one model call)
 */

import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
for (const [k, v] of Object.entries(env)) if (!process.env[k]) process.env[k] = v as string

async function main() {
  const jobId = process.argv[2]
  if (!jobId) throw new Error('jobId required')
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { gatherSources, buildBrief } = await import('../lib/sourcing/brief')
  const g = await gatherSources(admin, jobId)
  console.log(`\n== sources for ${g.title} at ${g.companyName}`)
  for (const s of g.sources) console.log(`  ${s.kind.padEnd(10)} ${s.label.padEnd(36)} ${s.at ?? ''}  ${s.chars} chars`)
  console.log(`  total ${g.text.length} chars`)

  const { ensureDeskMailbox, loadMailboxes, testMailbox, mailboxHealth } = await import('../lib/sourcing/mailboxes')
  await ensureDeskMailbox(admin)
  const mailboxes = await loadMailboxes(admin)
  console.log('\n== mailboxes')
  for (const m of mailboxes) {
    const t = await testMailbox(m)
    const h = await mailboxHealth(admin, m)
    console.log(`  ${m.address.padEnd(28)} ${m.credential.kind.padEnd(16)} test=${t.ok ? 'ok' : t.error} cap=${h.cap} sent=${h.sent} room=${h.room} blocked=${h.blocked ?? 'no'}`)
  }

  const { syncMailbox } = await import('../lib/sourcing/sync')
  console.log('\n== sync')
  for (const m of mailboxes) console.log(' ', JSON.stringify(await syncMailbox(admin, m)))

  if (process.argv.includes('--brief')) {
    console.log('\n== building a profile (one model call)')
    const b = await buildBrief(admin, jobId, 'smoke-test')
    console.log(`  v${b.version} ${b.status} model=${b.model}`)
    console.log(`  who: ${b.spec.who}`)
    for (const r of b.spec.requirements) console.log(`  [${r.mandatory ? 'MUST' : 'pref'}] ${r.key}: ${r.label}  <- ${r.sources.map(s => s.label).join(', ')}`)
    console.log(`  employers: ${b.spec.employers.map(e => `${e.name}${e.domain ? ` (${e.domain})` : ''}`).join(', ')}`)
    console.log(`  titles: ${b.spec.titles.join(', ')}`)
    console.log(`  locations: ${b.spec.locations.join(', ')} · ${b.spec.onsite} · years ${b.spec.years.min}-${b.spec.years.max}`)
    console.log(`  questions: ${b.spec.questions.join(' | ')}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
