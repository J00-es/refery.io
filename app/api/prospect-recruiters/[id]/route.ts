import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      const { data: adminData } = await adminClient
        .from('users_admin')
        .select('role, status')
        .eq('email', user.email)
        .single()

      if (!adminData || adminData.status !== 'active' || !['super_admin', 'admin'].includes(adminData.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    
    // Update the recruiter using admin client to bypass RLS
    const { data: updatedRecruiter, error } = await adminClient
      .from('prospect_recruiters')
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating recruiter:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ recruiter: updatedRecruiter })
  } catch (error) {
    console.error('Error in PATCH /api/prospect-recruiters/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
