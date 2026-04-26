import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'

// GET - List all agreement signatures (admin only)
export async function GET(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status })
  }

  const adminClient = createAdminClient()
  const searchParams = request.nextUrl.searchParams
  const recruiterId = searchParams.get('recruiter_id')
  const agreementType = searchParams.get('agreement_type')

  let query = adminClient
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
