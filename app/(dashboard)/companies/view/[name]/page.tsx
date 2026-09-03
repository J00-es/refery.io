import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Building2, Globe, MapPin, Users, Briefcase, ExternalLink, ArrowLeft, Edit, Linkedin } from 'lucide-react'
import type { Job } from '@/lib/types'
import { getAppUser } from '@/lib/current-user'
import { JobLink } from '@/components/jobs/job-link'

interface Props {
  params: Promise<{ name: string }>
}

export default async function CompanyViewPage({ params }: Props) {
  const { name: encodedName } = await params
  const companyName = decodeURIComponent(encodedName)
  const supabase = await createClient()

  // /jobs is super-admin-only for now, so nobody else gets a way into it.
  const appUser = await getAppUser()
  const isSuperAdmin = appUser?.isSuperAdmin ?? false

  // Check if company exists in database
  const { data: existingCompany } = await supabase
    .from('companies')
    .select('*')
    .ilike('name', companyName)
    .single()

  // If company exists in database, redirect to the proper company page
  if (existingCompany) {
    // We'll show the same page but with database info
  }

  // Get all jobs for this company
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .ilike('company_name', companyName)
    .order('created_at', { ascending: false })

  const typedJobs = (jobs ?? []) as Job[]
  const openJobs = typedJobs.filter(j => j.status === 'open')

  // Extract info from jobs
  const locations = [...new Set(typedJobs.map(j => j.location).filter(Boolean))]
  const salaryRanges = typedJobs.filter(j => j.salary_min || j.salary_max)
  const avgSalaryMin = salaryRanges.length > 0 
    ? Math.round(salaryRanges.reduce((acc, j) => acc + (j.salary_min || 0), 0) / salaryRanges.length)
    : null
  const avgSalaryMax = salaryRanges.length > 0 
    ? Math.round(salaryRanges.reduce((acc, j) => acc + (j.salary_max || 0), 0) / salaryRanges.length)
    : null

  const stageLabels: Record<string, { label: string; color: string }> = {
    seed: { label: 'Seed', color: 'bg-purple-100 text-purple-700' },
    'series-a': { label: 'Series A', color: 'bg-blue-100 text-blue-700' },
    'series-b': { label: 'Series B', color: 'bg-cyan-100 text-cyan-700' },
    'series-c': { label: 'Series C', color: 'bg-green-100 text-green-700' },
    'series-d': { label: 'Series D', color: 'bg-emerald-100 text-emerald-700' },
    public: { label: 'Public', color: 'bg-amber-100 text-amber-700' },
    established: { label: 'Established', color: 'bg-gray-100 text-gray-700' },
  }

  const statusColors = {
    open: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-gray-100 text-gray-500',
    draft: 'bg-amber-100 text-amber-700',
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/companies">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">{companyName}</h1>
              {existingCompany?.industry && (
                <p className="text-muted-foreground">{existingCompany.industry}</p>
              )}
            </div>
            {existingCompany?.stage && stageLabels[existingCompany.stage] && (
              <Badge className={stageLabels[existingCompany.stage].color}>
                {stageLabels[existingCompany.stage].label}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {existingCompany ? (
            <Link href={`/companies/${existingCompany.id}/edit`}>
              <Button variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                Edit Company
              </Button>
            </Link>
          ) : (
            <Link href={`/companies/new?name=${encodeURIComponent(companyName)}`}>
              <Button>
                <Edit className="h-4 w-4 mr-2" />
                Add Company Details
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Company Info */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {existingCompany?.description && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">About</p>
                  <p className="text-sm">{existingCompany.description}</p>
                </div>
              )}
              
              {(existingCompany?.location || locations.length > 0) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Locations</p>
                    <p className="text-sm text-muted-foreground">
                      {existingCompany?.location || locations.join(', ') || 'Not specified'}
                    </p>
                  </div>
                </div>
              )}

              {existingCompany?.employee_count && (
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Company Size</p>
                    <p className="text-sm text-muted-foreground">{existingCompany.employee_count}</p>
                  </div>
                </div>
              )}

              {existingCompany?.website && (
                <div className="flex items-start gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Website</p>
                    <a 
                      href={existingCompany.website} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline flex items-center gap-1"
                    >
                      {existingCompany.website.replace(/^https?:\/\//, '')}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              )}

              {existingCompany?.linkedin_url && (
                <div className="flex items-start gap-2">
                  <Linkedin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">LinkedIn</p>
                    <a 
                      href={existingCompany.linkedin_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      View Profile
                    </a>
                  </div>
                </div>
              )}

              {avgSalaryMin && avgSalaryMax && (
                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground mb-1">Avg. Salary Range</p>
                  <p className="text-sm font-medium text-emerald-600">
                    ${(avgSalaryMin / 1000).toFixed(0)}K - ${(avgSalaryMax / 1000).toFixed(0)}K
                  </p>
                </div>
              )}

              {!existingCompany && (
                <div className="pt-4 border-t">
                  <p className="text-xs text-muted-foreground mb-2">
                    This company was auto-detected from job postings. Add more details to improve tracking.
                  </p>
                  <Link href={`/companies/new?name=${encodeURIComponent(companyName)}`}>
                    <Button size="sm" variant="outline" className="w-full">
                      Add Company Details
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-primary">{openJobs.length}</p>
                  <p className="text-xs text-muted-foreground">Open Positions</p>
                </div>
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{typedJobs.length}</p>
                  <p className="text-xs text-muted-foreground">Total Jobs</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Jobs List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Jobs at {companyName}
                </CardTitle>
                {isSuperAdmin && (
                  <Link href={`/jobs/new?company=${encodeURIComponent(companyName)}`}>
                    <Button size="sm">Add Job</Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {typedJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No jobs found for this company
                </p>
              ) : (
                <div className="space-y-3">
                  {typedJobs.map(job => (
                    <JobLink
                      key={job.id}
                      jobId={job.id}
                      canOpen={isSuperAdmin}
                      className="block border rounded-lg p-4 hover:border-primary/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{job.title}</h3>
                            <Badge className={statusColors[job.status]}>{job.status}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {job.location}
                              </span>
                            )}
                            {job.remote_policy && (
                              <Badge variant="outline" className="text-xs">
                                {job.remote_policy}
                              </Badge>
                            )}
                            {(job.salary_min || job.salary_max) && (
                              <span className="text-emerald-600 font-medium">
                                ${((job.salary_min || job.salary_max || 0) / 1000).toFixed(0)}K
                                {job.salary_max && job.salary_min && ` - $${(job.salary_max / 1000).toFixed(0)}K`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </JobLink>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
