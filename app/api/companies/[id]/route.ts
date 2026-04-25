import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

// Helper to check if user can edit/delete companies (super admin or admin only)
async function canManageCompany(supabase: Awaited<ReturnType<typeof createClient>>, userEmail: string): Promise<boolean> {
  // Check if super admin
  if (SUPER_ADMIN_EMAILS.includes(userEmail)) {
    return true
  }

  // Get user role
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('email', userEmail)
    .single()

  const userRole = adminData?.role || 'viewer'

  // Only admins can manage companies
  return userRole === 'admin'
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Check if user can manage this company
  const canManage = await canManageCompany(supabase, user.email || '')

  return NextResponse.json({ ...company, canManage })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check permission
  const canManage = await canManageCompany(supabase, user.email || '')
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to edit companies. Only super admins and admins can edit companies.' }, { status: 403 })
  }

  const body = await req.json()

  const { data: company, error } = await supabase
    .from('companies')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(company)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check permission
  const canManage = await canManageCompany(supabase, user.email || '')
  if (!canManage) {
    return NextResponse.json({ error: 'You do not have permission to delete companies. Only super admins and admins can delete companies.' }, { status: 403 })
  }

  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
