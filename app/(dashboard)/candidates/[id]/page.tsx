import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser, ownsCandidate } from '@/lib/current-user'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Candidate, ParsedResumeData } from '@/lib/types'
import { CandidateAvailabilityStatus } from '@/components/candidate-availability-status'
import { CandidateActions } from '@/components/candidate-actions'
import { RecruiterNotes } from '@/components/recruiter-notes'
import { CandidateActivityLog } from '@/components/candidate-activity-log'
import { SuggestedJobs } from '@/components/candidates/suggested-jobs'
import { Audience } from '@/components/candidates/audience'
import { JobLink } from '@/components/jobs/job-link'
import { CandidateOwnerAssignment } from '@/components/candidate-owner-assignment'
import { Linkedin, Github, Globe, ArrowRight } from 'lucide-react'
import { CandidateVerdict } from '@/components/candidate-verdict'
import { ResumeBodySections, LanguagesSection } from '@/components/candidates/parsed-resume'
import { ReanalyzeResume } from '@/components/candidates/reanalyze-resume'
import { PARSER_VERSION } from '@/lib/resume-parser'
import { JourneyStrip } from '@/components/candidates/journey-strip'
import { DeskAssessment } from '@/components/candidates/desk-assessment'
import { ThreeFacts } from '@/components/candidates/three-facts'
import { getStageLabel, stageDisplayName } from '@/lib/pipeline-stages'
import {
  CARD,
  CHIP,
  FOCUS,
  GRADE_BADGE,
  UNGRADED,
  VERDICT_GRADES,
  avatarTint,
  formatSalary,
  initialsOf,
} from '@/lib/candidate-ui'
import type { PanelGrade } from '@/lib/journey'

interface PageProps {
  params: Promise<{ id: string }>
}

/** panel_grade back to the verdict key VERDICT_GRADES is keyed by. */
const GRADE_TO_VERDICT: Record<PanelGrade, string> = {
  'A+': 'very_strong',
  A: 'strong',
  'A-': 'moderate',
  'B+': 'weak',
  pass: 'pass',
}

