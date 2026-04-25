import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET(
  request: NextRequest,
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

    // Check if current user is admin - super admin emails always have access
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      const { data: currentAdmin } = await adminClient
        .from('users_admin')
        .select('role')
        .eq('email', user.email)
        .single()

      const isAdmin = currentAdmin?.role === 'admin' || currentAdmin?.role === 'super_admin'
      
      if (!isAdmin) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }
    }

    // Fetch user details using admin client to bypass RLS
    const { data: userData, error } = await adminClient
      .from('users_admin')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch user's jobs (owned) using admin client
    const { data: ownedJobs } = await adminClient
      .from('jobs')
      .select('id, title, company_name, status, created_at')
      .eq('owner_user_id', userData.user_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Fetch user's candidates (owned) using admin client
    const { data: ownedCandidates } = await adminClient
      .from('candidates')
      .select('id, name, email, status, created_at')
      .eq('owner_user_id', userData.user_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Fetch user's uploaded candidates using admin client
    const { data: uploadedCandidates } = await adminClient
      .from('candidates')
      .select('id, name, email, status, created_at')
      .eq('uploaded_by_user_id', userData.user_id)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      user: userData,
      ownedJobs: ownedJobs || [],
      ownedCandidates: ownedCandidates || [],
      uploadedCandidates: uploadedCandidates || [],
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 })
  }
}

export async function PATCH(
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

    // Super admin emails can always update users
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      const { data: adminUser } = await adminClient
        .from('users_admin')
        .select('role')
        .eq('email', user.email)
        .single()

      if (!adminUser || adminUser.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only super admins can update users' }, { status: 403 })
      }
    }

    const updates = await req.json()

    // Use admin client to update to bypass RLS
    const { data, error } = await adminClient
      .from('users_admin')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ user: data })
  } catch (error) {
    console.error('Error updating admin user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(
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

    // Super admin emails can always delete users
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      const { data: adminUser } = await adminClient
        .from('users_admin')
        .select('role, email')
        .eq('email', user.email)
        .single()

      if (!adminUser || adminUser.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only super admins can delete users' }, { status: 403 })
      }
    }

    // Prevent deleting self
    const { data: targetUser } = await adminClient
      .from('users_admin')
      .select('email')
      .eq('id', id)
      .single()

    if (targetUser?.email === user.email) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    // Use admin client to delete to bypass RLS
    const { error } = await adminClient
      .from('users_admin')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting admin user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
