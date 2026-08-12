import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * Granting and revoking company-level access.
 *
 * Access is a company, never a role: a scout who can see the client can see
 * every live mandate under it. Anything finer would mean maintaining a matrix
 * nobody keeps up to date, and a scout half-briefed on a client is worse than
 * one not briefed at all.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const companyId = typeof body?.company_id === 'string' ? body.company_id : null
  const userIds: string[] = Array.isArray(body?.user_ids)
    ? body.user_ids.filter((id: unknown): id is string => typeof id === 'string')
    : []

  if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 })

  const adminClient = createAdminClient()

  // The picker posts the company's whole assignee list, so this is a set
  // replacement: rows not in the new list are revoked. That makes an
  // accidental double-submit harmless.
  const { data: current } = await adminClient
    .from('company_assignments')
    .select('user_id')
    .eq('company_id', companyId)

  const currentIds = new Set((current ?? []).map(r => r.user_id as string))
  const nextIds = new Set(userIds)
  const toAdd = [...nextIds].filter(id => !currentIds.has(id))
  const toRemove = [...currentIds].filter(id => !nextIds.has(id))

  if (toAdd.length) {
    // Only users who exist and are active can hold an assignment — a stale
    // invite id would otherwise sit in the list looking like real coverage.
    const { data: users } = await adminClient
      .from('users_admin')
      .select('user_id, status')
      .in('user_id', toAdd)

    const allowed = (users ?? [])
      .filter(u => u.status === 'active' && u.user_id)
      .map(u => u.user_id as string)

    if (allowed.length) {
      const { error } = await adminClient.from('company_assignments').upsert(
        allowed.map(userId => ({
          company_id: companyId,
          user_id: userId,
          assigned_by: access.appUser.id,
        })),
        { onConflict: 'company_id,user_id', ignoreDuplicates: true },
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (toRemove.length) {
    const { error } = await adminClient
      .from('company_assignments')
      .delete()
      .eq('company_id', companyId)
      .in('user_id', toRemove)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // An approved request should not keep showing as pending once the assignment
  // it was asking for exists.
  if (toAdd.length) {
    await adminClient
      .from('company_access_requests')
      .update({ status: 'approved', decided_by: access.appUser.id, decided_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .in('user_id', toAdd)
  }

  return NextResponse.json({ assigned: toAdd.length, revoked: toRemove.length })
}
