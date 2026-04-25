import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { RecruiterDetailView } from '@/components/recruiter-detail-view'

// SUPER ADMIN EMAILS - These users bypass ALL database checks
const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function RecruiterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Step 1: Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Step 2: Check if super admin BY EMAIL FIRST - no database query needed!
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  
  // Step 3: For super admins, skip ALL permission checks - go directly to data fetch
  if (!isSuperAdmin) {
    // Only non-super admins need database role check
    // IMPORTANT: Query by EMAIL, not user_id, and use adminClient to bypass RLS
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role, status')
      .eq('email', user.email)
      .single()

    // Check if user is active
    if (!adminData || adminData.status !== 'active') {
      redirect('/auth/pending-approval')
    }

    // Check if user has admin role
    if (!['super_admin', 'admin'].includes(adminData.role)) {
      redirect('/dashboard')
    }
  }

  // Step 4: Fetch recruiter data using admin client (bypasses RLS)
  const { data: recruiter, error: recruiterError } = await adminClient
    .from('prospect_recruiters')
    .select('*')
    .eq('id', id)
    .single()

  if (recruiterError || !recruiter) {
    notFound()
  }

  // Step 5: Fetch related data
  const { data: notes } = await adminClient
    .from('prospect_recruiter_notes')
    .select('*')
    .eq('recruiter_id', id)
    .order('created_at', { ascending: false })

  const { data: stageHistory } = await adminClient
    .from('prospect_recruiter_stage_history')
    .select('*')
    .eq('recruiter_id', id)
    .order('changed_at', { ascending: false })

  // Step 6: Check if recruiter has a matching user account
  let matchedUser = null
  if (recruiter.email) {
    const { data: userData } = await adminClient
      .from('users_admin')
      .select('*')
      .eq('email', recruiter.email)
      .single()
    matchedUser = userData
  }

  // Step 7: Get candidate stats if user is matched
  let candidateStats = null
  let recentActivities: Array<{ type: string; stage?: string; candidateName?: string; jobTitle?: string; date: string }> = []
  
  if (matchedUser && matchedUser.user_id) {
    const { data: candidates } = await adminClient
      .from('candidates')
      .select('id, name, created_at')
      .eq('owner_user_id', matchedUser.user_id)
      .order('created_at', { ascending: false })

    if (candidates && candidates.length > 0) {
      const candidateIds = candidates.map(c => c.id)
      
      const { data: pipelineData } = await adminClient
        .from('job_candidate_pipeline')
        .select('stage, job_id, candidate_id, updated_at, jobs!inner(title)')
        .in('candidate_id', candidateIds)
        .order('updated_at', { ascending: false })
        .limit(50)

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

      const candidateMap = new Map(candidates.map(c => [c.id, c.name]))
      
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

      for (const c of candidates.slice(0, 5)) {
        recentActivities.push({
          type: 'candidate_added',
          candidateName: c.name,
          date: c.created_at,
        })
      }

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
