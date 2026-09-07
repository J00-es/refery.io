/**
 * Runs an authored brief through the real `normalizeBrief` and reports what it
 * would silently drop: a section with no heading, a stats item without a label,
 * a block of an unknown kind. The page never errors on these, it just comes out
 * short, so check before publishing.
 *
 *   npx tsx scripts/check-brief-content.ts scripts/seed-livo-hm-brief.mjs
 */

import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { normalizeBrief } from '../lib/brief'

async function main() {
  const file = process.argv[2]
  if (!file) throw new Error('pass the module that exports `content`')
  const mod = (await import(pathToFileURL(resolve(file)).href)) as { content: unknown }
  const raw = mod.content as { sections: { id: string; heading?: string; blocks: { kind: string }[] }[] }
  const norm = normalizeBrief(raw)

  let problems = 0
  const normById = new Map(norm.sections.map(s => [s.id, s]))
  for (const s of raw.sections) {
    const n = normById.get(s.id)
    if (!n) {
      console.log(`DROPPED section ${s.id} (${s.heading ?? 'no heading'})`)
      problems++
      continue
    }
    if (n.blocks.length !== s.blocks.length) {
      console.log(`section ${s.id}: authored ${s.blocks.length} blocks, rendered ${n.blocks.length}`)
      const kinds = s.blocks.map(b => b.kind)
      const kept = n.blocks.map(b => b.kind)
      console.log(`  authored: ${kinds.join(', ')}`)
      console.log(`  rendered: ${kept.join(', ')}`)
      problems++
    } else {
      console.log(`ok ${s.id}: ${n.blocks.length} blocks`)
    }
  }
  const c = (raw as { confidential?: { points?: string[] } }).confidential
  if (c?.points && norm.confidential?.points?.length !== c.points.length) {
    console.log(`confidential points: authored ${c.points.length}, rendered ${norm.confidential?.points?.length ?? 0}`)
    problems++
  }
  console.log(problems ? `${problems} problem(s)` : 'clean')
  process.exit(problems ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
