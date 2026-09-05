import { META } from '@/lib/desk-ui'
import { shortAge } from '@/lib/job-ui'
import { SEARCH_STAGES, searchStageMeta, type SearchStage } from '@/lib/partners'

/**
 * How far a search has got, instead of how many people are on it.
 *
 * The desk used to print "4 in play" and "3 of 5 slots". Both numbers tell a
 * partner how many other partners are working the role, which is not theirs to
 * know, and neither answers the question they are actually asking: is tonight
 * worth it, and how fast do I need to move. The furthest stage any candidate
 * has reached answers that. Derived in `partner_roles_v.search_stage` from the
 * role's submissions, so it is the same number on every surface.
 *
 * The strip only ever moves forward through the five working stages; `closed`
 * is drawn as the track with no fill and a plain label.
 */
export function StageStrip({
  stage,
  movedAt,
  isOpen = true,
  compact = false,
  note,
}: {
  stage: SearchStage
  movedAt?: string | null
  /** False once the mandate is off the desk or the job has closed. */
  isOpen?: boolean
  compact?: boolean
  /** Replaces the default "still open · moved 2d ago" line. */
  note?: string | null
}) {
  const meta = searchStageMeta(stage)
  const reached = SEARCH_STAGES.indexOf(stage === 'closed' ? 'sourcing' : stage)
  const closed = stage === 'closed'

  const line =
    note ??
    [
      closed ? 'closed' : isOpen ? 'still open for candidates' : null,
      movedAt ? `moved ${shortAge(movedAt)}` : null,
    ]
      .filter(Boolean)
      .join(' · ')

  return (
    <div className={`flex min-w-0 flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <div className="flex gap-1" role="img" aria-label={`Search stage: ${meta.label}`}>
        {SEARCH_STAGES.map((step, i) => (
          <span
            key={step}
            className={`${compact ? 'h-[5px]' : 'h-1.5'} flex-1 rounded-full ${
              closed
                ? 'bg-[#E4E3DC]'
                : i < reached
                  ? 'bg-[#5E8571]'
                  : i === reached
                    ? 'bg-[#1F3A2F]'
                    : 'bg-[#E4E3DC]'
            }`}
          />
        ))}
      </div>
      <div className={`flex items-baseline justify-between gap-3 ${compact ? 'text-[12px]' : 'text-[12.5px]'}`}>
        <span className="font-semibold text-[#161613]">{meta.label}</span>
        {line && <span className={`truncate ${META}`}>{line}</span>}
      </div>
    </div>
  )
}
