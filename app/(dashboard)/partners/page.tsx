import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { FOCUS, H1, LEDE, META, detailLine } from '@/lib/desk-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  DEFAULT_FEE_PERCENTAGE,
  DEFAULT_SCOUT_SHARE,
  payoutBandOf,
  resolveFee,
} from '@/lib/fees'
import { parseDeskQuery, type DeskSearch } from '@/lib/desk-filters'
import {
  submissionStatus,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
} from '@/lib/partners'
import { PartnerCompanyCard, type CompanyCardRole } from '@/components/partners/company-card'
import { RequestAccess } from '@/components/partners/request-access'
import { DeskPalette, type PaletteTarget } from '@/components/partners/desk-palette'
import { DeskTabs, type DeskView } from '@/components/partners/desk-tabs'
import { SearchesView } from '@/components/partners/searches-view'
import { ViewSwitch, type DeskViewKind } from '@/components/partners/view-switch'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function PartnersPage({ searchParams }: PageProps) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  // The desk is super-admin-only while it is being built — see DESK_SUPER_ADMIN_ONLY.
  if (!access.canUseDesk) notFound()

  const sp = await searchParams
  const view: DeskViewKind = one(sp.view) === 'clients' ? 'clients' : 'searches'
  const requestedClientTab = one(sp.tab) as DeskView
  const clientTab: DeskView = ['all', 'mine', 'setup'].includes(requestedClientTab)
    ? requestedClientTab
    : 'all'

  const adminClient = createAdminClient()

  /*
    Everyone sees the same set of relationships; what differs is how much of each
    one is legible. So the query is not filtered by assignment — the redaction
    happens in toCompanyView. Admins additionally see unpublished rows, which is
    where a relationship sits before anyone has decided the network should know
    about it.
  */
  let companyQuery = adminClient
    .from('partner_companies_v')
    .select('*')
    .order('live_roles', { ascending: false })
    .order('added_at', { ascending: false })

  if (!access.canManage) {
    companyQuery = companyQuery.eq('is_published', true).eq('is_active', true)
  }

  const { data: companyRows } = await companyQuery
  const companies = (companyRows ?? []) as PartnerCompanyRow[]
  const companyIds = companies.map(c => c.company_id)

  const [{ data: roleRows }, { data: submissionRows }, { data: requestRows }, { data: matchRows }] =
    await Promise.all([
      companyIds.length
        ? adminClient.from('partner_roles_v').select('*').in('company_id', companyIds).eq('is_live', true).eq('job_status', 'open')
        : Promise.resolve({ data: [] }),
      adminClient
        .from('role_submissions')
        .select('company_id, job_id, status, submitted_by_user_id')
        .then(res =>
          access.seesAllSubmissions
            ? res
            : {
                ...res,
                data: (res.data ?? []).filter(r => r.submitted_by_user_id === access.appUser.id),
              },
        ),
      access.canManage
        ? adminClient.from('company_access_requests').select('id').eq('status', 'pending')
        : Promise.resolve({ data: [] }),
      // This viewer's own matched candidates per role — what powers both the
      // "I already have someone" filter and the count on each row.
      adminClient
        .from('partner_role_match_counts')
        .select('job_id, match_count')
        .eq('owner_user_id', access.appUser.id),
    ])

  const roles = (roleRows ?? []) as PartnerRoleRow[]
  const submissions = submissionRows ?? []
  const views = companies.map(row => toCompanyView(row, access))
  const viewByCompany = new Map(views.map(v => [v.companyId, v]))
  const matchesByJob = new Map(
    (matchRows ?? []).map(r => [r.job_id as string, r.match_count as number]),
  )

  const mineByCompany = new Map<string, number>()
  const mineByJob = new Map<string, number>()
  for (const s of submissions) {
    if (s.submitted_by_user_id !== access.appUser.id) continue
    mineByCompany.set(s.company_id as string, (mineByCompany.get(s.company_id as string) ?? 0) + 1)
    mineByJob.set(s.job_id as string, (mineByJob.get(s.job_id as string) ?? 0) + 1)
  }

  /*
    The flat searches list. Redaction happens here, once: a role at a client this
    viewer is not assigned to still shows its title, market, payout and
    competition — everything they need to decide whether to ask for access — under
    the client's alias rather than its name.
  */
  const deskSearches: DeskSearch[] = roles.flatMap(role => {
    const company = viewByCompany.get(role.company_id)
    if (!company) return []
    const fee = resolveFee(role)
    return [
      {
        jobId: role.job_id,
        companyId: role.company_id,
        // toCompanyView has already swapped in the alias where it must.
        companyName: company.name,
        unlocked: company.unlocked,
        title: role.title,
        headline: role.headline,
        department: role.department,
        location: role.location,
        locationBuckets: (role as PartnerRoleRow & { location_buckets?: string[] }).location_buckets ?? [],
        remotePolicy: role.remote_policy,
        seniority: role.seniority,
        priority: role.priority,
        exclusive: role.exclusivity === 'exclusive',
        fee,
        payoutBand: payoutBandOf(fee),
        slotsLeft: role.submission_cap
          ? Math.max(0, role.submission_cap - role.live_submission_count)
          : null,
        submissionCap: role.submission_cap,
        liveSubmissions: role.live_submission_count,
        myMatches: matchesByJob.get(role.job_id) ?? 0,
        mySubmissions: mineByJob.get(role.job_id) ?? 0,
        briefPublished: role.brief_status === 'published',
        addedAt: role.added_at,
      },
    ]
  })

  const rolesByCompany = new Map<string, CompanyCardRole[]>()
  for (const role of roles) {
    const list = rolesByCompany.get(role.company_id) ?? []
    list.push({
      jobId: role.job_id,
      title: role.title,
      location: role.location,
      priority: role.priority,
      scoutPayout: resolveFee(role).payoutLow,
    })
    rolesByCompany.set(role.company_id, list)
  }

  const pendingRequests = (requestRows ?? []).length

  const inSecondTab = (company: (typeof views)[number]) =>
    access.canManage ? company.liveRoles > 0 : company.unlocked
  const needsSetup = (company: (typeof views)[number]) =>
    !company.admin?.isPublished || company.liveRoles === 0 || !company.briefPublished

  const visibleClients = views.filter(company => {
    if (clientTab === 'mine') return inSecondTab(company)
    if (clientTab === 'setup') return needsSetup(company)
    return true
  })
  const clientCounts = {
    all: views.length,
    mine: views.filter(inSecondTab).length,
    setup: views.filter(needsSetup).length,
  }

  const paletteTargets: PaletteTarget[] = [
    ...views.map(company => ({
      kind: 'company' as const,
      id: company.companyId,
      href: `/partners/${company.companyId}`,
      label: company.name,
      detail: company.liveRoles ? `${company.liveRoles} live` : null,
      locked: !company.unlocked,
    })),
    ...deskSearches.map(search => ({
      kind: 'role' as const,
      id: search.jobId,
      href: `/partners/${search.companyId}/roles/${search.jobId}`,
      label: search.title,
      detail: search.companyName,
    })),
  ]

  const inPlay = submissions.filter(s => submissionStatus(s.status as string).category === 'in_progress').length
  const placed = submissions.filter(s => s.status === 'placed').length
  const summary = detailLine(
    `${views.length} ${views.length === 1 ? 'client' : 'clients'}`,
    `${deskSearches.length} live ${deskSearches.length === 1 ? 'search' : 'searches'}`,
    inPlay > 0
      ? `${inPlay} ${access.seesAllSubmissions ? 'in play' : 'of yours in play'}`
      : 'nothing in play yet',
    placed > 0 && `${placed} placed`,
  )

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className={H1}>Partners</h1>
          <p className={`mt-2 max-w-2xl ${LEDE}`}>
            Every search here is a real mandate — we are retained, and a person reads what you
            submit. Refery charges the client {DEFAULT_FEE_PERCENTAGE}% of first-year base and pays
            you {DEFAULT_SCOUT_SHARE}% of that, unless a search says otherwise.
          </p>
          <p className={`mt-2.5 ${META}`}>{summary}</p>
        </div>
        <div className="shrink-0">
          <DeskPalette targets={paletteTargets} hasRequests={pendingRequests > 0} />
        </div>
      </header>

      {access.canManage && pendingRequests > 0 && (
        <Link
          href="/partners/requests"
          className={`flex items-center gap-2.5 rounded-[14px] bg-[#F7F0DE] px-4 py-3 text-[13.5px] font-medium text-[#7E621C] transition-colors hover:bg-[#F2E8CD] ${FOCUS}`}
        >
          <Inbox className="h-4 w-4 shrink-0" />
          {pendingRequests} scout {pendingRequests === 1 ? 'is' : 'are'} asking to be put on a client
          <span className="ml-auto shrink-0 text-[12.5px] font-semibold">Review →</span>
        </Link>
      )}

      <div className="border-b border-[#E7E7E0]">
        <ViewSwitch view={view} searchCount={deskSearches.length} clientCount={views.length} />
      </div>

      {view === 'searches' ? (
        <SearchesView searches={deskSearches} initialQuery={parseDeskQuery(sp)} />
      ) : (
        <div className="space-y-5">
          <DeskTabs view={clientTab} counts={clientCounts} canManage={access.canManage} />

          {visibleClients.length === 0 ? (
            <p className={`px-5 py-12 text-center ${LEDE}`}>
              {clientTab === 'mine'
                ? 'You are not assigned to a client yet. Request access on any card and Refery will brief you.'
                : clientTab === 'setup'
                  ? 'Every published client has live searches and a published brief. Nothing to set up.'
                  : 'No partner companies are published yet.'}
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {visibleClients.map(company => (
                <PartnerCompanyCard
                  key={company.companyId}
                  company={company}
                  roles={rolesByCompany.get(company.companyId) ?? []}
                  mySubmissions={mineByCompany.get(company.companyId) ?? 0}
                  requestAccess={
                    <RequestAccess
                      companyId={company.companyId}
                      companyLabel={company.name}
                      pending={company.requestPending}
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
