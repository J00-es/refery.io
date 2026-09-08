/**
 * "Type your email and we invite you to Slack with Lily."
 *
 * The founder gives an address on the public brief; we record it, try to send
 * a Slack Connect invitation, and tell Lily either way (see lib/slack-connect).
 * The response says honestly which happened, so the page can promise "check
 * your inbox" only when Slack actually sent something.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeBrief } from '@/lib/brief'
import { briefUrl, findPublishedBrief, viewerContext } from '@/lib/hm-brief'
import { notifySlack } from '@/lib/slack'
import { inviteToSlackWithLily } from '@/lib/slack-connect'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 10 * 60 * 1000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
  if (!EMAIL.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })
  }

  // Only a brief that asks for it accepts an invite request.
  const content = normalizeBrief(brief.content)
  const asks = content.sections.some(s => s.blocks.some(b => b.kind === 'invite'))
  if (!asks) return NextResponse.json({ error: 'This brief does not take Slack invitations.' }, { status: 400 })

  const viewer = viewerContext(request.headers)
  const db = createAdminClient()

  if (viewer.ip) {
    const { count } = await db
      .from('hm_brief_invites')
      .select('id', { count: 'exact', head: true })
      .eq('ip', viewer.ip)
      .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())
    if ((count ?? 0) >= RATE_LIMIT) {
      return NextResponse.json({ error: 'That is a lot of invitations at once. Try again shortly.' }, { status: 429 })
    }
  }

  const { data: briefRow } = await db.from('hm_briefs').select('company_id').eq('id', brief.id).single()
  const companyId = briefRow?.company_id as string | undefined
  if (!companyId) return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })

  const authorName = typeof raw.authorName === 'string' && raw.authorName.trim() ? raw.authorName.trim().slice(0, 80) : null

  const { data: existing } = await db
    .from('hm_brief_invites')
    .select('id, status')
    .eq('brief_id', brief.id)
    .eq('email', email)
    .maybeSingle()
  if (existing && existing.status === 'invited') {
    return NextResponse.json({ invite: { email, status: 'invited' } }, { status: 200 })
  }

  const outcome = await inviteToSlackWithLily({
    companyName: brief.companyName,
    email,
    requestedBy: authorName,
    briefUrl: briefUrl(brief.slug),
  })

  const row = {
    brief_id: brief.id,
    company_id: companyId,
    email,
    status: outcome.mode,
    channel_id: outcome.channelId,
    channel_name: outcome.channelName,
    detail: outcome.detail,
    author_name: authorName,
    ip: viewer.ip,
    country: viewer.country,
    region: viewer.region,
    city: viewer.city,
    user_agent: viewer.userAgent,
    updated_at: new Date().toISOString(),
  }
  const { error } = existing
    ? await db.from('hm_brief_invites').update(row).eq('id', existing.id)
    : await db.from('hm_brief_invites').insert(row)
  if (error) console.error('[hm-brief] invite write failed:', error)

  // The clients stream too, so it sits next to the comments and the delivery choice.
  await notifySlack({
    stream: 'clients',
    emoji: outcome.mode === 'invited' ? ':handshake:' : ':email:',
    title: `${brief.companyName}: ${authorName ?? brief.recipientName ?? 'The hiring manager'} asked for Slack access`,
    context:
      outcome.mode === 'invited'
        ? `Slack Connect invitation sent to ${email} for #${outcome.channelName}.`
        : `Send the invitation to ${email} by hand; the steps are in your DM from Refery Ops.`,
    fields: [{ label: 'Email', value: email }],
    links: [{ label: 'Open the brief', url: briefUrl(brief.slug) }],
  })

  return NextResponse.json({ invite: { email, status: outcome.mode } }, { status: existing ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
}
