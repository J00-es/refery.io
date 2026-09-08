/**
 * End-to-end test of client delivery against production: creates a marked test
 * submission on Livo's engineer search, delivers it, prints where it went.
 *
 *   npx tsx scripts/test-client-delivery.ts            # create + deliver
 *   npx tsx scripts/test-client-delivery.ts --cleanup  # remove the test rows
 *
 * The candidate is one of Lily's own, the partner of record is Lily, so the
 * only people who hear about it are Lily (Slack room, desk, email) and nobody
 * at Livo unless they open the room.
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

const LILY = '864aa3a4-f9e0-49c6-a35a-7ca02ffe04a7'
const COMPANY = '9c2b7d10-6f4e-4a8b-9d21-1e5b0a7c3f40'
const JOB = '9c2b7d10-6f4e-4a8b-9d21-1e5b0a7c3f41'
const MARK = 'TEST DELIVERY, ignore'

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const re = process.argv.indexOf('--redeliver')
  if (re >= 0) {
    const id = process.argv[re + 1]
    await db.from('role_submissions').update({ client_delivered_at: null, client_channel: null, client_slack_channel: null, client_slack_ts: null }).eq('id', id)
    const { deliverSubmission } = await import('../lib/client-delivery')
    console.log('redelivered', JSON.stringify(await deliverSubmission(id)))
    return
  }

  if (process.argv.includes('--cleanup')) {
    const { data: rows } = await db.from('role_submissions').select('id, client_slack_channel, client_slack_ts').eq('company_id', COMPANY).ilike('pitch', `${MARK}%`)
    for (const r of rows ?? []) {
      if (r.client_slack_channel && r.client_slack_ts) {
        await fetch('https://slack.com/api/chat.delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
          body: JSON.stringify({ channel: r.client_slack_channel, ts: r.client_slack_ts }),
        }).then(r => r.json()).then(j => console.log('slack delete', j.ok, j.error ?? ''))
      }
      await db.from('role_submission_events').delete().eq('submission_id', r.id)
      await db.from('job_candidate_pipeline').delete().eq('job_id', JOB).eq('candidate_id', (await db.from('role_submissions').select('candidate_id').eq('id', r.id).single()).data?.candidate_id)
      await db.from('role_submissions').delete().eq('id', r.id)
      console.log('deleted', r.id)
    }
    return
  }

  const { data: cand } = await db.from('candidates').select('id, name').eq('user_id', LILY).ilike('name', 'Xavi Francisco%').maybeSingle()
  if (!cand) throw new Error('test candidate not found')

  const { data: sub, error } = await db
    .from('role_submissions')
    .insert({
      job_id: JOB,
      candidate_id: cand.id,
      company_id: COMPANY,
      submitted_by_user_id: LILY,
      status: 'sent_to_client',
      pitch: `${MARK}: senior full-stack at Perk, Barcelona, TypeScript and React with Node and Postgres.\nShips with AI tools daily and can say where they fail.\nOpen to a smaller team where he owns outcomes.`,
      work_authorization: 'eu_citizen',
      target_base: 85000,
      reviewed_by: LILY,
      reviewed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !sub) throw new Error(`insert failed: ${error?.message}`)
  console.log('submission', sub.id)

  const { deliverSubmission } = await import('../lib/client-delivery')
  const res = await deliverSubmission(sub.id)
  console.log('delivered', JSON.stringify(res))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
