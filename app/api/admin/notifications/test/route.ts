import { NextRequest, NextResponse } from 'next/server'
import { getAppUser } from '@/lib/current-user'
import { notifySlack, type SlackStream } from '@/lib/slack'

/**
 * Slack wiring check for the super admin.
 *
 * GET  reports which streams have a webhook, as booleans only. The URLs are
 *      secrets and are never returned, not even partially.
 * POST posts one test message per configured stream, so a misrouted channel is
 *      obvious immediately.
 */

export const dynamic = 'force-dynamic'

const STREAMS: { stream: SlackStream; channel: string; env: string; sends: string }[] = [
  {
    stream: 'clients',
    channel: '#refery-clients',
    env: 'SLACK_WEBHOOK_CLIENTS',
    sends: 'Agreement opened, re-opened, and signed',
  },
  {
    stream: 'partners',
    channel: '#refery-partners',
    env: 'SLACK_WEBHOOK_PARTNERS',
    sends: 'Sign-up started, terms reached, completed',
  },
  {
    stream: 'candidates',
    channel: '#refery-candidates',
    env: 'SLACK_WEBHOOK_CANDIDATES',
    sends: 'New candidate uploads with highlights',
  },
  {
    stream: 'daily',
    channel: '#refery-daily',
    env: 'SLACK_WEBHOOK_DAILY',
    sends: 'Reserved for the daily digest',
  },
]

async function requireAdmin() {
  const appUser = await getAppUser()
  if (!appUser) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!appUser.isAdmin && !appUser.isSuperAdmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { appUser }
}

export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const fallback = !!process.env.SLACK_WEBHOOK_URL

  return NextResponse.json({
    fallbackConfigured: fallback,
    streams: STREAMS.map((s) => ({
      stream: s.stream,
      channel: s.channel,
      env: s.env,
      configured: !!process.env[s.env],
      usingFallback: !process.env[s.env] && fallback,
      sends: s.sends,
    })),
  })
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const only = request.nextUrl.searchParams.get('stream')
  const targets = only ? STREAMS.filter((s) => s.stream === only) : STREAMS

  const results = []
  for (const s of targets) {
    const configured = !!process.env[s.env] || !!process.env.SLACK_WEBHOOK_URL
    if (!configured) {
      results.push({ stream: s.stream, channel: s.channel, sent: false, error: `${s.env} not set` })
      continue
    }

    const res = await notifySlack({
      stream: s.stream,
      emoji: ':satellite_antenna:',
      title: `Wiring check: this is ${s.channel}`,
      context: `If this message is not in ${s.channel}, the webhook for ${s.env} points at the wrong channel.`,
      fields: [
        { label: 'Stream', value: s.stream },
        { label: 'Normally receives', value: s.sends },
        { label: 'Source', value: process.env[s.env] ? s.env : 'SLACK_WEBHOOK_URL (fallback)' },
      ],
    })
    results.push({ stream: s.stream, channel: s.channel, ...res })
  }

  return NextResponse.json({ results })
}
