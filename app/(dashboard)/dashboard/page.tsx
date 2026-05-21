import { createClient, createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { startOfWeek, startOfMonth, startOfYear, subDays } from 'date-fns'
import {
  DASHBOARD_BUCKETS,
  DASHBOARD_ACTIVE_BUCKET_KEYS,
  DASHBOARD_TERMINAL_BUCKET_KEYS,
  STAGE_ACCENT_COLORS,
} from '@/lib/pipeline-stages'
import { EarningsCard } from '@/components/dashboard/earnings-card'
import { FunnelBenchmark } from '@/components/dashboard/funnel-benchmark'
import { ChevronRight } from 'lucide-react'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

// Always render fresh — pipeline data is updated continuously by the matching automation.
export const dynamic = 'force-dynamic'

// Positive forward flow used for the funnel (excludes auto_passed / rejected).
const POSITIVE_FLOW = [
  'auto_matched',
  'screening',
  'job_matched',
  'job_shared',
  'interest_confirmed',
  'hm_shared',
] as const

// Phases shown in the pipeline journey (each card maps to a real DB stage).
const JOURNEY_PHASES: { label: string; keys: string[] }[] = [
  { label: 'AI Sourcing', keys: ['auto_matched', 'screening'] },
  { label: 'Matched', keys: ['job_matched', 'job_shared'] },
  { label: 'Engaged', keys: ['interest_confirmed', 'hm_shared'] },
]

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
  }>

  const bucketStats: BucketStats = {}

  for (const bucket of DASHBOARD_BUCKETS) {
    bucketStats[bucket.key] = { count: 0, thisWeek: 0, staleCount: 0, criticalCount: 0 }
  }

  for (const p of pipelineData) {
    const stage = p.stage as string
    const updatedAt = new Date(p.updated_at)
    const daysInStage = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))

    for (const bucket of DASHBOARD_BUCKETS) {
      if (bucket.stages.includes(stage)) {
        bucketStats[bucket.key].count++

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

  // Totals: active = in-flight pipeline; total = every stage (incl. AI-passed/rejected)
  const activeCandidates = DASHBOARD_ACTIVE_BUCKET_KEYS.reduce(
    (sum, key) => sum + (bucketStats[key]?.count || 0),
    0,
  )
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

  // ===== REAL DATA: Funnel conversion (last 90 days, positive flow) =====
  // Approximate "reached stage X" as candidates currently at X or any later
  // stage in the positive flow (assumes forward movement). This avoids the
  // >100% artifacts of comparing raw adjacent counts and reflects where the
  // pipeline narrows.
  const last90DaysPipeline = pipelineData.filter(p => new Date(p.created_at) >= ninetyDaysAgo)
  const flowCounts = POSITIVE_FLOW.map(
    stage => last90DaysPipeline.filter(p => p.stage === stage).length,
  )
  const reached = POSITIVE_FLOW.map((_, i) =>
    flowCounts.slice(i).reduce((a, b) => a + b, 0),
  )
  const pct = (num: number, denom: number) => (denom > 0 ? Math.round((num / denom) * 100) : 0)

  const funnelSteps = [
    { label: 'Matched → Screening', value: pct(reached[1], reached[0]), benchmark: 70 },
    { label: 'Screening → Job Match', value: pct(reached[2], reached[1]), benchmark: 65 },
    { label: 'Match → Shared', value: pct(reached[3], reached[2]), benchmark: 45 },
    { label: 'Shared → Interest', value: pct(reached[4], reached[3]), benchmark: 55 },
    { label: 'Interest → HM', value: pct(reached[5], reached[4]), benchmark: 70 },
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

  // Render a single stage bucket card
  const renderBucketCard = (key: string) => {
    const bucket = DASHBOARD_BUCKETS.find(b => b.key === key)
    if (!bucket) return null
    const stats = bucketStats[key] || { count: 0, thisWeek: 0, staleCount: 0, criticalCount: 0 }
    const accentColor = STAGE_ACCENT_COLORS[key] || '#888780'
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
            {stats.thisWeek === 0 && stats.criticalCount > 0 && (
              <span className="text-[10px] text-[#B23B3B] font-medium">{stats.criticalCount} critical</span>
            )}
          </div>
          <p className="text-[11px] sm:text-xs text-[rgba(16,15,15,0.64)] truncate">{bucket.label}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors shrink-0" />
      </Link>
    )
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[38px] font-semibold leading-none tracking-tight text-[#100F0F]">
            Hey {userName}
          </h1>
          <p className="text-xs sm:text-sm text-[rgba(16,15,15,0.64)] mt-1.5">
            {activeCandidates} active candidate{activeCandidates !== 1 ? 's' : ''} in your pipeline · refreshed just now
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
          {/* Phase labels (desktop) */}
          <div className="hidden sm:grid grid-cols-3 border-b border-[rgba(16,15,15,0.06)] bg-[#FAFAF8]">
            {JOURNEY_PHASES.map((phase) => (
              <div key={phase.label} className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)]">
                {phase.label}
              </div>
            ))}
          </div>

          {/* Journey stages grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3">
            {JOURNEY_PHASES.map((phase, idx) => (
              <div
                key={phase.label}
                className={`${idx < JOURNEY_PHASES.length - 1 ? 'border-b sm:border-b-0 sm:border-r' : ''} border-[rgba(16,15,15,0.06)]`}
              >
                <div className="sm:hidden px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)] bg-[#FAFAF8] border-b border-[rgba(16,15,15,0.06)]">
                  {phase.label}
                </div>
                <div className="p-2 space-y-1.5">
                  {phase.keys.map((key) => renderBucketCard(key))}
                </div>
              </div>
            ))}
          </div>

          {/* Terminal stages footer */}
          <div className="border-t border-[rgba(16,15,15,0.06)] bg-[#FAFAF8] grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[rgba(16,15,15,0.06)]">
            {DASHBOARD_TERMINAL_BUCKET_KEYS.map((key) => {
              const bucket = DASHBOARD_BUCKETS.find(b => b.key === key)!
              return (
                <Link
                  key={key}
                  href={`/dashboard/pipeline/${key}`}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[#F0F0EA] transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STAGE_ACCENT_COLORS[key] || '#A32D2D' }} />
                    <span className="text-xs text-[rgba(16,15,15,0.64)]">{bucket.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[rgba(16,15,15,0.64)]">{bucketStats[key]?.count || 0}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-[rgba(16,15,15,0.20)] group-hover:text-[rgba(16,15,15,0.40)] transition-colors" />
                  </div>
                </Link>
              )
            })}
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
