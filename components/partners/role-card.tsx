import Link from 'next/link'
import { ArrowUpRight, FileText, MapPin } from 'lucide-react'
import { CARD, CHIP, FOCUS } from '@/lib/candidate-ui'
import { REMOTE_LABELS, formatSalary, seniorityLabel, visaSignal } from '@/lib/job-ui'
import { PRIORITY_META, payoutLine, slotsLeft, type PartnerRoleRow } from '@/lib/partners'

/**
 * One live search.
 *
 * The three things a scout decides on are what the role is, what it pays them,
 * and whether there is still room — so those three are the only ones given
 * weight. Everything else is a chip.
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
  const salary = formatSalary(role.salary_min, role.salary_max)
  const chips = [
    role.location,
    role.remote_policy ? REMOTE_LABELS[role.remote_policy] : null,
    role.seniority ? seniorityLabel(role.seniority) : null,
    salary,
    visaSignal(role.visa_requirement),
  ].filter(Boolean) as string[]

  return (
    <Link
      href={`/partners/${companyId}/roles/${role.job_id}`}
      className={`group block p-5 transition-colors hover:border-[#D8D8D0] ${CARD} ${FOCUS}`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${priority.chip}`}
            >
              {priority.label}
            </span>
            {role.exclusivity === 'exclusive' && (
              <span className="rounded-full bg-[#1F4D3A] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-white">
                Exclusive
              </span>
            )}
            {role.brief_status === 'published' && (
              <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#6E6E68]">
                <FileText className="h-3 w-3" />
                Brief
              </span>
            )}
          </div>
          <h3 className="mt-2 font-serif text-[19px] leading-snug text-[#161613]">
            {role.headline || role.title}
          </h3>
          {role.headline && role.headline !== role.title && (
            <p className="mt-0.5 text-[13px] text-[#9C9C95]">{role.title}</p>
          )}
        </div>
        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[#B8B8B0]" aria-hidden />
      </div>

      {!!chips.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {chips.map((chip, i) => (
            <span key={i} className={CHIP}>
              {i === 0 && <MapPin className="h-3 w-3 shrink-0" aria-hidden />}
              <span className="truncate">{chip}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[#ECECE6] pt-3.5 text-[13px]">
        {payout ? (
          <span className="font-semibold text-[#1F4D3A]">{payout}</span>
        ) : (
          <span className="text-[#9C9C95]">Payout not set yet</span>
        )}
        <span className="text-[#6E6E68]">
          {slots === null
            ? `${role.live_submission_count} in play`
            : slots === 0
              ? 'Full — no slots left'
              : `${slots} of ${role.submission_cap} slots open`}
          {mySubmissions > 0 && ` · ${mySubmissions} yours`}
        </span>
      </div>
    </Link>
  )
}
