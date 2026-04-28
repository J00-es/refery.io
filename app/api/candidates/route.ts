import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

    // Check user role
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    const userRole = isSuperAdmin ? 'super_admin' : (adminData?.role || 'viewer')
    const isAdmin = ['super_admin', 'admin'].includes(userRole)

    // Get limit from query params
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')

    // Fetch candidates using admin client to bypass RLS
    let query = adminClient
      .from('candidates')
      .select('id, name, email, linkedin_url, skills, location, phone, experience_years, owner_user_id, uploaded_by_user_id, user_id')
      .order('name')
      .limit(limit)

    const { data: candidates, error } = await query

    if (error) {
      throw error
    }

    // Filter by ownership for non-admins
    const filteredCandidates = isAdmin
      ? candidates
      : (candidates || []).filter(c => 
          c.owner_user_id === user.id ||
          c.uploaded_by_user_id === user.id ||
          c.user_id === user.id
        )

    return NextResponse.json({ candidates: filteredCandidates })
  } catch (error) {
    console.error('Error fetching candidates:', error)
    return NextResponse.json({ error: 'Failed to fetch candidates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const { data: candidate, error } = await adminClient
      .from('candidates')
      .insert({
        ...body,
        user_id: user.id,
        uploaded_by_user_id: user.id,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ candidate })
  } catch (error) {
    console.error('Error creating candidate:', error)
    return NextResponse.json({ error: 'Failed to create candidate' }, { status: 500 })
  }
}
