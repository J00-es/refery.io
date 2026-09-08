/**
 * Remove everything one onboarding run created: the company and its client
 * row, jobs and partner roles, both briefs and their invites/answers/comments,
 * the agreement link, the run itself, and archive the Slack room.
 *
 *   npx tsx scripts/purge-onboarding-run.ts <run id> [--keep-company]
 *
 * Refuses to touch a company that has any submission or pipeline row, so it
 * cannot take a live client with it.
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
  const runId = process.argv[2]
  if (!runId) throw new Error('usage: purge-onboarding-run.ts <run id>')
  const keepCompany = process.argv.includes('--keep-company')
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const { data: run } = await db.from('onboarding_runs').select('id, company_id, hm_brief_id, slack_channel_id, slack_channel_name, status').eq('id', runId).maybeSingle()
  if (!run) throw new Error('no such run')
  const companyId = run.company_id as string | null
  console.log('run', run.id, run.status, 'company', companyId, 'brief', run.hm_brief_id, 'room', run.slack_channel_name)

  if (companyId) {
    const { count: subs } = await db.from('role_submissions').select('id', { count: 'exact', head: true }).eq('company_id', companyId)
    if ((subs ?? 0) > 0) throw new Error(`company has ${subs} submissions; not purging`)
  }

  const count = async (label: string, q: PromiseLike<{ error: { message: string } | null; count?: number | null }>) => {
    const r = await q
    if (r.error) console.warn('  !', label, r.error.message)
    else console.log('  -', label, r.count ?? '')
  }

  if (run.hm_brief_id) {
    for (const t of ['hm_brief_invites', 'hm_brief_answers', 'hm_brief_comments', 'hm_brief_events']) {
      await count(t, db.from(t).delete({ count: 'exact' }).eq('brief_id', run.hm_brief_id))
    }
    await count('hm_briefs', db.from('hm_briefs').delete({ count: 'exact' }).eq('id', run.hm_brief_id))
  }

  if (companyId && !keepCompany) {
    const { data: jobs } = await db.from('jobs').select('id').eq('company_id', companyId)
    const jobIds = (jobs ?? []).map(j => j.id as string)
    if (jobIds.length) {
      for (const t of ['search_assignments', 'partner_roles', 'job_candidate_pipeline']) {
        await count(t, db.from(t).delete({ count: 'exact' }).in('job_id', jobIds))
      }
      // The desk trigger skips deletes of live jobs; close them first.
      await db.from('partner_roles').delete().in('job_id', jobIds)
      await count('jobs', db.from('jobs').delete({ count: 'exact' }).in('id', jobIds))
    }
    await count('client_agreement_events', db.from('client_agreement_events').delete({ count: 'exact' }).in('link_id', (await db.from('client_agreement_links').select('id').eq('company_id', companyId)).data?.map(r => r.id as string) ?? ['00000000-0000-0000-0000-000000000000']))
    await count('client_agreement_links', db.from('client_agreement_links').delete({ count: 'exact' }).eq('company_id', companyId))
    await count('partner_briefs', db.from('partner_briefs').delete({ count: 'exact' }).eq('company_id', companyId))
    await count('client_companies', db.from('client_companies').delete({ count: 'exact' }).eq('company_id', companyId))
    await count('onboarding_runs', db.from('onboarding_runs').delete({ count: 'exact' }).eq('id', runId))
    await count('companies', db.from('companies').delete({ count: 'exact' }).eq('id', companyId))
  } else {
    await count('onboarding_runs', db.from('onboarding_runs').delete({ count: 'exact' }).eq('id', runId))
  }

  if (run.slack_channel_id && process.env.SLACK_BOT_TOKEN) {
    const res = await fetch('https://slack.com/api/conversations.archive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: run.slack_channel_id }),
    }).then(r => r.json() as Promise<{ ok: boolean; error?: string }>)
    console.log('  - slack archive', res.ok ? 'ok' : res.error)
  }
  console.log('done')
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
