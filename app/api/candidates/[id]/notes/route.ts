import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const adminClient = createAdminClient()

    // Notes are read with the service-role client, so ownership of the
    // candidate has to be proven here — RLS is not in play.
    const access = await requireCandidateAccess(id)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    // Hiring managers can't see notes
    if (access.appUser.role === ('hiring_manager' as typeof access.appUser.role)) {
      return NextResponse.json({ notes: [] })
    }

    // Use admin client to bypass RLS for fetching notes
    const { data: notes, error } = await adminClient
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
    const adminClient = createAdminClient()

    const access = await requireCandidateAccess(id)
    if (!access.ok) {
      return NextResponse.json({ error: access.message }, { status: access.status })
    }

    const { appUser } = access

    // Only recruiters, scouts and admins can add notes
    if (!['super_admin', 'admin', 'recruiter', 'scout'].includes(appUser.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { note_type, content } = await req.json()

    // Use admin client to bypass RLS for inserting notes
    const { data: note, error } = await adminClient
      .from('recruiter_notes')
      .insert({
        candidate_id: id,
        user_id: appUser.id,
        note_type: note_type || 'general',
        content,
      })
      .select()
      .single()

    if (error) throw error

    // Update last_contacted timestamp on candidate
    if (note_type === 'call') {
      await adminClient
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
