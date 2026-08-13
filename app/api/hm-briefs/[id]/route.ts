/**
 * Publishing, unpublishing, rotating and editing a hiring-manager brief.
 * Admin only.
 *
 * `rotate` mints a fresh slug, which is how a link is taken back: the old URL
 * stops resolving for everyone it was ever forwarded to. It is the only lever
 * that matters once a brief has left the building, so it is deliberately its
 * own explicit action rather than a side effect of editing.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/admin-auth'
import { briefUrl, newBriefSlug } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'

const STATUSES = new Set(['draft', 'published', 'revoked'])

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const { id } = await ctx.params
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const db = createAdminClient()
  const { data: existing } = await db
    .from('hm_briefs')
    .select('id, slug, status, version, company_id, companies(name)')
    .eq('id', id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const patch: Record<string, unknown> = {}

  if (typeof raw.status === 'string') {
    if (!STATUSES.has(raw.status)) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
    patch.status = raw.status
    // Stamped on the first publish only, so it keeps meaning "when this went out".
    if (raw.status === 'published' && existing.status !== 'published') {
      patch.published_at = new Date().toISOString()
    }
  }

  if (raw.content && typeof raw.content === 'object') {
    patch.content = raw.content
    patch.version = (existing.version ?? 1) + 1
  }

  if (typeof raw.title === 'string' && raw.title.trim()) patch.title = raw.title.trim()
  if (typeof raw.recipientName === 'string') patch.recipient_name = raw.recipientName.trim() || null
  if (typeof raw.recipientEmail === 'string') patch.recipient_email = raw.recipientEmail.trim() || null
  if (typeof raw.ribbonNote === 'string') patch.ribbon_note = raw.ribbonNote.trim() || null

  if (raw.rotate === true) {
    const rel = existing.companies as unknown
    const company = Array.isArray(rel) ? rel[0] : rel
    patch.slug = newBriefSlug((company as { name?: string } | null)?.name ?? 'brief')
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  }

  const { data, error } = await db
    .from('hm_briefs')
    .update(patch)
    .eq('id', id)
    .select('id, slug, title, status, version, published_at')
    .single()

  if (error || !data) {
    console.error('[hm-brief] update failed:', error)
    return NextResponse.json({ error: 'Could not save that.' }, { status: 500 })
  }

  return NextResponse.json({ brief: { ...data, url: briefUrl(data.slug) } })
}
