import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ChevronDown, FileText, Users } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import {
  BODY,
  BTN_QUIET,
  BTN_TEXT,
  CARD,
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
  assignmentFor,
  canWorkSearch,
  isUnlocked,
  searchStageMeta,
  slotsLeft,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
  type SubmissionRow,
} from '@/lib/partners'
import { ProposalActions } from '@/components/partners/proposal-card'
import { SearchQuestions, type QuestionRow } from '@/components/partners/search-questions'
import { StageStrip } from '@/components/partners/stage-strip'
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
  // The desk is in beta: super admins and beta users only. See DESK_BETA_ONLY.
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
  // Reading the client is company-wide; working a search is per role.
  const assignment = assignmentFor(access, jobId)
  const canWork = canWorkSearch(access, jobId, companyId)

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

  const [{ data: eventRows }, { data: briefRow }, { data: questionRows }] = await Promise.all([
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
    unlocked
      ? adminClient
          .from('search_questions')
          .select('id, question, answer, answered_at, created_at, is_visible, asked_by')
          .eq('job_id', jobId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const questions: QuestionRow[] = (questionRows ?? []).map(q => ({
    id: q.id as string,
    question: q.question as string,
    answer: (q.answer as string | null) ?? null,
    answered_at: (q.answered_at as string | null) ?? null,
    created_at: q.created_at as string,
    is_visible: q.is_visible as boolean,
    mine: q.asked_by === access.appUser.id,
  }))

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
        .select('id, name, panel_grade, location, experience_years, owner_user_id, visa_status, current_base, salary_expectation_min, salary_expectation_max')
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
              visaStatus: (person.visa_status as string | null) ?? null,
              currentBase: (person.current_base as number | null) ?? null,
              targetBase: ((person.salary_expectation_min ?? person.salary_expectation_max) as number | null) ?? null,
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

  // Two things the canvas lifts out of the brief onto the search: the logistics
  // table (comp, visa, travel, process) and the first two screening questions.
  const briefBlocks = brief ? brief.content.sections.flatMap(s => s.blocks) : []
  const factsBlock = briefBlocks.find(b => b.kind === 'facts')
  const logistics: { label: string; value: string }[] = factsBlock && factsBlock.kind === 'facts' ? factsBlock.rows : []
  const questionsBlock = briefBlocks.find(b => b.kind === 'questions')
  const screening = questionsBlock && questionsBlock.kind === 'questions' ? questionsBlock.items : []

  const priority = PRIORITY_META[role.priority] ?? PRIORITY_META.normal
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
  const slots = slotsLeft(role)
  const closed = !role.is_live || role.job_status !== 'open'
  const stage = searchStageMeta(role.search_stage)
  const interviewSteps = Array.isArray(role.interview_steps) ? role.interview_steps : []
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
        href={`/searches/${companyId}`}
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
          {assignment?.status === 'working' && <span className={CHIP_VALUE}>You are working this search</span>}
          {assignment?.status === 'proposed' && <span className={CHIP_WARN}>Proposed to you</span>}
          {role.priority !== 'normal' && (
            <span className={role.priority === 'urgent' ? CHIP_BAD : CHIP_WARN}>
              {priority.label}
            </span>
          )}
          {role.exclusivity === 'exclusive' && <span className={CHIP_VALUE}>Exclusive to Refery</span>}
          {!role.submission_cap && !closed && <span className={CHIP}>Open-ended headcount</span>}
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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {unlocked && (
              <Link href={`/searches/${companyId}`} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                <FileText className="h-4 w-4" />
                Client brief
              </Link>
            )}
            {unlocked && canWork && !closed && slots !== 0 && (
              <>
                <a href="#questions" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                  Ask a question
                </a>
                <SubmitCandidates jobId={jobId} roleTitle={`${role.title} · ${company.name}`} slotsLeft={slots} label="Submit a candidate" />
              </>
            )}
            {access.canManage && (
              <Link href={`/searches/${companyId}/roles/${jobId}/coverage`} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                <Users className="h-4 w-4" />
                Coverage
              </Link>
            )}
            {access.canManage && (
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
                  hardRequirements: role.hard_requirements ?? [],
                  intakeNotes: role.intake_notes ?? [],
                  notFor: role.not_for,
                  interviewSteps: interviewSteps,
                  decisionDays: role.decision_days,
                }}
              />
            )}
          </div>
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
          <dt className={FIGURE}>
            {role.decision_days ? `~${role.decision_days} days` : targetStart ?? priority.label}
          </dt>
          <dd className={`mt-1.5 ${LABEL}`}>
            {role.decision_days
              ? 'from first call to a decision'
              : targetStart
                ? 'target start'
                : 'priority for the client'}
          </dd>
          {role.decision_days && targetStart && (
            <dd className={`mt-1 ${META}`}>Target start {targetStart}</dd>
          )}
        </div>
        <div>
          {/* How far the search has got, in place of how many are on it. */}
          <StageStrip stage={role.search_stage} movedAt={role.stage_moved_at} isOpen={!closed} />
          <dd className={`mt-2 ${META}`}>{stage.blurb}</dd>
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
          {assignment?.status === 'proposed' && (
            <section className={`mt-7 border-[#E4D9B8] bg-[#FFFDF7] p-5 ${CARD}`}>
              <h2 className="text-[15px] font-semibold text-[#161613]">Refery put you on this search</h2>
              <p className={`mt-1 ${LEDE}`}>
                Read the bar and the brief, then tell us in one tap whether you will work it.
              </p>
              <div className="mt-3">
                <ProposalActions
                  assignmentId={assignment.id}
                  why={assignment.why}
                  proposedAt={assignment.proposed_at}
                  expiresAt={assignment.expires_at}
                />
              </div>
            </section>
          )}

          {!canWork && !access.canManage && (
            <section className={`mt-7 max-w-xl p-5 ${CARD}`}>
              <h2 className="text-[15px] font-semibold text-[#161613]">
                {assignment?.status === 'declined'
                  ? 'You passed on this search'
                  : 'You are not on this search yet'}
              </h2>
              <p className={`mt-1.5 ${LEDE}`}>
                You can read everything here because you are on another search at this client.
                Submitting to this one needs Refery to put you on it. Ask, and say what supply you have.
              </p>
              <div className="mt-3">
                <RequestAccess
                  companyId={companyId}
                  companyLabel={`${role.headline || role.title} at ${company.name}`}
                  pending={company.requestPending}
                />
              </div>
            </section>
          )}

          {/*
            The canvas order (artboard 2): the bar for this seat first, because it
            is what the reader came to check, then the logistics that decide
            whether to approach someone, then the two screening questions, then
            their own candidates and pipeline. The brief is one button in the
            header; the blurb sits with the questions as the third card.
          */}
          {(!!role.hard_requirements?.length || !!role.intake_notes?.length || role.not_for) && (
            <section className="mt-9">
              <h2 className={H2}>The bar for this seat</h2>
              <div className={`mt-4 grid gap-6 p-5 sm:grid-cols-2 ${CARD}`}>
                {!!role.hard_requirements?.length && (
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#6E6E68]">Hard requirements, from the JD</p>
                    <ul className="mt-2 space-y-1.5">
                      {role.hard_requirements.map((line, i) => (
                        <li key={i} className={`relative pl-4 ${BODY}`}>
                          <span aria-hidden className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#1F3A2F]" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!role.intake_notes?.length && (
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#8A6A1F]">From the intake call</p>
                    <ul className="mt-2 space-y-1.5">
                      {role.intake_notes.map((line, i) => (
                        <li key={i} className={`relative pl-4 ${BODY}`}>
                          <span aria-hidden className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#C79A2E]" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {role.not_for && (
                  <p className={`border-t border-dashed border-[#D2D1C7] pt-3 sm:col-span-2 ${LEDE}`}>
                    <span className="font-semibold text-[#9C3F37]">Not for: </span>
                    {role.not_for}
                  </p>
                )}
              </div>
            </section>
          )}

          {/* Logistics, from the brief: comp, visa, travel, process. Read before approaching anyone. */}
          {logistics.length > 0 && (
            <section className="mt-9">
              <h2 className={H2}>Logistics</h2>
              <div className={`mt-4 overflow-hidden ${CARD}`}>
                <table className="hidden w-full border-collapse sm:table">
                  <tbody>
                    {logistics.map((r, i) => (
                      <tr key={i} className="last:[&>*]:border-b-0">
                        <th scope="row" className="w-[150px] border-b border-[#E9E8E1] bg-[#FAF9F5] px-4 py-3 text-left align-top text-[13.5px] font-semibold text-[#2A2A26]">{r.label}</th>
                        <td className="border-b border-[#E9E8E1] px-4 py-3 align-top text-[14px] leading-relaxed text-[#2A2A26]">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <dl className="divide-y divide-[#E9E8E1] sm:hidden">
                  {logistics.map((r, i) => (
                    <div key={i} className="px-4 py-3">
                      <dt className="text-[12px] font-semibold text-[#6E6E68]">{r.label}</dt>
                      <dd className={`mt-1 ${BODY}`}>{r.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>
          )}

          {(screening.length > 0 || blurb || role.context) && (
            <section className="mt-9">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className={H2}>{screening.length ? 'Two questions to ask before you submit' : 'Before you approach anyone'}</h2>
                {brief && screening.length > 0 && (
                  <Link href={`/searches/${companyId}#screening`} className={BTN_TEXT}>
                    Full screening guide →
                  </Link>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {screening.slice(0, 2).map((q, i) => (
                  <div key={i} className={`p-4 ${CARD}`}>
                    <p className={`text-[12px] font-semibold tracking-[0.04em] ${MUTED}`}>{String(i + 1).padStart(2, '0')}</p>
                    <p className="mt-1 text-[14.5px] font-semibold leading-snug text-[#161613]">{q.question}</p>
                    {q.looking_for && (
                      <p className={`mt-1.5 ${LEDE}`}>
                        <span className={`font-semibold ${FOREST}`}>Looking for: </span>
                        {q.looking_for}
                      </p>
                    )}
                  </div>
                ))}
                {blurb && (
                  <div className={`p-4 ${CARD} ${screening.length ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14.5px] font-semibold text-[#161613]">What to say to a candidate</p>
                      <CopyButton text={blurb.paragraphs.join('\n\n')} label="Copy" />
                    </div>
                    <p className={`mt-2 line-clamp-3 ${LEDE}`}>{blurb.paragraphs[0]}</p>
                  </div>
                )}
                {role.context && (
                  <details className={`group p-4 ${CARD} ${screening.length ? 'sm:col-span-2' : ''}`}>
                    <summary className={`inline-flex cursor-pointer list-none items-center gap-1.5 ${BTN_TEXT}`}>
                      What we know about this search
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                    </summary>
                    <p className={`mt-2.5 whitespace-pre-line ${BODY}`}>{role.context}</p>
                  </details>
                )}
              </div>
              {!brief && (
                <p className={`mt-3 ${META}`}>
                  {access.canManage ? (
                    <>No brief imported yet. <Link href={`/searches/${companyId}`} className={`font-semibold ${FOREST} underline underline-offset-2 ${FOCUS}`}>Import one from the client page</Link>.</>
                  ) : (
                    'No scout brief published yet. Ask Refery for the detail before you approach anyone.'
                  )}
                </p>
              )}
            </section>
          )}

          {interviewSteps.length > 0 && (
            <section className="mt-9">
              <h2 className={H2}>How they interview</h2>
              <ol className={`mt-4 grid gap-5 p-5 sm:grid-cols-${Math.min(interviewSteps.length, 4)} ${CARD}`}>
                {interviewSteps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#E7EDE9] text-[12px] font-bold text-[#1F3A2F]">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[14px] font-semibold text-[#161613]">{step.title}</span>
                      {step.detail && <span className={`mt-0.5 block ${META}`}>{step.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              {role.decision_days && (
                <p className={`mt-2 ${META}`}>Decision typically inside {role.decision_days} days of the first call. Refery relays the read after each step.</p>
              )}
            </section>
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
              {!closed && slots !== 0 && canWork && (
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
                disabled={closed || slots === 0 || !canWork}
                disabledReason={
                  closed
                    ? 'This search is closed, so nothing more can be submitted.'
                    : !canWork
                      ? 'Ask to be put on this search before submitting.'
                      : 'This search is not taking more candidates right now.'
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

          <div id="questions">
            <SearchQuestions
              jobId={jobId}
              questions={questions}
              canAsk={canWork && !closed}
              canManage={access.canManage}
              canDelete={access.realUser.isSuperAdmin}
            />
          </div>
        </>
      )}
    </div>
  )
}

