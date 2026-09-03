import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { Company, Job } from '@/lib/types'
import { Building2, Globe, MapPin, Users, ExternalLink, Linkedin, ArrowLeft, Briefcase, Edit, DollarSign } from 'lucide-react'
import { CompanyNotes } from '@/components/company-notes'
import { CompanyRelationshipStatus } from '@/components/company-relationship-status'
import { CompanyContacts } from '@/components/company-contacts'
import { CompanyHiringInsights } from '@/components/company-hiring-insights'
import { CompanyAgreements } from '@/components/company-agreements'
import { CompanyServicesAgreement } from '@/components/company-services-agreement'
import { CompanyBriefCard } from '@/components/hm/company-brief-card'
import { JobLink } from '@/components/jobs/job-link'

interface PageProps {
  params: Promise<{ id: string }>
}

const relationshipLabels: Record<string, { label: string; color: string }> = {
  not_contacted: { label: 'Not Contacted', color: 'bg-gray-100 text-gray-600' },
  cold_outreached: { label: 'Cold Outreach', color: 'bg-blue-100 text-blue-700' },
  warm_lead: { label: 'Warm Lead', color: 'bg-amber-100 text-amber-700' },
  in_conversation: { label: 'In Conversation', color: 'bg-purple-100 text-purple-700' },
  proposal_sent: { label: 'Proposal Sent', color: 'bg-cyan-100 text-cyan-700' },
  contract_signed: { label: 'Contract Signed', color: 'bg-emerald-100 text-emerald-700' },
  active_client: { label: 'Active Client', color: 'bg-green-100 text-green-800' },
  churned: { label: 'Churned', color: 'bg-red-100 text-red-700' },
  lost: { label: 'Lost', color: 'bg-gray-200 text-gray-600' },
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Check if user is admin/super_admin
  const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('email', user?.email)
    .single()
  
  const isAdmin = isSuperAdmin || (adminData && adminData.role === 'admin')
  const canManageCompany = isSuperAdmin || isAdmin

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !company) {
    notFound()
  }

  // Get jobs for this company
  const { data: jobs } = await supabase
    .from('jobs')
    .select('*')
    .ilike('company_name', company.name)
    .order('created_at', { ascending: false })

  const typedCompany = company as Company & { relationship_status?: string }
  const typedJobs = (jobs ?? []) as Job[]
  const openJobs = typedJobs.filter(j => j.status === 'open' || j.status === 'active')

  const stageLabels: Record<string, { label: string; color: string }> = {
    seed: { label: 'Seed', color: 'bg-purple-100 text-purple-700' },
    'series-a': { label: 'Series A', color: 'bg-blue-100 text-blue-700' },
    'series-b': { label: 'Series B', color: 'bg-cyan-100 text-cyan-700' },
    'series-c': { label: 'Series C', color: 'bg-green-100 text-green-700' },
    'series-d': { label: 'Series D', color: 'bg-emerald-100 text-emerald-700' },
    public: { label: 'Public', color: 'bg-amber-100 text-amber-700' },
    established: { label: 'Established', color: 'bg-gray-100 text-gray-700' },
  }

  const relationshipStatus = typedCompany.relationship_status || 'not_contacted'
  const relationshipInfo = relationshipLabels[relationshipStatus]

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/companies">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {typedCompany.logo_url ? (
              <img 
                src={typedCompany.logo_url} 
                alt={typedCompany.name}
                className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground truncate">{typedCompany.name}</h1>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                {typedCompany.stage && stageLabels[typedCompany.stage] && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${stageLabels[typedCompany.stage].color}`}>
                    {stageLabels[typedCompany.stage].label}
                  </span>
                )}
                {isAdmin && relationshipInfo && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${relationshipInfo.color}`}>
                    {relationshipInfo.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground pl-10 sm:pl-0">
          {typedCompany.industry && <span>{typedCompany.industry}</span>}
          {typedCompany.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {typedCompany.location}
            </span>
          )}
          {typedCompany.employee_count && (
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              {typedCompany.employee_count}
            </span>
          )}
          {typedCompany.funding_raised && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              {typedCompany.funding_raised}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pl-10 sm:pl-0">
          {typedCompany.linkedin_url && (
            <a href={typedCompany.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Linkedin className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">LinkedIn</span>
              </Button>
            </a>
          )}
          {typedCompany.website && (
            <a href={typedCompany.website} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Globe className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Website</span>
              </Button>
            </a>
          )}
          {canManageCompany && (
            <Link href={`/companies/${id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Relationship Status Selector - Admin only */}
      {isAdmin && (
        <CompanyRelationshipStatus companyId={id} currentStatus={relationshipStatus} />
      )}

      {typedCompany.description && (
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-foreground whitespace-pre-wrap">{typedCompany.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Open Jobs */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5" />
                    Open Positions
                  </CardTitle>
                  <CardDescription>
                    {openJobs.length} open position{openJobs.length !== 1 ? 's' : ''} at {typedCompany.name}
                  </CardDescription>
                </div>
                {isSuperAdmin && (
                  <Link href={`/jobs/new?company=${encodeURIComponent(typedCompany.name)}`}>
                    <Button size="sm">Add Job</Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {openJobs.map((job) => (
                  <JobLink key={job.id} jobId={job.id} canOpen={isSuperAdmin}>
                    <div className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-foreground">{job.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            {job.location && <span>{job.location}</span>}
                            {job.remote_policy && (
                              <span className="capitalize">{job.remote_policy}</span>
                            )}
                            {job.salary_min && job.salary_max && (
                              <span>${(job.salary_min/1000).toFixed(0)}K - ${(job.salary_max/1000).toFixed(0)}K</span>
                            )}
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </JobLink>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Hiring Insights */}
          <CompanyHiringInsights 
            companyId={id} 
            insights={typedCompany.hiring_insights} 
            canEdit={canManageCompany}
          />

          {/*
            Hiring manager brief: the public link and what has happened on it.
            Super admin only, deliberately narrower than the rest of this page.
            The card exposes salary bands, equity, the candid read on the
            founders, and a link that needs no login to open, so an ordinary
            admin should not see it exists. The API enforces the same rule.
          */}
          {isSuperAdmin && <CompanyBriefCard companyId={id} companyName={typedCompany.name} />}

          {/* Company Contacts - Admin only */}
          {isAdmin && <CompanyContacts companyId={id} canEdit={canManageCompany} />}

          {/* Services Agreement (clickwrap, sent to client/company) - Admin only */}
          {isAdmin && (
            <CompanyServicesAgreement
              companyId={id}
              companyName={typedCompany.name}
              isAdmin={isAdmin}
            />
          )}

          {/* Recruiter/Scout Agreement acknowledgments - Admin only */}
          {isAdmin && <CompanyAgreements companyId={id} companyName={typedCompany.name} isAdmin={isAdmin} />}
        </div>

        <div className="space-y-6">
          {/* Team Notes - Admin only */}
          {isAdmin && <CompanyNotes companyId={id} />}

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Jobs</p>
                <p className="text-2xl font-bold text-foreground">{typedJobs.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open Positions</p>
                <p className="text-2xl font-bold text-primary">{openJobs.length}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Added</p>
                <p className="text-foreground">{new Date(typedCompany.created_at).toLocaleDateString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
