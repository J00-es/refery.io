import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { postMessage, esc, type SlackBlock } from '@/lib/slack-bot'
import { isInternalEmail } from '@/lib/funnel'
import {
  ago,
  deviceWord,
  loadActivity,
  loadPresence,
  loadSignInsSince,
  summariseActivity,
} from '@/lib/activity'

/**
 * The sign-in feed.
 *
 * Every fifteen minutes (pg_cron, via desk_cron_post) this reads the sessions
 * created since the last run and posts one message to #refery-pulse naming
 * who came in, how often they have been in this week, and what they have
 * opened so far this visit. Staff and test accounts are left out.
 *
 * A watermark in pulse_cursor guarantees a sign-in is announced once. It only
 * advances after a successful post, so if the bot is not yet in the channel
 * the sign-ins queue up rather than vanish, capped at a day so a long outage
 * cannot dump a week into the channel at once.
 *
 * This is deliberately not #refery-desk, whose brief is critical-only.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** #refery-pulse, private, created 7 Sep 2026. Invite @Refery Ops once. */
const PULSE_CHANNEL = 'C0C087E7C4U'
const CURSOR_KEY = 'sign-ins'
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

const ROLE_WORD: Record<string, string> = {
  recruiter: 'recruiter',
  scout: 'scout',
  hiring_manager: 'hiring manager',
  admin: 'admin',
  super_admin: 'admin',
  viewer: 'viewer',
}

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

async function run(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  const { data: cursor } = await admin
    .from('pulse_cursor')
    .select('through')
    .eq('key', CURSOR_KEY)
    .maybeSingle()

  const floor = new Date(now.getTime() - MAX_LOOKBACK_MS)
  const since = cursor?.through && new Date(cursor.through) > floor ? new Date(cursor.through) : floor

  const signIns = (await loadSignInsSince(admin, since)).filter((s) => !isInternalEmail(s.email))

  const advance = () =>
    admin
      .from('pulse_cursor')
      .upsert({ key: CURSOR_KEY, through: now.toISOString(), updated_at: now.toISOString() })

  if (signIns.length === 0) {
    await advance()
    return NextResponse.json({ ok: true, posted: false, signIns: 0 })
  }

  // One line per person, even if they signed in twice in the window.
  const byUser = new Map<string, (typeof signIns)[number]>()
  for (const s of signIns) if (!byUser.has(s.user_id)) byUser.set(s.user_id, s)
  const userIds = [...byUser.keys()]

  const [presence, activity, adminRes] = await Promise.all([
    loadPresence(admin),
    loadActivity(admin, userIds, since),
    admin
      .from('users_admin')
      .select('user_id, email, full_name, role, is_beta, status')
      .in('user_id', userIds),
  ])
  const profile = new Map<string, { full_name: string | null; role: string; is_beta: boolean; status: string }>()
  for (const row of adminRes.data ?? []) if (row.user_id) profile.set(row.user_id, row)

  const lines: string[] = []
  for (const [userId, s] of byUser) {
    const p = profile.get(userId)
    const who = p?.full_name?.trim() || s.email
    const tags: string[] = []
    if (p?.role) tags.push(ROLE_WORD[p.role] ?? p.role)
    if (p?.is_beta) tags.push('beta')
    if (p?.status && p.status !== 'active') tags.push(p.status)
    const device = deviceWord(s.user_agent)
    if (device) tags.push(device)

    const pr = presence.get(userId)
    const visits = pr?.sign_ins_7d ?? 1
    const isFirst = pr?.first_sign_in_at && new Date(pr.first_sign_in_at) >= since
    const cadence = isFirst
      ? 'first ever sign-in'
      : visits <= 1
        ? 'first visit this week'
        : `${ordinal(visits)} visit this week`

    const rows = (activity.get(userId) ?? []).filter((r) => new Date(r.at) >= new Date(s.signed_in_at))
    const doing = summariseActivity(rows)

    lines.push(
      `*${esc(who)}*${tags.length ? `  _${esc(tags.join(', '))}_` : ''}  ·  ${cadence}${
        doing ? `\n      ${esc(doing)}` : ''
      }`,
    )
  }

  const header = `:door: ${byUser.size === 1 ? 'Signed in' : `${byUser.size} signed in`} (${ago(
    since.toISOString(),
    now.getTime(),
  )} to now)`

  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `${header}\n${lines.join('\n')}` } },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `<${APP_URL}/admin/users|Last seen, everyone>` }],
    },
  ]

  const channel = process.env.SLACK_CHANNEL_PULSE || PULSE_CHANNEL
  const text = `${byUser.size} signed in: ${[...byUser.values()].map((s) => profile.get(s.user_id)?.full_name || s.email).join(', ')}`
  const res = await postMessage(channel, text, blocks)

  if (!res.ok) {
    // Leave the cursor where it is: the next run will include these people.
    console.error('[cron/pulse] post failed:', res.error)
    return NextResponse.json({ ok: false, error: res.error, signIns: byUser.size }, { status: 502 })
  }

  await advance()
  return NextResponse.json({ ok: true, posted: true, signIns: byUser.size })
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
