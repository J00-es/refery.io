/**
 * One-off, 7 Sep 2026: brings the Arx Labs and Alcor Labs founder briefs in
 * line with the folded layout and with reality.
 *
 * - Both clients signed their agreements (Alcor 12 Aug on v2.7-A, Arx 4 Sep on
 *   v2.7), yet both briefs still opened "How we work" with "Sign the agreement".
 *   That step now says so.
 * - Alcor had no "in short" summaries, which the folded layout shows as the
 *   section header. Added, from the section's own content.
 * - The confirm section starts open on both; the rest fold.
 *
 * Idempotent. Bumps version once per brief per run.
 *
 *   node scripts/patch-hm-briefs-2026-09-07.mjs [--dry]
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry')

const ALCOR_SUMMARIES = {
  company: 'Wearable AI copilot for industrial field technicians. $5M seed led by A*, live in eight countries, six months in.',
  team: 'Elior (CV research, Harvard and NASA) and Gabriel (MIT ML), first hires join a team of two. Correct me if I have a role wrong.',
  roles: 'Four founding engineering seats, all live: applied AI, full-stack, backend and firmware, technical forward-deployed. Hardware-constrained CV is the signal across all four.',
  bar: 'Shipped, not studied. Hardware-constrained or real-time depth. Fully in person in the Bay Area. Founder spirit.',
  logistics: 'Bay Area, in person, the house first then an SF office. Sponsorship for candidates already in the US, so a national search.',
  how: 'Agreement signed. Slack and WhatsApp, candidates arrive ready to assess, speed wins the talent.',
  blurb: 'The anonymised blurb candidates see. Nothing in it identifies Alcor.',
  confirm: 'Two one-line answers and we are calibrated.',
}

function patchSteps(section, first) {
  for (const b of section.blocks) {
    if (b.kind === 'steps' && b.items.length) b.items[0] = first
  }
}

const plans = [
  {
    slug: 'arx-labs-ujnz9q2',
    apply(content) {
      for (const s of content.sections) {
        if (s.id === 'how') {
          s.summary = 'Agreement signed 4 September, so we are live. Slack, the pool first, then targeted scouts, and speed.'
          patchSteps(s, '**Agreement signed on 4 September, so we are live.** Full candidate details come to you as they land; nothing is held back.')
        }
        if (s.id === 'confirm') s.open = true
        if (s.id === 'comp') s.summary = s.summary ?? ''
      }
      if (content.confidential?.points?.length) {
        content.confidential.points[0] = '[Agreement signed 4 September. We are live; the rest of this page is calibration.](#how)'
      }
    },
  },
  {
    slug: 'alcor-labs-rdmg3xa',
    apply(content) {
      for (const s of content.sections) {
        if (ALCOR_SUMMARIES[s.id] && !s.summary) s.summary = ALCOR_SUMMARIES[s.id]
        if (s.id === 'how') {
          patchSteps(s, '**Agreement signed on 12 August, so we are live.** Thank you both.')
        }
        if (s.id === 'confirm') s.open = true
      }
    },
  },
]

for (const plan of plans) {
  const { data: row, error } = await db.from('hm_briefs').select('id, version, content').eq('slug', plan.slug).single()
  if (error || !row) throw new Error(`${plan.slug}: ${error?.message ?? 'not found'}`)
  const content = row.content
  plan.apply(content)
  console.log(plan.slug, `v${row.version} → v${row.version + 1}`, content.sections.map(s => `${s.id}${s.open ? '*' : ''}${s.summary ? '' : ' (no summary)'}`).join(', '))
  if (!DRY) {
    const { error: uErr } = await db.from('hm_briefs').update({ content, version: row.version + 1, updated_at: new Date().toISOString() }).eq('id', row.id)
    if (uErr) throw new Error(uErr.message)
  }
}
console.log(DRY ? 'Dry run. Nothing written.' : 'Done.')
