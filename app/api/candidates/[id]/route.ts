import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: candidate, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw error
    }

    // Also get matches for this candidate
    const { data: matches } = await supabase
      .from('job_matches')
      .select(`
        *,
        job:jobs(*)
      `)
      .eq('candidate_id', id)
      .order('overall_score', { ascending: false })

    return NextResponse.json({ candidate, matches })
  } catch (error) {
    console.error('Error fetching candidate:', error)
    return NextResponse.json({ error: 'Failed to fetch candidate' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const { data: candidate, error } = await supabase
      .from('candidates')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ candidate })
  } catch (error) {
    console.error('Error updating candidate:', error)
    return NextResponse.json({ error: 'Failed to update candidate' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('candidates')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting candidate:', error)
    return NextResponse.json({ error: 'Failed to delete candidate' }, { status: 500 })
  }
}
