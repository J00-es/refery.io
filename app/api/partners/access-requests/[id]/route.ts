import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * Deciding an access request. Approving it grants the assignment in the same
 * step — an approved request that still required a second action would be a
 * reliable way to leave a scout waiting on nothing.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const decision = body?.status

  if (decision !== 'approved' && decision !== 'denied') {
    return NextResponse.json({ error: 'status must be approved or denied' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: request } = await adminClient
    .from('company_access_requests')
    .select('id, company_id, user_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!request) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (request.status !== 'pending') {
    return NextResponse.json({ error: 'That request has already been decided.' }, { status: 409 })
  }

  if (decision === 'approved') {
    const { error } = await adminClient.from('company_assignments').upsert(
      {
        company_id: request.company_id,
        user_id: request.user_id,
        assigned_by: access.appUser.id,
        note: 'Approved from an access request',
      },
      { onConflict: 'company_id,user_id', ignoreDuplicates: true },
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { error } = await adminClient
    .from('company_access_requests')
    .update({ status: decision, decided_by: access.appUser.id, decided_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, status: decision })
}
