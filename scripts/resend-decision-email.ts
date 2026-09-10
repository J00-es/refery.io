/**
 * Queues the decision email for an application that was already decided but
 * whose email never got written, which is what happened while `lateLine` was
 * undefined: `decideApplication` recorded the decision, the render threw, and
 * the catch turned it into "send by hand".
 *
 * The row is already out of `new`, so the decision cannot simply be re-run.
 * This renders the same template that decision would have rendered and queues
 * it through `queueEmail`, so the ledger, the budget, the dedupe key and the
 * stop condition are identical to a normal send. Delivery itself stays with
 * the production comms-flush cron: nothing here talks to Gmail.
 *
 *   npx tsx scripts/resend-decision-email.ts <email> [--send]
 *
 * Without --send it renders and prints, and writes nothing.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { templateB } from '../lib/voice/templates'
import { verifiedDetail } from '../lib/onboarding/decisions'
import { queueEmail, DECISION_DELAY_MS } from '../lib/comms'

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
const APP_URL = (env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

async function main() {
  const email = process.argv[2]
  const send = process.argv.includes('--send')
  if (!email) throw new Error('an applicant email is required')

  const { data: app, error } = await db
    .from('scout_applications')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  if (error || !app) throw new Error(`application not found: ${error?.message ?? email}`)

  if (app.decision !== 'approve') throw new Error(`decision is ${app.decision ?? 'none'}, not approve; this script only re-sends B`)
  if (app.contribution_mode !== 'introduce') throw new Error(`contribution_mode is ${app.contribution_mode}; C would have gone, not B`)
  if (!app.invite_token) throw new Error('no invite token on the row')

  // Anything already sent or waiting for this person stops us: no duplicates.
  const { data: prior } = await db
    .from('communications')
    .select('id, template_id, status')
    .eq('application_id', app.id)
    .in('status', ['sent', 'queued', 'sending'])
  const clash = (prior ?? []).find(r => r.template_id === 'B')
  if (clash) throw new Error(`B already exists for this application (${clash.id}, ${clash.status})`)

  const fullName = String(app.full_name ?? '').trim()
  const rendered = templateB({
    fullName,
    verifiedDetail: verifiedDetail(app as never),
    onboardingLink: `${APP_URL}/auth/sign-up?invite=${app.invite_token}`,
    late: false,
  })

  console.log(`\n--- ${fullName} <${app.email}> ---`)
  console.log(`decided ${app.decided_at}, prior rows: ${(prior ?? []).map(r => `${r.template_id}/${r.status}`).join(', ') || 'none'}`)
  console.log(`\nSubject: ${rendered.subject}\n`)
  console.log(rendered.text)
  console.log('\n---')

  if (!send) {
    console.log('DRY RUN. Nothing written. Re-run with --send to queue it.')
    return
  }

  const q = await queueEmail(db as never, {
    to: app.email,
    toName: fullName,
    applicationId: app.id,
    email: rendered,
    delayMs: DECISION_DELAY_MS,
    stop: { kind: 'application_status', applicationId: app.id, status: 'approved' },
    dedupeKey: `B:${app.id}:resend`,
  })
  console.log(q.ok ? `QUEUED ${q.id}, sends after ${q.sendAfter}` : `NOT QUEUED: ${q.reason} ${q.error ?? ''}`)
}

main().catch(e => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
