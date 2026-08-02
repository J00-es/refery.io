'use client'

import { memo, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Briefcase, MapPin, TriangleAlert } from 'lucide-react'
import { CARD, CHIP, FOCUS, avatarTint, initialsOf } from '@/lib/candidate-ui'
import {
  employeeLabel,
  formatFundingDate,
  formatMoney,
  investorList,
  monthsSince,
  shortRound,
  stageLabel,
  stageTint,
} from '@/lib/company-ui'

export interface CompanyRow {
  id?: string
  name: string
  description?: string | null
  logo_url?: string | null
  industry?: string | null
  location?: string | null
  employee_count?: string | null
  stage?: string | null
  last_funding_amount_usd?: number | null
  last_funding_type?: string | null
  last_funding_date?: string | null
  top_investors?: string | null
  do_not_contact?: boolean | null
  do_not_contact_reason?: string | null
  jobCount?: number
  isFromDatabase?: boolean
}

/** Logo with an initials fallback — roughly 40% of rows have no logo, and
 *  remote logo URLs go stale, so the error path is the common path. */
function Logo({ name, url }: { name: string; url?: string | null }) {
  const [failed, setFailed] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // The card is server-rendered, so a dead logo URL can fail before React
  // attaches onError — the handler never fires and a broken-image glyph is
  // left on screen. Re-check the decoded size once on mount to catch those.
  useEffect(() => {
    const img = imgRef.current
    if (img?.complete && img.naturalWidth === 0) setFailed(true)
  }, [url])

  if (!url || failed) {
    return (
      <span
        aria-hidden
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-[14px] font-semibold ${avatarTint(name)}`}
      >
        {initialsOf(name)}
      </span>
    )
  }
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[12px] border border-[#ECECE6] bg-white p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={url}
        alt=""
        loading="lazy"
        className="h-full w-full object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

function CompanyCardComponent({ company, isAdmin = false }: { company: CompanyRow; isAdmin?: boolean }) {
  const stage = stageLabel(company.stage)
  const round = shortRound(company.last_funding_type)
  const amount = formatMoney(company.last_funding_amount_usd)
  const when = formatFundingDate(company.last_funding_date)
  const age = monthsSince(company.last_funding_date)
  const fresh = age !== null && age <= 6
  const hasFunding = Boolean(round || amount || when)
  const { shown: investors, extra: moreInvestors } = investorList(company.top_investors)

  const href = company.id
    ? `/companies/${company.id}`
    : `/companies/view/${encodeURIComponent(company.name)}`

  const sub = [company.industry, company.location].filter(Boolean).join(' · ')

  return (
    <Link href={href} className={`group block h-full rounded-[18px] ${FOCUS}`}>
      <article
        className={`${CARD} grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto_1fr_auto] gap-3.5 overflow-hidden p-4 transition-[border-color,box-shadow] duration-150 group-hover:border-[#D8D8D0] group-hover:shadow-[0_2px_12px_rgba(22,22,19,0.06)] sm:p-5`}
      >
        {/* ── identity ───────────────────────────────────────────────────── */}
        <header className="flex min-w-0 items-start gap-3">
          <Logo name={company.name} url={company.logo_url} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[#161613]">
                {company.name}
              </h3>
              {isAdmin && company.do_not_contact && (
                <span
                  title={company.do_not_contact_reason || 'Do not contact'}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F7EDEC] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#9C4038]"
                >
                  <TriangleAlert className="h-3 w-3" />
                  DNC
                </span>
              )}
            </div>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-[#6E6E68]">
              {company.location && <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9C9C95]" />}
              <span className="truncate" title={sub || undefined}>
                {sub || 'No industry on file'}
              </span>
            </p>
          </div>
          {stage && (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-semibold leading-none ${stageTint(company.stage)}`}
            >
              {stage}
            </span>
          )}
        </header>

        {/*
          ── last round ──────────────────────────────────────────────────────
          The three facts that decide whether a company is worth a conversation:
          which round, how much, and how long ago. Given a dedicated panel
          rather than chips so the eye lands on it, and so the row is legible
          even when one of the three is missing.
        */}
        <div className="rounded-[12px] border border-[#ECECE6] bg-[#FAFAF6] px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#9C9C95]">
              Last round
            </span>
            {fresh && (
              <span className="shrink-0 rounded-full bg-[#E9F0EC] px-1.5 py-0.5 text-[10px] font-semibold text-[#1F4D3A]">
                Fresh capital
              </span>
            )}
          </div>
          {hasFunding ? (
            <div className="mt-1.5 flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-serif text-[19px] leading-none tracking-[-0.01em] text-[#161613]">
                {amount ?? '—'}
              </span>
              {round && (
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#6E6E68]" title={company.last_funding_type ?? undefined}>
                  {round}
                </span>
              )}
              {when && <span className="shrink-0 text-[12px] text-[#9C9C95]">{when}</span>}
            </div>
          ) : (
            <p className="mt-1.5 text-[13px] text-[#9C9C95]">No funding on record</p>
          )}
        </div>

        {/* ── body ───────────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-2.5">
          {company.description && (
            <p className="line-clamp-2 text-[13px] leading-[1.5] text-[#6E6E68]">
              {company.description}
            </p>
          )}
          {(investors.length > 0 || company.employee_count) && (
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {company.employee_count && (
                <span className={CHIP}>
                  <span className="truncate">{employeeLabel(company.employee_count)}</span>
                </span>
              )}
              {investors.map((inv, i) => (
                <span key={i} className={CHIP} title={inv}>
                  <span className="truncate">{inv}</span>
                </span>
              ))}
              {moreInvestors > 0 && (
                <span className="self-center text-[11.5px] text-[#9C9C95]">+{moreInvestors}</span>
              )}
            </div>
          )}
        </div>

        {/* ── footer ─────────────────────────────────────────────────────── */}
        <footer className="flex min-w-0 items-center justify-between gap-3 border-t border-[#ECECE6] pt-3 text-[12px]">
          {company.jobCount ? (
            <span className="flex items-center gap-1.5 font-medium text-[#1F4D3A]">
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              {company.jobCount} open {company.jobCount === 1 ? 'role' : 'roles'}
            </span>
          ) : (
            <span className="text-[#9C9C95]">No open roles</span>
          )}
          {!company.isFromDatabase && (
            <span className="shrink-0 text-[#9C9C95]">From jobs</span>
          )}
        </footer>
      </article>
    </Link>
  )
}

export const CompanyCard = memo(CompanyCardComponent)
