import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import type { Job } from '@/lib/types'
import { ScoreBadge } from '@/components/score-badge'
import { JobActions } from '@/components/job-actions'
import { JobInternalNotes } from '@/components/job-internal-notes'
import { JobCandidatePipeline } from '@/components/job-candidate-pipeline'
import { JobOwnerAssignment } from '@/components/job-owner-assignment'
import { JobStatusEditor } from '@/components/job-status-editor'
import { User, Calendar, Building2, ExternalLink, MapPin, Users, Lightbulb, DollarSign, FileCheck } from 'lucide-react'
import type { Company } from '@/lib/types'
import { CompanyHiringInsights } from '@/components/company-hiring-insights'

interface PageProps {
  params: Promise<{ id: string }>
}

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Get current user and check if admin
  const { data: { user } } = await supabase.auth.getUser()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  
  // Use admin client for super admins to bypass RLS
  const dbClient = isSuperAdmin ? adminClient : supabase
  
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user?.email)
    .single()
  
  const userRole = isSuperAdmin 
    ? 'super_admin' 
    : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)

  const { data: job, error: jobError } = await dbClient
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (jobError || !job) {
    notFound()
  }

  // Fetch owner info
  let ownerInfo = null
  if (job.owner_user_id) {
    const { data: owner } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', job.owner_user_id)
      .single()
    ownerInfo = owner
  }

  // Fetch created by info
  let createdByInfo = null
  if (job.created_by_user_id) {
    const { data: createdBy } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', job.created_by_user_id)
      .single()
    createdByInfo = createdBy
  }

  // Fetch company data if job has company_id or company_name
  let companyData: Company | null = null
  if (job.company_id) {
    const { data: company } = await dbClient
      .from('companies')
      .select('*')
      .eq('id', job.company_id)
      .single()
    companyData = company as Company | null
  } else if (job.company_name) {
    const { data: company } = await dbClient
      .from('companies')
      .select('*')
      .ilike('name', job.company_name)
      .single()
    companyData = company as Company | null
  }

  const typedJob = job as Job
  const canViewHiringInsights = isSuperAdmin || isAdmin || userRole === 'recruiter'

  // Check if user has accepted agreement for this company
  let hasAgreement = false
  if (companyData && user?.id) {
    const { data: agreement } = await dbClient
      .from('agreement_acceptances')
      .select('id')
      .eq('user_id', user.id)
      .eq('company_id', companyData.id)
      .limit(1)
      .single()
    hasAgreement = !!agreement
  }

  // Check if current user can edit this job
  const canEditJob = isSuperAdmin || 
    isAdmin || 
    job.owner_user_id === user?.id || 
    job.created_by_user_id === user?.id

  const remotePolicyLabels = {
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site',
  }

  const statusColors = {
    open: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    closed: 'bg-muted text-muted-foreground border-muted',
    draft: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  }

  const visaLabels: Record<string, { label: string; color: string }> = {
    us_citizen_only: { label: 'US Citizen / Green Card Only', color: 'bg-red-100 text-red-700 border-red-200' },
    us_authorized: { label: 'Must Be Authorized to Work in US', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    sponsorship_available: { label: 'Visa Sponsorship Available', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    no_restriction: { label: 'Open to All Work Authorizations', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  }

  return (
    <div className="space-y-6 sm:space-y-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground break-words">{typedJob.title}</h1>
            <JobStatusEditor 
              jobId={id}
              currentStatus={typedJob.status}
              currentDealType={typedJob.internal_deal_type}
              isAdmin={isAdmin}
            />
          </div>
          {typedJob.company_name && (
            <p className="text-lg font-medium text-foreground mb-1">{typedJob.company_name}</p>
          )}
          <p className="text-muted-foreground">
            {typedJob.department && `${typedJob.department} • `}
            {typedJob.location && `${typedJob.location} • `}
            {typedJob.remote_policy && remotePolicyLabels[typedJob.remote_policy]}
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          {canEditJob && (
            <Link href={`/jobs/${id}/edit`}>
              <Button variant="outline" size="sm" className="sm:size-default">Edit Job</Button>
            </Link>
          )}
          <JobActions job={typedJob} />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-foreground">{typedJob.description}</p>
            </CardContent>
          </Card>

          {typedJob.requirements && typedJob.requirements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Requirements</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc list-inside space-y-2 text-foreground">
                  {typedJob.requirements.map((req, i) => (
                    <li key={i}>{req}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Company Information Section - Visible to admin/recruiter */}
          {canViewHiringInsights && companyData && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Company Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-4">
                  {companyData.logo_url ? (
                    <img 
                      src={companyData.logo_url} 
                      alt={companyData.name}
                      className="h-16 w-16 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-foreground">{companyData.name}</h3>
                      {companyData.stage && (
                        <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground capitalize">
                          {companyData.stage.replace('-', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                      {companyData.industry && <span>{companyData.industry}</span>}
                      {companyData.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {companyData.location}
                        </span>
                      )}
                      {companyData.employee_count && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {companyData.employee_count}
                        </span>
                      )}
                      {companyData.funding_raised && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {companyData.funding_raised}
                        </span>
                      )}
                    </div>
                    {companyData.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                        {companyData.description}
                      </p>
                    )}
                    <div className="flex gap-2 mt-3">
                      {companyData.website && (
                        <a 
                          href={companyData.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Website
                        </a>
                      )}
                      {companyData.linkedin_url && (
                        <a 
                          href={companyData.linkedin_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          LinkedIn
                        </a>
                      )}
                      <Link 
                        href={`/companies/${companyData.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View Company
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Company Hiring Insights - Visible to admin/recruiter */}
          {canViewHiringInsights && companyData?.hiring_insights && (
            <CompanyHiringInsights 
              companyId={companyData.id} 
              insights={companyData.hiring_insights}
              canEdit={false}
              variant="compact"
            />
          )}

          {/* Agreement Banner - Show only to job owner, super admins, and admins who haven't accepted */}
          {companyData && !hasAgreement && (isAdmin || job.owner_user_id === user?.id) && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <FileCheck className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-medium text-amber-900">Agreement Required</h3>
                    <p className="text-sm text-amber-700 mt-1">
                      To submit candidates for this position, you must first accept the Recruitment Services Agreement for {companyData.name}.
                    </p>
                    <Link href={`/agreement/${companyData.id}`}>
                      <Button size="sm" className="mt-3">
                        Review & Accept Agreement
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Candidate Pipeline - Track candidates through stages */}
          <JobCandidatePipeline 
            jobId={id} 
            userRole={userRole} 
            userId={user?.id}
            companyId={companyData?.id}
            hasAgreement={hasAgreement || isAdmin}
          />
        </div>

        <div className="space-y-6">
          {/* Ownership */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Ownership
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Job Owner</p>
                <JobOwnerAssignment 
                  jobId={id} 
                  currentOwner={ownerInfo}
                  currentOwnerId={typedJob.owner_user_id}
                />
              </div>
              {createdByInfo && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created By</p>
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {createdByInfo.full_name || createdByInfo.email}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-1">Posted</p>
                <p className="text-sm font-medium text-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(typedJob.created_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Job Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {typedJob.company_stage && (
                <div>
                  <p className="text-sm text-muted-foreground">Company Stage</p>
                  <p className="font-medium text-foreground capitalize">{typedJob.company_stage.replace('-', ' ')}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Experience Required</p>
                <p className="font-medium text-foreground">
                  {typedJob.experience_years_min}-{typedJob.experience_years_max ?? '+'} years
                </p>
              </div>
              {(typedJob.salary_min || typedJob.salary_max) && (
                <div>
                  <p className="text-sm text-muted-foreground">Salary Range</p>
                  <p className="font-medium text-foreground">
                    ${typedJob.salary_min?.toLocaleString() ?? '?'} - ${typedJob.salary_max?.toLocaleString() ?? '?'}
                  </p>
                </div>
              )}
              {typedJob.referral_bonus && (
                <div>
                  <p className="text-sm text-muted-foreground">Referral Bonus</p>
                  <p className="font-medium text-emerald-600">
                    {typedJob.referral_bonus_type === 'percent'
                      ? `${typedJob.referral_bonus}% of first year base salary`
                      : `$${typedJob.referral_bonus.toLocaleString()}`}
                  </p>
                </div>
              )}
              {typedJob.visa_requirement && visaLabels[typedJob.visa_requirement] && (
                <div>
                  <p className="text-sm text-muted-foreground">Work Authorization</p>
                  <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium mt-1 ${visaLabels[typedJob.visa_requirement].color}`}>
                    {visaLabels[typedJob.visa_requirement].label}
                  </span>
                </div>
              )}
              {/* Job Posting URL - Admin only */}
              {isAdmin && typedJob.job_post_url && (
                <div>
                  <p className="text-sm text-muted-foreground">Job Posting</p>
                  <a href={typedJob.job_post_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                    View original post
                  </a>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hiring Contact - Admin only */}
          {isAdmin && (typedJob.hiring_manager_name || typedJob.hiring_manager_email || typedJob.hiring_manager_linkedin) && (
            <Card>
              <CardHeader>
                <CardTitle>Hiring Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {typedJob.hiring_manager_name && (
                  <p className="font-medium text-foreground">{typedJob.hiring_manager_name}</p>
                )}
                {typedJob.hiring_manager_email && (
                  <a href={`mailto:${typedJob.hiring_manager_email}`} className="block text-sm text-primary hover:underline">
                    {typedJob.hiring_manager_email}
                  </a>
                )}
                {typedJob.hiring_manager_linkedin && (
                  <a href={typedJob.hiring_manager_linkedin} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary hover:underline">
                    LinkedIn Profile
                  </a>
                )}
              </CardContent>
            </Card>
          )}

          {typedJob.recruiter_notes && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle>Recruiter Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{typedJob.recruiter_notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Internal Notes - Admin Only */}
          <JobInternalNotes jobId={id} />
        </div>
      </div>
    </div>
  )
}
