import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Super admin emails always have full access
    if (SUPER_ADMIN_EMAILS.includes(user.email || '')) {
      return NextResponse.json({ 
        status: 'active', 
        role: 'super_admin',
        email: user.email,
        isSuperAdmin: true
      })
    }

    // Use admin client to bypass RLS and get user data
    const { data: adminData, error } = await adminClient
      .from('users_admin')
      .select('id, email, role, status, full_name, user_id')
      .eq('email', user.email)
      .single()

    if (error || !adminData) {
      // User not in users_admin table - treat as pending
      return NextResponse.json({ 
        status: 'pending', 
        role: null,
        email: user.email,
        message: 'User not found in system'
      })
    }

    // Sync user_id if not set
    if (!adminData.user_id) {
      await adminClient
        .from('users_admin')
        .update({ user_id: user.id })
        .eq('id', adminData.id)
    }

    return NextResponse.json({ 
      status: adminData.status || 'pending', 
      role: adminData.role,
      email: user.email,
      fullName: adminData.full_name,
      isSuperAdmin: false
    })
  } catch (error) {
    console.error('Error checking user status:', error)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
