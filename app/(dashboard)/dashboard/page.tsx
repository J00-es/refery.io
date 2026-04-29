import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { Job, Candidate, JobMatch, PipelineStage } from '@/lib/types'
import { ScoreBadge } from '@/components/score-badge'
import { formatDistanceToNow, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { Briefcase, Users, TrendingUp, Calendar, Clock, AlertTriangle } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { DASHBOARD_BUCKETS, getStageConfig, ACTIVE_STAGE_VALUES, TERMINAL_NEGATIVE_STAGE_VALUES } from '@/lib/pipeline-stages'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

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
    .select('role, full_name, user_id')
    .eq('email', user?.email)
    .single()
  
  const userRole = isSuperAdmin
    ? 'super_admin' 
    : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)
  const userName = adminData?.full_name?.split(' ')[0] || 'there'
  const currentUserId = adminData?.user_id || user?.id

  // Build queries
  const now = new Date()
  const thisMonthStart = startOfMonth(now)
  const thisMonthEnd = endOfMonth(now)
  const lastMonthStart = startOfMonth(subMonths(now, 1))
  const lastMonthEnd = endOfMonth(subMonths(now, 1))

  // Fetch pipeline data
  const [pipelineResult, topMatchesResult, recentCandidatesResult, recentActivitiesResult] = await Promise.all([
    adminClient
      .from('job_candidate_pipeline')
      .select(`
        id,
        stage,
        updated_at,
        job_id,
        candidate_id,
        owner_user_id,
        jobs(id, title, company_name),
        candidates(id, name, owner_user_id, uploaded_by_user_id, user_id, status, availability)
      `)
      .order('updated_at', { ascending: false }),
    adminClient.from('job_matches').select(`
      *,
      job:jobs(id, title, company_name, department),
      candidate:candidates(id, name, experience_years, location, owner_user_id, uploaded_by_user_id, user_id, status, availability)
    `).order('overall_score', { ascending: false }).limit(50),
    adminClient.from('candidates').select('id, name, experience_years, status, availability, created_at, owner_user_id, uploaded_by_user_id, user_id').order('created_at', { ascending: false }).limit(30),
    adminClient
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
        // Check pipeline ownership
        if (p.owner_user_id === currentUserId) return true
        // Check candidate ownership
        const candidate = p.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && (
          candidate.owner_user_id === currentUserId ||
          candidate.uploaded_by_user_id === currentUserId ||
          candidate.user_id === currentUserId
        )
      })

  // Filter top matches for non-admins and only show actively_looking candidates
  const ownedCandidateMatches = (isAdmin 
    ? allTopMatches
    : allTopMatches.filter(match => {
        const candidate = match.candidate
        return candidate && (
          candidate.owner_user_id === currentUserId ||
          candidate.uploaded_by_user_id === currentUserId ||
          candidate.user_id === currentUserId
        )
      })).filter(match => {
        const candidate = match.candidate
        return candidate && candidate.availability === 'actively_looking'
      })

  // Filter recent candidates for non-admins
  const recentCandidates = (isAdmin 
    ? allRecentCandidates
    : allRecentCandidates.filter(c => {
        return c.owner_user_id === currentUserId || c.uploaded_by_user_id === currentUserId || c.user_id === currentUserId
      })).slice(0, 5)

  // Filter recent activities for non-admins
  const recentActivities = (isAdmin
    ? allRecentActivities
    : allRecentActivities.filter(a => {
        if (a.owner_user_id === currentUserId) return true
        const candidate = a.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && (
          candidate.owner_user_id === currentUserId ||
          candidate.uploaded_by_user_id === currentUserId ||
          candidate.user_id === currentUserId
        )
      })).slice(0, 25)

  // Build pipeline stats by bucket for dashboard cards
  type BucketStats = Record<string, { 
    count: number
    thisMonth: number
    lastMonth: number
    subCounts?: Record<string, number>
  }>
  
  const bucketStats: BucketStats = {}

  for (const bucket of DASHBOARD_BUCKETS) {
    bucketStats[bucket.key] = { count: 0, thisMonth: 0, lastMonth: 0, subCounts: {} }
  }

  for (const p of pipelineData) {
    const stage = p.stage as PipelineStage
    const updatedAt = new Date(p.updated_at)
    
    // Find which bucket this stage belongs to
    for (const bucket of DASHBOARD_BUCKETS) {
      if (bucket.stages.includes(stage)) {
        bucketStats[bucket.key].count++
        
        // Track sub-counts for grouped buckets
        if (bucket.showSubCounts && bucketStats[bucket.key].subCounts) {
          bucketStats[bucket.key].subCounts![stage] = (bucketStats[bucket.key].subCounts![stage] || 0) + 1
        }
        
        if (updatedAt >= thisMonthStart && updatedAt <= thisMonthEnd) {
          bucketStats[bucket.key].thisMonth++
        } else if (updatedAt >= lastMonthStart && updatedAt <= lastMonthEnd) {
          bucketStats[bucket.key].lastMonth++
        }
        break
      }
    }
  }

  // Calculate overall stats
  const totalInPipeline = pipelineData.length
  const activeCount = pipelineData.filter(p => ACTIVE_STAGE_VALUES.includes(p.stage as PipelineStage)).length
  const hiredCount = pipelineData.filter(p => p.stage === 'hired').length
  const thisMonthTotal = Object.values(bucketStats).reduce((sum, s) => sum + s.thisMonth, 0)
  const lastMonthTotal = Object.values(bucketStats).reduce((sum, s) => sum + s.lastMonth, 0)
  const monthlyChange = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : 0
  
  const topMatches = ownedCandidateMatches.slice(0, 5)

  // Calculate interview count (combined)
  const interviewCount = bucketStats['interview']?.count || 0

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
              {activeCount} active
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
                <p className="text-3xl font-bold text-foreground">{hiredCount}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {bucketStats['hired']?.thisMonth || 0} this month
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

      {/* Pipeline Overview with Grouped Buckets - CLICKABLE */}
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
          {/* 9 Grouped Bucket Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3">
            {DASHBOARD_BUCKETS.map((bucket) => {
              const data = bucketStats[bucket.key]
              const change = data.lastMonth > 0 
                ? Math.round(((data.thisMonth - data.lastMonth) / data.lastMonth) * 100)
                : data.thisMonth > 0 ? 100 : 0
              
              return (
                <Link 
                  key={bucket.key} 
                  href={`/dashboard/pipeline/${bucket.key}`}
                  className="block"
                >
                  <div 
                    className="relative p-4 rounded-lg border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
                  >
                    <div className={`absolute top-0 left-0 right-0 h-1 ${bucket.borderColor} rounded-t-lg`} />
                    <div className="text-3xl font-bold text-foreground group-hover:text-primary transition-colors">{data.count}</div>
                    <div className="text-sm text-muted-foreground">{bucket.label}</div>
                    
                    {/* Sub-counts for grouped buckets */}
                    {bucket.showSubCounts && data.subCounts && Object.keys(data.subCounts).length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {bucket.stages.map(stage => {
                          const subCount = data.subCounts?.[stage] || 0
                          if (subCount === 0) return null
                          const stageConfig = getStageConfig(stage)
                          const isAwaiting = stage === 'hm_pending'
                          return (
                            <div key={stage} className={`text-xs flex items-center gap-1 ${isAwaiting ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              {isAwaiting && <Clock className="h-3 w-3" />}
                              {subCount} {stageConfig.label.replace('Interview – ', 'R')}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    
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
                </Link>
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
                    {recentActivities.map((activity) => {
                      const candidate = activity.candidates as { id: string; name: string } | null
                      const job = activity.jobs as { id: string; title: string; company_name: string | null } | null
                      const stageConfig = getStageConfig(activity.stage as string)
                      const days = Math.floor((Date.now() - new Date(activity.updated_at).getTime()) / (1000 * 60 * 60 * 24))
                      const isStale = days > 7
                      
                      return (
                        <div key={activity.id} className="flex items-start gap-3 relative">
                          <div className={`h-2.5 w-2.5 rounded-full ${stageConfig.dotColor} mt-1.5 z-10 ring-2 ring-background`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground">
                              <Link href={`/candidates/${candidate?.id}`} className="font-medium hover:underline">
                                {candidate?.name || 'Unknown'}
                              </Link>
                              {' moved to '}
                              <Badge variant="outline" className={`${stageConfig.color} text-xs`}>
                                {stageConfig.label}
                              </Badge>
                            </p>
                            {job && (
                              <p className="text-xs text-muted-foreground">
                                {job.title} at {job.company_name}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(activity.updated_at), { addSuffix: true })}
                              </p>
                              {isStale && (
                                <Badge variant="outline" className="h-4 px-1 text-[10px] border-amber-300 text-amber-600 bg-amber-50">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                  {days}d in stage
                                </Badge>
                              )}
                            </div>
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
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{candidate.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {candidate.experience_years ? `${candidate.experience_years}+ years` : 'No experience listed'}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(candidate.created_at), { addSuffix: true })}
                    </p>
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
