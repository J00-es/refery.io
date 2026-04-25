'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  BarChart3, 
  Users, 
  Briefcase, 
  CheckCircle, 
  XCircle, 
  Clock,
  TrendingUp,
  Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Job {
  id: string
  title: string
  status: string
}

interface PipelineEntry {
  id: string
  job_id: string
  candidate_id: string
  stage: string
  created_at: string
  job?: Job
}

interface CompanyPipelineAnalyticsProps {
  companyName: string
}

const stageColors: Record<string, string> = {
  sourced: 'bg-gray-100 text-gray-700',
  screening: 'bg-blue-100 text-blue-700',
  interview: 'bg-purple-100 text-purple-700',
  offer: 'bg-amber-100 text-amber-700',
  hired: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600'
}

const stageLabels: Record<string, string> = {
  sourced: 'Sourced',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn'
}

export function CompanyPipelineAnalytics({ companyName }: CompanyPipelineAnalyticsProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [pipelineData, setPipelineData] = useState<PipelineEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [companyName])

  const loadData = async () => {
    setIsLoading(true)

    // Get jobs for this company
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('id, title, status')
      .ilike('company', companyName)

    if (jobsData) {
      setJobs(jobsData)

      // Get pipeline data for all jobs
      const jobIds = jobsData.map(j => j.id)
      if (jobIds.length > 0) {
        const { data: pipelineRaw } = await supabase
          .from('job_candidate_pipeline')
          .select('*')
          .in('job_id', jobIds)

        if (pipelineRaw) {
          setPipelineData(pipelineRaw)
        }
      }
    }

    setIsLoading(false)
  }

  // Calculate stats
  const stats = {
    totalJobs: jobs.length,
    activeJobs: jobs.filter(j => j.status === 'active').length,
    totalCandidates: pipelineData.length,
    hired: pipelineData.filter(p => p.stage === 'hired').length,
    inProgress: pipelineData.filter(p => ['screening', 'interview', 'offer'].includes(p.stage)).length,
    rejected: pipelineData.filter(p => p.stage === 'rejected').length
  }

  // Stage breakdown
  const stageBreakdown = pipelineData.reduce((acc, p) => {
    acc[p.stage] = (acc[p.stage] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Calculate conversion rates
  const conversionRates = {
    screeningRate: stats.totalCandidates > 0 
      ? Math.round(((stageBreakdown.screening || 0) + (stageBreakdown.interview || 0) + (stageBreakdown.offer || 0) + (stageBreakdown.hired || 0)) / stats.totalCandidates * 100)
      : 0,
    interviewRate: (stageBreakdown.screening || 0) + (stageBreakdown.interview || 0) > 0
      ? Math.round(((stageBreakdown.interview || 0) + (stageBreakdown.offer || 0) + (stageBreakdown.hired || 0)) / ((stageBreakdown.screening || 0) + (stageBreakdown.interview || 0) + (stageBreakdown.offer || 0) + (stageBreakdown.hired || 0)) * 100)
      : 0,
    offerRate: (stageBreakdown.interview || 0) > 0
      ? Math.round(((stageBreakdown.offer || 0) + (stageBreakdown.hired || 0)) / (stageBreakdown.interview || 0) * 100)
      : 0,
    hireRate: stats.totalCandidates > 0
      ? Math.round((stageBreakdown.hired || 0) / stats.totalCandidates * 100)
      : 0
  }

  // Job-level stats
  const jobStats = jobs.map(job => {
    const jobPipeline = pipelineData.filter(p => p.job_id === job.id)
    return {
      ...job,
      total: jobPipeline.length,
      inProgress: jobPipeline.filter(p => ['screening', 'interview', 'offer'].includes(p.stage)).length,
      hired: jobPipeline.filter(p => p.stage === 'hired').length
    }
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No jobs found for this company</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600" />
          Pipeline Analytics
        </CardTitle>
        <CardDescription>
          Recruitment pipeline overview for {companyName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Briefcase className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.activeJobs}</p>
            <p className="text-xs text-muted-foreground">Active Jobs</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <Users className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-2xl font-bold">{stats.totalCandidates}</p>
            <p className="text-xs text-muted-foreground">Candidates</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-emerald-50">
            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-emerald-600" />
            <p className="text-2xl font-bold text-emerald-700">{stats.hired}</p>
            <p className="text-xs text-emerald-600">Hired</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-blue-50">
            <Clock className="h-5 w-5 mx-auto mb-1 text-blue-600" />
            <p className="text-2xl font-bold text-blue-700">{stats.inProgress}</p>
            <p className="text-xs text-blue-600">In Progress</p>
          </div>
        </div>

        {/* Funnel Visualization */}
        {stats.totalCandidates > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Pipeline Funnel
            </h4>
            <div className="space-y-2">
              {['sourced', 'screening', 'interview', 'offer', 'hired'].map((stage) => {
                const count = stageBreakdown[stage] || 0
                const percentage = stats.totalCandidates > 0 ? Math.round(count / stats.totalCandidates * 100) : 0
                return (
                  <div key={stage} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{stageLabels[stage]}</span>
                      <span className="font-medium">{count} ({percentage}%)</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Conversion Rates */}
        {stats.totalCandidates > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-2 rounded-lg border text-center">
              <p className="text-lg font-bold text-blue-600">{conversionRates.screeningRate}%</p>
              <p className="text-xs text-muted-foreground">Screen Rate</p>
            </div>
            <div className="p-2 rounded-lg border text-center">
              <p className="text-lg font-bold text-purple-600">{conversionRates.interviewRate}%</p>
              <p className="text-xs text-muted-foreground">Interview Rate</p>
            </div>
            <div className="p-2 rounded-lg border text-center">
              <p className="text-lg font-bold text-amber-600">{conversionRates.offerRate}%</p>
              <p className="text-xs text-muted-foreground">Offer Rate</p>
            </div>
            <div className="p-2 rounded-lg border text-center">
              <p className="text-lg font-bold text-emerald-600">{conversionRates.hireRate}%</p>
              <p className="text-xs text-muted-foreground">Hire Rate</p>
            </div>
          </div>
        )}

        {/* Jobs Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Jobs Overview</h4>
          <div className="space-y-2">
            {jobStats.map((job) => (
              <Link 
                key={job.id} 
                href={`/jobs/${job.id}`}
                className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">{job.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job.total} candidates
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job.inProgress > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {job.inProgress} active
                    </Badge>
                  )}
                  {job.hired > 0 && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                      {job.hired} hired
                    </Badge>
                  )}
                  <Badge variant={job.status === 'active' ? 'default' : 'outline'} className="text-xs">
                    {job.status}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
