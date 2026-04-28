import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

    // Check role
    const { data: adminUser } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    const userRole = isSuperAdmin ? 'super_admin' : (adminUser?.role || 'viewer')
    
    // Only admins, recruiters, and scouts can assign owners
    if (!['super_admin', 'admin', 'recruiter', 'scout'].includes(userRole)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { owner_user_id } = await req.json()

    // Use admin client to bypass RLS
    const { error } = await adminClient
      .from('candidates')
      .update({ owner_user_id: owner_user_id || null })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating owner:', error)
    return NextResponse.json({ error: 'Failed to update owner' }, { status: 500 })
  }
}

// Get list of users for assignment dropdown
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const search = url.searchParams.get('search') || ''

    // Use admin client to fetch users
    let query = adminClient
      .from('users_admin')
      .select('user_id, email, full_name, role')
      .not('user_id', 'is', null)
      .order('full_name')
      .limit(20)

    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%`)
    }

    const { data: users, error } = await query

    if (error) throw error

    return NextResponse.json({ users: users || [] })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}
