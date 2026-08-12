import Link from 'next/link'
import { FileText, Lock } from 'lucide-react'
import {
  BODY,
  CARD,
  CARD_LINK,
  CHIP_VALUE,
  CHIP_WARN,
  FOREST,
  H3,
  META,
  MUTED,
  RULE,
  detailLine,
} from '@/lib/desk-ui'
import { formatMoney, stageLabel } from '@/lib/company-ui'
import { formatPayout, relationshipMeta, type PartnerCompanyView } from '@/lib/partners'
import { CompanyLogo } from './company-logo'

export interface CompanyCardRole {
  jobId: string
  title: string
  location: string | null
  priority: string
  scoutPayout: number | null
}

/**
 * One partner company, in one of two states.
 *
 * Unlocked, it is the client. Locked, it is deliberately still useful — the
 * alias, the market signals we already hold, every live role title, and the best
 * payout on offer. That is the judgement this card exists to support: is this
 * worth asking to be put on? Hiding the roles too would make the answer
 * unknowable; hiding the payout would make it uninteresting.
 *
 * A locked card never shows the name, logo, website or investors.
 *
 * The facts used to be six identical grey chips. They are now one line of plain
 * text, because a row of same-weight pills is a list pretending to be a
 * hierarchy. The only chip left is the payout — the single fact a scout is
 * actually deciding on.
 */
export function PartnerCompanyCard({
  company,
  roles,
  mySubmissions,
  requestAccess,
}: {
  company: PartnerCompanyView
  roles: CompanyCardRole[]
  mySubmissions: number
  /** Rendered in the locked footer. Passed in so this stays a server component. */
  requestAccess?: React.ReactNode
}) {
  const relationship = relationshipMeta(company.relationship)
  const shown = roles.slice(0, 4)
  const extra = roles.length - shown.length
  const bestPayout = roles.reduce<number | null>(
    (best, r) => (r.scoutPayout != null && (best == null || r.scoutPayout > best) ? r.scoutPayout : best),
    null,
  )

  const facts = detailLine(
    stageLabel(company.stage),
    company.location,
    company.industry,
    formatMoney(company.lastFundingAmountUsd),
    company.employeeCount,
  )

  const body = (
    <>
      <div className="flex items-start gap-3">
        <CompanyLogo name={company.name} url={company.logoUrl} locked={!company.unlocked} />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className={`min-w-0 truncate ${H3}`}>{company.name}</h3>
            {company.admin && !company.admin.isPublished && (
              <span className={`shrink-0 ${META}`}>Unpublished</span>
            )}
          </div>
          <p className={`mt-0.5 ${META}`}>
            {detailLine(
              relationship.label,
              company.liveRoles === 0
                ? 'no live searches'
                : `${company.liveRoles} live ${company.liveRoles === 1 ? 'search' : 'searches'}`,
              mySubmissions > 0 && `${mySubmissions} submitted by you`,
            )}
          </p>
        </div>

        {bestPayout != null && (
          <span className={`shrink-0 ${CHIP_VALUE}`}>up to {formatPayout(bestPayout)}</span>
        )}
      </div>

      {company.blurb && <p className={`mt-3 line-clamp-2 ${BODY}`}>{company.blurb}</p>}

      {facts && <p className={`mt-2.5 ${META}`}>{facts}</p>}

      {!!shown.length && (
        <ul className={`mt-4 space-y-1.5 border-t pt-3.5 ${RULE}`}>
          {shown.map(role => (
            <li key={role.jobId} className="flex items-baseline gap-2 text-[14px]">
              {/* Priority is the one thing worth a colour here, and it is a dot
                  rather than a pill so four rows stay a list. */}
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  role.priority === 'urgent'
                    ? 'bg-[#C2544B]'
                    : role.priority === 'high'
                      ? 'bg-[#C79A2E]'
                      : 'bg-[#C3D2C8]'
                }`}
              />
              <span className="min-w-0 flex-1 truncate text-[#161613]">{role.title}</span>
              {role.location && (
                <span className={`hidden shrink-0 sm:inline ${META}`}>{role.location}</span>
              )}
            </li>
          ))}
          {extra > 0 && (
            <li className={`pl-3.5 ${META}`}>
              and {extra} more {extra === 1 ? 'search' : 'searches'}
            </li>
          )}
        </ul>
      )}
    </>
  )

  if (company.unlocked) {
    return (
      <Link href={`/partners/${company.companyId}`} className={`block p-5 ${CARD_LINK}`}>
        {body}
        {company.briefPublished && (
          <p className={`mt-3.5 inline-flex items-center gap-1.5 ${FOREST} text-[13px] font-semibold`}>
            <FileText className="h-3.5 w-3.5" />
            Scout brief
          </p>
        )}
      </Link>
    )
  }

  return (
    <div className={`p-5 ${CARD}`}>
      {body}
      <p className={`mt-4 flex items-start gap-2 text-[13px] leading-relaxed ${MUTED}`}>
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          The client’s name and their scout brief open up once you’re assigned. The searches above
          are real and live.
        </span>
      </p>
      <div className="mt-3.5">
        {company.requestPending ? <span className={CHIP_WARN}>Access requested</span> : requestAccess}
      </div>
    </div>
  )
}
