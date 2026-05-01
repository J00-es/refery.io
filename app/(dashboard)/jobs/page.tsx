import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Job } from '@/lib/types'
import { JobList } from '@/components/job-list'
import { BatchUpload } from '@/components/batch-upload'
import { cookies } from 'next/headers'

// Hardcoded super admins
const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function JobsPage() {
  await cookies()
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user and their role
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return <div>Please log in to view jobs.</div>
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
  const isRecruiter = userRole === 'recruiter'
  const canSeeAllJobs = isAdmin || isRecruiter

  // RLS policies handle access control at database level
  // Admins and recruiters see all, others see only owned/assigned jobs
  // Order: open jobs first, then by most recent
  // Paginate to ensure all rows are fetched regardless of total count
  const PAGE_SIZE = 1000
  let allJobs: Record<string, unknown>[] = []
  let jobsPage = 0
  while (true) {
    const { data, error } = await dbClient
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(jobsPage * PAGE_SIZE, (jobsPage + 1) * PAGE_SIZE - 1)
    if (error) break
    if (data) allJobs = allJobs.concat(data)
    if (!data || data.length < PAGE_SIZE) break
    jobsPage++
  }

  // Paginate pipeline query to handle large datasets
  let allPipeline: Record<string, unknown>[] = []
  let pipelinePage = 0
  while (true) {
    const { data, error } = await dbClient
      .from('job_candidate_pipeline')
      .select('job_id, stage, candidate_id, candidates!inner(owner_user_id)')
      .range(pipelinePage * PAGE_SIZE, (pipelinePage + 1) * PAGE_SIZE - 1)
    if (error) break
    if (data) allPipeline = allPipeline.concat(data)
    if (!data || data.length < PAGE_SIZE) break
    pipelinePage++
  }

  const [companiesResult] = await Promise.all([
    dbClient
      .from('companies')
      .select('id, name, description, logo_url')
  ])

  const jobs = allJobs
  const pipelineData = allPipeline
  const companies = companiesResult.data

  type PipelineRow = { job_id: string; stage: string; candidate_id: string; candidates: { owner_user_id: string | null } | null }

  // Group pipeline data by job - separate for all and user-owned
  const pipelineByJob: Record<string, Record<string, number>> = {}
  const userPipelineByJob: Record<string, Record<string, number>> = {}
  if (pipelineData) {
    for (const p of (pipelineData as unknown as PipelineRow[])) {
      const candidate = p.candidates
      
      // All pipeline data (for admins)
      if (!pipelineByJob[p.job_id]) {
        pipelineByJob[p.job_id] = { sourced: 0, screening: 0, interview: 0, offer: 0, hired: 0, total: 0 }
      }
      if (p.stage in pipelineByJob[p.job_id]) {
        pipelineByJob[p.job_id][p.stage]++
      }
      pipelineByJob[p.job_id].total++
      
      // User-owned pipeline data (for non-admins)
      if (candidate?.owner_user_id === user.id) {
        if (!userPipelineByJob[p.job_id]) {
          userPipelineByJob[p.job_id] = { sourced: 0, screening: 0, interview: 0, offer: 0, hired: 0, total: 0 }
        }
        if (p.stage in userPipelineByJob[p.job_id]) {
          userPipelineByJob[p.job_id][p.stage]++
        }
        userPipelineByJob[p.job_id].total++
      }
    }
  }

  // Create company data lookup (by name for legacy jobs without company_id, and by id for proper relationships)
  const companyDataByName: Record<string, { tagline: string | null; logo_url: string | null }> = {}
  const companyDataById: Record<string, { tagline: string | null; logo_url: string | null }> = {}
  if (companies) {
    for (const c of companies) {
      const data = {
        tagline: c.description ? c.description.split('.')[0].trim().substring(0, 100) : null,
        logo_url: c.logo_url,
      }
      companyDataByName[c.name.toLowerCase()] = data
      companyDataById[c.id] = data
    }
  }

  // Non-admins only see open jobs — filter out draft and closed before enriching
  const visibleJobs = isAdmin
    ? (jobs as unknown as Job[])
    : (jobs as unknown as Job[]).filter(j => j.status === 'open')

  // Enrich jobs with pipeline stats and company logos
  // For admins: show all pipeline stats, for non-admins: show only their owned candidates
  const enrichedJobs = visibleJobs.map(job => {
    // Try to get company data by id first, then by name
    const companyData = job.company_id 
      ? companyDataById[job.company_id] 
      : job.company_name 
        ? companyDataByName[job.company_name.toLowerCase()] 
        : null
    
    return {
      ...job,
      pipeline_stats: isAdmin ? pipelineByJob[job.id] || null : userPipelineByJob[job.id] || null,
      company_tagline: companyData?.tagline || null,
      company_logo_url: companyData?.logo_url || null,
    }
  }).sort((a, b) => {
    // Sort by: open status first, then non-pipeline deal types before pipeline, then by created_at desc
    // Status priority: open > draft > closed
    const statusPriority = { open: 0, draft: 1, closed: 2 }
    const statusDiff = (statusPriority[a.status] ?? 2) - (statusPriority[b.status] ?? 2)
    if (statusDiff !== 0) return statusDiff
    
    // Pipeline deal type should be shown lower (less visible)
    const aIsPipeline = a.internal_deal_type === 'pipeline' ? 1 : 0
    const bIsPipeline = b.internal_deal_type === 'pipeline' ? 1 : 0
    if (aIsPipeline !== bIsPipeline) return aIsPipeline - bIsPipeline
    
    // Then by created_at descending (newest first)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  }) as (Job & { 
    pipeline_stats: { total: number; sourced: number; screening: number; interview: number; offer: number; hired: number } | null
    company_tagline: string | null
    company_logo_url: string | null
  })[]

  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Jobs</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {canSeeAllJobs 
              ? 'Manage all job listings and requirements' 
              : 'View jobs assigned to you or created by you'}
          </p>
        </div>
        <div className="flex gap-2">
          <BatchUpload type="jobs" />
          <Link href="/jobs/new">
            <Button size="sm" className="sm:size-default">Add Job</Button>
          </Link>
        </div>
      </div>

      {/* Confidentiality Reminder - Shown to all users */}
      <div className="rounded-lg border border-green-200/60 bg-green-50/40 px-4 py-3">
        <div className="flex gap-3">
          <span className="text-green-600 mt-0.5 flex-shrink-0">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
          <div className="text-sm text-green-900/80">
            <p className="font-medium text-green-900 mb-0.5">Friendly reminder</p>
            <p>
              This page gives you visibility into available roles so you can identify great candidates. 
              <strong> Company names and role details stay private</strong> until candidates complete our vetting process — 
              then we share opportunities directly with them. Our founders appreciate this selective approach, 
              and it ensures your referrals get premium treatment.
            </p>
          </div>
        </div>
      </div>

      <JobList jobs={enrichedJobs} isAdmin={isAdmin} showStatusFilter={isAdmin} />
    </div>
  )
}
