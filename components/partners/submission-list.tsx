import Link from 'next/link'
import { CARD, FOCUS, GRADE_TO_VERDICT, VERDICT_GRADES } from '@/lib/candidate-ui'
import { shortAge } from '@/lib/job-ui'
import {
  SUBMISSION_TRACK,
  submissionStatus,
  type SubmissionRow,
  type SubmissionStatus,
} from '@/lib/partners'
import { SubmissionActions } from './submission-actions'

/**
 * Where each submission has got to.
 *
 * The timeline is the whole point of this component. Every account of what goes
 * wrong in split-fee networks says the same thing: a recruiter sends someone
 * good and then hears nothing, so they stop sending. Showing the trail — and the
 * note attached to each move — is what makes the desk worth working.
 */
export function SubmissionList({
  submissions,
  viewerId,
  canManage,
  /** Whether the viewer may read who submitted each one. */
  showsSubmitter,
  events,
}: {
  submissions: SubmissionRow[]
  viewerId: string
  canManage: boolean
  showsSubmitter: boolean
  events: Map<string, { to_status: string; note: string | null; created_at: string }[]>
}) {
  if (!submissions.length) {
    return (
      <p className="rounded-[18px] border border-dashed border-[#D8D8D0] bg-[#FAFAF6] px-5 py-8 text-center text-[14px] leading-relaxed text-[#6E6E68]">
        Nothing has been put forward for this search yet.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {submissions.map(submission => {
        const status = submissionStatus(submission.status)
        const mine = submission.submitted_by_user_id === viewerId
        const grade = VERDICT_GRADES[GRADE_TO_VERDICT[submission.candidate_grade ?? ''] ?? '']
        const trail = events.get(submission.id) ?? []

        return (
          <li key={submission.id} className={`p-5 ${CARD}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {mine || canManage ? (
                    <Link
                      href={`/candidates/${submission.candidate_id}`}
                      className={`truncate font-serif text-[18px] text-[#161613] underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      {submission.candidate_name || 'Unnamed candidate'}
                    </Link>
                  ) : (
                    <span className="truncate font-serif text-[18px] text-[#161613]">
                      {submission.candidate_name || 'Unnamed candidate'}
                    </span>
                  )}
                  {grade && (
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10.5px] font-bold ${grade.className}`}
                      title={grade.label}
                    >
                      {grade.grade}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] text-[#9C9C95]">
                  {[
                    submission.candidate_location,
                    submission.candidate_experience_years
                      ? `${submission.candidate_experience_years} yrs`
                      : null,
                    showsSubmitter && !mine
                      ? `via ${submission.submitted_by_name || submission.submitted_by_email || 'a scout'}`
                      : mine
                        ? 'yours'
                        : null,
                    `submitted ${shortAge(submission.created_at)}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${status.chip}`}
                >
                  {status.label}
                </span>
                <SubmissionActions
                  submissionId={submission.id}
                  status={submission.status}
                  canManage={canManage}
                  canWithdraw={mine && status.category === 'in_progress'}
                />
              </div>
            </div>

            <Track status={submission.status} />

            <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-[#3C403C]">
              {submission.pitch}
            </p>

            {!!submission.highlights?.length && (
              <ul className="mt-3 space-y-1">
                {submission.highlights.map((h, i) => (
                  <li key={i} className="relative pl-4 text-[13.5px] leading-relaxed text-[#6E6E68]">
                    <span
                      aria-hidden
                      className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#C9D9CF]"
                    />
                    {h}
                  </li>
                ))}
              </ul>
            )}

            {trail.length > 1 && (
              <details className="group mt-3">
                <summary
                  className={`inline-flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
                >
                  History
                  <span aria-hidden className="text-[#B8B8B0] group-open:hidden">
                    show
                  </span>
                  <span aria-hidden className="hidden text-[#B8B8B0] group-open:inline">
                    hide
                  </span>
                </summary>
                <ol className="mt-2 space-y-2 border-l border-[#ECECE6] pl-3.5">
                  {trail.map((event, i) => {
                    const meta = submissionStatus(event.to_status)
                    return (
                      <li key={i} className="relative text-[13px]">
                        <span
                          aria-hidden
                          className={`absolute -left-[18px] top-[6px] h-1.5 w-1.5 rounded-full ${meta.dot}`}
                        />
                        <span className="font-medium text-[#161613]">{meta.label}</span>
                        <span className="text-[#9C9C95]"> · {shortAge(event.created_at)}</span>
                        {event.note && (
                          <p className="mt-0.5 leading-relaxed text-[#6E6E68]">{event.note}</p>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </details>
            )}

            {submission.review_note && status.category !== 'in_progress' && (
              <p className="mt-3 rounded-[10px] bg-[#FAFAF6] px-3 py-2 text-[13px] leading-relaxed text-[#6E6E68]">
                <span className="font-semibold text-[#161613]">From Refery: </span>
                {submission.review_note}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The six-step track, or a single honest endpoint.
 *
 * A withdrawn or declined submission does not get a progress bar — drawing one
 * would imply it is still moving. It gets one line saying where it stopped.
 */
function Track({ status }: { status: SubmissionStatus }) {
  const meta = submissionStatus(status)
  if (meta.category === 'closed') {
    return (
      <p className="mt-3 text-[12.5px] text-[#9C9C95]">
        {meta.blurb} No further steps.
      </p>
    )
  }

  const reached = SUBMISSION_TRACK.indexOf(status)

  return (
    <div className="mt-3.5">
      <div className="flex gap-1" role="presentation">
        {SUBMISSION_TRACK.map((step, i) => (
          <span
            key={step}
            className={`h-1.5 flex-1 rounded-full ${
              i <= reached ? (i === SUBMISSION_TRACK.length - 1 ? 'bg-[#1F4D3A]' : 'bg-[#5E8571]') : 'bg-[#ECECE6]'
            }`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[12.5px] text-[#6E6E68]">{meta.blurb}</p>
    </div>
  )
}
