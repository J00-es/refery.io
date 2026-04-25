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

  // Check admin access - super admins have full access
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  
  if (!isSuperAdmin) {
    // Query by email (more reliable - user_id may not be synced yet)
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role, status')
      .eq('email', user.email)
      .single()

    if (!adminData || adminData.status !== 'active') {
      redirect('/auth/pending-approval')
    }

    // Only super_admin and admin can access this page
    if (!['super_admin', 'admin'].includes(adminData.role)) {
      redirect('/dashboard')
    }
  }

  // Use admin client to bypass RLS
  const dbClient = adminClient

  // Fetch recruiter with notes and stage history
  const { data: recruiter, error } = await dbClient
    .from('prospect_recruiters')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !recruiter) {
    notFound()
  }

  // Fetch notes
  const { data: notes } = await dbClient
    .from('prospect_recruiter_notes')
    .select('*')
    .eq('recruiter_id', id)
    .order('created_at', { ascending: false })

  // Fetch stage history
  const { data: stageHistory } = await dbClient
    .from('prospect_recruiter_stage_history')
    .select('*')
    .eq('recruiter_id', id)
    .order('changed_at', { ascending: false })

  // Check if recruiter email matches a user
  let matchedUser = null
  if (recruiter.email) {
    const { data: userData } = await dbClient
      .from('users_admin')
      .select('*')
      .eq('email', recruiter.email)
      .single()
    matchedUser = userData
  }

  // If matched user, fetch their candidate stats
  let candidateStats = null
  let recentActivities: Array<{ type: string; stage?: string; candidateName?: string; jobTitle?: string; date: string }> = []
  if (matchedUser) {
    // Get candidates owned by this user
    const { data: candidates } = await dbClient
      .from('candidates')
      .select('id, name, created_at')
      .eq('owner_user_id', matchedUser.user_id)
      .order('created_at', { ascending: false })

    if (candidates && candidates.length > 0) {
      const candidateIds = candidates.map(c => c.id)
      
      // Get pipeline stats for these candidates with job info
      const { data: pipelineData } = await dbClient
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
