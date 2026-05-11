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
  // Non-admins only see open jobs — push that filter into SQL so we don't
  // download closed/draft rows we'd just throw away.
  // Select only the columns the list view needs (avoids the heavy `description`,
  // `requirements`, `skills_required`, `tags`, and the vector `embedding` column).
  const JOB_LIST_COLUMNS = 'id, title, company_name, company_id, company_stage, department, location, remote_policy, salary_min, salary_max, status, referral_bonus, referral_bonus_type, created_at, internal_deal_type'
  const PAGE_SIZE = 5000
  let allJobs: Record<string, unknown>[] = []
  let jobsPage = 0
  while (true) {
    let q = dbClient
      .from('jobs')
      .select(JOB_LIST_COLUMNS)
      .order('created_at', { ascending: false })
      .range(jobsPage * PAGE_SIZE, (jobsPage + 1) * PAGE_SIZE - 1)
    if (!isAdmin) q = q.eq('status', 'open')
    const { data, error } = await q
    if (error) break
    if (data) allJobs = allJobs.concat(data)
    if (!data || data.length < PAGE_SIZE) break
    jobsPage++
  }

  // Pipeline stage counts and company enrichment data — run in parallel.
  // Admins get global counts from a view; non-admins get user-scoped counts
  // from an RPC that joins through candidates.owner_user_id (matches the
  // previous JS-side filter exactly).
  const [pipelineResult, companiesResult] = await Promise.all([
    isAdmin
      ? dbClient.from('job_pipeline_stats').select('job_id, sourced, screening, interview, offer, hired, total')
      : dbClient.rpc('user_job_pipeline_stats', { uid: user.id }),
    dbClient
      .from('companies')
      .select('id, name, description, logo_url')
  ])

  const jobs = allJobs
  const companies = companiesResult.data

  type PipelineStatsRow = { job_id: string; sourced: number; screening: number; interview: number; offer: number; hired: number; total: number }
  const pipelineByJob: Record<string, { sourced: number; screening: number; interview: number; offer: number; hired: number; total: number }> = {}
  if (pipelineResult.data) {
    for (const row of pipelineResult.data as unknown as PipelineStatsRow[]) {
      pipelineByJob[row.job_id] = {
        sourced: Number(row.sourced) || 0,
        screening: Number(row.screening) || 0,
        interview: Number(row.interview) || 0,
        offer: Number(row.offer) || 0,
        hired: Number(row.hired) || 0,
        total: Number(row.total) || 0,
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

  // Non-admins already had status='open' applied at SQL; admins see everything.
  const visibleJobs = jobs as unknown as Job[]

  // Enrich jobs with pipeline stats (admin: global; non-admin: user-scoped) and
  // company logos/taglines from the companies lookup.
  const enrichedJobs = visibleJobs.map(job => {
    // Try to get company data by id first, then by name
    const companyData = job.company_id
      ? companyDataById[job.company_id]
      : job.company_name
        ? companyDataByName[job.company_name.toLowerCase()]
        : null

    return {
      ...job,
      pipeline_stats: pipelineByJob[job.id] || null,
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
