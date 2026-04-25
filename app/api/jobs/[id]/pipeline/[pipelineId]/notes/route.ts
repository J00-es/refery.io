import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; pipelineId: string }> }
) {
  const { pipelineId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('job_candidate_notes')
    .select(`
      *,
      user:users_admin!job_candidate_notes_user_id_fkey(email, full_name)
    `)
    .eq('job_candidate_pipeline_id', pipelineId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; pipelineId: string }> }
) {
  const { pipelineId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { content } = body

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Content is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('job_candidate_notes')
    .insert({
      job_candidate_pipeline_id: pipelineId,
      user_id: user.id,
      content: content.trim(),
    })
    .select(`
      *,
      user:users_admin!job_candidate_notes_user_id_fkey(email, full_name)
    `)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
