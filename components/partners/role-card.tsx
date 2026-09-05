import Link from 'next/link'
import { FileText } from 'lucide-react'
import {
  CARD_LINK,
  CHIP_BAD,
  CHIP_VALUE,
  CHIP_WARN,
  FOREST,
  H3,
  META,
  MUTED,
  detailLine,
} from '@/lib/desk-ui'
import { REMOTE_LABELS, formatSalary, seniorityLabel } from '@/lib/job-ui'
import { PRIORITY_META, slotsLeft, type PartnerRoleRow } from '@/lib/partners'
import { feeExplanation, payoutAmount, resolveFee } from '@/lib/fees'
import { StageStrip } from './stage-strip'

/**
 * One live search.
 *
 * Three things decide whether a scout opens it: what the role is, what it pays
 * them, and whether there is still room. Those three get weight; everything else
 * is one line of grey text. A "normal" priority gets no chip at all — a label
 * every row carries tells you nothing, and the absence of one is the signal.
 */
export function RoleCard({
  role,
  companyId,
  mySubmissions,
}: {
  role: PartnerRoleRow
  companyId: string
  mySubmissions: number
}) {
  const priority = PRIORITY_META[role.priority] ?? PRIORITY_META.normal
  const fee = resolveFee(role)
  const payout = payoutAmount(fee)
  const slots = slotsLeft(role)

  const facts = detailLine(
    role.location,
    role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null,
    role.seniority ? seniorityLabel(role.seniority) : null,
    formatSalary(role.salary_min, role.salary_max),
  )

  return (
    <Link href={`/searches/${companyId}/roles/${role.job_id}`} className={`block p-5 ${CARD_LINK}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={H3}>{role.headline || role.title}</h3>
          {role.headline && role.headline !== role.title && (
            <p className={`mt-0.5 ${META}`}>{role.title}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {role.priority === 'urgent' && <span className={CHIP_BAD}>{priority.label}</span>}
          {role.priority === 'high' && <span className={CHIP_WARN}>{priority.label}</span>}
          {role.exclusivity === 'exclusive' && <span className={CHIP_VALUE}>Exclusive</span>}
        </div>
      </div>

      {facts && <p className={`mt-2 ${META}`}>{facts}</p>}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <span>
          {payout ? (
            <span className={`block text-[15px] font-semibold ${FOREST}`}>{payout} to you</span>
          ) : (
            <span className={`block text-[13.5px] ${MUTED}`}>Payout depends on the offer</span>
          )}
          {/* The arithmetic, so the figure can be checked rather than trusted. */}
          <span className={`mt-0.5 block ${META}`}>{feeExplanation(fee)}</span>
        </span>
        <span className={`text-[13px] ${slots === 0 ? 'font-semibold text-[#9C3F37]' : MUTED}`}>
          {detailLine(slots === 0 && 'Not taking more right now', mySubmissions > 0 && `${mySubmissions} yours in play`)}
        </span>
      </div>

      <div className="mt-4">
        <StageStrip
          stage={role.search_stage}
          movedAt={role.stage_moved_at}
          isOpen={role.is_live && role.job_status === 'open'}
          compact
        />
      </div>

      {role.brief_status === 'published' && (
        <p className={`mt-3 inline-flex items-center gap-1.5 text-[12.5px] ${MUTED}`}>
          <FileText className="h-3 w-3" />
          Brief published
        </p>
      )}
    </Link>
  )
}
