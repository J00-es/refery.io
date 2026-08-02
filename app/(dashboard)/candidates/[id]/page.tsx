import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser, ownsCandidate } from '@/lib/current-user'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import type { Candidate, ParsedResumeData } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { CandidateAvailabilityStatus } from '@/components/candidate-availability-status'
import { CandidateActions } from '@/components/candidate-actions'
import { RecruiterNotes } from '@/components/recruiter-notes'
import { CandidateActivityLog } from '@/components/candidate-activity-log'
import { SuggestedJobs } from '@/components/candidates/suggested-jobs'
import { CandidateOwnerAssignment } from '@/components/candidate-owner-assignment'
import { Linkedin, Clock, Calendar, Briefcase, ArrowRight, User, Sparkles, Brain } from 'lucide-react'
import { CandidateVerdict } from '@/components/candidate-verdict'

interface PageProps {
  params: Promise<{ id: string }>
}

const stageColors: Record<string, { bg: string; text: string }> = {
  sourced: { bg: 'bg-slate-100', text: 'text-slate-700' },
  job_matched: { bg: 'bg-slate-100', text: 'text-slate-700' },
  job_shared: { bg: 'bg-blue-100', text: 'text-blue-700' },
  interest_confirmed: { bg: 'bg-cyan-100', text: 'text-cyan-700' },
  hm_shared: { bg: 'bg-teal-100', text: 'text-teal-700' },
  hm_pending: { bg: 'bg-amber-100', text: 'text-amber-700' },
  interview_1: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  interview_2: { bg: 'bg-purple-100', text: 'text-purple-700' },
  offer: { bg: 'bg-violet-100', text: 'text-violet-700' },
  hired: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  interest_declined: { bg: 'bg-gray-100', text: 'text-gray-600' },
  rejected: { bg: 'bg-red-100', text: 'text-red-700' },
  rejected_no_feedback: { bg: 'bg-red-50', text: 'text-red-600' },
  withdrawn: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

const stageLabels: Record<string, string> = {
  sourced: 'Sourced',
  job_matched: 'Job Matched',
  job_shared: 'Job Shared',
  interest_confirmed: 'Interest Confirmed',
  hm_shared: 'Shared to HM',
  hm_pending: 'Awaiting HM Feedback',
  interview_1: 'Interview – Round 1',
  interview_2: 'Interview – Round 2',
  offer: 'Offer',
  hired: 'Hired',
  interest_declined: 'Not Interested',
  rejected: 'Rejected',
  rejected_no_feedback: 'Rejected (No Response)',
  withdrawn: 'Withdrawn',
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params
  const adminClient = createAdminClient()

  const appUser = await getAppUser()
  if (!appUser) {
    notFound()
  }

  const { data: candidate, error: candidateError } = await adminClient
    .from('candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  // 404 rather than 403 for someone else's candidate: guessing an id should
  // not confirm that the candidate exists.
  if (candidateError || !ownsCandidate(appUser, candidate)) {
    notFound()
  }

  // Fetch pipeline data for this candidate
  const { data: pipelineData } = await adminClient
    .from('job_candidate_pipeline')
    .select(`
      *,
      job:jobs(id, title, company_name)
    `)
    .eq('candidate_id', id)
    .order('created_at', { ascending: false })

  // Fetch owner info
  let ownerInfo = null
  if (candidate.owner_user_id) {
    const { data: owner } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', candidate.owner_user_id)
      .single()
    ownerInfo = owner
  }

  // Fetch created by info
  let createdByInfo = null
  if (candidate.uploaded_by_user_id) {
    const { data: createdBy } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', candidate.uploaded_by_user_id)
      .single()
    createdByInfo = createdBy
  }

  const { isSuperAdmin, role: userRole } = appUser
  const isAdmin = appUser.isAdmin
  const canSetRecruiterVerdict =
    isSuperAdmin || ['admin', 'recruiter', 'scout'].includes(userRole)

  const typedCandidate = candidate as Candidate
  const parsedData = typedCandidate.parsed_data as ParsedResumeData | null

  const statusColors = {
    new: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    reviewing: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
    shortlisted: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    rejected: 'bg-red-500/10 text-red-600 border-red-500/30',
    hired: 'bg-primary/10 text-primary border-primary/30',
  }

  function formatRelativeTime(dateString: string | null) {
    if (!dateString) return null
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-4 sm:space-y-8 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
            <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">{typedCandidate.name}</h1>
            <span className={`rounded-full border px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm font-medium capitalize ${statusColors[typedCandidate.status]}`}>
              {typedCandidate.status}
            </span>
            <CandidateAvailabilityStatus 
              candidateId={id} 
              currentStatus={typedCandidate.availability_status || 'not_yet_talked'} 
            />
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            {typedCandidate.experience_years && `${typedCandidate.experience_years} years experience • `}
            {typedCandidate.location ?? 'Unknown location'}
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Added {formatRelativeTime(typedCandidate.created_at)}
            </span>
            {typedCandidate.last_contacted && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Last contacted {formatRelativeTime(typedCandidate.last_contacted)}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          {typedCandidate.linkedin_url && (
            <a href={typedCandidate.linkedin_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <Linkedin className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">LinkedIn</span>
              </Button>
            </a>
          )}
          <a href={`/api/file?pathname=${encodeURIComponent(typedCandidate.resume_blob_pathname)}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">View Resume</Button>
          </a>
          <Link href={`/candidates/${id}/edit`}>
            <Button variant="outline" size="sm">Edit</Button>
          </Link>
          <CandidateActions candidate={typedCandidate} />
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Verdict Sections */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Recruiter Verdict */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4 text-green-600" />
                  Recruiter Assessment
                </CardTitle>
                <CardDescription className="text-xs">
                  Overall verdict from recruiting team
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CandidateVerdict
                  candidateId={id}
                  type="recruiter"
                  currentVerdict={typedCandidate.recruiter_verdict as 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null}
                  canEdit={canSetRecruiterVerdict}
                />
              </CardContent>
            </Card>

            {/* Lily's Verdict - Only visible to super admin and admin */}
            {isAdmin && (
              <Card className="border-purple-200 bg-purple-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    Lily&apos;s Assessment
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Super admin evaluation (visible to admins only)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CandidateVerdict
                    candidateId={id}
                    type="lily"
                    currentVerdict={typedCandidate.lily_verdict as 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null}
                    canEdit={isSuperAdmin}
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* AI Analysis Section */}
          <Card className="border-blue-200 bg-blue-50/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="h-4 w-4 text-blue-600" />
                AI Candidate Analysis
              </CardTitle>
              <CardDescription className="text-xs">
                AI-powered assessment and insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              {typedCandidate.ai_analysis ? (
                <div className="prose prose-sm max-w-none text-sm text-foreground whitespace-pre-wrap">
                  {typedCandidate.ai_analysis}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No AI analysis available yet. Analysis will be added when external evaluation is complete.
                </p>
              )}
            </CardContent>
          </Card>

          {parsedData?.summary && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-foreground">{parsedData.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Pipeline Status - Jobs this candidate is in */}
          {pipelineData && pipelineData.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="h-5 w-5" />
                      Active Pipeline
                    </CardTitle>
                    <CardDescription>
                      Jobs this candidate is being considered for
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {pipelineData.map((pipeline: { id: string; stage: string; created_at: string; job: { id: string; title: string; company_name: string } | null }) => {
                    const stage = stageColors[pipeline.stage] || stageColors.sourced
                    const daysInStage = Math.floor((Date.now() - new Date(pipeline.created_at).getTime()) / (1000 * 60 * 60 * 24))
                    
                    return (
                      <Link key={pipeline.id} href={`/jobs/${pipeline.job?.id}`}>
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:border-primary/50 transition-colors">
                          <div className="flex items-center gap-4">
                            <div className={`w-2 h-10 rounded-full ${stage.bg}`}></div>
                            <div>
                              <p className="font-medium text-foreground">{pipeline.job?.title || 'Unknown Job'}</p>
                              <p className="text-sm text-muted-foreground">{pipeline.job?.company_name || 'Unknown Company'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <Badge className={`${stage.bg} ${stage.text} border-0`}>
                                {stageLabels[pipeline.stage] || pipeline.stage}
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1">
                                {daysInStage === 0 ? 'Today' : `${daysInStage}d in stage`}
                              </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {parsedData?.work_history && parsedData.work_history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Work History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {parsedData.work_history.map((work, i) => (
                    <div key={i} className="border-l-2 border-border pl-4">
                      <p className="font-medium text-foreground">{work.title}</p>
                      <p className="text-sm text-muted-foreground">{work.company} - {work.duration}</p>
                      {work.description && (
                        <p className="mt-2 text-sm text-foreground">{work.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {parsedData?.education && parsedData.education.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Education</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {parsedData.education.map((edu, i) => (
                    <div key={i}>
                      <p className="font-medium text-foreground">{edu.degree} in {edu.field}</p>
                      <p className="text-sm text-muted-foreground">{edu.institution} - {edu.year}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {/* Owner Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Ownership
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Profile Owner</p>
                <CandidateOwnerAssignment 
                  candidateId={id} 
                  currentOwner={ownerInfo}
                  currentOwnerId={typedCandidate.owner_user_id}
                />
              </div>
              {createdByInfo && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Created By</p>
                  <p className="text-sm font-medium text-foreground">
                    {createdByInfo.full_name || createdByInfo.email}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Open roles ranked against this candidate's embedding. */}
          <SuggestedJobs candidateId={id} />

          {/* Recruiter Notes - Private */}
          <RecruiterNotes candidateId={id} />

          {/* Activity Log */}
          <CandidateActivityLog candidateId={id} />

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {typedCandidate.email && (
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a href={`mailto:${typedCandidate.email}`} className="font-medium text-primary hover:underline">
                    {typedCandidate.email}
                  </a>
                </div>
              )}
              {typedCandidate.phone && (
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <a href={`tel:${typedCandidate.phone}`} className="font-medium text-primary hover:underline">
                    {typedCandidate.phone}
                  </a>
                </div>
              )}
              {typedCandidate.linkedin_url && (
                <div>
                  <p className="text-sm text-muted-foreground">LinkedIn</p>
                  <a href={typedCandidate.linkedin_url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1">
                    <Linkedin className="h-4 w-4" />
                    View Profile
                  </a>
                </div>
              )}
              {typedCandidate.remote_preference && (
                <div>
                  <p className="text-sm text-muted-foreground">Remote Preference</p>
                  <p className="font-medium text-foreground capitalize">{typedCandidate.remote_preference}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {(typedCandidate.salary_expectation_min || typedCandidate.salary_expectation_max) && (
            <Card>
              <CardHeader>
                <CardTitle>Salary Expectations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-foreground">
                  ${typedCandidate.salary_expectation_min?.toLocaleString() ?? '?'} - ${typedCandidate.salary_expectation_max?.toLocaleString() ?? '?'}
                </p>
              </CardContent>
            </Card>
          )}

          {typedCandidate.skills && typedCandidate.skills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {typedCandidate.skills.map((skill) => (
                    <span key={skill} className="rounded-md bg-primary/10 px-3 py-1 text-sm text-primary font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {parsedData?.certifications && parsedData.certifications.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Certifications</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {parsedData.certifications.map((cert, i) => (
                    <li key={i} className="text-foreground">{cert}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Resume</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{typedCandidate.resume_filename}</p>
              <a 
                href={`/api/file?pathname=${encodeURIComponent(typedCandidate.resume_blob_pathname)}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                Download PDF
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
