import Link from 'next/link'
import { FileText, Lock, Sparkles } from 'lucide-react'
import { CARD_LINK, CHIP_BAD, CHIP_VALUE, CHIP_WARN, FOREST, H3, META, MUTED, RULE, detailLine } from '@/lib/desk-ui'
import { REMOTE_LABELS, seniorityLabel } from '@/lib/job-ui'
import { feeExplanation, payoutAmount } from '@/lib/fees'
import type { DeskSearch } from '@/lib/desk-filters'
import { StageStrip } from './stage-strip'

/**
 * One live search in the flat list.
 *
 * Denser than the company-page card, because this list is scanned rather than
 * read: the payout is the left-hand column so a column of figures can be compared
 * down the page, and everything else is one line of grey.
 *
 * Three signals earn their own space because they change the decision and nothing
 * else on the row does:
 *
 *   what you earn     with the arithmetic underneath, so it can be checked rather
 *                     than trusted.
 *   who is in play    submissions against slots. "3 of 5" tells a scout whether
 *                     tonight is worth it; a bare "3 submitted" does not.
 *   your matches      the number of your own candidates already paired with this
 *                     search. This is the row's whole reason to exist — it is the
 *                     one thing no other marketplace can tell you.
 */
export function SearchRow({ search }: { search: DeskSearch }) {
  const payout = payoutAmount(search.fee)
  const full = search.slotsLeft === 0
  const onIt = search.assignment === 'working' || search.assignment === 'proposed'

  return (
    <Link
      href={`/searches/${search.companyId}/roles/${search.jobId}`}
      className={`block px-4 py-4 sm:px-5 ${CARD_LINK}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
        {/* The figure, first and in the reading order, so a scan down the list is
            a scan down a column of payouts. Wide enough for the longest range a
            band can produce, and `whitespace-nowrap` so a figure never breaks
            across two lines even if one day it is longer than that. */}
        <div className="sm:w-[172px] sm:shrink-0">
          {payout ? (
            <p
              className={`font-semibold whitespace-nowrap text-[21px] leading-none tracking-[-0.02em] ${FOREST}`}
            >
              {payout}
            </p>
          ) : (
            <p className={`font-semibold text-[19px] leading-none ${MUTED}`}>—</p>
          )}
          <p className={`mt-1.5 ${META}`}>{feeExplanation(search.fee)}</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={`min-w-0 ${H3}`}>{search.headline || search.title}</h3>
            {search.priority === 'urgent' && <span className={CHIP_BAD}>Urgent</span>}
            {search.priority === 'high' && <span className={CHIP_WARN}>Priority</span>}
            {search.exclusive && <span className={CHIP_VALUE}>Exclusive</span>}
          </div>

          <p className={`mt-1 flex items-center gap-1.5 ${META}`}>
            {!search.unlocked && <Lock className="h-3 w-3 shrink-0" aria-hidden />}
            {detailLine(
              search.companyName,
              search.location,
              search.remotePolicy ? REMOTE_LABELS[search.remotePolicy] : null,
              search.seniority ? seniorityLabel(search.seniority) : null,
            )}
          </p>

          <p className={`mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 ${META}`}>
            {search.assignment === 'proposed' && (
              <span className={CHIP_WARN}>Proposed to you</span>
            )}
            {search.assignment === 'working' && (
              <span className={CHIP_VALUE}>You are working this</span>
            )}
            {search.myMatches > 0 && (
              <span className={`inline-flex items-center gap-1 font-semibold ${FOREST}`}>
                <Sparkles className="h-3 w-3" />
                {search.myMatches} of your candidates matched
              </span>
            )}
            {full && <span className="font-semibold text-[#9C3F37]">Not taking more right now</span>}
            {search.mySubmissions > 0 && <span>{search.mySubmissions} yours in play</span>}
            {search.briefPublished && (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Brief
              </span>
            )}
          </p>
        </div>

        {/* How far it has got, in place of how many are on it. */}
        <div className="sm:w-[210px] sm:shrink-0 sm:pt-0.5">
          <StageStrip stage={search.stage} movedAt={search.stageMovedAt} isOpen={search.isOpen} compact />
        </div>
      </div>
    </Link>
  )
}

/**
 * What the list says when the filters exclude everything.
 *
 * Names the likely culprit rather than shrugging: a scout who has just ticked
 * three things needs to know which one to loosen, and "no results" tells them
 * nothing they cannot already see.
 */
export function SearchesEmpty({ hasFilters }: { hasFilters: boolean }) {
  return (
    <p className={`border-t py-10 text-center ${RULE} ${META}`}>
      {hasFilters
        ? 'Nothing matches all of those filters. Remove one from the row above — the count next to each option shows what it would leave.'
        : 'No live searches on the desk yet.'}
    </p>
  )
}
