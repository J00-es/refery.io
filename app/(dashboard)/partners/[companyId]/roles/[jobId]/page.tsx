import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ChevronDown, ExternalLink, FileText } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import {
  BODY,
  BTN_TEXT,
  CARD,
  CARD_LINK,
  CHIP,
  CHIP_BAD,
  CHIP_VALUE,
  CHIP_WARN,
  FIGURE,
  FOCUS,
  FOREST,
  H1,
  H2,
  LABEL,
  LEDE,
  META,
  MUTED,
  RULE,
  detailLine,
} from '@/lib/desk-ui'
import { REMOTE_LABELS, formatExperience, formatSalary, seniorityLabel, shortAge, visaSignal } from '@/lib/job-ui'
import { findBlurb, normalizeBrief, type BriefContent } from '@/lib/brief'
import { CLOSED_STAGE_VALUES } from '@/lib/pipeline-stages'
import { clientFeeAmount, feeExplanation, payoutAmount, resolveFee } from '@/lib/fees'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  PRIORITY_META,
  isUnlocked,
  slotsLeft,
  submissionStatus,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
  type SubmissionRow,
} from '@/lib/partners'
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
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
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

  /*
    The header used to carry seven identical grey chips — location, remote policy,
    seniority, salary, experience, visa, department — which is a list pretending
    to be a hierarchy. Two of those facts change whether a scout opens the role at
    all, so they stay as chips; the rest becomes one line of plain text.
  */
  const headline = [role.location, role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null]
    .filter(Boolean) as string[]
  const rest = detailLine(
    role.seniority ? seniorityLabel(role.seniority) : null,
    formatSalary(role.salary_min, role.salary_max),
    formatExperience(role.experience_years_min, role.experience_years_max),
    visaSignal(role.visa_requirement),
    role.department,
  )

  return (
    <div className="mx-auto max-w-[1120px] px-1 pb-16 sm:px-0">
      <Link
        href={`/partners/${companyId}`}
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium ${MUTED} transition-colors hover:text-[#161613] ${FOCUS}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {company.name}
      </Link>

      {/*
        Above the fold: what the search is, what it pays, and how much room is
        left. Nothing else — the brief, the intake context and the candidate blurb
        are each one click or one disclosure away. That ordering is the point of
        the redesign: the page opens on the decision, not on everything we know.
      */}
      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          {role.priority !== 'normal' && (
            <span className={role.priority === 'urgent' ? CHIP_BAD : CHIP_WARN}>
              {priority.label}
            </span>
          )}
          {role.exclusivity === 'exclusive' && <span className={CHIP_VALUE}>Exclusive to Refery</span>}
          {closed && <span className={CHIP}>Closed</span>}
        </div>

        <div className="mt-2.5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className={H1}>{role.headline || role.title}</h1>
            <p className={`mt-1.5 ${META}`}>
              {detailLine(
                company.name,
                role.headline && role.headline !== role.title
                  ? `posted as “${role.title}”`
                  : null,
              )}
            </p>
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
                  scoutShare: role.scout_share,
                  submissionCap: role.submission_cap,
                  targetStart: role.target_start,
                  salaryMin: role.salary_min,
                  salaryMax: role.salary_max,
                }}
              />
            </div>
          )}
        </div>

        {!!headline.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {headline.map(fact => (
              <span key={fact} className={CHIP}>
                {fact}
              </span>
            ))}
          </div>
        )}
        {rest && <p className={`mt-2 ${META}`}>{rest}</p>}
      </header>

      {/* Three figures, each read before its label. No boxes — space groups them. */}
      <dl className={`mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5 sm:grid-cols-3 ${RULE}`}>
        <div>
          <dt className={`${FIGURE} ${payout ? FOREST : ''}`}>{payout ?? '—'}</dt>
          <dd className={`mt-1.5 ${LABEL}`}>
            {payout ? 'to you on placement' : 'depends on the offer'}
          </dd>
          {/* Always shown, figure or not: a mandate with no salary band recorded
              still has a fee structure, and stating it beats "not set". */}
          <dd className={`mt-1 ${META}`}>{feeExplanation(fee)}</dd>
          {access.canManage && clientFeeAmount(fee) && (
            <dd className={`mt-0.5 ${META}`}>Client pays {clientFeeAmount(fee)}</dd>
          )}
          {role.payout_note && <dd className={`mt-0.5 ${META}`}>{role.payout_note}</dd>}
        </div>
        <div>
          <dt className={FIGURE}>{slots === null ? inPlay : slots === 0 ? 'Full' : slots}</dt>
          <dd className={`mt-1.5 ${LABEL}`}>
            {slots === null
              ? 'in play · no cap'
              : slots === 0
                ? 'no slots until one frees up'
                : `of ${role.submission_cap} slots open`}
          </dd>
        </div>
        <div>
          <dt className={FIGURE}>{shortAge(role.added_at)}</dt>
          <dd className={`mt-1.5 ${LABEL}`}>
            {targetStart ? `on the desk · starts ${targetStart}` : 'on the desk'}
          </dd>
        </div>
      </dl>

      {!unlocked ? (
        <section className="mt-7 max-w-xl">
          <h2 className={H2}>Ask to be put on this client</h2>
          <p className={`mt-2 ${LEDE}`}>
            Everything above is real. The company’s name, the scout brief — what they actually want,
            what will not clear, what to say to a candidate — and submitting all open up once you are
            assigned.
          </p>
          <div className="mt-3.5">
            <RequestAccess
              companyId={companyId}
              companyLabel={company.name}
              pending={company.requestPending}
            />
          </div>
        </section>
      ) : (
        <>
          {/*
            The brief and the blurb are one row of two entry points, not two full
            sections. The brief used to be rendered inline below everything else —
            a nine-section document embedded under a page that already had seven
            sections. A scout who has read it does not need it re-rendered under
            every search; one who has not needs one obvious way in.
          */}
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {brief ? (
              <Link
                href={`/partners/${companyId}/brief${brief.job_id ? `?job=${jobId}` : ''}`}
                className={`flex items-start gap-3 p-4 ${CARD_LINK}`}
              >
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1F3A2F]" aria-hidden />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-[#161613]">
                    {brief.job_id ? 'Brief for this search' : 'Scout brief'}
                    {brief.status !== 'published' && <span className={CHIP_WARN}>Draft</span>}
                  </span>
                  <span className={`mt-0.5 block ${META}`}>
                    The bar, the logistics, the screening questions, what to say to a candidate
                  </span>
                </span>
              </Link>
            ) : (
              <p className={`p-4 ${CARD} ${LEDE}`}>
                {access.canManage ? (
                  <>
                    No brief imported yet.{' '}
                    <Link
                      href={`/partners/${companyId}`}
                      className={`font-semibold text-[#1F3A2F] underline underline-offset-2 ${FOCUS}`}
                    >
                      Import one from the client setup panel
                    </Link>
                    .
                  </>
                ) : (
                  'No scout brief published yet. Ask Refery for the detail before you approach anyone.'
                )}
              </p>
            )}

            {blurb ? (
              <div className={`p-4 ${CARD}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14.5px] font-semibold text-[#161613]">
                    What to say to a candidate
                  </p>
                  <CopyButton text={blurb.paragraphs.join('\n\n')} label="Copy" />
                </div>
                <p className={`mt-2 line-clamp-2 ${META}`}>{blurb.paragraphs[0]}</p>
              </div>
            ) : role.job_post_url ? (
              <a
                href={role.job_post_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-start gap-3 p-4 ${CARD_LINK}`}
              >
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-[#8A8A82]" aria-hidden />
                <span>
                  <span className="block text-[14.5px] font-semibold text-[#161613]">
                    The company’s own posting
                  </span>
                  <span className={`mt-0.5 block ${META}`}>How the role is advertised publicly</span>
                </span>
              </a>
            ) : null}
          </div>

          {/* Intake detail behind a disclosure: read once, not on every visit. */}
          {role.context && (
            <details className="group mt-4">
              <summary
                className={`inline-flex cursor-pointer list-none items-center gap-1.5 ${BTN_TEXT}`}
              >
                What we know about this search
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <p className={`mt-2.5 max-w-2xl whitespace-pre-line ${BODY}`}>{role.context}</p>
            </details>
          )}

          {/* The queue you can act on, then the record of what you already did. */}
          <section className="mt-9">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className={H2}>
                  {access.seesAllCandidates ? 'Matched candidates' : 'Your matched candidates'}
                  <span className={`ml-2 text-[15px] ${MUTED}`}>{matches.length}</span>
                </h2>
                <p className={`mt-1 max-w-xl ${LEDE}`}>
                  Paired with this search but not put forward. A match is a suggestion — tick the ones
                  you would stand behind and say why.
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
            <div className="mt-4">
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
            </div>
          </section>

          <section className="mt-9">
            <h2 className={H2}>
              {access.seesAllSubmissions ? 'Submissions' : 'Your submissions'}
              <span className={`ml-2 text-[15px] ${MUTED}`}>{submissions.length}</span>
            </h2>
            <div className="mt-4">
              <SubmissionList
                submissions={submissions}
                viewerId={access.appUser.id}
                canManage={access.canManage}
                showsSubmitter={access.seesAllSubmissions}
                events={events}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

