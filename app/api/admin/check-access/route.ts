import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Super admin emails always have access
  if (SUPER_ADMIN_EMAILS.includes(user.email || '')) {
    return NextResponse.json({ role: 'super_admin' })
  }

  // Check admin access using admin client to bypass RLS
  const { data: adminUser } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ role: adminUser.role })
}
