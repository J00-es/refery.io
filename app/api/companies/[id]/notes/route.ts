import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: notes, error } = await supabase
    .from('company_notes')
    .select(`
      *,
      user:users_admin!company_notes_user_id_fkey(email, full_name)
    `)
    .eq('company_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    // Fallback without user join if it fails
    const { data: notesOnly, error: notesError } = await supabase
      .from('company_notes')
      .select('*')
      .eq('company_id', id)
      .order('created_at', { ascending: false })

    if (notesError) {
      return NextResponse.json({ error: notesError.message }, { status: 500 })
    }
    return NextResponse.json(notesOnly)
  }

  return NextResponse.json(notes)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { note_type, content } = await req.json()

  const { data: note, error } = await supabase
    .from('company_notes')
    .insert({
      company_id: id,
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
