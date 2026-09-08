/**
 * The founder's booking link, saved once from the candidates page so that
 * every Interview after it can send the candidate straight to a calendar.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { findPublishedBrief } from '@/lib/hm-brief'
import { notifySlack } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const url = typeof raw?.url === 'string' ? raw.url.trim() : ''
  if (!/^https:\/\/[^\s]{6,300}$/.test(url)) {
    return NextResponse.json({ error: 'Paste a full https link, for example a Calendly or Google booking page.' }, { status: 400 })
  }

  const db = createAdminClient()
  const { data: row } = await db.from('hm_briefs').select('company_id').eq('id', brief.id).single()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db.from('client_companies').update({ booking_url: url }).eq('company_id', row.company_id)
  if (error) return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })

  await notifySlack({
    stream: 'clients',
    emoji: ':calendar:',
    title: `${brief.companyName} added a booking link`,
    context: 'Interviews from now on send candidates here.',
    fields: [{ label: 'Link', value: url }],
  })
  return NextResponse.json({ ok: true, url }, { headers: { 'Cache-Control': 'no-store' } })
}
