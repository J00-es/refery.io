import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Job, Candidate, JobMatch } from '@/lib/types'
import { ScoreBadge } from '@/components/score-badge'
import { formatDistanceToNow, format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Briefcase, Users, TrendingUp, Calendar, ChevronDown, ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ScrollArea } from '@/components/ui/scroll-area'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

// Pipeline stage configuration
const PIPELINE_STAGES = [
  { key: 'job_matched', label: 'Job Matched', color: 'bg-slate-500' },
  { key: 'job_shared', label: 'Job Shared', color: 'bg-blue-500' },
  { key: 'interest_confirmed', label: 'Interest Confirmed', color: 'bg-cyan-500' },
  { key: 'shared_to_hiring_manager', label: 'Shared to HM', color: 'bg-indigo-500' },
  { key: 'interview', label: 'Interview', color: 'bg-purple-500' },
  { key: 'offer', label: 'Offer', color: 'bg-amber-500' },
  { key: 'hired', label: 'Hired', color: 'bg-emerald-500' },
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user and role
  const { data: { user } } = await supabase.auth.getUser()
  
  // Check if super admin - use admin client to bypass RLS
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  const dbClient = isSuperAdmin ? adminClient : supabase
  
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role, full_name')
    .eq('email', user?.email)
    .single()
  
  const userRole = isSuperAdmin
    ? 'super_admin' 
    : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)
  const userName = adminData?.full_name?.split(' ')[0] || 'there'

  // Build queries
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const thisMonthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  // Fetch pipeline, top matches, and recent activities
  const [pipelineResult, topMatchesResult, recentCandidatesResult, recentActivitiesResult] = await Promise.all([
    dbClient
      .from('job_candidate_pipeline')
      .select(`
        id,
        stage,
        updated_at,
        job_id,
        candidate_id,
        jobs(id, title, company_name),
        candidates(id, name, owner_user_id, uploaded_by_user_id, user_id, status, availability)
      `)
      .order('updated_at', { ascending: false }),
    dbClient.from('job_matches').select(`
      *,
      job:jobs(id, title, company_name, department),
      candidate:candidates(id, name, experience_years, location, owner_user_id, uploaded_by_user_id, user_id, status, availability)
    `).order('overall_score', { ascending: false }).limit(50),
    dbClient.from('candidates').select('id, name, experience_years, status, availability, created_at, owner_user_id, uploaded_by_user_id, user_id').order('created_at', { ascending: false }).limit(30),
    // Get recent pipeline stage changes for activity feed
    dbClient
      .from('job_candidate_pipeline')
      .select(`
        id,
        stage,
        updated_at,
        created_at,
        job_id,
        candidate_id,
        jobs(id, title, company_name),
        candidates(id, name, owner_user_id, uploaded_by_user_id, user_id)
      `)
      .order('updated_at', { ascending: false })
      .limit(50)
  ])

  const allPipelineData = pipelineResult.data ?? []
  const allTopMatches = (topMatchesResult.data ?? []) as (JobMatch & { job: Job; candidate: Candidate })[]
  const allRecentCandidates = (recentCandidatesResult.data ?? []) as (Candidate & { owner_user_id?: string; uploaded_by_user_id?: string })[]
  const allRecentActivities = recentActivitiesResult.data ?? []
  
  // Filter pipeline data based on ownership for non-admins
  const pipelineData = isAdmin 
    ? allPipelineData 
    : allPipelineData.filter(p => {
        const candidate = p.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && user && (
          candidate.owner_user_id === user.id ||
          candidate.uploaded_by_user_id === user.id ||
          candidate.user_id === user.id
        )
      })

  // Filter top matches for non-admins and only show actively_looking candidates
  const ownedCandidateMatches = (isAdmin 
    ? allTopMatches
    : allTopMatches.filter(match => {
        const candidate = match.candidate
        return candidate && user && (
          candidate.owner_user_id === user.id ||
          candidate.uploaded_by_user_id === user.id ||
          candidate.user_id === user.id
        )
      })).filter(match => {
        const candidate = match.candidate
        return candidate && candidate.availability === 'actively_looking'
      })

  // Filter recent candidates for non-admins
  const recentCandidates = (isAdmin 
    ? allRecentCandidates
    : allRecentCandidates.filter(c => {
        return user && (c.owner_user_id === user.id || c.uploaded_by_user_id === user.id || c.user_id === user.id)
      })).slice(0, 5)

  // Filter recent activities for non-admins
  const recentActivities = (isAdmin
    ? allRecentActivities
    : allRecentActivities.filter(a => {
        const candidate = a.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && user && (
          candidate.owner_user_id === user.id ||
          candidate.uploaded_by_user_id === user.id ||
          candidate.user_id === user.id
        )
      })).slice(0, 25)

  // Build pipeline stats by stage
  const pipelineByStage: Record<string, { 
    count: number
    thisMonth: number
    lastMonth: number
  }> = {}

  for (const stage of PIPELINE_STAGES) {
    pipelineByStage[stage.key] = { count: 0, thisMonth: 0, lastMonth: 0 }
  }

  for (const p of pipelineData) {
    const stage = p.stage as string
    if (!pipelineByStage[stage]) continue
    
    pipelineByStage[stage].count++
    
    const updatedAt = new Date(p.updated_at)
    if (updatedAt >= thisMonthStart && updatedAt <= thisMonthEnd) {
      pipelineByStage[stage].thisMonth++
    } else if (updatedAt >= lastMonthStart && updatedAt <= lastMonthEnd) {
      pipelineByStage[stage].lastMonth++
    }
  }

  const totalInPipeline = Object.values(pipelineByStage).reduce((sum, s) => sum + s.count, 0)
  const thisMonthTotal = Object.values(pipelineByStage).reduce((sum, s) => sum + s.thisMonth, 0)
  const lastMonthTotal = Object.values(pipelineByStage).reduce((sum, s) => sum + s.lastMonth, 0)
  const monthlyChange = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : 0
  
  const topMatches = ownedCandidateMatches.slice(0, 5)

  // Calculate key stats
  const totalCandidates = isAdmin ? allRecentCandidates.length : recentCandidates.length
  const hiredThisMonth = pipelineByStage['hired']?.thisMonth || 0
  const interviewCount = pipelineByStage['interview']?.count || 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Hey {userName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Here&apos;s what&apos;s happening with your candidates today.
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <Link href="/jobs/new" className="flex-1 sm:flex-none">
            <Button className="w-full sm:w-auto h-10">Add Job</Button>
          </Link>
          <Link href="/candidates/new" className="flex-1 sm:flex-none">
            <Button variant="outline" className="w-full sm:w-auto h-10">Upload Resume</Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Pipeline</p>
                <p className="text-3xl font-bold text-foreground">{totalInPipeline}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {thisMonthTotal} added this month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Interviews</p>
                <p className="text-3xl font-bold text-foreground">{interviewCount}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <Briefcase className="h-5 w-5 text-purple-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Active interviews
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hired</p>
                <p className="text-3xl font-bold text-foreground">{pipelineByStage['hired']?.count || 0}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {hiredThisMonth} this month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monthly Change</p>
                <p className={`text-3xl font-bold ${monthlyChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {monthlyChange >= 0 ? '+' : ''}{monthlyChange}%
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-amber-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              vs last month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Overview with Monthly Breakdown */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Pipeline Overview</CardTitle>
              <CardDescription>
                {totalInPipeline} candidate{totalInPipeline !== 1 ? 's' : ''} across all stages
              </CardDescription>
            </div>
            <Link href="/candidates">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stage Cards with Monthly Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const data = pipelineByStage[stage.key]
              const change = data.lastMonth > 0 
                ? Math.round(((data.thisMonth - data.lastMonth) / data.lastMonth) * 100)
                : data.thisMonth > 0 ? 100 : 0
              return (
                <div 
                  key={stage.key} 
                  className="relative p-4 rounded-lg border bg-card"
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${stage.color} rounded-t-lg`} />
                  <div className="text-3xl font-bold text-foreground">{data.count}</div>
                  <div className="text-sm text-muted-foreground">{stage.label}</div>
                  <div className="mt-2 pt-2 border-t">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">This month</span>
                      <span className="font-medium text-foreground">{data.thisMonth}</span>
                    </div>
                    {data.lastMonth > 0 && (
                      <div className={`text-xs mt-1 ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {change >= 0 ? '+' : ''}{change}% vs last month
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity and Top Matches */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Link href="/candidates">
                <Button variant="ghost" size="sm" className="h-8">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
            ) : (
              <ScrollArea className="h-[320px]">
                <div className="relative px-6 pb-6">
                  {/* Timeline line */}
                  <div className="absolute left-9 top-2 bottom-2 w-px bg-border" />
                  
                  <div className="space-y-4">
                    {recentActivities.map((activity, idx) => {
                      const candidate = activity.candidates as { id: string; name: string } | null
                      const job = activity.jobs as { id: string; title: string; company_name: string | null } | null
                      const stageColors: Record<string, string> = {
                        job_matched: 'bg-slate-400',
                        job_shared: 'bg-blue-500',
                        interest_confirmed: 'bg-cyan-500',
                        shared_to_hiring_manager: 'bg-indigo-500',
                        interview: 'bg-purple-500',
                        offer: 'bg-amber-500',
                        hired: 'bg-emerald-500',
                        rejected: 'bg-red-400',
                        withdrawn: 'bg-gray-400',
                      }
                      const dotColor = stageColors[activity.stage as string] || 'bg-muted-foreground'
                      const stageLabel = PIPELINE_STAGES.find(s => s.key === activity.stage)?.label || activity.stage
                      
                      return (
                        <div key={activity.id} className="flex items-start gap-3 relative">
                          <div className={`h-2.5 w-2.5 rounded-full ${dotColor} mt-1.5 z-10 ring-2 ring-background`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">
                              <Link href={`/candidates/${candidate?.id}`} className="font-medium hover:underline">
                                {candidate?.name || 'Unknown'}
                              </Link>
                              {' moved to '}
                              <span className="font-medium capitalize">{stageLabel}</span>
                            </p>
                            {job && (
                              <p className="text-xs text-muted-foreground">
                                {job.title} at {job.company_name}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(activity.updated_at), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Top Matches - Only Actively Looking */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Top Matches</CardTitle>
                <CardDescription className="text-xs">Actively looking candidates only</CardDescription>
              </div>
              <Link href="/candidates">
                <Button variant="ghost" size="sm" className="h-8">View all</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {topMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No actively looking candidates with matches</p>
            ) : (
              <div className="space-y-2">
                {topMatches.map((match) => (
                  <Link key={match.id} href={`/candidates/${match.candidate_id}`}>
                    <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent">
                      <div className="flex items-center gap-3">
                        <ScoreBadge score={match.overall_score} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">{match.candidate?.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {match.job?.title} @ {match.job?.company_name}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 shrink-0">
                        Active
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Candidates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Candidates</CardTitle>
            <Link href="/candidates">
              <Button variant="ghost" size="sm" className="h-8">View all</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No candidates yet</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentCandidates.map((candidate) => (
                <Link key={candidate.id} href={`/candidates/${candidate.id}`}>
                  <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent">
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="font-medium text-foreground text-sm truncate">{candidate.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {candidate.experience_years ? `${candidate.experience_years} yrs exp` : 'Experience unknown'}
                        {' - '}
                        {formatDistanceToNow(new Date(candidate.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full border capitalize shrink-0 ${
                      candidate.status === 'new' ? 'bg-blue-500/10 text-blue-600 border-blue-500/30' :
                      candidate.status === 'shortlisted' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                      'bg-muted text-muted-foreground border-muted'
                    }`}>
                      {candidate.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
