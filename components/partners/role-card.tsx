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
import { PRIORITY_META, payoutLine, slotsLeft, type PartnerRoleRow } from '@/lib/partners'

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
  const payout = payoutLine(role)
  const slots = slotsLeft(role)

  const facts = detailLine(
    role.location,
    role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null,
    role.seniority ? seniorityLabel(role.seniority) : null,
    formatSalary(role.salary_min, role.salary_max),
  )

  return (
    <Link href={`/partners/${companyId}/roles/${role.job_id}`} className={`block p-5 ${CARD_LINK}`}>
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {payout ? (
          <span className={`text-[14px] font-semibold ${FOREST}`}>{payout}</span>
        ) : (
          <span className={`text-[13.5px] ${MUTED}`}>Payout not set</span>
        )}
        <span className={`text-[13px] ${slots === 0 ? 'font-semibold text-[#9C3F37]' : MUTED}`}>
          {detailLine(
            slots === null
              ? `${role.live_submission_count} in play`
              : slots === 0
                ? 'Full'
                : `${slots} of ${role.submission_cap} slots`,
            mySubmissions > 0 && `${mySubmissions} yours`,
          )}
        </span>
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
