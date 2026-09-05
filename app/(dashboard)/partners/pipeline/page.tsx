import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, FOCUS, H1, LEDE, META, detailLine } from '@/lib/desk-ui'
import { shortAge } from '@/lib/job-ui'
import { GRADE_TO_VERDICT, VERDICT_GRADES } from '@/lib/candidate-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  SUBMISSION_STATUSES,
  SUBMISSION_TRACK,
  hmRatingLabel,
  submissionStatus,
  type SubmissionRow,
} from '@/lib/partners'

export const dynamic = 'force-dynamic'

/**
 * Pipeline: everyone the viewer has put forward, across every search, by stage.
 *
 * A board rather than a list because the question is "where is everyone", not
 * "who is next". Six working columns, closed folded away underneath. Each card
 * carries the one thing that changes what the partner does next: a read from
 * the hiring manager, a missing answer, a reason for a no.
 *
 * An admin sees the whole desk; a partner sees only their own submissions.
 */
export default async function PipelinePage() {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  if (!access.canUseDesk) notFound()

  const adminClient = createAdminClient()
  let query = adminClient.from('role_submissions_v').select('*').order('updated_at', { ascending: false })
  if (!access.seesAllSubmissions) query = query.eq('submitted_by_user_id', access.appUser.id)
  const { data } = await query
  const submissions = (data ?? []) as SubmissionRow[]

  const columns = SUBMISSION_TRACK.map(status => ({
    meta: submissionStatus(status),
    items: submissions.filter(s => s.status === status),
  }))
  const closed = submissions.filter(s => submissionStatus(s.status).category === 'closed')
  const inPlay = submissions.filter(s => submissionStatus(s.status).category === 'in_progress').length
  const placed = submissions.filter(s => s.status === 'placed').length
  const needsYou = submissions.filter(s => !s.work_authorization && ['submitted', 'shortlisted', 'sent_to_client'].includes(s.status)).length

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className={H1}>Pipeline</h1>
          <p className={`mt-2 ${LEDE}`}>
            {access.seesAllSubmissions ? 'Everyone the desk has put forward' : 'Everyone you have put forward'}, across every search, and exactly where they are.
            When something moves, the note that explains it moves with it.
          </p>
          <p className={`mt-2.5 ${META}`}>
            {detailLine(`${inPlay} in play`, `${placed} placed`, `${closed.length} closed`, needsYou > 0 && `${needsYou} missing work authorisation`)}
          </p>
        </div>
      </header>

      {submissions.length === 0 ? (
        <div className={`p-8 text-center ${CARD}`}>
          <p className={LEDE}>
            Nothing here yet. Open a search you are working, pick from your candidates, and say why. They appear here the moment you submit.
          </p>
          <Link href="/partners" className={`mt-4 inline-flex text-[13.5px] font-semibold text-[#1F3A2F] ${FOCUS}`}>
            Go to your searches →
          </Link>
        </div>
      ) : (
        <>
          {/* Scrolls sideways on a phone, six columns on a desktop. */}
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 lg:mx-0 lg:grid lg:grid-cols-6 lg:overflow-visible lg:px-0">
            {columns.map(({ meta, items }) => (
              <div key={meta.value} className="w-[240px] shrink-0 space-y-2 lg:w-auto">
                <div className="px-1">
                  <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[#161613]">
                    <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                    <span className="font-medium text-[#9C9C95]">{items.length}</span>
                  </p>
                  <p className={`mt-0.5 ${META}`}>{meta.blurb}</p>
                </div>
                {items.length === 0 ? (
                  <div className="rounded-[16px] border border-dashed border-[#D2D1C7] px-3 py-5 text-center text-[12.5px] text-[#9C9C95]">
                    {meta.value === 'placed' ? 'Your first one lands here' : 'Nothing here'}
                  </div>
                ) : (
                  items.map(s => <Card key={s.id} s={s} showsSubmitter={access.seesAllSubmissions} />)
                )}
              </div>
            ))}
          </div>

          {closed.length > 0 && (
            <details className={`group px-5 py-3.5 ${CARD}`}>
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-medium text-[#6E6E68] ${FOCUS}`}>
                <span>
                  Closed <span className="text-[#9C9C95]">{closed.length}</span>
                  <span className="ml-3 font-normal text-[#9C9C95]">
                    {closed[0].candidate_name} · {closed[0].company_name} · {submissionStatus(closed[0].status).label.toLowerCase()}
                    {closed[0].decline_reason ? `: ${closed[0].decline_reason}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[#9C9C95] group-open:hidden">show</span>
                <span className="hidden shrink-0 text-[#9C9C95] group-open:inline">hide</span>
              </summary>
              <ul className="mt-3 divide-y divide-[#E4E3DC] border-t border-[#E4E3DC]">
                {closed.map(s => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3 text-[13.5px]">
                    <Link href={`/partners/${s.company_id}/roles/${s.job_id}`} className={`font-semibold text-[#161613] underline-offset-4 hover:underline ${FOCUS}`}>
                      {s.candidate_name || 'Unnamed candidate'}
                    </Link>
                    <span className={META}>{s.job_title} · {s.company_name}</span>
                    <span className={META}>{submissionStatus(s.status).label}</span>
                    {s.decline_reason && <span className="w-full text-[13px] text-[#6E6E68]">Reason: {s.decline_reason}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function Card({ s, showsSubmitter }: { s: SubmissionRow; showsSubmitter: boolean }) {
  const grade = VERDICT_GRADES[GRADE_TO_VERDICT[s.candidate_grade ?? ''] ?? '']
  const read = hmRatingLabel(s.hm_rating)
  const missingAuth = !s.work_authorization && ['submitted', 'shortlisted', 'sent_to_client'].includes(s.status)
  const badge = read
    ? { text: `HM: ${read.toLowerCase()}`, cls: s.hm_rating && s.hm_rating >= 3 ? 'bg-[#E1F5EE] text-[#1D6B55]' : 'bg-[#F9EBE9] text-[#9C3F37]' }
    : missingAuth
      ? { text: 'Add work authorisation', cls: 'bg-[#F5EEDD] text-[#8A6A1F]' }
      : s.review_note && s.status !== 'submitted'
        ? { text: s.review_note, cls: 'bg-[#EAE9E1] text-[#6E6E68]' }
        : null

  return (
    <Link href={`/partners/${s.company_id}/roles/${s.job_id}`} className={`block p-3.5 ${CARD} transition-colors hover:border-[#D2D1C7] ${FOCUS}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[14px] font-semibold text-[#161613]">{s.candidate_name || 'Unnamed candidate'}</span>
          {grade && (
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${grade.className}`} title={grade.label}>
              {grade.grade}
            </span>
          )}
        </span>
        <span className={`shrink-0 ${META}`}>{shortAge(s.updated_at)}</span>
      </div>
      <p className={`mt-1 ${META}`}>
        {s.job_title} · <span className="font-medium text-[#2A2A26]">{s.company_name}</span>
        {showsSubmitter && s.submitted_by_name ? ` · ${s.submitted_by_name}` : ''}
      </p>
      {badge && <span className={`mt-2 inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-tight ${badge.cls}`}>{badge.text}</span>}
    </Link>
  )
}

export { SUBMISSION_STATUSES }
