import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { jobsAccessDenied } from '@/lib/admin-auth'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await jobsAccessDenied()
  if (denied) return denied
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: notes, error } = await supabase
    .from('job_internal_notes')
    .select(`
      *,
      user:users_admin!job_internal_notes_user_id_fkey(email, full_name)
    `)
    .eq('job_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    // Fallback without user join if it fails
    const { data: notesOnly, error: notesError } = await supabase
      .from('job_internal_notes')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false })

    if (notesError) {
      return NextResponse.json({ error: notesError.message }, { status: 500 })
    }
    return NextResponse.json(notesOnly)
  }

  return NextResponse.json(notes)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await jobsAccessDenied()
  if (denied) return denied
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { note_type, content } = await req.json()

  const { data: note, error } = await supabase
    .from('job_internal_notes')
    .insert({
      job_id: id,
      user_id: user.id,
      note_type: note_type || 'general',
      content,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(note)
}
