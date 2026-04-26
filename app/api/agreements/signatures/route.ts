import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

async function checkAdminAccess() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      adminClient,
    }
  }

  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

  if (!isSuperAdmin) {
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    if (!adminData || !['admin', 'super_admin'].includes(adminData.role)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        adminClient,
      }
    }
  }

  return {
    ok: true,
    response: null,
    adminClient,
  }
}

// GET - List all agreement signatures (admin only)
export async function GET(request: NextRequest) {
  const auth = await checkAdminAccess()

  if (!auth.ok) {
    return auth.response
  }

  const searchParams = request.nextUrl.searchParams
  const recruiterId = searchParams.get('recruiter_id')
  const agreementType = searchParams.get('agreement_type')

  let query = auth.adminClient
    .from('agreement_signatures')
    .select('*')
    .order('signed_at', { ascending: false })

  if (recruiterId) query = query.eq('recruiter_id', recruiterId)
  if (agreementType) query = query.eq('agreement_type', agreementType)

  const { data, error } = await query

  if (error) {
    console.error('[agreements/signatures GET] query failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
