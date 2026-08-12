import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * Publishing a partner company, and writing the alias an unassigned scout sees.
 *
 * Publishing is what makes a relationship visible on the desk at all, so it is
 * an explicit admin action rather than a side effect of adding a mandate — a
 * prospect we are still qualifying should not appear to the network because
 * someone filed a role under it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if ('is_published' in body) patch.is_published = body.is_published === true
  if ('is_active' in body) patch.is_active = body.is_active === true

  for (const field of ['anon_alias', 'public_blurb', 'engagement_notes', 'next_step'] as const) {
    if (field in body) {
      const raw = body[field]
      if (raw !== null && typeof raw !== 'string') {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      }
      patch[field] = raw === null || raw.trim() === '' ? null : raw.trim()
    }
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('client_companies')
    .update(patch)
    .eq('company_id', companyId)
    .select('company_id, is_published, is_active, anon_alias, public_blurb')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) {
    return NextResponse.json(
      { error: 'That company is not on the partner list yet.' },
      { status: 404 },
    )
  }

  return NextResponse.json(data)
}
