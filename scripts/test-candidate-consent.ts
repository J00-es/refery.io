/**
 * End-to-end test of the candidate consent note against production. Creates a
 * throwaway candidate carrying Lily's own email, a marked submission on Livo's
 * engineer search, and sends the one-tap note; prints the private link.
 *
 *   npx tsx scripts/test-candidate-consent.ts            # create + send
 *   npx tsx scripts/test-candidate-consent.ts --cleanup  # remove the test rows
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
const NAME = 'Test Consent (ignore)'

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  if (process.argv.includes('--cleanup')) {
    const { data: cands } = await db.from('candidates').select('id').eq('name', NAME)
    for (const c of cands ?? []) {
      await db.from('candidate_consents').delete().eq('candidate_id', c.id)
      const { data: subs } = await db.from('role_submissions').select('id').eq('candidate_id', c.id)
      for (const s of subs ?? []) await db.from('role_submission_events').delete().eq('submission_id', s.id)
      await db.from('role_submissions').delete().eq('candidate_id', c.id)
      await db.from('job_candidate_pipeline').delete().eq('candidate_id', c.id)
      const { error } = await db.from('candidates').delete().eq('id', c.id)
      console.log('deleted candidate', c.id, error?.message ?? '')
    }
    return
  }

  const { data: cand, error: cErr } = await db
    .from('candidates')
    .insert({ name: NAME, email: 'lily@10kventures.co', user_id: LILY, owner_user_id: LILY, location: 'Barcelona', resume_blob_pathname: 'test/consent-ignore.pdf' })
    .select('id')
    .single()
  if (cErr || !cand) throw new Error(`candidate insert failed: ${cErr?.message}`)

  const { data: sub, error } = await db
    .from('role_submissions')
    .insert({
      job_id: JOB,
      candidate_id: cand.id,
      company_id: COMPANY,
      submitted_by_user_id: LILY,
      status: 'submitted',
      pitch: 'TEST CONSENT, ignore: a throwaway submission to exercise the one-tap note.',
      work_authorization: 'eu_citizen',
      spoken_to_candidate: 'not_yet',
    })
    .select('id')
    .single()
  if (error || !sub) throw new Error(`submission insert failed: ${error?.message}`)
  console.log('candidate', cand.id, 'submission', sub.id)

  const { requestConsent } = await import('../lib/candidate-consent')
  const res = await requestConsent(db, { candidateId: cand.id, companyId: COMPANY, submissionId: sub.id, requestedByUserId: LILY })
  console.log('consent', JSON.stringify(res))
  if (res) console.log('url', `https://refery.xyz/c/${res.token}`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
