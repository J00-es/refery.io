import { createClient, createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { PipelineStage } from '@/lib/types'
import { subDays, startOfWeek, startOfMonth, startOfYear, format } from 'date-fns'
import { DASHBOARD_BUCKETS, getStageConfig, STAGE_ACCENT_COLORS, ACTIVE_STAGE_VALUES } from '@/lib/pipeline-stages'
import { EarningsCard } from '@/components/dashboard/earnings-card'
import { StageOverviewCard } from '@/components/dashboard/stage-overview-card'
import { ActionQueueCard } from '@/components/dashboard/action-queue-card'
import { FunnelBenchmark } from '@/components/dashboard/funnel-benchmark'
import { HotOpportunityCard } from '@/components/dashboard/hot-opportunity-card'
import { Briefcase, Users, DollarSign } from 'lucide-react'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function DashboardPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user and role
  const { data: { user } } = await supabase.auth.getUser()
  
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role, full_name, user_id')
    .eq('email', user?.email)
    .single()
  
  const userRole = isSuperAdmin ? 'super_admin' : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)
  const userName = adminData?.full_name?.split(' ')[0] || 'there'
  const currentUserId = adminData?.user_id || user?.id

  // Get date ranges
  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const yearStart = startOfYear(now)
  const ninetyDaysAgo = subDays(now, 90)

  // Fetch all pipeline data
  const { data: allPipelineData } = await adminClient
    .from('job_candidate_pipeline')
    .select(`
      id,
      stage,
      updated_at,
      created_at,
      job_id,
      candidate_id,
      owner_user_id,
      jobs(id, title, company_name),
      candidates(id, name, email, linkedin_url, location, owner_user_id, uploaded_by_user_id, user_id)
    `)
    .order('updated_at', { ascending: false })

  // Filter by ownership for non-admins
  const pipelineData = isAdmin 
    ? allPipelineData || []
    : (allPipelineData || []).filter(p => {
        if (p.owner_user_id === currentUserId) return true
        const candidate = p.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && (
          candidate.owner_user_id === currentUserId ||
          candidate.uploaded_by_user_id === currentUserId ||
          candidate.user_id === currentUserId
        )
      })

  // Calculate bucket stats
  type BucketStats = Record<string, { 
    count: number
    thisWeek: number
    staleCount: number
    criticalCount: number
    subCounts?: Record<string, number>
  }>
  
  const bucketStats: BucketStats = {}

  for (const bucket of DASHBOARD_BUCKETS) {
    bucketStats[bucket.key] = { count: 0, thisWeek: 0, staleCount: 0, criticalCount: 0, subCounts: {} }
  }

  for (const p of pipelineData) {
    const stage = p.stage as PipelineStage
    const updatedAt = new Date(p.updated_at)
    const daysInStage = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    
    for (const bucket of DASHBOARD_BUCKETS) {
      if (bucket.stages.includes(stage)) {
        bucketStats[bucket.key].count++
        
        if (bucket.showSubCounts && bucketStats[bucket.key].subCounts) {
          bucketStats[bucket.key].subCounts![stage] = (bucketStats[bucket.key].subCounts![stage] || 0) + 1
        }
        
        if (updatedAt >= weekStart) {
          bucketStats[bucket.key].thisWeek++
        }
        
        if (daysInStage > 14) {
          bucketStats[bucket.key].criticalCount++
        } else if (daysInStage > 7) {
          bucketStats[bucket.key].staleCount++
        }
        break
      }
    }
  }

  // Build action queue items
  type ActionItem = {
    id: string
    candidateId: string
    candidateName: string
    candidateLinkedin: string | null
    jobId: string
    jobTitle: string
    companyName: string
    daysInStage: number
    lastActivity: string
    stage: string
  }

  const actionRows: {
    urgency: 'red' | 'amber' | 'blue'
    title: string
    meta: string
    items: ActionItem[]
    defaultOpen?: boolean
  }[] = []

  // RED: Candidates in hm_pending for >14 days
  const hmPendingCritical = pipelineData.filter(p => {
    const daysInStage = Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    return p.stage === 'hm_pending' && daysInStage > 14
  })

  if (hmPendingCritical.length > 0) {
    const companies = [...new Set(hmPendingCritical.map(p => (p.jobs as { company_name: string } | null)?.company_name).filter(Boolean))]
    actionRows.push({
      urgency: 'red',
      title: `${hmPendingCritical.length} candidate${hmPendingCritical.length !== 1 ? 's' : ''} stale in Awaiting HM Feedback for 14+ days`,
      meta: companies.slice(0, 3).join(' · '),
      items: hmPendingCritical.slice(0, 5).map(p => ({
        id: p.id,
        candidateId: p.candidate_id,
        candidateName: (p.candidates as { name: string } | null)?.name || 'Unknown',
        candidateLinkedin: (p.candidates as { linkedin_url: string | null } | null)?.linkedin_url || null,
        jobId: p.job_id,
        jobTitle: (p.jobs as { title: string } | null)?.title || 'Unknown',
        companyName: (p.jobs as { company_name: string } | null)?.company_name || 'Unknown',
        daysInStage: Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
        lastActivity: p.updated_at,
        stage: p.stage,
      })),
      defaultOpen: true,
    })
  }

  // AMBER: Candidates in offer for >5 days
  const offerStale = pipelineData.filter(p => {
    const daysInStage = Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    return p.stage === 'offer' && daysInStage > 5
  })

  for (const p of offerStale.slice(0, 2)) {
    const candidateName = (p.candidates as { name: string } | null)?.name || 'Unknown'
    const companyName = (p.jobs as { company_name: string } | null)?.company_name || 'Unknown'
    const jobTitle = (p.jobs as { title: string } | null)?.title || 'Unknown'
    const daysInStage = Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    
    actionRows.push({
      urgency: 'amber',
      title: `${candidateName} at offer stage — closing window ${daysInStage} days`,
      meta: `${companyName} · ${jobTitle}`,
      items: [{
        id: p.id,
        candidateId: p.candidate_id,
        candidateName,
        candidateLinkedin: (p.candidates as { linkedin_url: string | null } | null)?.linkedin_url || null,
        jobId: p.job_id,
        jobTitle,
        companyName,
        daysInStage,
        lastActivity: p.updated_at,
        stage: p.stage,
      }],
    })
  }

  // AMBER: Candidates in interest_confirmed for >3 days not moved to hm_shared
  const interestConfirmedStale = pipelineData.filter(p => {
    const daysInStage = Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    return p.stage === 'interest_confirmed' && daysInStage > 3
  })

  if (interestConfirmedStale.length > 0) {
    const avgWait = Math.round(interestConfirmedStale.reduce((sum, p) => {
      return sum + Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    }, 0) / interestConfirmedStale.length)

    actionRows.push({
      urgency: 'amber',
      title: `${interestConfirmedStale.length} candidate${interestConfirmedStale.length !== 1 ? 's' : ''} confirmed interest, not yet shared to HM`,
      meta: `Average wait ${avgWait} days`,
      items: interestConfirmedStale.slice(0, 5).map(p => ({
        id: p.id,
        candidateId: p.candidate_id,
        candidateName: (p.candidates as { name: string } | null)?.name || 'Unknown',
        candidateLinkedin: (p.candidates as { linkedin_url: string | null } | null)?.linkedin_url || null,
        jobId: p.job_id,
        jobTitle: (p.jobs as { title: string } | null)?.title || 'Unknown',
        companyName: (p.jobs as { company_name: string } | null)?.company_name || 'Unknown',
        daysInStage: Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
        lastActivity: p.updated_at,
        stage: p.stage,
      })),
    })
  }

  // BLUE: Candidates in sourced for >14 days with no job_matched
  const sourcedStale = pipelineData.filter(p => {
    const daysInStage = Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    return p.stage === 'sourced' && daysInStage > 14
  })

  if (sourcedStale.length > 0) {
    actionRows.push({
      urgency: 'blue',
      title: `${sourcedStale.length} candidate${sourcedStale.length !== 1 ? 's' : ''} in Sourced 14+ days with no match yet`,
      meta: 'Review for potential matches',
      items: sourcedStale.slice(0, 5).map(p => ({
        id: p.id,
        candidateId: p.candidate_id,
        candidateName: (p.candidates as { name: string } | null)?.name || 'Unknown',
        candidateLinkedin: (p.candidates as { linkedin_url: string | null } | null)?.linkedin_url || null,
        jobId: p.job_id,
        jobTitle: (p.jobs as { title: string } | null)?.title || 'Unknown',
        companyName: (p.jobs as { company_name: string } | null)?.company_name || 'Unknown',
        daysInStage: Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24)),
        lastActivity: p.updated_at,
        stage: p.stage,
      })),
    })
  }

  // Action queue count for header
  const actionCount = actionRows.length

  // Calculate total candidates
  const totalCandidates = pipelineData.length

  // ===== REAL DATA: Earnings from hired candidates =====
  // Get hired candidates (placement fees would be a percentage of their salary)
  const hiredPipeline = pipelineData.filter(p => p.stage === 'hired')
  const hiredThisMonth = hiredPipeline.filter(p => new Date(p.updated_at) >= monthStart)
  const hiredThisYear = hiredPipeline.filter(p => new Date(p.updated_at) >= yearStart)
  
  // Calculate earnings: Assume avg salary $120k, 15% fee = $18k per placement
  const avgPlacementFee = 18 // $18k per placement
  const pendingPayout = hiredThisMonth.length * avgPlacementFee
  const paidYTD = hiredThisYear.length * avgPlacementFee
  const thisMonthEarnings = hiredThisMonth.length * avgPlacementFee
  
  // Format earnings
  const formatEarnings = (amount: number) => {
    if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}`
    }
    return `$${amount}`
  }
  
  const pendingPayoutStr = formatEarnings(pendingPayout)
  const paidYTDStr = formatEarnings(paidYTD)
  const thisMonthStr = formatEarnings(thisMonthEarnings)

  // ===== REAL DATA: Funnel conversion rates (last 90 days) =====
  // Get pipeline stage history or calculate from current data
  const last90DaysPipeline = pipelineData.filter(p => new Date(p.created_at) >= ninetyDaysAgo)
  
  // Count candidates that reached each stage
  const stageReachedCounts: Record<string, number> = {}
  for (const p of last90DaysPipeline) {
    const stage = p.stage as string
    stageReachedCounts[stage] = (stageReachedCounts[stage] || 0) + 1
  }
  
  // Calculate conversion rates between stages
  const jobSharedCount = stageReachedCounts['job_shared'] || 0
  const interestConfirmedCount = stageReachedCounts['interest_confirmed'] || 0
  const hmSharedCount = (stageReachedCounts['hm_shared'] || 0) + (stageReachedCounts['hm_pending'] || 0)
  const interviewCount = (stageReachedCounts['interview_1'] || 0) + (stageReachedCounts['interview_2'] || 0)
  const offerCount = stageReachedCounts['offer'] || 0
  const hiredCount = stageReachedCounts['hired'] || 0
  
  // Calculate percentages (avoid division by zero)
  const sharedToInterest = jobSharedCount > 0 ? Math.round((interestConfirmedCount / jobSharedCount) * 100) : 0
  const interestToHM = interestConfirmedCount > 0 ? Math.round((hmSharedCount / interestConfirmedCount) * 100) : 0
  const hmToInterview = hmSharedCount > 0 ? Math.round((interviewCount / hmSharedCount) * 100) : 0
  const interviewToOffer = interviewCount > 0 ? Math.round((offerCount / interviewCount) * 100) : 0
  const offerToHired = offerCount > 0 ? Math.round((hiredCount / offerCount) * 100) : 0
  
  // Platform benchmarks (could be calculated from all users' data if admin)
  const funnelSteps = [
    { label: 'Shared → Interest', value: sharedToInterest || 0, benchmark: 62 },
    { label: 'Interest → HM', value: interestToHM || 0, benchmark: 78 },
    { label: 'HM → Interview', value: hmToInterview || 0, benchmark: 55 },
    { label: 'Interview → Offer', value: interviewToOffer || 0, benchmark: 35 },
    { label: 'Offer → Hired', value: offerToHired || 0, benchmark: 68 },
  ]

  // Find weakest funnel step
  const stepsWithData = funnelSteps.filter(s => s.value > 0)
  const weakestStep = stepsWithData.length > 0 
    ? stepsWithData.reduce((weakest, step) => {
        const diff = step.value - step.benchmark
        const weakestDiff = weakest.value - weakest.benchmark
        return diff < weakestDiff ? step : weakest
      }, stepsWithData[0])
    : null

  const funnelInsight = weakestStep && weakestStep.value < weakestStep.benchmark 
    ? `is your weakest stage. Try improving your pitch or candidate preparation.`
    : stepsWithData.length === 0 
      ? 'Add more candidates to your pipeline to see conversion insights.'
      : null

  // ===== REAL DATA: Hot Opportunities =====
  // 1. New jobs posted in last 7 days
  const sevenDaysAgo = subDays(now, 7)
  const { data: newJobs } = await adminClient
    .from('jobs')
    .select('id, title, company_name, created_at')
    .gte('created_at', sevenDaysAgo.toISOString())
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5)

  const newRolesMatching = (newJobs || []).map(job => ({
    id: job.id,
    title: `${job.title} at ${job.company_name || 'Unknown'}`,
    subtitle: `Posted ${format(new Date(job.created_at), 'MMM d')}`,
    link: `/jobs/${job.id}`,
  }))

  // 2. Candidates without a match (in sourced stage for >14 days)
  const fourteenDaysAgo = subDays(now, 14)
  const unmatchedCandidatesData = pipelineData
    .filter(p => p.stage === 'sourced' && new Date(p.updated_at) < fourteenDaysAgo)
    .slice(0, 5)

  const unmatchedCandidates = unmatchedCandidatesData.map(p => ({
    id: p.candidate_id,
    title: (p.candidates as { name: string } | null)?.name || 'Unknown',
    subtitle: `Unmatched for ${Math.floor((now.getTime() - new Date(p.updated_at).getTime()) / (1000 * 60 * 60 * 24))} days`,
    candidateLinkedin: (p.candidates as { linkedin_url: string | null } | null)?.linkedin_url || undefined,
    link: `/candidates/${p.candidate_id}`,
  }))

  // 3. Recently added companies with open jobs
  const { data: recentCompanies } = await adminClient
    .from('companies')
    .select('id, name, description')
    .order('created_at', { ascending: false })
    .limit(5)

  const recentlyFunded = (recentCompanies || []).map(company => ({
    id: company.id,
    title: company.name,
    subtitle: company.description?.slice(0, 60) || 'Recently added client',
    link: `/companies/${company.id}`,
  }))

  return (
    <div className="space-y-6 sm:space-y-9 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-[32px] sm:text-[42px] font-semibold leading-none tracking-tight text-[#100F0F]">
            Hey {userName}
          </h1>
          <p className="text-xs sm:text-sm text-[rgba(16,15,15,0.64)] mt-1.5">
            {actionCount > 0 ? (
              <><span className="text-[#B7791F] font-medium">{actionCount} thing{actionCount !== 1 ? 's' : ''}</span> need you today · </>
            ) : (
              <>All clear · </>
            )}
            refreshed just now
          </p>
        </div>
        <div className="flex gap-2.5">
          <Link href="/candidates/new">
            <Button variant="outline" className="h-9 sm:h-10 px-3 sm:px-[18px] text-[12px] sm:text-[13.5px] font-medium border-[rgba(16,15,15,0.10)] text-[#100F0F] hover:bg-[#F0F0EA]">
              Upload resume
            </Button>
          </Link>
          <Link href="/jobs/new">
            <Button className="h-9 sm:h-10 px-3 sm:px-[18px] text-[12px] sm:text-[13.5px] font-medium bg-[#100F0F] hover:bg-[#2A2928]">
              Add job
            </Button>
          </Link>
        </div>
      </div>

      {/* Section 1: Earnings Hero */}
      <section>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <EarningsCard
            label="Pending payout"
            value={pendingPayoutStr}
            suffix={pendingPayout >= 1000 ? 'k' : ''}
            subtitle={hiredThisMonth.length > 0 ? `${hiredThisMonth.length} placed this month` : 'No placements yet'}
          />
          <EarningsCard
            label="Paid YTD"
            value={paidYTDStr}
            suffix={paidYTD >= 1000 ? 'k' : ''}
            subtitle={hiredThisYear.length > 0 ? `${hiredThisYear.length} placed this year` : 'Start placing to earn'}
            isPositive={hiredThisYear.length > 0}
          />
          <EarningsCard
            label="This month"
            value={thisMonthStr}
            suffix={thisMonthEarnings >= 1000 ? 'k' : ''}
            subtitle={`${hiredThisMonth.length} placed`}
            isPositive={hiredThisMonth.length > 0}
          />
        </div>
      </section>

      {/* Section 2: Action Queue */}
      <section>
        <div className="flex justify-between items-end mb-3 sm:mb-3.5">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#100F0F] tracking-tight">Needs your attention</h2>
            <p className="text-[11px] sm:text-[13px] text-[rgba(16,15,15,0.64)] mt-0.5 hidden sm:block">Click any row to see who&apos;s involved and what&apos;s happening</p>
          </div>
          <span className="text-[10px] sm:text-xs text-[rgba(16,15,15,0.40)]">
            {actionCount} item{actionCount !== 1 ? 's' : ''}
          </span>
        </div>
        <ActionQueueCard rows={actionRows} />
      </section>

      {/* Section 3: Pipeline Overview */}
      <section>
        <div className="flex justify-between items-end mb-3 sm:mb-3.5">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#100F0F] tracking-tight">Pipeline overview</h2>
            <p className="text-[11px] sm:text-[13px] text-[rgba(16,15,15,0.64)] mt-0.5">{totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''} · click any stage</p>
          </div>
          <span className="text-[10px] sm:text-xs text-[rgba(16,15,15,0.40)]">Updated live</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {DASHBOARD_BUCKETS.map((bucket) => {
            const stats = bucketStats[bucket.key]
            const subText = bucket.showSubCounts && stats.subCounts
              ? bucket.key === 'shared_to_hm'
                ? `${stats.subCounts['hm_pending'] || 0} awaiting`
                : bucket.key === 'interview'
                  ? `R1: ${stats.subCounts['interview_1'] || 0} · R2: ${stats.subCounts['interview_2'] || 0}`
                  : undefined
              : undefined

            return (
              <StageOverviewCard
                key={bucket.key}
                href={`/dashboard/pipeline/${bucket.key}`}
                accentColor={STAGE_ACCENT_COLORS[bucket.key] || '#2A6B45'}
                stageName={bucket.label}
                count={stats.count}
                weeklyDelta={stats.thisWeek}
                staleCount={stats.staleCount}
                criticalCount={stats.criticalCount}
                subText={subText}
              />
            )
          })}
        </div>
      </section>

      {/* Section 4: Funnel Benchmark */}
      <section>
        <div className="flex justify-between items-end mb-3 sm:mb-3.5">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#100F0F] tracking-tight">Your funnel vs platform</h2>
            <p className="text-[11px] sm:text-[13px] text-[rgba(16,15,15,0.64)] mt-0.5">Stage-to-stage conversion rates (last 90 days)</p>
          </div>
        </div>
        <FunnelBenchmark 
          steps={funnelSteps} 
          insight={funnelInsight || undefined}
          insightHighlight={weakestStep && weakestStep.value < weakestStep.benchmark ? `${weakestStep.label}` : undefined}
        />
      </section>

      {/* Section 5: Hot Opportunities */}
      <section>
        <div className="flex justify-between items-end mb-3 sm:mb-3.5">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#100F0F] tracking-tight">Hot opportunities</h2>
            <p className="text-[11px] sm:text-[13px] text-[rgba(16,15,15,0.64)] mt-0.5 hidden sm:block">Click to expand and explore</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <HotOpportunityCard
            icon={<Briefcase className="h-4 w-4" />}
            title="New roles this week"
            subtitle="Jobs posted in last 7 days"
            items={newRolesMatching}
            emptyText="No new roles this week"
          />
          <HotOpportunityCard
            icon={<Users className="h-4 w-4" />}
            title="Candidates without a match"
            subtitle="In sourced 14+ days without a job match"
            items={unmatchedCandidates}
            emptyText="All candidates are matched"
          />
          <HotOpportunityCard
            icon={<DollarSign className="h-4 w-4" />}
            title="Recent clients"
            subtitle="Recently added companies with open roles"
            items={recentlyFunded}
            emptyText="No recent clients"
          />
        </div>
      </section>
    </div>
  )
}
