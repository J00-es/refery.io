/**
 * Creating a hiring-manager brief. Admin only.
 *
 * A brief starts as a draft with its slug already minted, so the link can be
 * checked and the content filled in before anything is shareable. Publishing is
 * a separate, deliberate act — see `[id]/route.ts`.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'
import { briefUrl, newBriefSlug } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const companyId = typeof raw?.companyId === 'string' ? raw.companyId : ''
  if (!companyId) return NextResponse.json({ error: 'companyId is required' }, { status: 400 })

  const db = createAdminClient()
  const { data: company } = await db.from('companies').select('id, name').eq('id', companyId).maybeSingle()
  if (!company) return NextResponse.json({ error: 'No such company' }, { status: 404 })

  const title = typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : company.name

  const { data, error } = await db
    .from('hm_briefs')
    .insert({
      company_id: company.id,
      slug: newBriefSlug(company.name),
      title,
      status: 'draft',
      content: raw?.content ?? {},
      recipient_name: typeof raw?.recipientName === 'string' ? raw.recipientName.trim() : null,
      recipient_email: typeof raw?.recipientEmail === 'string' ? raw.recipientEmail.trim() : null,
      ribbon_note: typeof raw?.ribbonNote === 'string' ? raw.ribbonNote.trim() : null,
      created_by: auth.userId,
    })
    .select('id, slug, title, status')
    .single()

  if (error || !data) {
    console.error('[hm-brief] create failed:', error)
    return NextResponse.json({ error: 'Could not create that brief.' }, { status: 500 })
  }

  return NextResponse.json({ brief: { ...data, url: briefUrl(data.slug) } }, { status: 201 })
}
