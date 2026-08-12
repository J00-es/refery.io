import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink, FileText, Lock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import {
  BODY,
  CARD,
  CARD_LINK,
  FOCUS,
  FOREST,
  H1,
  H2,
  LEDE,
  META,
  MUTED,
  RULE,
  detailLine,
} from '@/lib/desk-ui'
import { formatFundingDate, formatMoney, stageLabel, investorList } from '@/lib/company-ui'
import { normalizeBrief } from '@/lib/brief'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  PRIORITY_ORDER,
  relationshipMeta,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
} from '@/lib/partners'
import { CompanyLogo } from '@/components/partners/company-logo'
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
  // The desk is super-admin-only while it is being built — see DESK_SUPER_ADMIN_ONLY.
  if (!access.canUseDesk) notFound()

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

  const relationship = relationshipMeta(company.relationship)
  const funding = formatMoney(company.lastFundingAmountUsd)
  const investors = investorList(company.topInvestors, 3)

  const signals = detailLine(
    company.location,
    company.employeeCount,
    funding ? `${funding} ${company.lastFundingType ?? 'raised'}` : null,
    formatFundingDate(company.lastFundingDate),
    company.industry,
    ...investors.shown,
  )

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <Link
        href="/partners"
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Partners
      </Link>

      <header>
        <div className="flex min-w-0 items-start gap-4">
          <CompanyLogo
            name={company.name}
            url={company.logoUrl}
            locked={!company.unlocked}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className={H1}>{company.name}</h1>
            {/* Relationship, stage and publish state as one grey line. They were
                three tinted pills above the title, which put decoration where the
                name belongs and spent three colours on categories. */}
            <p className={`mt-1.5 ${META}`}>
              {detailLine(
                relationship.label,
                stageLabel(company.stage),
                access.canManage && !company.admin?.isPublished ? 'unpublished' : null,
              )}
            </p>
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
      </header>

      {company.longBlurb && (
        <p className="max-w-3xl text-[15px] leading-relaxed text-[#6E6E68]">{company.longBlurb}</p>
      )}

      {/* The setup panel sits here rather than as a button in the header. Every
          control worked when it was tucked behind "Manage" and none of it was
          findable, so the four decisions and their current state are on the page
          itself. */}
      {access.canManage && company.admin && (
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
          liveRoles={liveRoles.length}
        />
      )}

      {/* Location, size, funding, industry and investors were eight identical
          pills. None of them is a status and none is actionable, so they read as
          one line of facts. */}
      {signals && <p className={META}>{signals}</p>}

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
        <section className={`border-l-2 pl-4 ${RULE}`}>
          <h2 className="text-[14px] font-semibold text-[#161613]">Where we are with them</h2>
          {company.admin.convoStage && (
            <p className={`mt-1.5 ${BODY}`}>{company.admin.convoStage}</p>
          )}
          {company.admin.nextStep && (
            <p className={`mt-2 ${LEDE}`}>
              <span className={`font-semibold ${FOREST}`}>Next: </span>
              {company.admin.nextStep}
            </p>
          )}
          {company.admin.channel && <p className={`mt-1.5 ${META}`}>{company.admin.channel}</p>}
        </section>
      )}

      {brief && (
        <Link href={`/partners/${company.companyId}/brief`} className={`flex items-start gap-3 p-4 ${CARD_LINK}`}>
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1F4D3A]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-semibold text-[#161613]">Scout brief</span>
            <span className={`mt-0.5 block ${META}`}>
              {detailLine(
                brief.status === 'published' ? 'Published' : 'Draft — admins only',
                `v${brief.version}`,
                'the bar, the logistics, the screening questions, what to say to a candidate',
              )}
            </span>
          </span>
        </Link>
      )}

      <section className="space-y-3">
        <h2 className={H2}>
          Live searches
          <span className={`ml-2 text-[15px] ${MUTED}`}>{liveRoles.length}</span>
        </h2>

        {liveRoles.length === 0 ? (
          <p className={`px-5 py-8 text-center ${LEDE}`}>
            {access.canManage
              ? 'No roles are on the desk for this client yet. Use “Pick roles” in the setup panel above and tick the ones we have a mandate on.'
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
            <ul className={`mt-3 divide-y border-t ${RULE}`}>
              {closedRoles.map(role => (
                <li key={role.job_id} className="flex items-center gap-3 py-3">
                  <span className={`min-w-0 flex-1 truncate text-[14px] ${MUTED}`}>{role.title}</span>
                  <span className={`shrink-0 ${META}`}>
                    {role.submission_count > 0 && `${role.submission_count} submitted · `}
                    {!role.is_live ? 'off the desk' : role.job_status}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

    </div>
  )
}