const INTAKE_LABELS: Record<string, string> = {
  referred: 'Referred by a partner',
  sourced: 'Sourced by us',
  calibration: 'Calibration sample — not a real candidate',
  inbound: 'Came to us directly',
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

  /**
   * Only roles where something actually happened.
   *
   * The unfiltered list was the most misleading thing on this page. The matcher
   * writes a pipeline row for every plausible role, so the median candidate has
   * 18 of them and the 90th percentile has 165 — 96% of all rows sit at
   * auto_matched or job_matched, meaning a machine noticed a fit and nothing
   * more. Rendering those as "jobs this candidate is being considered for" told
   * a scout their candidate was in play with 165 companies. None of it was true.
   *
   * From job_shared onward a human did something: the role was put in front of
   * the candidate. Across the whole database that is 10 candidates — so for
   * nearly everyone this section now correctly disappears.
   */
  const { data: pipelineData } = await adminClient
    .from('job_candidate_pipeline')
    .select('*, job:jobs(id, title, company_name)')
    .eq('candidate_id', id)
    .in('stage', ['job_shared', 'interest_confirmed', 'hm_shared'])
    .order('created_at', { ascending: false })

  /*
   * The contractual claims on this person: who holds them, with which client,
   * and until when. Scoped by the same rule as the record itself, so a partner
   * sees their own and the super admin sees all of them.
   */
  let claimsQuery = adminClient
    .from('submission_claims')
    .select('id, client_company_id, protected_through, status, intro_confirmed_at, intro_due_by')
    .eq('candidate_id', id)
    .eq('status', 'active')
    .order('protected_through', { ascending: true })
  if (!appUser.canViewAllCandidates) claimsQuery = claimsQuery.eq('holder_user_id', appUser.id)
  const { data: claims } = await claimsQuery

  const claimCompanies = claims?.length
    ? (
        await adminClient
          .from('companies')
          .select('id, name')
          .in('id', Array.from(new Set(claims.map(c => c.client_company_id))))
      ).data ?? []
    : []
  const claimCompanyName = new Map(claimCompanies.map(c => [c.id as string, c.name as string]))

  let ownerInfo = null
  if (candidate.owner_user_id) {
    const { data: owner } = await adminClient
      .from('users_admin')
      .select('email, full_name')
      .eq('user_id', candidate.owner_user_id)
      .single()
    ownerInfo = owner
  }

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

  // Profiles parsed before the extractor learned to read bullet points,
  // education detail, links and the document text are worth re-reading.
  const isStaleParse = (parsedData?.parser_version ?? 0) < PARSER_VERSION

  const displayedExperience = parsedData?.experience_years ?? typedCandidate.experience_years

  // Same rule as the list: Lily's grade wins for admins, partners see the
  // recruiter one, and panel_grade covers the rows whose verdict is prose.
  const verdict = (isAdmin && typedCandidate.lily_verdict) || typedCandidate.recruiter_verdict
  const grade =
    (verdict && VERDICT_GRADES[verdict]) ||
    (typedCandidate.panel_grade && VERDICT_GRADES[GRADE_TO_VERDICT[typedCandidate.panel_grade]]) ||
    UNGRADED

  const salary = formatSalary(
    typedCandidate.salary_expectation_min,
    typedCandidate.salary_expectation_max
  )

  const role = parsedData?.current_title
    ? [parsedData.current_title, parsedData.current_company].filter(Boolean).join(' at ')
    : parsedData?.headline

  function formatRelativeTime(dateString: string | null) {
    if (!dateString) return null
    const diffDays = Math.floor((Date.now() - new Date(dateString).getTime()) / 86_400_000)
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`
    return new Date(dateString).toLocaleDateString()
  }

  /**
   * One row of the at-a-glance rail. Renders nothing when there is no value, so
   * the card is exactly as long as what is actually known about the person
   * rather than a form with blanks in it.
   */
  function Fact({ label, children }: { label: string; children: React.ReactNode }) {
    if (children == null || children === false) return null
    return (
      <div className="flex items-baseline justify-between gap-4 py-2">
        <dt className="shrink-0 text-[12.5px] text-[#9C9C95]">{label}</dt>
        <dd className="min-w-0 text-right text-[13.5px] font-medium text-[#161613]">{children}</dd>
      </div>
    )
  }

  const linkCls = `text-[#1F3A2F] hover:underline ${FOCUS}`
  const btnCls = `rounded-full border border-[#D2D1C7] px-4 py-2 text-[13px] font-semibold text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`

  return (
    <div className="mx-auto max-w-[1060px] space-y-6 px-4 pb-16 sm:px-6">
      {/* ── identity ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span
            aria-hidden
            className={`hidden h-14 w-14 shrink-0 place-items-center rounded-full text-[17px] font-semibold sm:grid ${avatarTint(typedCandidate.name)}`}
          >
            {initialsOf(typedCandidate.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-semibold text-[28px] leading-tight tracking-[-0.02em] text-[#161613] sm:text-[34px]">
                {typedCandidate.name}
              </h1>
              <span className={`${GRADE_BADGE} ${grade.className}`} title={grade.label}>
                {grade.grade}
              </span>
            </div>
            {role && <p className="mt-1 text-[15px] text-[#161613]">{role}</p>}
            <p className="mt-1 text-[13.5px] text-[#6E6E68]">
              {[
                displayedExperience != null ? `${displayedExperience} years` : null,
                typedCandidate.location,
                parsedData?.seniority_level,
              ]
                .filter(Boolean)
                .join(' · ') || 'No background on file'}
            </p>
            {/* Where they came from. A partner referral has a fee attached to it
                and a calibration sample is a benchmark — worth saying plainly
                rather than leaving it buried in a note. */}
            {typedCandidate.intake_source && INTAKE_LABELS[typedCandidate.intake_source] && (
              <p
                className={`mt-2 text-[12.5px] ${
                  typedCandidate.intake_source === 'calibration'
                    ? 'font-medium text-[#8A6A1F]'
                    : 'text-[#9C9C95]'
                }`}
              >
                {INTAKE_LABELS[typedCandidate.intake_source]}
                {createdByInfo && typedCandidate.intake_source !== 'calibration'
                  ? ` · added by ${createdByInfo.full_name || createdByInfo.email}`
                  : ''}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {typedCandidate.linkedin_url && (
            <a
              href={typedCandidate.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className={btnCls}
              aria-label="LinkedIn profile"
            >
              <Linkedin className="h-4 w-4" />
            </a>
          )}
          <a
            href={`/api/file?pathname=${encodeURIComponent(typedCandidate.resume_blob_pathname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={btnCls}
          >
            Résumé
          </a>
          <Link href={`/candidates/${id}/edit`} className={btnCls}>
            Edit
          </Link>
          <CandidateActions candidate={typedCandidate} />
        </div>
      </header>

      {/* Where we are with this person, and the only control that changes it. */}
      <JourneyStrip
        candidateId={id}
        stage={typedCandidate.journey_stage}
        offMarket={typedCandidate.availability_status === 'off_market'}
        canEdit={canSetRecruiterVerdict}
        canRecordCommitteeDecision={isAdmin}
      />

      {/*
        Explicit grid placement rather than two columns, because the mobile
        order and the desktop order are genuinely different.

        Stacked on a phone the natural order buries contact details and notes
        under the full résumé — work history, education, projects, awards,
        publications, the document text. That is the wrong way round for the
        person reading this in a café before a call. So the résumé body is its
        own block, placed last on mobile and beneath the assessment on desktop,
        which puts "at a glance" and the notes within thumb reach.
      */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          {/* ── assessment ───────────────────────────────────────────────
              Previously three stacked cards: recruiter verdict, Lily's
              verdict, and an AI analysis panel that rendered an empty state
              for most candidates. One subject, one card — and the AI section
              only exists when there is something in it. */}
          <section className={`${CARD} p-5`}>
            <h2 className="text-[15px] font-semibold text-[#161613]">Assessment<Audience show={isSuperAdmin} who="owner" /></h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#9C9C95]">
                  Recruiting team
                </p>
                <CandidateVerdict
                  candidateId={id}
                  type="recruiter"
                  currentVerdict={
                    typedCandidate.recruiter_verdict as
                      | 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null
                  }
                  canEdit={canSetRecruiterVerdict}
                />
              </div>
              {isAdmin && (
                <div>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#9C9C95]">
                    Lily · admins only
                  </p>
                  <CandidateVerdict
                    candidateId={id}
                    type="lily"
                    currentVerdict={
                      typedCandidate.lily_verdict as
                        | 'very_strong' | 'strong' | 'moderate' | 'weak' | 'pass' | null
                    }
                    canEdit={isSuperAdmin}
                  />
                </div>
              )}
            </div>

            {typedCandidate.ai_analysis && (
              <div className="mt-5 border-t border-[#E4E3DC] pt-4">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#9C9C95]">
                  Panel reasoning
                </p>
                <p className="max-w-full overflow-x-auto whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#161613] [overflow-wrap:anywhere]">
                  {typedCandidate.ai_analysis}
                </p>
              </div>
            )}

            {parsedData?.summary && (
              <div className="mt-5 border-t border-[#E4E3DC] pt-4">
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-[#9C9C95]">
                  Summary
                </p>
                <p className="text-[13.5px] leading-relaxed text-[#161613]">{parsedData.summary}</p>
              </div>
            )}
          </section>

          {/* ── the desk: panel read, seat fits, decisions, timeline ────── */}
          <DeskAssessment
            candidateId={id}
            journeyStage={typedCandidate.journey_stage}
            isSuperAdmin={isSuperAdmin}
            isOwner={typedCandidate.owner_user_id === appUser.id}
          />

          {/* The three facts founders ask first, only the unanswered ones.
              Saving re-runs the panel with the new facts. */}
          {(isSuperAdmin || typedCandidate.owner_user_id === appUser.id) && (
            <section id="facts" className={`${CARD} scroll-mt-24 p-5`}>
              <ThreeFacts
                candidateId={id}
                compact
                title="Missing facts"
                initial={{
                  visa_status: typedCandidate.visa_status ?? null,
                  allowed_locations: ((candidate as Record<string, unknown>).allowed_locations as string[] | null) ?? [],
                  relocation_ok: ((candidate as Record<string, unknown>).relocation_ok as boolean | null) ?? null,
                  salary_expectation_min: typedCandidate.salary_expectation_min ?? null,
                  salary_expectation_max: typedCandidate.salary_expectation_max ?? null,
                  consent_told_candidate: ((candidate as Record<string, unknown>).consent_told_candidate as boolean | null) ?? null,
                  other_city: '',
                }}
              />
            </section>
          )}

          {/* ── roles ────────────────────────────────────────────────────
              Stage names follow the same rule as the job board: the team sees
              real stages, partners see the four steps they track. The old
              hardcoded label map here listed nine stages that do not exist in
              the schema (interview_1, offer, hired…) and would have rendered
              raw enum values for the ones that do. */}
          {pipelineData && pipelineData.length > 0 && (
            <section className={`${CARD} overflow-hidden`}>
              <h2 className="px-5 pt-5 text-[15px] font-semibold text-[#161613]">
                In play with companies
                <span className="ml-2 font-normal text-[#9C9C95]">{pipelineData.length}</span>
                <Audience show={isSuperAdmin} who="owner" />
              </h2>
              <div className="mt-3">
                {pipelineData.map(
                  (p: {
                    id: string
                    stage: string
                    created_at: string
                    job: { id: string; title: string; company_name: string } | null
                  }) => {
                    const days = Math.floor(
                      (Date.now() - new Date(p.created_at).getTime()) / 86_400_000
                    )
                    return (
                      <JobLink
                        key={p.id}
                        jobId={p.job?.id}
                        canOpen={isSuperAdmin}
                        className={`flex items-center gap-4 border-t border-[#E4E3DC] px-5 py-3.5 transition-colors hover:bg-[#FAF9F5] ${FOCUS}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-[#161613]">
                            {p.job?.title || 'Unknown role'}
                          </p>
                          <p className="truncate text-[12.5px] text-[#6E6E68]">
                            {p.job?.company_name || 'Unknown company'}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[12.5px] font-medium text-[#1F3A2F]">
                            {isAdmin ? getStageLabel(p.stage) : stageDisplayName(p.stage)}
                          </p>
                          <p className="text-[11.5px] text-[#9C9C95]">
                            {days === 0 ? 'today' : `${days}d`}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-[#C9C9C1]" />
                      </JobLink>
                    )
                  }
                )}
              </div>
            </section>
          )}

          {isSuperAdmin && claims && claims.length > 0 && (
            <section className={`${CARD} overflow-hidden`}>
              <h2 className="px-5 pt-5 text-[15px] font-semibold text-[#161613]">
                Protected
                <span className="ml-2 font-normal text-[#9C9C95]">{claims.length}</span>
                <Audience show={isSuperAdmin} who="you" />
              </h2>
              <div className="mt-3">
                {claims.map(c => {
                  const overdue =
                    !c.intro_confirmed_at &&
                    c.intro_due_by &&
                    new Date(c.intro_due_by).getTime() < Date.now()
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-4 border-t border-[#E4E3DC] px-5 py-3.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-[#161613]">
                          {claimCompanyName.get(c.client_company_id) ?? 'Unknown company'}
                        </p>
                        <p className="truncate text-[12.5px] text-[#6E6E68]">
                          {overdue ? 'Introduction still outstanding' : 'Your submission is protected'}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-[12.5px] font-medium text-[#1F3A2F]">
                        until{' '}
                        {new Date(c.protected_through).toLocaleDateString('en-GB', {
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

        </div>

        {/* ── rail ───────────────────────────────────────────────────────
            Was eight stacked cards — contact, ownership, salary, skills,
            certifications, languages, resume — several of them a heading over
            a single line. Everything that is one fact now sits in one list. */}
        <div className="min-w-0 space-y-6 lg:col-start-3 lg:row-start-1 lg:row-span-2">
          <section className={`${CARD} p-5`}>
            <h2 className="text-[15px] font-semibold text-[#161613]">At a glance<Audience show={isSuperAdmin} who="owner" /></h2>
            <dl className="mt-1 divide-y divide-[#E4E3DC]">
              <Fact label="Email">
                {typedCandidate.email && (
                  <a href={`mailto:${typedCandidate.email}`} className={`break-all ${linkCls}`}>
                    {typedCandidate.email}
                  </a>
                )}
              </Fact>
              <Fact label="Phone">
                {typedCandidate.phone && (
                  <a href={`tel:${typedCandidate.phone}`} className={linkCls}>
                    {typedCandidate.phone}
                  </a>
                )}
              </Fact>
              <Fact label="GitHub">
                {parsedData?.github_url && (
                  <a
                    href={parsedData.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 ${linkCls}`}
                  >
                    <Github className="h-3.5 w-3.5" /> Profile
                  </a>
                )}
              </Fact>
              <Fact label="Portfolio">
                {parsedData?.portfolio_url && (
                  <a
                    href={parsedData.portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 ${linkCls}`}
                  >
                    <Globe className="h-3.5 w-3.5" /> Site
                  </a>
                )}
              </Fact>
              <Fact label="Salary">{salary}</Fact>
              <Fact label="Remote">
                {typedCandidate.remote_preference && (
                  <span className="capitalize">{typedCandidate.remote_preference}</span>
                )}
              </Fact>
              <Fact label="Work authorisation">{typedCandidate.visa_status}</Fact>
              <Fact label="Relocation">
                {parsedData?.willing_to_relocate != null &&
                  (parsedData.willing_to_relocate ? 'Open to it' : 'Not open to it')}
              </Fact>
              <Fact label="Notice">{parsedData?.notice_period}</Fact>
              <Fact label="Added">{formatRelativeTime(typedCandidate.created_at)}</Fact>
              <Fact label="Last contacted">
                {formatRelativeTime(typedCandidate.last_contacted)}
              </Fact>
            </dl>

            <div className="mt-4 space-y-3 border-t border-[#E4E3DC] pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-[#9C9C95]">Availability</span>
                <CandidateAvailabilityStatus
                  candidateId={id}
                  currentStatus={typedCandidate.availability_status || 'not_yet_talked'}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-[#9C9C95]">Owner</span>
                <CandidateOwnerAssignment
                  candidateId={id}
                  currentOwner={ownerInfo}
                  currentOwnerId={typedCandidate.owner_user_id}
                />
              </div>
            </div>
          </section>

          {typedCandidate.skills && typedCandidate.skills.length > 0 && (
            <section className={`${CARD} p-5`}>
              <h2 className="mb-3 text-[15px] font-semibold text-[#161613]">Skills<Audience show={isSuperAdmin} who="owner" /></h2>
              <div className="flex flex-wrap gap-1.5">
                {typedCandidate.skills.map(s => (
                  <span key={s} className={CHIP} title={s}>
                    <span className="truncate">{s}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {parsedData?.certifications && parsedData.certifications.length > 0 && (
            <section className={`${CARD} p-5`}>
              <h2 className="mb-2 text-[15px] font-semibold text-[#161613]">Certifications<Audience show={isSuperAdmin} who="owner" /></h2>
              <ul className="space-y-1 text-[13.5px] text-[#161613]">
                {parsedData.certifications.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          )}

          {parsedData && <LanguagesSection parsed={parsedData} />}

          {/* Open roles ranked against this candidate's embedding — the same
              engine that produces the auto-matches, shown a second way. For a
              scout it is a list they cannot act on next to a pipeline they can,
              which reads as though both mean the same thing. It is a matching
              tool, so it stays with the people who do the matching. */}
          {isSuperAdmin && <SuggestedJobs candidateId={id} />}

          <RecruiterNotes candidateId={id} />

          <CandidateActivityLog candidateId={id} />

          <section className={`${CARD} p-5`}>
            <h2 className="text-[15px] font-semibold text-[#161613]">Résumé file<Audience show={isSuperAdmin} who="owner" /></h2>
            <p className="mt-1 break-all text-[12.5px] text-[#6E6E68]">
              {typedCandidate.resume_filename}
            </p>
            <p className="mt-2 text-[12.5px] text-[#9C9C95]">
              {isStaleParse
                ? 'Read by an earlier extractor — re-read to pull in bullet points, education, links and the full text.'
                : 'Read in full by the current extractor.'}
            </p>
            <div className="mt-3">
              <ReanalyzeResume candidateId={id} isStale={isStaleParse} />
            </div>
          </section>
        </div>

        {/* Last on a phone, second row of the left column on a desktop. */}
        {parsedData && (
          <div className="space-y-6 lg:col-span-2 lg:col-start-1 lg:row-start-2">
            <ResumeBodySections parsed={parsedData} />
          </div>
        )}
      </div>
    </div>
  )
}
