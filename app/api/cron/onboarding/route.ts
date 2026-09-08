import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postThreadReply } from '@/lib/slack-bot'
import { queueEmail } from '@/lib/comms'
import { sendPendingNote } from '@/lib/onboarding/decisions'
import { suggestFirstSearch } from '@/lib/onboarding/matcher'
import { templateG, templateN } from '@/lib/voice/templates'

/**
 * The onboarding timers, once a day at 09:00 UTC.
 *
 * Every one of these is a state check, not a schedule: it looks at what is
 * true now, sends at most one thing, and stops the moment the thing it chases
 * happens. None of them decides anything. Nothing here calls a model.
 *
 *   1. Applications untouched for 48 hours get one honest pending note (P)
 *      and a line in their Slack thread so the desk shows them as overdue.
 *   2. Approved applicants who have not created an account get "finish
 *      setup" (G) at day 3 and day 10, then "pausing reminders" (N) at day 17.
 *   3. Active partners with confirmed preferences and no search get one
 *      suggested (H) or an honest no-match (F).
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DAY_MS = 24 * 60 * 60 * 1000
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz'

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const out = { pending: 0, setup3: 0, setup10: 0, paused: 0, suggested: 0, noMatch: 0 }
  const now = Date.now()

  // 1. Still waiting on Lily after 48 hours.
  const { data: waiting } = await admin
    .from('scout_applications')
    .select('id, full_name, email, created_at, slack_channel_id, slack_message_ts')
    .eq('status', 'new')
    .is('pending_note_sent_at', null)
    // Only people who got the receipt: the pending note replies to it, and the
    // backlog from before this flow existed is worked from the desk by hand.
    .not('receipt_sent_at', 'is', null)
    .not('slack_message_ts', 'is', null)
    .lt('created_at', new Date(now - 2 * DAY_MS).toISOString())
    .gt('created_at', new Date(now - 14 * DAY_MS).toISOString())
  for (const a of waiting ?? []) {
    const slack = a.slack_channel_id && a.slack_message_ts ? { channel: a.slack_channel_id, ts: a.slack_message_ts } : null
    const q = await sendPendingNote(admin, a, slack)
    if (q.ok) {
      out.pending++
      if (slack) await postThreadReply(slack.channel, slack.ts, ':hourglass_flowing_sand: Two days with no decision. A pending note is going to them; the decision is still yours.')
    }
  }

  // 2. Approved, no account yet.
  const { data: approved } = await admin
    .from('scout_applications')
    .select('id, full_name, email, decided_at, invite_token, status')
    .in('status', ['approved', 'in_conversation'])
    .not('decided_at', 'is', null)
    .gt('decided_at', new Date(now - 30 * DAY_MS).toISOString())
  for (const a of approved ?? []) {
    const { data: account } = await admin.from('users_admin').select('status').eq('email', a.email).maybeSingle()
    if (account) continue
    const age = (now - new Date(a.decided_at as string).getTime()) / DAY_MS
    const subjectBase = `[Refery] ${a.full_name} | Let's get started :)`
    const link = `${APP_URL}/auth/sign-up?invite=${a.invite_token}`
    const stop = { kind: 'no_account_yet' as const, email: a.email }
    if (age >= 17) {
      const q = await queueEmail(admin, { to: a.email, toName: a.full_name, applicationId: a.id, email: templateN({ fullName: a.full_name, existingSubject: subjectBase }), dedupeKey: `N:${a.id}`, stop })
      if (q.ok) out.paused++
    } else if (age >= 10) {
      const q = await queueEmail(admin, { to: a.email, toName: a.full_name, applicationId: a.id, email: templateG({ fullName: a.full_name, existingSubject: subjectBase, resumeLink: link, incompleteStep: 'creating your account and accepting the partner terms' }), dedupeKey: `G10:${a.id}`, stop })
      if (q.ok) out.setup10++
    } else if (age >= 3) {
      const q = await queueEmail(admin, { to: a.email, toName: a.full_name, applicationId: a.id, email: templateG({ fullName: a.full_name, existingSubject: subjectBase, resumeLink: link, incompleteStep: 'creating your account and accepting the partner terms' }), dedupeKey: `G3:${a.id}`, stop })
      if (q.ok) out.setup3++
    }
  }

  // 3. Active partners with preferences and nothing to work on.
  const { data: partners } = await admin
    .from('partner_preferences')
    .select('user_id, confirmed_at, users_admin!inner(email, full_name, status, no_match_at)')
    .not('confirmed_at', 'is', null)
  for (const p of partners ?? []) {
    const u = (p as unknown as { users_admin: { email: string; full_name: string | null; status: string; no_match_at: string | null } }).users_admin
    if (!u || u.status !== 'active') continue
    // A no-match is re-checked weekly, not daily.
    if (u.no_match_at && now - new Date(u.no_match_at).getTime() < 7 * DAY_MS) continue
    const r = await suggestFirstSearch(admin, { userId: p.user_id as string, email: u.email, fullName: u.full_name }, { by: 'daily', sendEmail: true })
    if (r.outcome === 'suggested') out.suggested++
    if (r.outcome === 'no_match' && !r.reason) out.noMatch++
  }

  console.log('[onboarding]', JSON.stringify(out))
  return NextResponse.json({ ok: true, ...out })
}

export async function GET(request: NextRequest) {
  return run(request)
}
export async function POST(request: NextRequest) {
  return run(request)
}
