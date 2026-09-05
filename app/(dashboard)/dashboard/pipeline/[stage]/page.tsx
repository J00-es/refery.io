import { createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter, getAppUser } from '@/lib/current-user'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { DASHBOARD_BUCKETS, getStageConfig, STAGE_ACCENT_COLORS, STAGE_DESCRIPTIONS } from '@/lib/pipeline-stages'
import { StageDrilldownClient } from './stage-drilldown-client'

interface PageProps {
  params: Promise<{ stage: string }>
  searchParams: Promise<{ sort?: string; stale?: string; search?: string; owner?: string }>
}

export default async function StageDrillDownPage({ params, searchParams }: PageProps) {
  const { stage: bucketKey } = await params
  const { sort = 'days_desc', stale, search, owner } = await searchParams
  
  const adminClient = createAdminClient()

  // Find the bucket configuration
  const bucket = DASHBOARD_BUCKETS.find(b => b.key === bucketKey)
  if (!bucket) {
    notFound()
  }

  const appUser = await getAppUser()
  if (!appUser) {
    redirect('/auth/login')
  }

  // Candidate visibility follows canViewAllCandidates (super admin only), not
  // the broader admin-console capability. See lib/current-user.ts.
  const canViewAll = appUser.canViewAllCandidates
  const currentUserId = appUser.id

  // Scope before fetching. This used to pull every pipeline row and filter in
  // JS, which both read other partners' rows and silently lost data: PostgREST
  // caps a response at 1000 rows, so a partner whose rows sorted past the cap
  // saw an empty stage.
  let ownedCandidateIds: string[] = []
  if (!canViewAll) {
    const { data: ownedCands } = await adminClient
      .from('candidates')
      .select('id')
      .or(candidateOwnershipFilter(currentUserId))
    ownedCandidateIds = (ownedCands || []).map(c => c.id)
  }

  // Fetch pipeline data for the stages in this bucket
  let pipelineQuery = adminClient
    .from('job_candidate_pipeline')
    .select(`
      id,
      stage,
      updated_at,
      created_at,
      job_id,
      candidate_id,
      owner_user_id,
      jobs(id, title, company_name, company_id, location, salary_min, salary_max, created_at),
      candidates(
        id,
        name,
        email,
        linkedin_url,
        location,
        experience_years,
        resume_blob_pathname,
        owner_user_id,
        uploaded_by_user_id,
        user_id
      )
    `)
    .in('stage', bucket.stages)
    .order('updated_at', { ascending: false })

  if (!canViewAll) {
    // A row is yours if you own the row itself, or if it is about your
    // candidate — the matching automation owns most rows.
    const orParts = [`owner_user_id.eq.${currentUserId}`]
    if (ownedCandidateIds.length > 0) {
      orParts.push(`candidate_id.in.(${ownedCandidateIds.join(',')})`)
    }
    pipelineQuery = pipelineQuery.or(orParts.join(','))
  }

  const { data: pipelineData, error } = await pipelineQuery

  // Fetch company logos for all jobs
  const companyIds = [...new Set(
    (pipelineData || [])
      .map(p => (p.jobs as { company_id: string | null } | null)?.company_id)
      .filter(Boolean)
  )] as string[]
  
  const { data: companies } = companyIds.length > 0
    ? await adminClient
        .from('companies')
        .select('id, logo_url')
        .in('id', companyIds)
    : { data: [] }
  
  const companyLogoMap = new Map(companies?.map(c => [c.id, c.logo_url]) || [])

  if (error) {
    console.error('Pipeline fetch error:', error)
  }

  // Second pass over the same rule the query already applied — cheap, and it
  // keeps the page correct if the query filter is ever loosened.
  const filteredData = canViewAll
    ? pipelineData || []
    : (pipelineData || []).filter(p => {
        if (p.owner_user_id === currentUserId) return true
        const candidate = p.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && (
          candidate.owner_user_id === currentUserId ||
          candidate.uploaded_by_user_id === currentUserId ||
          candidate.user_id === currentUserId
        )
      })

  // Fetch owner info for all pipeline items
  const ownerIds = [...new Set(filteredData.map(p => p.owner_user_id).filter(Boolean))]
  const { data: owners } = ownerIds.length > 0 
    ? await adminClient
        .from('users_admin')
        .select('user_id, email, full_name')
        .in('user_id', ownerIds)
    : { data: [] }

  const ownerMap = new Map(owners?.map(o => [o.user_id, o]) || [])

  // Group pipeline items by candidate_id
  type CandidateGroup = {
    candidate_id: string
    candidate_name: string
    candidate_email: string | null
    candidate_linkedin: string | null
    candidate_location: string | null
    candidate_current_title: string | null
    candidate_experience_years: number | null
    resume_url: string | null
    source_type: string | null
    source_name: string | null
    notes: string | null
    owner: { user_id: string; email: string; full_name: string | null } | null
    lastActivity: string
    maxDaysInStage: number
    jobs: {
      id: string
      job_id: string
      title: string
      company_name: string
      company_logo_url: string | null
      location: string | null
      salary_min: number | null
      salary_max: number | null
      created_at: string
      daysInStage: number
    }[]
    activities: { timestamp: string; description: string }[]
  }

  const candidateGroups: Map<string, CandidateGroup> = new Map()

  for (const item of filteredData) {
    const candidate = item.candidates as {
      id: string
      name: string
      email: string | null
      linkedin_url: string | null
      location: string | null
      experience_years: number | null
      resume_blob_pathname: string | null
    } | null
    
    const job = item.jobs as {
      id: string
      title: string
      company_name: string | null
      company_id: string | null
      location: string | null
      salary_min: number | null
      salary_max: number | null
      created_at: string
    } | null

    if (!candidate) continue

    const daysInStage = Math.floor((Date.now() - new Date(item.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    const ownerInfo = item.owner_user_id ? ownerMap.get(item.owner_user_id) : null

    if (!candidateGroups.has(candidate.id)) {
      candidateGroups.set(candidate.id, {
        candidate_id: candidate.id,
        candidate_name: candidate.name,
        candidate_email: candidate.email,
        candidate_linkedin: candidate.linkedin_url,
        candidate_location: candidate.location,
        candidate_current_title: null,
        candidate_experience_years: candidate.experience_years,
        resume_url: candidate.resume_blob_pathname,
        source_type: null,
        source_name: null,
        notes: null,
        owner: ownerInfo ? { 
          user_id: ownerInfo.user_id, 
          email: ownerInfo.email, 
          full_name: ownerInfo.full_name 
        } : null,
        lastActivity: item.updated_at,
        maxDaysInStage: daysInStage,
        jobs: [],
        activities: [
          { timestamp: item.updated_at, description: `Moved to ${getStageConfig(item.stage).label}` },
          { timestamp: item.created_at, description: 'Added to pipeline' },
        ],
      })
    }

    const group = candidateGroups.get(candidate.id)!
    
    // Add job to group
    if (job) {
      group.jobs.push({
        id: item.id,
        job_id: job.id,
        title: job.title,
        company_name: job.company_name || 'Unknown',
        company_logo_url: job.company_id ? companyLogoMap.get(job.company_id) || null : null,
        location: job.location,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        created_at: job.created_at,
        daysInStage,
      })
    }

    // Update max days in stage
    if (daysInStage > group.maxDaysInStage) {
      group.maxDaysInStage = daysInStage
    }

    // Update last activity if more recent
    if (new Date(item.updated_at) > new Date(group.lastActivity)) {
      group.lastActivity = item.updated_at
    }
  }

  // Convert to array and apply sorting
  let groupedData = Array.from(candidateGroups.values())

  // Calculate stats
  const totalCount = filteredData.length
  const uniqueCandidates = groupedData.length
  const staleCount = groupedData.filter(g => g.maxDaysInStage > 7).length
  const criticalCount = groupedData.filter(g => g.maxDaysInStage > 14).length
  const avgDaysInStage = groupedData.length > 0
    ? Math.round((groupedData.reduce((sum, g) => sum + g.maxDaysInStage, 0) / groupedData.length) * 10) / 10
    : 0
  const oldestDays = groupedData.length > 0
    ? Math.max(...groupedData.map(g => g.maxDaysInStage))
    : 0

  // Get unique owners for filter dropdown
  const uniqueOwners = Array.from(
    new Map(
      groupedData
        .filter(g => g.owner)
        .map(g => [g.owner!.user_id, g.owner!])
    ).values()
  )

  const stageAccentColor = STAGE_ACCENT_COLORS[bucketKey] || '#1F3A2F'
  const stageDescription = STAGE_DESCRIPTIONS[bucketKey] || 'View and manage candidates in this stage'

  return (
    <div className="space-y-4 sm:space-y-5 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-[12.5px] text-[rgba(22,22,19,0.40)]">
        <Link href="/dashboard" className="text-[rgba(22,22,19,0.64)] hover:underline">
          &larr; Dashboard
        </Link>
        <span className="text-[rgba(22,22,19,0.20)]">/</span>
        <span className="hidden sm:inline">Pipeline</span>
        <span className="hidden sm:inline text-[rgba(22,22,19,0.20)]">/</span>
        <span>{bucket.label}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3 sm:gap-5">
        <div 
          className="w-1 self-stretch rounded-sm mt-1 sm:mt-2"
          style={{ backgroundColor: stageAccentColor }}
        />
        <div className="flex-1">
          <h1 className="text-[28px] sm:text-[38px] font-semibold leading-tight tracking-tight text-[#161613] flex flex-wrap items-baseline gap-2 sm:gap-3.5">
            {bucket.label}
            <span className="text-xs sm:text-sm font-medium bg-[#E9E8E1] text-[rgba(22,22,19,0.64)] px-2 sm:px-3 py-1 sm:py-1.5 rounded-full tracking-normal">
              {totalCount} candidate{totalCount !== 1 ? 's' : ''}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-[rgba(22,22,19,0.64)] mt-1 sm:mt-1.5">
            {stageDescription}
          </p>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white border border-[rgba(22,22,19,0.10)] rounded-[10px] px-3 sm:px-[18px] py-3 sm:py-4">
          <p className="text-[10px] sm:text-[11.5px] text-[rgba(22,22,19,0.40)] font-medium mb-1 sm:mb-1.5">Total in stage</p>
          <p className="text-[22px] sm:text-[28px] font-semibold leading-none tracking-tight text-[#161613]">
            {totalCount}
          </p>
          <p className="text-[10px] sm:text-xs text-[rgba(22,22,19,0.40)] mt-1">
            {uniqueCandidates} unique candidate{uniqueCandidates !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="bg-white border border-[rgba(22,22,19,0.10)] rounded-[10px] px-3 sm:px-[18px] py-3 sm:py-4">
          <p className="text-[10px] sm:text-[11.5px] text-[rgba(22,22,19,0.40)] font-medium mb-1 sm:mb-1.5">Stale ({'>'}7 days)</p>
          <p className="text-[22px] sm:text-[28px] font-semibold leading-none tracking-tight text-[#B7791F]">
            {staleCount}
          </p>
          <p className="text-[10px] sm:text-xs text-[rgba(22,22,19,0.40)] mt-1">
            {totalCount > 0 ? Math.round((staleCount / uniqueCandidates) * 100) : 0}% of stage
          </p>
        </div>
        <div className="bg-white border border-[rgba(22,22,19,0.10)] rounded-[10px] px-3 sm:px-[18px] py-3 sm:py-4">
          <p className="text-[10px] sm:text-[11.5px] text-[rgba(22,22,19,0.40)] font-medium mb-1 sm:mb-1.5">Critical ({'>'}14 days)</p>
          <p className="text-[22px] sm:text-[28px] font-semibold leading-none tracking-tight text-[#B23B3B]">
            {criticalCount}
          </p>
          <p className="text-[10px] sm:text-xs text-[rgba(22,22,19,0.40)] mt-1">
            {oldestDays > 0 ? `oldest: ${oldestDays}d` : 'none'}
          </p>
        </div>
        <div className="bg-white border border-[rgba(22,22,19,0.10)] rounded-[10px] px-3 sm:px-[18px] py-3 sm:py-4">
          <p className="text-[10px] sm:text-[11.5px] text-[rgba(22,22,19,0.40)] font-medium mb-1 sm:mb-1.5">Avg time in stage</p>
          <p className="text-[22px] sm:text-[28px] font-semibold leading-none tracking-tight text-[#161613]">
            {avgDaysInStage}d
          </p>
          <p className="text-[10px] sm:text-xs text-[rgba(22,22,19,0.40)] mt-1">
            platform avg: 4.1d
          </p>
        </div>
      </div>

      {/* Client component for filters and candidate groups */}
      <StageDrilldownClient 
        data={groupedData} 
        bucketKey={bucketKey}
        currentSort={sort}
        showStaleOnly={stale === 'true'}
        searchQuery={search || ''}
        ownerFilter={owner || ''}
        owners={uniqueOwners}
        stageAccentColor={stageAccentColor}
        isTerminalStage={bucketKey === 'hired' || bucketKey === 'rejected' || bucketKey === 'auto_passed'}
      />
    </div>
  )
}
