import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { NextResponse } from 'next/server'
import type { Candidate } from '@/lib/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only the super admin sees candidates that are not their own — the same
  // rule the candidates page and RLS use. This was `super_admin OR admin`,
  // which would have let an admin read every partner's submissions.
  const appUser = await getAppUser()
  const isAdmin = appUser?.canViewAllCandidates ?? false

  // Fetch pipeline candidates with their details using admin client
  const { data, error } = await adminClient
    .from('job_candidate_pipeline')
    .select(`
      *,
      candidate:candidates(*)
    `)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Pipeline fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter by candidate ownership for non-admins
  const filteredData = isAdmin 
    ? data 
    : (data || []).filter(item => {
        const candidate = item.candidate as Candidate | null
        return candidate && (
          candidate.owner_user_id === user.id ||
          candidate.uploaded_by_user_id === user.id ||
          candidate.user_id === user.id
        )
      })

  // Fetch owner info and why_good_fit (first stage history note) separately if needed
  const pipelineWithDetails = await Promise.all(
    (filteredData || []).map(async (item) => {
      const [ownerResult, whyGoodFitResult] = await Promise.all([
        item.owner_user_id 
          ? adminClient
              .from('users_admin')
              .select('email, full_name')
              .eq('user_id', item.owner_user_id)
              .single()
          : Promise.resolve({ data: null }),
        // Get the initial "why good fit" note from stage history
        adminClient
          .from('pipeline_stage_history')
          .select('notes')
          .eq('pipeline_id', item.id)
          .is('previous_stage', null) // First entry has null previous_stage
          .single()
      ])
      
      const whyGoodFit = whyGoodFitResult.data?.notes !== 'Added to pipeline' 
        ? whyGoodFitResult.data?.notes 
        : null
        
      return { 
        ...item, 
        owner: ownerResult.data,
        why_good_fit: whyGoodFit 
      }
    })
  )

  return NextResponse.json(pipelineWithDetails)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { candidate_id, stage = 'job_matched', owner_user_id, why_good_fit } = body

  const { data, error } = await adminClient
    .from('job_candidate_pipeline')
    .insert({
      job_id: jobId,
      candidate_id,
      stage,
      added_by_user_id: user.id,
      owner_user_id: owner_user_id || user.id,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Candidate already added to this job' }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Get job info for activity log description
  const { data: job } = await adminClient
    .from('jobs')
    .select('title, company_name')
    .eq('id', jobId)
    .single()

  // Log the initial stage to history with "why good fit" as notes
  await adminClient
    .from('pipeline_stage_history')
    .insert({
      pipeline_id: data.id,
      job_id: jobId,
      candidate_id,
      previous_stage: null, // First entry - no previous stage
      new_stage: stage,
      changed_by_user_id: user.id,
      time_in_previous_stage: null,
      notes: why_good_fit || 'Added to pipeline',
    })

  // Auto-log to candidate activity log
  const activityDescription = job 
    ? `Added to pipeline for ${job.title} at ${job.company_name}${why_good_fit ? `. Reason: ${why_good_fit}` : ''}`
    : `Added to job pipeline${why_good_fit ? `. Reason: ${why_good_fit}` : ''}`

  await adminClient.from('candidate_activity_log').insert({
    candidate_id,
    activity_type: 'job_matched',
    description: activityDescription,
    performed_by: user.id,
    metadata: { job_id: jobId, pipeline_id: data.id }
  })

  return NextResponse.json(data)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { pipeline_id, stage, owner_user_id, notes } = body

  // Fetch current pipeline entry to get previous stage and timing
  const { data: currentPipeline } = await adminClient
    .from('job_candidate_pipeline')
    .select('stage, candidate_id, updated_at')
    .eq('id', pipeline_id)
    .single()

  const previousStage = currentPipeline?.stage
  const previousUpdatedAt = currentPipeline?.updated_at
  const candidateId = currentPipeline?.candidate_id

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (stage) updateData.stage = stage
  if (owner_user_id !== undefined) updateData.owner_user_id = owner_user_id

  const { data, error } = await adminClient
    .from('job_candidate_pipeline')
    .update(updateData)
    .eq('id', pipeline_id)
    .eq('job_id', jobId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log stage change to history if stage actually changed
  if (stage && stage !== previousStage && candidateId) {
    // Get job info for activity log
    const { data: job } = await adminClient
      .from('jobs')
      .select('title, company_name')
      .eq('id', jobId)
      .single()

    // Calculate time spent in previous stage
    let timeInPreviousStage = null
    if (previousUpdatedAt) {
      const prevTime = new Date(previousUpdatedAt).getTime()
      const nowTime = new Date().getTime()
      const diffMs = nowTime - prevTime
      // Convert to PostgreSQL interval format (seconds)
      timeInPreviousStage = `${Math.floor(diffMs / 1000)} seconds`
    }

    await adminClient
      .from('pipeline_stage_history')
      .insert({
        pipeline_id,
        job_id: jobId,
        candidate_id: candidateId,
        previous_stage: previousStage,
        new_stage: stage,
        changed_by_user_id: user.id,
        time_in_previous_stage: timeInPreviousStage,
        notes: notes || null,
      })

    // Auto-log stage change to candidate activity log
    const stageLabels: Record<string, string> = {
      auto_matched: 'AI Matched',
      screening: 'Screening',
      job_matched: 'Job Matched',
      job_shared: 'Job Shared',
      interest_confirmed: 'Interest Confirmed',
      hm_shared: 'Shared to HM',
      auto_passed: 'AI Passed',
      rejected: 'Rejected'
    }

    const activityType = ['auto_passed', 'rejected'].includes(stage)
      ? stage
      : 'stage_changed'
    
    const stageDescription = job 
      ? `Moved to "${stageLabels[stage] || stage}" for ${job.title} at ${job.company_name}`
      : `Moved to "${stageLabels[stage] || stage}" stage`

    await adminClient.from('candidate_activity_log').insert({
      candidate_id: candidateId,
      activity_type: activityType,
      description: stageDescription,
      performed_by: user.id,
      metadata: { job_id: jobId, pipeline_id, previous_stage: previousStage, new_stage: stage }
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pipelineId = searchParams.get('pipeline_id')

  if (!pipelineId) {
    return NextResponse.json({ error: 'Pipeline ID required' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('job_candidate_pipeline')
    .delete()
    .eq('id', pipelineId)
    .eq('job_id', jobId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
