import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, FileText, Lock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, CHIP, FOCUS } from '@/lib/candidate-ui'
import { formatFundingDate, formatMoney, stageLabel, stageTint, usableLogo, investorList } from '@/lib/company-ui'
import { normalizeBrief } from '@/lib/brief'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  PRIORITY_ORDER,
  relationshipMeta,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
} from '@/lib/partners'
import { BriefDocument } from '@/components/partners/brief-document'
import { ManageCompany } from '@/components/partners/manage-company'
import { RequestAccess } from '@/components/partners/request-access'
import { RoleCard } from '@/components/partners/role-card'

export const dynamic = 'force-dynamic'

export default async function PartnerCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')

  const { companyId } = await params
  const adminClient = createAdminClient()

  const { data: row } = await adminClient
    .from('partner_companies_v')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!row) notFound()
  const companyRow = row as PartnerCompanyRow

  // An unpublished client is an admin's working draft, so it 404s for everyone
  // else rather than confirming it exists.
  if (!access.canManage && (!companyRow.is_published || !companyRow.is_active)) notFound()

  const company = toCompanyView(companyRow, access)

  const [{ data: roleRows }, { data: mySubs }, { data: briefRow }] = await Promise.all([
    adminClient
      .from('partner_roles_v')
      .select('*')
      .eq('company_id', companyId)
      .order('added_at', { ascending: false }),
    adminClient
      .from('role_submissions')
      .select('job_id, status, submitted_by_user_id')
      .eq('company_id', companyId),
    company.unlocked && companyRow.company_brief_id
      ? adminClient
          .from('partner_briefs')
          .select('id, title, status, content, updated_at, version')
          .eq('id', companyRow.company_brief_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const allRoles = (roleRows ?? []) as PartnerRoleRow[]
  // Urgent first, then priority, then newest. Sorted here rather than in the
  // query because ordering the text column would give alphabetical order —
  // high, normal, urgent — which is exactly wrong.
  const liveRoles = allRoles
    .filter(r => r.is_live && r.job_status === 'open')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  const closedRoles = allRoles.filter(r => !r.is_live || r.job_status !== 'open')

  const mineByJob = new Map<string, number>()
  for (const s of mySubs ?? []) {
    if (s.submitted_by_user_id !== access.appUser.id) continue
    mineByJob.set(s.job_id as string, (mineByJob.get(s.job_id as string) ?? 0) + 1)
  }

  // A draft brief is only legible to the person writing it. Showing a scout a
  // half-written brief is worse than showing them none.
  const brief =
    briefRow && (briefRow.status === 'published' || access.canManage)
      ? { ...briefRow, content: normalizeBrief(briefRow.content) }
      : null

  const logo = company.unlocked ? usableLogo(company.logoUrl) : null
  const relationship = relationshipMeta(company.relationship)
  const funding = formatMoney(company.lastFundingAmountUsd)
  const investors = investorList(company.topInvestors, 3)

  const signals = [
    company.location,
    company.employeeCount,
    funding ? `${funding} ${company.lastFundingType ?? 'raised'}` : null,
    formatFundingDate(company.lastFundingDate),
    company.industry,
  ].filter(Boolean) as string[]

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <Link
        href="/partners"
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Partners
      </Link>

      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt=""
              className="h-14 w-14 shrink-0 rounded-[14px] border border-[#ECECE6] object-contain p-1.5"
            />
          ) : null}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${relationship.chip}`}
              >
                {relationship.label}
              </span>
              {stageLabel(company.stage) && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${stageTint(company.stage)}`}
                >
                  {stageLabel(company.stage)}
                </span>
              )}
              {access.canManage && !company.admin?.isPublished && (
                <span className="rounded-full bg-[#F0F0EA] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#6E6E68]">
                  Unpublished
                </span>
              )}
            </div>
            <h1 className="mt-2 font-serif text-[28px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[34px]">
              {company.name}
            </h1>
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-1.5 inline-flex items-center gap-1 text-[13.5px] text-[#6E6E68] transition-colors hover:text-[#1F4D3A] ${FOCUS}`}
              >
                {company.website.replace(/^https?:\/\/(www\.)?/, '')}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>

        {access.canManage && company.admin && (
          <div className="shrink-0">
            <ManageCompany
              companyId={company.companyId}
              companyName={company.name}
              initial={{
                isPublished: company.admin.isPublished,
                isActive: company.admin.isActive,
                anonAlias: company.admin.anonAlias,
                publicBlurb: company.admin.publicBlurb,
              }}
              assignedUserIds={company.assignedUserIds}
              hasBrief={company.hasBrief}
              briefId={companyRow.company_brief_id}
              briefStatus={companyRow.company_brief_status}
            />
          </div>
        )}
      </header>

      {company.blurb && (
        <p className="max-w-3xl text-[15px] leading-relaxed text-[#6E6E68]">{company.blurb}</p>
      )}

      {!!signals.length && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map(signal => (
            <span key={signal} className={CHIP}>
              <span className="truncate">{signal}</span>
            </span>
          ))}
          {investors.shown.map(name => (
            <span key={name} className={CHIP}>
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      )}

      {!company.unlocked && (
        <section className={`flex flex-col gap-3 p-5 ${CARD}`}>
          <div className="flex items-start gap-2.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#9C9C95]" aria-hidden />
            <div>
              <h2 className="text-[15px] font-semibold text-[#161613]">
                You are not assigned to this client
              </h2>
              <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-[#6E6E68]">
                The searches below are real and live — you can see what they are and what they pay.
                The company’s name, its scout brief and submitting candidates all open up once
                Refery puts you on it.
              </p>
            </div>
          </div>
          <RequestAccess
            companyId={company.companyId}
            companyLabel={company.name}
            pending={company.requestPending}
          />
        </section>
      )}

      {company.unlocked && company.admin && (company.admin.convoStage || company.admin.nextStep) && (
        <section className={`p-5 ${CARD}`}>
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#6E6E68]">
            Where we are with them
          </h2>
          {company.admin.convoStage && (
            <p className="mt-2 text-[14px] leading-relaxed text-[#161613]">
              {company.admin.convoStage}
            </p>
          )}
          {company.admin.nextStep && (
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-[#6E6E68]">
              <span className="font-semibold text-[#1F4D3A]">Next: </span>
              {company.admin.nextStep}
            </p>
          )}
          {company.admin.channel && (
            <p className="mt-2 text-[12.5px] text-[#9C9C95]">{company.admin.channel}</p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-[22px] font-normal text-[#161613]">
            Live searches
            <span className="ml-2 text-[15px] text-[#9C9C95]">{liveRoles.length}</span>
          </h2>
          {brief && (
            <Link
              href={`/partners/${company.companyId}/brief`}
              className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#1F4D3A] transition-colors hover:text-[#173D2E] ${FOCUS}`}
            >
              <FileText className="h-3.5 w-3.5" />
              Read the full brief
            </Link>
          )}
        </div>

        {liveRoles.length === 0 ? (
          <p className="rounded-[18px] border border-dashed border-[#D8D8D0] bg-[#FAFAF6] px-5 py-8 text-center text-[14px] text-[#6E6E68]">
            {access.canManage
              ? 'No roles are on the desk for this client yet. Open Manage → Roles and tick the ones we have a mandate on.'
              : 'Nothing is live for this client at the moment.'}
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {liveRoles.map(role => (
              <RoleCard
                key={role.job_id}
                role={role}
                companyId={company.companyId}
                mySubmissions={mineByJob.get(role.job_id) ?? 0}
              />
            ))}
          </div>
        )}

        {!!closedRoles.length && (
          <details className="group">
            <summary
              className={`inline-flex cursor-pointer list-none items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
            >
              {closedRoles.length} closed {closedRoles.length === 1 ? 'search' : 'searches'}
              <span aria-hidden className="text-[#B8B8B0] group-open:hidden">
                show
              </span>
              <span aria-hidden className="hidden text-[#B8B8B0] group-open:inline">
                hide
              </span>
            </summary>
            <ul className="mt-3 divide-y divide-[#ECECE6] rounded-[14px] border border-[#ECECE6] bg-white">
              {closedRoles.map(role => (
                <li key={role.job_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1 truncate text-[14px] text-[#6E6E68]">
                    {role.title}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-[#9C9C95]">
                    {role.submission_count > 0 && `${role.submission_count} submitted · `}
                    {!role.is_live ? 'off the desk' : role.job_status}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {brief && (
        <section className={`overflow-hidden p-5 sm:p-7 ${CARD}`}>
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2 border-b border-[#ECECE6] pb-4">
            <h2 className="font-serif text-[22px] font-normal text-[#161613]">Scout brief</h2>
            <p className="text-[12.5px] text-[#9C9C95]">
              {brief.status === 'published' ? 'Published' : 'Draft — visible to admins only'} · v
              {brief.version}
            </p>
          </div>
          <BriefDocument content={brief.content} variant="embedded" />
        </section>
      )}
    </div>
  )
}
