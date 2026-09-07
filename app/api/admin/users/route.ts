import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/current-user'
import { loadPresence } from '@/lib/activity'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Super admin emails always have full access
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      // Check if user is admin or super_admin using admin client to bypass RLS
      const { data: adminUser } = await adminClient
        .from('users_admin')
        .select('*')
        .eq('email', user.email)
        .single()

      if (!adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Get all admin users using admin client to bypass RLS
    const [{ data: users, error }, presence] = await Promise.all([
      adminClient.from('users_admin').select('*').order('created_at', { ascending: false }),
      loadPresence(adminClient),
    ])

    if (error) throw error

    // Presence lives on the auth side. Matched by auth id first, then by
    // email for rows an admin created by hand that have not signed in yet.
    const byEmail = new Map([...presence.values()].map((p) => [p.email.toLowerCase(), p]))
    const withPresence = (users ?? []).map((u) => {
      const p = (u.user_id && presence.get(u.user_id)) || byEmail.get(String(u.email).toLowerCase())
      return { ...u, last_seen_at: p?.last_active_at ?? null, sign_ins_7d: p?.sign_ins_7d ?? 0 }
    })

    return NextResponse.json({ users: withPresence, currentUserRole: isSuperAdmin ? 'super_admin' : 'admin' })
  } catch (error) {
    console.error('Error fetching admin users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Super admin emails can always add users
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      // Check role using admin client
      const { data: adminUser } = await adminClient
        .from('users_admin')
        .select('role')
        .eq('email', user.email)
        .single()

      if (!adminUser || adminUser.role !== 'super_admin') {
        return NextResponse.json({ error: 'Only super admins can add users' }, { status: 403 })
      }
    }

    const body = await req.json()
    const { role, status } = body
    // Store the same casing Supabase Auth will, so this row is findable once
    // the invitee signs in.
    const email = normalizeEmail(body.email)

    // Use admin client to insert to bypass RLS
    const { data, error } = await adminClient
      .from('users_admin')
      .insert({ email, role, status: status || 'active' })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'User already exists' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ user: data })
  } catch (error) {
    console.error('Error creating admin user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
