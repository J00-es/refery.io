'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { JobCard } from '@/components/job-card'
import { JobFilters, FilterStats } from '@/components/list-filters'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, List, LayoutGrid, ChevronDown, ChevronRight, MapPin, DollarSign, Users, Calendar, Briefcase } from 'lucide-react'
import type { Job } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface JobListProps {
  jobs: Job[]
  isAdmin?: boolean
  showStatusFilter?: boolean
}

interface CompanyGroup {
  company: string
  jobs: Job[]
  openCount: number
  totalSalaryMin: number | null
  totalSalaryMax: number | null
  locations: string[]
  stages: string[]
  logo_url: string | null
}

function CompanyJobGroup({ group, defaultExpanded = false, isAdmin = false }: { group: CompanyGroup; defaultExpanded?: boolean; isAdmin?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const salaryRange = group.totalSalaryMin && group.totalSalaryMax 
    ? `$${(group.totalSalaryMin / 1000).toFixed(0)}K - $${(group.totalSalaryMax / 1000).toFixed(0)}K`
    : group.totalSalaryMin 
    ? `From $${(group.totalSalaryMin / 1000).toFixed(0)}K`
    : null

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left"
      >
        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              {group.logo_url ? (
                <img 
                  src={group.logo_url} 
                  alt={group.company}
                  className="h-10 w-10 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold shrink-0">
                  {group.company.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <CardTitle className="text-lg">{group.company}</CardTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {group.openCount} open role{group.openCount !== 1 ? 's' : ''}
                  </span>
                  {group.locations.length > 0 && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {group.locations.slice(0, 2).join(', ')}
                      {group.locations.length > 2 && ` +${group.locations.length - 2}`}
                    </span>
                  )}
                  {salaryRange && (
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      {salaryRange}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {group.stages[0] && (
                <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground capitalize">
                  {group.stages[0].replace('-', ' ')}
                </span>
              )}
              <span className={cn(
                "text-xs font-medium px-2 py-1 rounded-full",
                group.openCount > 0 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
              )}>
                {group.jobs.length} job{group.jobs.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </CardHeader>
      </button>
      {isExpanded && (
        <CardContent className="pt-0 pb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.jobs.map((job) => (
              <JobCard key={job.id} job={job} compact isAdmin={isAdmin} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

const statusColors: Record<string, string> = {
  open: 'bg-emerald-100 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
  draft: 'bg-amber-100 text-amber-700',
}

export function JobList({ jobs, isAdmin = false, showStatusFilter = false }: JobListProps) {
  const [filteredJobs, setFilteredJobs] = useState<Job[]>(jobs)
  const [viewMode, setViewMode] = useState<'jobs' | 'companies'>('jobs')
  const [jobViewStyle, setJobViewStyle] = useState<'card' | 'list'>('card')

  const handleFilterChange = useCallback((filtered: Job[]) => {
    setFilteredJobs(filtered)
  }, [])

  // Group jobs by company
  const companyGroups = useMemo(() => {
    const groups: Record<string, CompanyGroup> = {}
    
    filteredJobs.forEach(job => {
      const company = job.company_name || 'Unknown Company'
      
      if (!groups[company]) {
        groups[company] = {
          company,
          jobs: [],
          openCount: 0,
          totalSalaryMin: null,
          totalSalaryMax: null,
          locations: [],
          stages: [],
          logo_url: (job as Job & { company_logo_url?: string | null }).company_logo_url || null,
        }
      }
      
      groups[company].jobs.push(job)
      
      if (job.status === 'open') {
        groups[company].openCount++
      }
      
      if (job.salary_min) {
        groups[company].totalSalaryMin = groups[company].totalSalaryMin 
          ? Math.min(groups[company].totalSalaryMin, job.salary_min)
          : job.salary_min
      }
      
      if (job.salary_max) {
        groups[company].totalSalaryMax = groups[company].totalSalaryMax 
          ? Math.max(groups[company].totalSalaryMax, job.salary_max)
          : job.salary_max
      }
      
      if (job.location && !groups[company].locations.includes(job.location)) {
        groups[company].locations.push(job.location)
      }
      
      if (job.company_stage && !groups[company].stages.includes(job.company_stage)) {
        groups[company].stages.push(job.company_stage)
      }
    })
    
    return Object.values(groups).sort((a, b) => b.openCount - a.openCount)
  }, [filteredJobs])

  const openJobs = filteredJobs.filter(j => j.status === 'open')
  const closedJobs = filteredJobs.filter(j => j.status === 'closed')
  const draftJobs = filteredJobs.filter(j => j.status === 'draft')

  if (jobs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No jobs yet</h3>
          <p className="text-muted-foreground text-center mb-4 max-w-sm">
            Create your first job listing to start matching candidates with AI-powered scoring.
          </p>
          <Link href="/jobs/new">
            <Button>Create Your First Job</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1">
          <JobFilters jobs={jobs} onFilterChange={handleFilterChange} showStatusFilter={showStatusFilter} />
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {viewMode === 'jobs' && (
            <div className="flex items-center border rounded-md shrink-0">
              <Button
                variant={jobViewStyle === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-r-none h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
                onClick={() => setJobViewStyle('card')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={jobViewStyle === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                className="rounded-l-none h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
                onClick={() => setJobViewStyle('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}
          
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'jobs' | 'companies')}>
            <TabsList className="h-8 sm:h-9">
              <TabsTrigger value="jobs" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
                <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Jobs</span>
              </TabsTrigger>
              <TabsTrigger value="companies" className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Companies</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>
      
      <FilterStats 
        total={jobs.length} 
        filtered={filteredJobs.length} 
        label="job" 
        extra={viewMode === 'companies' ? `${companyGroups.length} companies` : undefined}
      />

      {filteredJobs.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No jobs match your filters</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search criteria</p>
          </CardContent>
        </Card>
      ) : viewMode === 'companies' ? (
        <div className="space-y-4">
          {companyGroups.map((group, idx) => (
            <CompanyJobGroup key={group.company} group={group} defaultExpanded={idx === 0} isAdmin={isAdmin} />
          ))}
        </div>
      ) : jobViewStyle === 'list' ? (
        /* List View */
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Job Title</TableHead>
                <TableHead className="min-w-[140px]">Company</TableHead>
                <TableHead className="hidden md:table-cell">Location</TableHead>
                <TableHead className="hidden lg:table-cell">Department</TableHead>
                <TableHead className="hidden sm:table-cell">Salary</TableHead>
                <TableHead className="hidden lg:table-cell">Referral Bonus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredJobs.map((job) => (
                <TableRow key={job.id} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/jobs/${job.id}`} className="font-medium hover:underline">
                      {job.title}
                    </Link>
                    {job.remote_policy && (
                      <Badge variant="outline" className="ml-2 text-xs capitalize">
                        {job.remote_policy}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex items-center gap-2">
                      {(job as Job & { company_logo_url?: string | null }).company_logo_url ? (
                        <img 
                          src={(job as Job & { company_logo_url?: string | null }).company_logo_url!} 
                          alt={job.company_name || 'Company'} 
                          className="h-6 w-6 rounded object-cover shrink-0"
                        />
                      ) : job.company_name ? (
                        <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-primary font-semibold text-xs">
                            {job.company_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      ) : null}
                      <div>
                        {job.company_name || '-'}
                        {job.company_stage && (
                          <span className="text-xs text-muted-foreground ml-1 capitalize">
                            ({job.company_stage.replace('-', ' ')})
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{job.location || '-'}</TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">{job.department || '-'}</TableCell>
                  <TableCell className="text-sm hidden sm:table-cell">
                    {job.salary_min && job.salary_max
                      ? `$${Math.round(job.salary_min / 1000)}k - $${Math.round(job.salary_max / 1000)}k`
                      : job.salary_min
                      ? `From $${Math.round(job.salary_min / 1000)}k`
                      : job.salary_max
                      ? `Up to $${Math.round(job.salary_max / 1000)}k`
                      : '-'}
                  </TableCell>
                  <TableCell className="text-sm hidden lg:table-cell">
                    {job.referral_bonus ? (
                      <span className="text-emerald-600 font-medium">
                        {job.referral_bonus_type === 'percent'
                          ? `${job.referral_bonus}% of first year base salary`
                          : `$${job.referral_bonus.toLocaleString()}`}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">In discussion</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={`${statusColors[job.status]} text-xs`}>
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                    {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Card View */
        <div className="space-y-8">
          {openJobs.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Open Positions ({openJobs.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {openJobs.map((job) => (
                  <JobCard key={job.id} job={job} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          )}

          {draftJobs.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Drafts ({draftJobs.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {draftJobs.map((job) => (
                  <JobCard key={job.id} job={job} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          )}

          {closedJobs.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                Closed ({closedJobs.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {closedJobs.map((job) => (
                  <JobCard key={job.id} job={job} isAdmin={isAdmin} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
