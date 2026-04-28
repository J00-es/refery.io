import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { noteId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

    // Check if user is admin
    const { data: adminUser } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    const isAdmin = isSuperAdmin || ['super_admin', 'admin'].includes(adminUser?.role || '')

    // Admins can delete any note, others can only delete their own
    let query = adminClient
      .from('recruiter_notes')
      .delete()
      .eq('id', noteId)

    if (!isAdmin) {
      query = query.eq('user_id', user.id)
    }

    const { error } = await query

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting note:', error)
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const { noteId } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

    // Check if user is admin
    const { data: adminUser } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    const isAdmin = isSuperAdmin || ['super_admin', 'admin'].includes(adminUser?.role || '')

    const updates = await req.json()

    // Admins can update any note, others can only update their own
    let query = adminClient
      .from('recruiter_notes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', noteId)

    if (!isAdmin) {
      query = query.eq('user_id', user.id)
    }

    const { data: note, error } = await query.select().single()

    if (error) throw error

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Error updating note:', error)
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
  }
}
