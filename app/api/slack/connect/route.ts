/**
 * refery.xyz/slack: "Type your email and Lily invites you to Slack."
 *
 * The Slack share-DM links Lily pasted into partner emails expire after a few
 * days, so the emails now point here instead. A partner types the address
 * their Refery account is under; we look it up, try to send a Slack Connect
 * invitation to a private `#<name>-refery` room with Lily in it, and tell Lily
 * either way (see lib/slack-connect). The response says honestly which
 * happened, so the page only promises "check your inbox" when Slack actually
 * sent something.
 *
 * An address that matches no partner account still reaches Lily, marked as
 * unknown, because the most common reason is a partner typing their other
 * email.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { viewerContext } from '@/lib/hm-brief'
import { notifySlack } from '@/lib/slack'
import { inviteToSlackWithLily } from '@/lib/slack-connect'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RATE_LIMIT = 6
const RATE_WINDOW_MS = 10 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const ADMIN_USERS_URL = 'https://refery.xyz/admin/users'

export async function POST(request: NextRequest) {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })
  }

  const viewer = viewerContext(request.headers)
  const db = createAdminClient()

  if (viewer.ip) {
    const { count } = await db
      .from('partner_slack_invites')
      .select('id', { count: 'exact', head: true })
      .eq('ip', viewer.ip)
      .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())
    if ((count ?? 0) >= RATE_LIMIT) {
      return NextResponse.json({ error: 'That is a lot of requests at once. Try again shortly.' }, { status: 429 })
    }
  }

  // Sent once per address: a second press returns the first answer.
  const { data: prior } = await db
    .from('partner_slack_invites')
    .select('status')
    .eq('email', email)
    .eq('status', 'invited')
    .limit(1)
    .maybeSingle()
  if (prior) return NextResponse.json({ invite: { email, status: 'invited' } }, { status: 200 })

  const { data: partner } = await db
    .from('users_admin')
    .select('user_id, full_name, role, status')
    .eq('email', email)
    .maybeSingle()

  const base = {
    email,
    user_id: (partner?.user_id as string | undefined) ?? null,
    partner_name: (partner?.full_name as string | undefined) ?? null,
    ip: viewer.ip,
    country: viewer.country,
    region: viewer.region,
    city: viewer.city,
    user_agent: viewer.userAgent,
  }

  // ── no account under that address ─────────────────────────────────────
  if (!partner) {
    await db.from('partner_slack_invites').insert({ ...base, status: 'unknown' })
    await notifySlack({
      stream: 'partners',
      emoji: ':grey_question:',
      title: `Slack request from an address with no account: ${email}`,
      context: 'Probably a partner on their other email. If you recognise it, send the invitation by hand from your DM.',
      fields: [{ label: 'Where', value: [viewer.city, viewer.country].filter(Boolean).join(', ') || 'unknown' }],
      links: [{ label: 'Open users', url: ADMIN_USERS_URL }],
    })
    return NextResponse.json({ invite: { email, status: 'unknown' } }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  }

  const name = (partner.full_name as string) || email.split('@')[0]
  const outcome = await inviteToSlackWithLily({
    companyName: name,
    email,
    requestedBy: null,
    briefUrl: ADMIN_USERS_URL,
    isPrivate: true,
    linkLabel: 'Open users',
  })

  const { error } = await db.from('partner_slack_invites').insert({
    ...base,
    status: outcome.mode,
    channel_id: outcome.channelId,
    channel_name: outcome.channelName,
    detail: outcome.detail,
  })
  if (error) console.error('[slack-connect] partner invite write failed:', error)

  await notifySlack({
    stream: 'partners',
    emoji: outcome.mode === 'invited' ? ':handshake:' : ':email:',
    title: `${name} (${partner.role}) asked to talk on Slack`,
    context:
      outcome.mode === 'invited'
        ? `Slack Connect invitation sent to ${email} for #${outcome.channelName}.`
        : `Send the invitation to ${email} by hand; the steps are in your DM from Refery Ops.`,
    fields: [{ label: 'Email', value: email }],
    links: [{ label: 'Open users', url: ADMIN_USERS_URL }],
  })

  return NextResponse.json({ invite: { email, status: outcome.mode } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
