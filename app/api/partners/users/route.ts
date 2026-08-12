import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/** The people who can hold an assignment, for the assignee picker. Admin only. */
export async function GET() {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('users_admin')
    .select('user_id, email, full_name, role')
    .eq('status', 'active')
    .not('user_id', 'is', null)
    .order('full_name', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A viewer has no reason to be briefed on a client, and listing them as a
  // candidate assignee invites granting access nobody meant to grant.
  const eligible = (data ?? []).filter(u =>
    ['scout', 'recruiter', 'admin', 'super_admin'].includes(u.role as string),
  )

  return NextResponse.json({ users: eligible })
}
