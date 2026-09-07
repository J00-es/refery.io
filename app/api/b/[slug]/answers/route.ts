/**
 * One-tap answers on a public hiring-manager brief.
 *
 * A `choice` block in the brief asks a question with a fixed set of options.
 * The reader taps one; this stores it once per brief and question, mirrors the
 * answer onto the client record where the desk can read it, and tells Slack the
 * same way a comment does. The value is validated against the published brief's
 * own options, so nothing arrives here that the brief did not offer.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeBrief } from '@/lib/brief'
import { briefRef, findPublishedBrief, notifyBriefAnswer, viewerContext } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RATE_LIMIT = 30
const RATE_WINDOW_MS = 10 * 60 * 1000

/** Answers that also live on the client record, keyed by the choice block's `key`. */
const MIRRORS: Record<string, { column: string; allowed: string[] }> = {
  candidate_delivery: { column: 'candidate_delivery', allowed: ['slack', 'email', 'platform'] },
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const key = typeof raw.key === 'string' ? raw.key.trim() : ''
  const value = typeof raw.value === 'string' ? raw.value.trim() : ''
  if (!key || !value) return NextResponse.json({ error: 'Pick an option first.' }, { status: 400 })

  // The brief is the authority on what may be answered and with what.
  const content = normalizeBrief(brief.content)
  const block = content.sections.flatMap(s => s.blocks).find(b => b.kind === 'choice' && b.key === key)
  if (!block || block.kind !== 'choice') return NextResponse.json({ error: 'That question is not on this brief.' }, { status: 400 })
  const option = block.options.find(o => o.value === value)
  if (!option) return NextResponse.json({ error: 'That option is not on this brief.' }, { status: 400 })

  const viewer = viewerContext(request.headers)
  const db = createAdminClient()

  if (viewer.ip) {
    const { count } = await db
      .from('hm_brief_answers')
      .select('id', { count: 'exact', head: true })
      .eq('ip', viewer.ip)
      .gte('updated_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString())
    if ((count ?? 0) >= RATE_LIMIT) {
      return NextResponse.json({ error: 'Too many changes at once. Try again shortly.' }, { status: 429 })
    }
  }

  const authorName = typeof raw.authorName === 'string' && raw.authorName.trim() ? raw.authorName.trim().slice(0, 80) : null

  const { data: existing } = await db
    .from('hm_brief_answers')
    .select('id, value')
    .eq('brief_id', brief.id)
    .eq('key', key)
    .maybeSingle()

  const { data: companyRow } = await db.from('hm_briefs').select('company_id').eq('id', brief.id).single()
  const companyId = companyRow?.company_id as string | undefined
  if (!companyId) return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })

  const now = new Date().toISOString()
  const row = {
    brief_id: brief.id,
    company_id: companyId,
    key,
    value,
    label: option.label,
    author_name: authorName,
    ip: viewer.ip,
    country: viewer.country,
    region: viewer.region,
    city: viewer.city,
    user_agent: viewer.userAgent,
    updated_at: now,
  }
  const { error } = existing
    ? await db.from('hm_brief_answers').update(row).eq('id', existing.id)
    : await db.from('hm_brief_answers').insert(row)
  if (error) {
    console.error('[hm-brief] answer write failed:', error)
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }

  // Mirror onto the client record so the desk sees it without knowing about briefs.
  const mirror = MIRRORS[key]
  if (mirror && mirror.allowed.includes(value)) {
    await db
      .from('client_companies')
      .update({
        [mirror.column]: value,
        [`${mirror.column}_set_at`]: now,
        [`${mirror.column}_set_by`]: authorName ?? brief.recipientName ?? null,
      })
      .eq('company_id', companyId)
  }

  // Awaited on purpose: a serverless function can be frozen the moment the
  // response returns, and the Slack ping is the whole point of the answer.
  await notifyBriefAnswer(briefRef(brief), viewer, {
    author: authorName,
    prompt: block.prompt,
    label: option.label,
    changed: Boolean(existing && existing.value !== value),
  })

  return NextResponse.json(
    { answer: { key, value, authorName, updatedAt: now } },
    { status: existing ? 200 : 201, headers: { 'Cache-Control': 'no-store' } },
  )
}
