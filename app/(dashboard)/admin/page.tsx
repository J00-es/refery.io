'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Briefcase, Users, Target, TrendingUp, Clock } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import Link from 'next/link'

interface Analytics {
  overview: {
    totalJobs: number
    openJobs: number
    totalCandidates: number
    totalMatches: number
    totalUsers: number
  }
  distributions: {
    jobsByStatus: Record<string, number>
    candidatesByStatus: Record<string, number>
    matchesByScore: Record<string, number>
  }
  recent: {
    jobs: Array<{ id: string; title: string; company_name: string; created_at: string; status: string }>
    candidates: Array<{ id: string; name: string; email: string; created_at: string; status: string }>
    topMatches: Array<{ id: string; overall_score: number; jobs: { title: string; company_name: string }; candidates: { name: string } }>
  }
}

export default function AdminPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/admin/analytics')
        if (!res.ok) throw new Error('Failed to fetch analytics')
        const data = await res.json()
        setAnalytics(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchAnalytics()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-destructive">
        {error}
      </div>
    )
  }

  if (!analytics) return null

  const { overview, distributions, recent } = analytics

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      {/* Overview Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Total Jobs</CardTitle>
            <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{overview.totalJobs}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {overview.openJobs} open
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Candidates</CardTitle>
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{overview.totalCandidates}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              In system
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Matches</CardTitle>
            <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{overview.totalMatches}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Job pairs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Excellent</CardTitle>
            <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{distributions.matchesByScore.excellent || 0}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              Score 80+
            </p>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 sm:pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-xs sm:text-sm font-medium">Team</CardTitle>
            <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="text-xl sm:text-2xl font-bold">{overview.totalUsers}</div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              With access
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distributions */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(distributions.jobsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{status}</span>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(distributions.jobsByStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No jobs yet</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Candidates by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(distributions.candidatesByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <span className="text-sm capitalize">{status}</span>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(distributions.candidatesByStatus).length === 0 && (
                <p className="text-sm text-muted-foreground">No candidates yet</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Match Quality</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-600">Excellent (80+)</span>
                <span className="text-sm font-medium">{distributions.matchesByScore.excellent || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-600">Good (60-79)</span>
                <span className="text-sm font-medium">{distributions.matchesByScore.good || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-yellow-600">Fair (40-59)</span>
                <span className="text-sm font-medium">{distributions.matchesByScore.fair || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-red-600">Poor (0-39)</span>
                <span className="text-sm font-medium">{distributions.matchesByScore.poor || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Jobs
            </CardTitle>
            <CardDescription>Latest job postings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recent.jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block rounded-lg border p-3 hover:bg-muted transition-colors"
                >
                  <div className="font-medium">{job.title}</div>
                  <div className="text-sm text-muted-foreground">{job.company_name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      job.status === 'open' ? 'bg-green-100 text-green-700' :
                      job.status === 'closed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {job.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
              {recent.jobs.length === 0 && (
                <p className="text-sm text-muted-foreground">No jobs yet</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Candidates
            </CardTitle>
            <CardDescription>Latest candidate uploads</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recent.candidates.map((candidate) => (
                <Link
                  key={candidate.id}
                  href={`/candidates/${candidate.id}`}
                  className="block rounded-lg border p-3 hover:bg-muted transition-colors"
                >
                  <div className="font-medium">{candidate.name}</div>
                  <div className="text-sm text-muted-foreground">{candidate.email}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      candidate.status === 'shortlisted' ? 'bg-green-100 text-green-700' :
                      candidate.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      candidate.status === 'hired' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {candidate.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(candidate.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
              {recent.candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">No candidates yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Matches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Matches</CardTitle>
          <CardDescription>Highest scoring job-candidate matches</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recent.topMatches.map((match) => (
              <div key={match.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="font-medium">{match.candidates?.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {match.jobs?.title} at {match.jobs?.company_name}
                  </div>
                </div>
                <div className={`text-lg font-bold ${
                  match.overall_score >= 80 ? 'text-green-600' :
                  match.overall_score >= 60 ? 'text-blue-600' :
                  'text-yellow-600'
                }`}>
                  {match.overall_score}%
                </div>
              </div>
            ))}
            {recent.topMatches.length === 0 && (
              <p className="text-sm text-muted-foreground">No matches yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
