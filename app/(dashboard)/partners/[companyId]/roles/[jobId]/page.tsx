import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, FileText, Lock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, CHIP, FOCUS } from '@/lib/candidate-ui'
import { REMOTE_LABELS, formatExperience, formatSalary, seniorityLabel, shortAge, visaSignal } from '@/lib/job-ui'
import { findBlurb, normalizeBrief, type BriefContent } from '@/lib/brief'
import { CLOSED_STAGE_VALUES } from '@/lib/pipeline-stages'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  PRIORITY_META,
  isUnlocked,
  payoutLine,
  relationshipMeta,
  slotsLeft,
  submissionStatus,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
  type SubmissionRow,
} from '@/lib/partners'
import { BriefDocument } from '@/components/partners/brief-document'
import { CopyButton } from '@/components/partners/copy-button'
import { MatchedCandidates, type MatchRow } from '@/components/partners/matched-candidates'
import { ManageRole } from '@/components/partners/manage-role'
import { RequestAccess } from '@/components/partners/request-access'
import { SubmissionList } from '@/components/partners/submission-list'
import { SubmitCandidates } from '@/components/partners/submit-candidates'

export const dynamic = 'force-dynamic'

export default async function PartnerRolePage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string }>
}) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  // The desk is super-admin-only while it is being built — see DESK_SUPER_ADMIN_ONLY.
  if (!access.canUseDesk) notFound()

  const { companyId, jobId } = await params
  const adminClient = createAdminClient()

  const [{ data: roleRow }, { data: companyRow }] = await Promise.all([
    adminClient.from('partner_roles_v').select('*').eq('job_id', jobId).maybeSingle(),
    adminClient.from('partner_companies_v').select('*').eq('company_id', companyId).maybeSingle(),
  ])

  if (!roleRow || !companyRow) notFound()
  const role = roleRow as PartnerRoleRow
  const company = toCompanyView(companyRow as PartnerCompanyRow, access)

  // The role must actually sit under the company in the URL, or a scout assigned
  // to company A could read company B's mandate by editing the path.
  if (role.company_id !== companyId) notFound()
  if (!access.canManage && !(companyRow as PartnerCompanyRow).is_published) notFound()

  const unlocked = isUnlocked(access, companyId)

  /*
    Submissions. A scout reads their own; an admin reads the desk's. There is no
    middle setting — showing a scout a redacted count of other people's work
    tells them nothing they can act on and quite a lot about each other.
  */
  const { data: submissionRows } = await adminClient
    .from('role_submissions_v')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  const allSubmissions = (submissionRows ?? []) as SubmissionRow[]
  const submissions = access.seesAllSubmissions
    ? allSubmissions
    : allSubmissions.filter(s => s.submitted_by_user_id === access.appUser.id)

  const [{ data: eventRows }, { data: briefRow }] = await Promise.all([
    submissions.length
      ? adminClient
          .from('role_submission_events')
          .select('submission_id, to_status, note, created_at')
          .in(
            'submission_id',
            submissions.map(s => s.id),
          )
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    unlocked
      ? adminClient
          .from('partner_briefs')
          .select('id, title, status, content, version, job_id')
          .eq('company_id', companyId)
          .or(`job_id.eq.${jobId},job_id.is.null`)
      : Promise.resolve({ data: null }),
  ])

  /*
    The candidates already paired with this role.

    `job_candidate_pipeline` is where the nightly matcher writes its suggestions —
    8,170 rows sit at `auto_matched` across the board — and a match is not a
    submission: nobody has read it and nobody has vouched for it. This section is
    where the person who owns the candidate turns one into the other.

    Scoped to rows this viewer owns or added, which is the same ownership test
    `ownsCandidate` applies everywhere else. Anything already submitted drops out;
    it belongs under Submissions, not back in the queue.
  */
  const submittedCandidateIds = new Set(allSubmissions.map(s => s.candidate_id))
  let matches: MatchRow[] = []

  if (unlocked) {
    const { data: pipelineRows } = await adminClient
      .from('job_candidate_pipeline')
      .select('candidate_id, stage, match_score, match_tier, match_reason, owner_user_id, added_by_user_id')
      .eq('job_id', jobId)
      .not('stage', 'in', `(${CLOSED_STAGE_VALUES.join(',')})`)

    const mine = (pipelineRows ?? []).filter(
      row =>
        access.seesAllCandidates ||
        row.owner_user_id === access.appUser.id ||
        row.added_by_user_id === access.appUser.id,
    )
    const candidateIds = mine
      .map(row => row.candidate_id as string)
      .filter(id => !submittedCandidateIds.has(id))

    if (candidateIds.length) {
      const { data: people } = await adminClient
        .from('candidates')
        .select('id, name, panel_grade, location, experience_years, owner_user_id')
        .in('id', candidateIds)
      const byId = new Map((people ?? []).map(p => [p.id as string, p]))

      // Owner names only for the viewer who is allowed to see across books.
      const ownerIds = access.seesAllCandidates
        ? [...new Set(mine.map(r => r.owner_user_id).filter(Boolean) as string[])]
        : []
      const { data: owners } = ownerIds.length
        ? await adminClient.from('users_admin').select('user_id, full_name, email').in('user_id', ownerIds)
        : { data: [] }
      const ownerById = new Map(
        (owners ?? []).map(o => [o.user_id as string, (o.full_name as string) || (o.email as string)]),
      )

      matches = mine
        .filter(row => !submittedCandidateIds.has(row.candidate_id as string))
        .flatMap(row => {
          const person = byId.get(row.candidate_id as string)
          if (!person) return []
          const isMine = row.owner_user_id === access.appUser.id
          return [
            {
              candidateId: row.candidate_id as string,
              name: person.name as string | null,
              grade: person.panel_grade as string | null,
              location: person.location as string | null,
              experienceYears: person.experience_years as number | null,
              stage: row.stage as string,
              matchScore: row.match_score as number | null,
              matchTier: row.match_tier as string | null,
              matchReason: row.match_reason as string | null,
              ownerName: isMine ? null : (ownerById.get(row.owner_user_id as string) ?? null),
            },
          ]
        })
        // Strongest match first — that is the order anyone reviewing a queue wants.
        .sort((a, b) => Number(b.matchScore ?? 0) - Number(a.matchScore ?? 0))
    }
  }

  const events = new Map<string, { to_status: string; note: string | null; created_at: string }[]>()
  for (const event of eventRows ?? []) {
    const key = event.submission_id as string
    const list = events.get(key) ?? []
    list.push({
      to_status: event.to_status as string,
      note: (event.note as string | null) ?? null,
      created_at: event.created_at as string,
    })
    events.set(key, list)
  }

  /*
    A role-scoped brief beats the company one, but only among briefs this viewer
    may actually read — otherwise a role-scoped draft would shadow a published
    company brief and a scout would see "no brief" when one exists.
  */
  const readable = (briefRow ?? []).filter(b => b.status === 'published' || access.canManage)
  const briefRecord = readable.find(b => b.job_id === jobId) ?? readable.find(b => !b.job_id) ?? null
  const brief = briefRecord
    ? { ...briefRecord, content: normalizeBrief(briefRecord.content) as BriefContent }
    : null
  const blurb = brief ? findBlurb(brief.content) : null

  const priority = PRIORITY_META[role.priority] ?? PRIORITY_META.normal
  const payout = payoutLine(role)
  const slots = slotsLeft(role)
  const closed = !role.is_live || role.job_status !== 'open'
  const inPlay = submissions.filter(s => submissionStatus(s.status).category === 'in_progress').length
  const targetStart = role.target_start
    ? new Date(role.target_start).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null

  const chips = [
    role.location,
    role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null,
    role.seniority ? seniorityLabel(role.seniority) : null,
    formatSalary(role.salary_min, role.salary_max),
    formatExperience(role.experience_years_min, role.experience_years_max),
    visaSignal(role.visa_requirement),
    role.department,
  ].filter(Boolean) as string[]

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <Link
        href={`/partners/${companyId}`}
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {company.name}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${priority.chip}`}
          >
            {priority.label}
          </span>
          {role.exclusivity === 'exclusive' && (
            <span className="rounded-full bg-[#1F4D3A] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">
              Exclusive to Refery
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${relationshipMeta(company.relationship).chip}`}
          >
            {company.name}
          </span>
          {closed && (
            <span className="rounded-full bg-[#F0F0EA] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E6E68]">
              Closed
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-serif text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[34px]">
              {role.headline || role.title}
            </h1>
            {role.headline && role.headline !== role.title && (
              <p className="mt-1 text-[14px] text-[#9C9C95]">Posted as “{role.title}”</p>
            )}
          </div>
          {access.canManage && (
            <div className="shrink-0">
              <ManageRole
                jobId={jobId}
                jobTitle={`${role.title} · ${company.name}`}
                initial={{
                  isLive: role.is_live,
                  priority: role.priority,
                  headline: role.headline,
                  context: role.context,
                  scoutPayout: role.scout_payout,
                  feePercentage: role.fee_percentage,
                  feeFlat: role.fee_flat,
                  payoutNote: role.payout_note,
                  exclusivity: role.exclusivity,
                  submissionCap: role.submission_cap,
                  targetStart: role.target_start,
                }}
              />
            </div>
          )}
        </div>

        {!!chips.length && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip, i) => (
              <span key={i} className={CHIP}>
                <span className="truncate">{chip}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      {/* The three facts a scout decides on, given the weight they deserve. */}
      <section className={`grid gap-4 p-5 sm:grid-cols-3 ${CARD}`}>
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68]">
            What you earn
          </p>
          <p className="mt-1.5 font-serif text-[21px] leading-tight text-[#1F4D3A]">
            {payout ?? 'Not set yet'}
          </p>
          {role.payout_note && payout && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#9C9C95]">{role.payout_note}</p>
          )}
        </div>
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68]">
            Room left
          </p>
          <p className="mt-1.5 font-serif text-[21px] leading-tight text-[#161613]">
            {slots === null ? `${inPlay} in play` : slots === 0 ? 'Full' : `${slots} of ${role.submission_cap}`}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#9C9C95]">
            {slots === null
              ? 'No cap on this search'
              : slots === 0
                ? 'Nothing more can be submitted until a slot frees up'
                : 'Submission slots open'}
          </p>
        </div>
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68]">
            On the desk
          </p>
          <p className="mt-1.5 font-serif text-[21px] leading-tight text-[#161613]">
            {shortAge(role.added_at)}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[#9C9C95]">
            {targetStart ? `Wants someone starting ${targetStart}` : 'No target start date'}
          </p>
        </div>
      </section>

      {!unlocked ? (
        <section className={`space-y-3 p-5 ${CARD}`}>
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#9C9C95]" aria-hidden />
            <div>
              <h2 className="text-[15px] font-semibold text-[#161613]">
                Ask to be put on this client
              </h2>
              <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[#6E6E68]">
                Everything above is real. The company’s name, the scout brief — what they actually
                want, what will not clear, what to say to a candidate — and submitting all open up
                once you are assigned.
              </p>
            </div>
          </div>
          <RequestAccess
            companyId={companyId}
            companyLabel={company.name}
            pending={company.requestPending}
          />
        </section>
      ) : (
        <>
          {role.context && (
            <section className={`p-5 ${CARD}`}>
              <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68]">
                What we know about this search
              </h2>
              <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-[#161613]">
                {role.context}
              </p>
            </section>
          )}

          {blurb && (
            <section className={`p-5 ${CARD}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68]">
                    What to say to a candidate
                  </h2>
                  {blurb.note && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#9C9C95]">{blurb.note}</p>
                  )}
                </div>
                <CopyButton text={blurb.paragraphs.join('\n\n')} label="Copy blurb" />
              </div>
              <p className="mt-3 line-clamp-3 font-serif text-[15px] leading-relaxed text-[#3C403C]">
                {blurb.paragraphs[0]}
              </p>
              {brief && (
                <Link
                  href={`/partners/${companyId}/brief${brief.job_id ? `?job=${jobId}` : ''}`}
                  className={`mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1F4D3A] hover:text-[#173D2E] ${FOCUS}`}
                >
                  Read it in the brief
                  <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </section>
          )}

          {/* Matched first, submissions second: the queue you can act on comes
              before the record of what you already did. */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="font-serif text-[22px] font-normal text-[#161613]">
                  {access.seesAllCandidates ? 'Matched candidates' : 'Your matched candidates'}
                  <span className="ml-2 text-[15px] text-[#9C9C95]">{matches.length}</span>
                </h2>
                <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-[#6E6E68]">
                  Paired with this search but not yet put forward. A match is a suggestion — tick the
                  ones you would stand behind and say why.
                </p>
              </div>
              {!closed && slots !== 0 && (
                <SubmitCandidates
                  jobId={jobId}
                  roleTitle={`${role.title} · ${company.name}`}
                  slotsLeft={slots}
                  label="Add someone else"
                />
              )}
            </div>
            <MatchedCandidates
              jobId={jobId}
              roleTitle={`${role.title} · ${company.name}`}
              matches={matches}
              disabled={closed || slots === 0}
              disabledReason={
                closed
                  ? 'This search is closed, so nothing more can be submitted.'
                  : 'This search is full. Nothing more can be submitted until a slot frees up.'
              }
            />
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-serif text-[22px] font-normal text-[#161613]">
                {access.seesAllSubmissions ? 'Submissions' : 'Your submissions'}
                <span className="ml-2 text-[15px] text-[#9C9C95]">{submissions.length}</span>
              </h2>
              {closed && <p className="text-[13px] text-[#9C9C95]">This search is closed.</p>}
            </div>
            <SubmissionList
              submissions={submissions}
              viewerId={access.appUser.id}
              canManage={access.canManage}
              showsSubmitter={access.seesAllSubmissions}
              events={events}
            />
          </section>

          {role.job_post_url && (
            <a
              href={role.job_post_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#1F4D3A] ${FOCUS}`}
            >
              The company’s own posting
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          {brief ? (
            <section className={`overflow-hidden p-5 sm:p-7 ${CARD}`}>
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#ECECE6] pb-4">
                <h2 className="font-serif text-[22px] font-normal text-[#161613]">
                  {brief.job_id ? 'Brief for this role' : 'Scout brief'}
                </h2>
                <div className="flex items-center gap-3">
                  {brief.status !== 'published' && (
                    <span className="rounded-full bg-[#F5EEDD] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#8A6A1F]">
                      Draft
                    </span>
                  )}
                  <Link
                    href={`/partners/${companyId}/brief${brief.job_id ? `?job=${jobId}` : ''}`}
                    className={`inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#1F4D3A] hover:text-[#173D2E] ${FOCUS}`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Full page
                  </Link>
                </div>
              </div>
              <BriefDocument content={brief.content} variant="embedded" />
            </section>
          ) : (
            <p className="rounded-[18px] border border-dashed border-[#D8D8D0] bg-[#FAFAF6] px-5 py-6 text-center text-[13.5px] leading-relaxed text-[#6E6E68]">
              {access.canManage
                ? 'No brief has been imported for this client yet. Open Manage → Scout brief on the client page.'
                : 'No scout brief has been published for this client yet. Ask Refery for the detail before you approach anyone.'}
            </p>
          )}
        </>
      )}
    </div>
  )
}
