import Link from 'next/link'
import { ArrowUpRight, FileText, Lock } from 'lucide-react'
import { CARD, CHIP, FOCUS } from '@/lib/candidate-ui'
import { formatMoney, formatFundingDate, stageLabel, stageTint } from '@/lib/company-ui'
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
 * One partner company on the desk, in one of two states.
 *
 * Unlocked, it is the client: name, logo, engagement, the searches. Locked, it
 * is deliberately still useful — the alias, the market signals we already hold,
 * every live role title, and the best payout on offer. That is the judgement
 * call this card exists to support: is this worth asking to be put on? Hiding
 * the roles as well would make the answer unknowable, and hiding the payout
 * would make it uninteresting.
 *
 * What a locked card never shows: the company's name, logo, website, investors,
 * or anything a scout could triangulate the client from.
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
  const funding = formatMoney(company.lastFundingAmountUsd)

  // The stage chip is rendered separately because it carries its own tint, so
  // it is kept out of this list rather than sliced off the front of it —
  // slicing dropped the location on every company with no stage recorded.
  const stage = stageLabel(company.stage)
  const signals = [
    company.location,
    company.industry,
    funding
      ? `${funding}${formatFundingDate(company.lastFundingDate) ? ` · ${formatFundingDate(company.lastFundingDate)}` : ''}`
      : null,
  ].filter(Boolean) as string[]

  const body = (
    <>
      <div className="flex items-start gap-3">
        <CompanyLogo name={company.name} url={company.logoUrl} locked={!company.unlocked} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate font-serif text-[19px] leading-tight text-[#161613]">
              {company.name}
            </h3>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${relationship.chip}`}
            >
              {relationship.label}
            </span>
            {/* Admins see unpublished relationships in this list, and there is
                no other way to tell one apart from a client the network can
                already see. */}
            {company.admin && !company.admin.isPublished && (
              <span className="shrink-0 rounded-full bg-[#F0F0EA] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E6E68]">
                Unpublished
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-[#6E6E68]">
            {company.liveRoles === 0
              ? 'No live searches right now'
              : `${company.liveRoles} live ${company.liveRoles === 1 ? 'search' : 'searches'}`}
            {mySubmissions > 0 && ` · ${mySubmissions} submitted by you`}
          </p>
        </div>

        {company.unlocked && (
          <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[#B8B8B0]" aria-hidden />
        )}
      </div>

      {company.blurb && (
        <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-[#6E6E68]">
          {company.blurb}
        </p>
      )}

      {(stage || signals.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {stage && (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium leading-none ${stageTint(company.stage)}`}
            >
              {stage}
            </span>
          )}
          {signals.map(signal => (
            <span key={signal} className={CHIP}>
              <span className="truncate">{signal}</span>
            </span>
          ))}
        </div>
      )}

      {!!shown.length && (
        <ul className="mt-4 space-y-1.5 border-t border-[#ECECE6] pt-3.5">
          {shown.map(role => (
            <li key={role.jobId} className="flex items-baseline gap-2 text-[13.5px]">
              <span
                aria-hidden
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  role.priority === 'urgent'
                    ? 'bg-[#C2544B]'
                    : role.priority === 'high'
                      ? 'bg-[#C79A2E]'
                      : 'bg-[#5E8571]'
                }`}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-[#161613]">{role.title}</span>
              {role.location && (
                <span className="hidden shrink-0 text-[12px] text-[#9C9C95] sm:inline">
                  {role.location}
                </span>
              )}
            </li>
          ))}
          {extra > 0 && (
            <li className="pl-3.5 text-[12.5px] text-[#9C9C95]">
              and {extra} more {extra === 1 ? 'search' : 'searches'}
            </li>
          )}
        </ul>
      )}
    </>
  )

  const showsBrief = company.unlocked && company.briefPublished
  const showsRequest = !company.unlocked
  // A client with no live searches, no payout set and no brief has nothing for
  // the footer to say. Rendering the rule and its padding anyway leaves a stray
  // line and a gap under half the cards, which reads as something failing to
  // load.
  const footer =
    bestPayout != null || showsBrief || showsRequest ? (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#ECECE6] pt-3.5">
        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px]">
          {bestPayout != null && (
            <span className="font-semibold text-[#1F4D3A]">
              up to {formatPayout(bestPayout)} per placement
            </span>
          )}
          {showsBrief && (
            <span className="inline-flex items-center gap-1 text-[#6E6E68]">
              <FileText className="h-3.5 w-3.5" />
              Scout brief
            </span>
          )}
        </div>
        {showsRequest && requestAccess}
      </div>
    ) : null

  if (company.unlocked) {
    return (
      <Link
        href={`/partners/${company.companyId}`}
        className={`group block p-5 transition-colors hover:border-[#D8D8D0] ${CARD} ${FOCUS}`}
      >
        {body}
        {footer}
      </Link>
    )
  }

  return (
    <div className={`p-5 ${CARD}`}>
      {body}
      <p className="mt-4 inline-flex items-start gap-1.5 rounded-[10px] bg-[#FAFAF6] px-3 py-2 text-[12.5px] leading-relaxed text-[#6E6E68]">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9C9C95]" aria-hidden />
        <span>
          The client’s name and their scout brief open up once you’re assigned. The roles above are
          real and live.
        </span>
      </p>
      {footer}
    </div>
  )
}
