import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * Publishing or unpublishing a brief.
 *
 * A draft is invisible to scouts. That separation is the point: a brief is
 * written from an intake call and is often half-right for a day or two, and a
 * scout acting on a half-right brief burns a candidate relationship we do not
 * get back.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const status = body?.status

  if (status !== 'draft' && status !== 'published') {
    return NextResponse.json({ error: 'status must be draft or published' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('partner_briefs')
    .update({
      status,
      published_at: status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, status, published_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('partner_briefs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
