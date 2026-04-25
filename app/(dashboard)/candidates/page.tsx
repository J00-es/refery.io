import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Candidate } from '@/lib/types'
import { CandidateList } from '@/components/candidate-list'
import { cookies } from 'next/headers'

// Hardcoded super admins
const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function CandidatesPage() {
  await cookies()
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user and their role
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return <div>Please log in to view candidates.</div>
  }

  // Check if super admin - use admin client to bypass RLS
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  const dbClient = isSuperAdmin ? adminClient : supabase

  // Get user role for display purposes
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user.email)
    .single()

  const userRole = isSuperAdmin
    ? 'super_admin' 
    : adminData?.role || 'viewer'
  
  const isAdmin = ['super_admin', 'admin'].includes(userRole)
  const currentUserId = user.id

  // Build query based on role
  // Admins see all candidates, others see only owned/uploaded/created candidates
  let candidatesResult
  
  if (isAdmin) {
    candidatesResult = await dbClient
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
  } else {
    // Non-admins (including recruiters) only see candidates they own, uploaded, or created
    candidatesResult = await dbClient
      .from('candidates')
      .select('*')
      .or(`owner_user_id.eq.${currentUserId},uploaded_by_user_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
      .order('created_at', { ascending: false })
      .limit(100)
  }

  // Get pipeline data
  const pipelineResult = await dbClient
    .from('job_candidate_pipeline')
    .select('candidate_id, stage, job:jobs(title, company_name)')

  // Get latest recruiter note date for each candidate
  const { data: recruiterNotes } = await dbClient
    .from('recruiter_notes')
    .select('candidate_id, created_at')
    .order('created_at', { ascending: false })

  const candidates = candidatesResult.data
  const pipelineData = pipelineResult.data

  // Build map of candidate_id -> latest note date
  const latestNoteByCandidate: Record<string, string> = {}
  if (recruiterNotes) {
    for (const note of recruiterNotes) {
      if (!latestNoteByCandidate[note.candidate_id]) {
        latestNoteByCandidate[note.candidate_id] = note.created_at
      }
    }
  }

  // Get unique owner IDs that exist
  const ownerIds = [...new Set((candidates ?? []).filter(c => c.owner_user_id).map(c => c.owner_user_id))]
  
  // Only fetch owners if there are any
  let ownerMap: Record<string, { email: string; full_name: string | null }> = {}
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from('users_admin')
      .select('user_id, email, full_name')
      .in('user_id', ownerIds)
    
    if (owners) {
      ownerMap = Object.fromEntries(owners.map(o => [o.user_id, { email: o.email, full_name: o.full_name }]))
    }
  }

  // Group pipeline data by candidate
  const pipelineByCandidate: Record<string, { job_title: string; stage: string; company: string }[]> = {}
  if (pipelineData) {
    for (const p of pipelineData) {
      if (!pipelineByCandidate[p.candidate_id]) {
        pipelineByCandidate[p.candidate_id] = []
      }
      if (p.job) {
        const job = p.job as { title: string; company_name: string }
        pipelineByCandidate[p.candidate_id].push({
          job_title: job.title,
          stage: p.stage,
          company: job.company_name || '',
        })
      }
    }
  }

  // Enrich candidates with last_activity (max of updated_at, created_at, and latest recruiter note)
  const enrichedCandidates = (candidates ?? []).map(candidate => {
    const latestNoteDate = latestNoteByCandidate[candidate.id]
    const candidateUpdated = new Date(candidate.updated_at).getTime()
    const candidateCreated = new Date(candidate.created_at).getTime()
    const noteDate = latestNoteDate ? new Date(latestNoteDate).getTime() : 0
    
    const lastActivityTimestamp = Math.max(candidateUpdated, candidateCreated, noteDate)
    
    return {
      ...candidate,
      pipeline_jobs: pipelineByCandidate[candidate.id] || [],
      owner: candidate.owner_user_id ? ownerMap[candidate.owner_user_id] || null : null,
      last_activity: new Date(lastActivityTimestamp).toISOString(),
      latest_note_date: latestNoteDate || null,
    }
  }) as (Candidate & { 
    pipeline_jobs: { job_title: string; stage: string; company: string }[]
    owner: { email: string; full_name: string | null } | null
    last_activity: string
    latest_note_date: string | null
  })[]

  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Candidates</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {isAdmin 
              ? 'View and manage all candidate resumes' 
              : 'View candidates assigned to you or created by you'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/candidates/bulk">
            <Button variant="outline" size="sm" className="sm:size-default">Bulk Upload</Button>
          </Link>
          <Link href="/candidates/new">
            <Button size="sm" className="sm:size-default">Upload Resume</Button>
          </Link>
        </div>
      </div>

      <CandidateList candidates={enrichedCandidates} />
    </div>
  )
}
