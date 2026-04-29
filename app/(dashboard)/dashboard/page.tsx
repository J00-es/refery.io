import { createClient, createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { PipelineStage } from '@/lib/types'
import { startOfWeek, startOfMonth, startOfYear, subDays } from 'date-fns'
import { DASHBOARD_BUCKETS, STAGE_ACCENT_COLORS } from '@/lib/pipeline-stages'
import { EarningsCard } from '@/components/dashboard/earnings-card'
import { FunnelBenchmark } from '@/components/dashboard/funnel-benchmark'
import { ChevronRight } from 'lucide-react'

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

  // Calculate total candidates
  const totalCandidates = pipelineData.length

  // ===== REAL DATA: Earnings from hired candidates =====
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
  
  // Platform benchmarks
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

  // Define the journey stages in order
  const journeyStages = [
    { key: 'sourced', phase: 'sourcing' },
    { key: 'job_matched', phase: 'sourcing' },
    { key: 'job_shared', phase: 'engagement' },
    { key: 'interest_confirmed', phase: 'engagement' },
    { key: 'shared_to_hm', phase: 'interview' },
    { key: 'interview', phase: 'interview' },
    { key: 'offer', phase: 'closing' },
    { key: 'hired', phase: 'closing' },
  ]

  return (
    <div className="space-y-6 sm:space-y-8 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[38px] font-semibold leading-none tracking-tight text-[#100F0F]">
            Hey {userName}
          </h1>
          <p className="text-xs sm:text-sm text-[rgba(16,15,15,0.64)] mt-1.5">
            {totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''} in your pipeline · refreshed just now
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

      {/* Section 2: Pipeline Journey View */}
      <section>
        <div className="flex justify-between items-end mb-3 sm:mb-4">
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-[#100F0F] tracking-tight">Pipeline journey</h2>
            <p className="text-[11px] sm:text-[13px] text-[rgba(16,15,15,0.64)] mt-0.5">{totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''} across all stages</p>
          </div>
        </div>
        
        {/* Journey Flow */}
        <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[12px] overflow-hidden">
          {/* Phase labels */}
          <div className="hidden sm:grid grid-cols-4 border-b border-[rgba(16,15,15,0.06)] bg-[#FAFAF8]">
            <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)]">Sourcing</div>
            <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)]">Engagement</div>
            <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)]">Interviews</div>
            <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)]">Closing</div>
          </div>
          
          {/* Journey stages grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {/* Sourcing phase */}
            <div className="border-r border-[rgba(16,15,15,0.06)] border-b sm:border-b-0">
              <div className="sm:hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)] bg-[#FAFAF8] border-b border-[rgba(16,15,15,0.06)]">Sourcing</div>
              <div className="p-2 space-y-1.5">
                {['sourced', 'job_matched'].map((key) => {
                  const bucket = DASHBOARD_BUCKETS.find(b => b.key === key)!
                  const stats = bucketStats[key]
                  const accentColor = STAGE_ACCENT_COLORS[key]
                  return (
                    <Link 
                      key={key} 
                      href={`/dashboard/pipeline/${key}`}
                      className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-[#F8F8F3] transition-colors group"
                    >
                      <div className="w-1 h-8 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[20px] sm:text-[24px] font-semibold text-[#100F0F]">{stats.count}</span>
                          {stats.thisWeek > 0 && (
                            <span className="text-[10px] text-[#2A6B45] font-medium">+{stats.thisWeek} this week</span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[rgba(16,15,15,0.64)] truncate">{bucket.label}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors shrink-0" />
                    </Link>
                  )
                })}
              </div>
            </div>
            
            {/* Engagement phase */}
            <div className="border-r-0 sm:border-r border-[rgba(16,15,15,0.06)] border-b sm:border-b-0">
              <div className="sm:hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)] bg-[#FAFAF8] border-b border-[rgba(16,15,15,0.06)]">Engagement</div>
              <div className="p-2 space-y-1.5">
                {['job_shared', 'interest_confirmed'].map((key) => {
                  const bucket = DASHBOARD_BUCKETS.find(b => b.key === key)!
                  const stats = bucketStats[key]
                  const accentColor = STAGE_ACCENT_COLORS[key]
                  return (
                    <Link 
                      key={key} 
                      href={`/dashboard/pipeline/${key}`}
                      className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-[#F8F8F3] transition-colors group"
                    >
                      <div className="w-1 h-8 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[20px] sm:text-[24px] font-semibold text-[#100F0F]">{stats.count}</span>
                          {stats.staleCount > 0 && (
                            <span className="text-[10px] text-[#B7791F] font-medium">{stats.staleCount} stale</span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[rgba(16,15,15,0.64)] truncate">{bucket.label}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors shrink-0" />
                    </Link>
                  )
                })}
              </div>
            </div>
            
            {/* Interview phase */}
            <div className="border-r border-[rgba(16,15,15,0.06)]">
              <div className="sm:hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)] bg-[#FAFAF8] border-b border-[rgba(16,15,15,0.06)]">Interviews</div>
              <div className="p-2 space-y-1.5">
                {['shared_to_hm', 'interview'].map((key) => {
                  const bucket = DASHBOARD_BUCKETS.find(b => b.key === key)!
                  const stats = bucketStats[key]
                  const accentColor = STAGE_ACCENT_COLORS[key]
                  const subText = key === 'shared_to_hm' && stats.subCounts?.['hm_pending'] 
                    ? `${stats.subCounts['hm_pending']} awaiting`
                    : key === 'interview' && stats.subCounts
                      ? `R1: ${stats.subCounts['interview_1'] || 0} · R2: ${stats.subCounts['interview_2'] || 0}`
                      : null
                  return (
                    <Link 
                      key={key} 
                      href={`/dashboard/pipeline/${key}`}
                      className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-[#F8F8F3] transition-colors group"
                    >
                      <div className="w-1 h-8 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[20px] sm:text-[24px] font-semibold text-[#100F0F]">{stats.count}</span>
                          {stats.criticalCount > 0 && (
                            <span className="text-[10px] text-[#B23B3B] font-medium">{stats.criticalCount} critical</span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[rgba(16,15,15,0.64)] truncate">
                          {bucket.label}
                          {subText && <span className="hidden sm:inline"> · {subText}</span>}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors shrink-0" />
                    </Link>
                  )
                })}
              </div>
            </div>
            
            {/* Closing phase */}
            <div>
              <div className="sm:hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)] bg-[#FAFAF8] border-b border-[rgba(16,15,15,0.06)]">Closing</div>
              <div className="p-2 space-y-1.5">
                {['offer', 'hired'].map((key) => {
                  const bucket = DASHBOARD_BUCKETS.find(b => b.key === key)!
                  const stats = bucketStats[key]
                  const accentColor = STAGE_ACCENT_COLORS[key]
                  const isHired = key === 'hired'
                  return (
                    <Link 
                      key={key} 
                      href={`/dashboard/pipeline/${key}`}
                      className="flex items-center gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-[#F8F8F3] transition-colors group"
                    >
                      <div className="w-1 h-8 rounded-full" style={{ backgroundColor: accentColor }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className={`text-[20px] sm:text-[24px] font-semibold ${isHired ? 'text-[#3B6D11]' : 'text-[#100F0F]'}`}>{stats.count}</span>
                          {isHired && stats.thisWeek > 0 && (
                            <span className="text-[10px] text-[#3B6D11] font-medium">+{stats.thisWeek} this week</span>
                          )}
                          {!isHired && stats.staleCount > 0 && (
                            <span className="text-[10px] text-[#B7791F] font-medium">{stats.staleCount} stale</span>
                          )}
                        </div>
                        <p className="text-[11px] sm:text-xs text-[rgba(16,15,15,0.64)] truncate">{bucket.label}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors shrink-0" />
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
          
          {/* Rejected link */}
          <div className="border-t border-[rgba(16,15,15,0.06)] bg-[#FAFAF8]">
            <Link 
              href="/dashboard/pipeline/rejected"
              className="flex items-center justify-between px-4 py-2.5 hover:bg-[#F0F0EA] transition-colors group"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#A32D2D]" />
                <span className="text-xs text-[rgba(16,15,15,0.64)]">Rejected / Declined / Withdrawn</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[rgba(16,15,15,0.64)]">{bucketStats['rejected']?.count || 0}</span>
                <ChevronRight className="h-3.5 w-3.5 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors" />
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Section 3: Funnel Benchmark */}
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
    </div>
  )
}
