import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is a recruiter/admin (hiring managers can't see notes)
    const { data: adminUser } = await supabase
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    if (adminUser && adminUser.role === 'hiring_manager') {
      return NextResponse.json({ notes: [] }) // Return empty for hiring managers
    }

    const { data: notes, error } = await supabase
      .from('recruiter_notes')
      .select('*')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ notes: notes || [] })
  } catch (error) {
    console.error('Error fetching notes:', error)
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role - only recruiters and admins can add notes
    const { data: adminUser } = await supabase
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    if (adminUser && !['super_admin', 'admin', 'recruiter'].includes(adminUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { note_type, content } = await req.json()

    const { data: note, error } = await supabase
      .from('recruiter_notes')
      .insert({
        candidate_id: id,
        user_id: user.id,
        note_type: note_type || 'general',
        content,
      })
      .select()
      .single()

    if (error) throw error

    // Update last_contacted timestamp on candidate
    if (note_type === 'call') {
      await supabase
        .from('candidates')
        .update({ last_contacted: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({ note })
  } catch (error) {
    console.error('Error creating note:', error)
    return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
  }
}
