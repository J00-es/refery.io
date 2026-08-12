import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

/**
 * Admin-only activity feed for client agreement links.
 *
 * GET /api/agreements/client/activity?company_id=...  → events for one company
 * GET /api/agreements/client/activity?link_id=...     → events for one link
 */

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co', 'lily@refery.io']

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let isAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  if (!isAdmin) {
    const { data: adminRow } = await supabase
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()
    isAdmin = !!adminRow && ['super_admin', 'admin'].includes(adminRow.role)
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const companyId = request.nextUrl.searchParams.get('company_id')
  const linkId = request.nextUrl.searchParams.get('link_id')

  if (!companyId && !linkId) {
    return NextResponse.json(
      { error: 'company_id or link_id is required' },
      { status: 400 },
    )
  }

  const adminClient = createAdminClient()
  let query = adminClient
    .from('client_agreement_events')
    .select('id, link_id, event_type, occurred_at, ip_address, device, seq, metadata')
    .order('occurred_at', { ascending: false })
    .limit(200)

  if (linkId) query = query.eq('link_id', linkId)
  else if (companyId) query = query.eq('company_id', companyId)

  const { data, error } = await query

  if (error) {
    console.error('[agreements/client/activity] query failed:', error)
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 })
  }

  return NextResponse.json({ events: data ?? [] })
}
