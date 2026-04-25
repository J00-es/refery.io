import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { RecruiterDetailView } from '@/components/recruiter-detail-view'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function RecruiterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  console.log('[v0] RecruiterDetailPage - User email:', user.email)

  // SUPER ADMINS BYPASS ALL CHECKS - check email first
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  console.log('[v0] Is super admin by email?', isSuperAdmin)

  // For super admins, skip all role checks entirely
  if (!isSuperAdmin) {
    // For non-super admins, check role by EMAIL (not user_id!)
    console.log('[v0] Checking admin role by email:', user.email)
    const { data: adminData, error: adminError } = await adminClient
      .from('users_admin')
      .select('role, status')
      .eq('email', user.email)
      .single()

    console.log('[v0] Admin data:', adminData, 'Error:', adminError)

    if (!adminData || adminData.status !== 'active') {
      console.log('[v0] Redirecting to pending-approval')
      redirect('/auth/pending-approval')
    }

    if (!['super_admin', 'admin'].includes(adminData.role)) {
      console.log('[v0] Redirecting to dashboard - not admin')
      redirect('/dashboard')
    }
  }

  console.log('[v0] Access granted, fetching recruiter data')

  // Use admin client for ALL data fetches to bypass RLS
  const { data: recruiter, error: recruiterError } = await adminClient
    .from('prospect_recruiters')
    .select('*')
    .eq('id', id)
    .single()

  if (recruiterError || !recruiter) {
    console.log('[v0] Recruiter not found:', recruiterError)
    notFound()
  }

  // Fetch notes
  const { data: notes } = await adminClient
    .from('prospect_recruiter_notes')
    .select('*')
    .eq('recruiter_id', id)
    .order('created_at', { ascending: false })

  // Fetch stage history
  const { data: stageHistory } = await adminClient
    .from('prospect_recruiter_stage_history')
    .select('*')
    .eq('recruiter_id', id)
    .order('changed_at', { ascending: false })

  // Check if recruiter email matches a user
  let matchedUser = null
  if (recruiter.email) {
    const { data: userData } = await adminClient
      .from('users_admin')
      .select('*')
      .eq('email', recruiter.email)
      .single()
    matchedUser = userData
  }

  // If matched user, fetch their candidate stats
  let candidateStats = null
  let recentActivities: Array<{ type: string; stage?: string; candidateName?: string; jobTitle?: string; date: string }> = []
  
  if (matchedUser && matchedUser.user_id) {
    // Get candidates owned by this user
    const { data: candidates } = await adminClient
      .from('candidates')
      .select('id, name, created_at')
      .eq('owner_user_id', matchedUser.user_id)
      .order('created_at', { ascending: false })

    if (candidates && candidates.length > 0) {
      const candidateIds = candidates.map(c => c.id)
      
      // Get pipeline stats for these candidates with job info
      const { data: pipelineData } = await adminClient
        .from('job_candidate_pipeline')
        .select('stage, job_id, candidate_id, updated_at, jobs!inner(title)')
        .in('candidate_id', candidateIds)
        .order('updated_at', { ascending: false })
        .limit(50)

      // Build stage stats with time tracking
      const stageData: Record<string, { count: number; dates: string[] }> = {}
      if (pipelineData) {
        for (const p of pipelineData) {
          if (!stageData[p.stage]) {
            stageData[p.stage] = { count: 0, dates: [] }
          }
          stageData[p.stage].count++
          stageData[p.stage].dates.push(p.updated_at)
        }
      }

      candidateStats = {
        totalCandidates: candidates.length,
        inPipeline: pipelineData?.length || 0,
        byStage: Object.fromEntries(Object.entries(stageData).map(([stage, data]) => [stage, data.count])),
        stageDetails: stageData,
        hiredCount: stageData['hired']?.count || 0,
        interviewCount: stageData['interview']?.count || 0,
        offerCount: stageData['offer']?.count || 0,
        screeningCount: stageData['screening']?.count || 0,
      }

      // Build recent activities timeline
      const candidateMap = new Map(candidates.map(c => [c.id, c.name]))
      
      // Add pipeline updates as activities
      if (pipelineData) {
        for (const p of pipelineData.slice(0, 10)) {
          const jobData = p.jobs as { title: string } | null
          recentActivities.push({
            type: 'pipeline_update',
            stage: p.stage,
            candidateName: candidateMap.get(p.candidate_id) || 'Unknown',
            jobTitle: jobData?.title || 'Unknown Job',
            date: p.updated_at,
          })
        }
      }

      // Add recent candidate submissions
      for (const c of candidates.slice(0, 5)) {
        recentActivities.push({
          type: 'candidate_added',
          candidateName: c.name,
          date: c.created_at,
        })
      }

      // Sort by date
      recentActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      recentActivities = recentActivities.slice(0, 15)
    }
  }

  return (
    <RecruiterDetailView 
      recruiter={{ ...recruiter, matched_user: matchedUser }}
      notes={notes || []}
      stageHistory={stageHistory || []}
      candidateStats={candidateStats}
      recentActivities={recentActivities}
    />
  )
}
