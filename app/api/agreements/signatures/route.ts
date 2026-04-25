import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET - List all agreement signatures (admin only)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!adminData || !['admin', 'super_admin'].includes(adminData.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const recruiterId = searchParams.get('recruiter_id')
  const agreementType = searchParams.get('agreement_type')

  let query = supabase
    .from('agreement_signatures')
    .select('*')
    .order('signed_at', { ascending: false })

  if (recruiterId) {
    query = query.eq('recruiter_id', recruiterId)
  }

  if (agreementType) {
    query = query.eq('agreement_type', agreementType)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
