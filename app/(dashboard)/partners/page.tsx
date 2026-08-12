import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { FOCUS, H1, LEDE, META, detailLine } from '@/lib/desk-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
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
  const requested = one(sp.view) as DeskView
  const view: DeskView = ['all', 'mine', 'setup'].includes(requested) ? requested : 'all'

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

  /*
    Live mandates, and this viewer's own submissions. Both are small enough to
    fetch whole — twelve clients and a few dozen roles — so the grouping happens
    here rather than in four more round trips.
  */
  const [{ data: roleRows }, { data: submissionRows }, { data: requestRows }] = await Promise.all([
    companyIds.length
      ? adminClient
          .from('partner_roles_v')
          .select(
            'job_id, company_id, title, location, priority, scout_payout, is_live, job_status, submission_cap, live_submission_count',
          )
          .in('company_id', companyIds)
          .eq('is_live', true)
          .eq('job_status', 'open')
      : Promise.resolve({ data: [] }),
    adminClient
      .from('role_submissions')
      .select('company_id, status, submitted_by_user_id')
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
  ])

  const roles = (roleRows ?? []) as Pick<
    PartnerRoleRow,
    'job_id' | 'company_id' | 'title' | 'location' | 'priority' | 'scout_payout'
  >[]

  const rolesByCompany = new Map<string, CompanyCardRole[]>()
  for (const role of roles) {
    const list = rolesByCompany.get(role.company_id) ?? []
    list.push({
      jobId: role.job_id,
      title: role.title,
      location: role.location,
      priority: role.priority,
      scoutPayout: role.scout_payout,
    })
    rolesByCompany.set(role.company_id, list)
  }

  const submissions = submissionRows ?? []
  const mineByCompany = new Map<string, number>()
  for (const s of submissions) {
    if (s.submitted_by_user_id !== access.appUser.id) continue
    mineByCompany.set(s.company_id as string, (mineByCompany.get(s.company_id as string) ?? 0) + 1)
  }

  const views = companies.map(row => toCompanyView(row, access))
  const pendingRequests = (requestRows ?? []).length

  // An admin is assigned to nothing and sees everything, so "unlocked" is not a
  // filter that means anything to them; theirs narrows to the clients with a
  // live search. A scout's narrows to the clients they can act on today.
  const inSecondTab = (company: (typeof views)[number]) =>
    access.canManage ? company.liveRoles > 0 : company.unlocked

  // The setup tab is the admin's to-do list: relationships that cannot yet do
  // anything for a scout.
  const needsSetup = (company: (typeof views)[number]) =>
    !company.admin?.isPublished || company.liveRoles === 0 || !company.briefPublished

  const visible = views.filter(company => {
    if (view === 'mine') return inSecondTab(company)
    if (view === 'setup') return needsSetup(company)
    return true
  })

  const counts = {
    all: views.length,
    mine: views.filter(inSecondTab).length,
    setup: views.filter(needsSetup).length,
  }

  /*
    Everything the palette can jump to. Assembled from what this page already
    loaded, so ⌘K costs nothing extra and only ever offers what the viewer is
    allowed to reach.
  */
  const paletteTargets: PaletteTarget[] = [
    ...views.map(company => ({
      kind: 'company' as const,
      id: company.companyId,
      href: `/partners/${company.companyId}`,
      label: company.name,
      detail: company.liveRoles ? `${company.liveRoles} live` : null,
      locked: !company.unlocked,
    })),
    ...roles.map(role => ({
      kind: 'role' as const,
      id: role.job_id,
      href: `/partners/${role.company_id}/roles/${role.job_id}`,
      label: role.title,
      detail: views.find(v => v.companyId === role.company_id)?.name ?? null,
    })),
  ]

  /*
    A summary sentence rather than four tiles.

    The tiles read "0 submissions in play / 0 placed" on a desk that is just
    getting going — two of the four carried no information, which is exactly what
    a metric that has not earned its place looks like. One line states the same
    facts and admits the zeros in words.
  */
  const inPlay = submissions.filter(s => submissionStatus(s.status as string).category === 'in_progress')
    .length
  const placed = submissions.filter(s => s.status === 'placed').length
  const summary = detailLine(
    `${counts.all} ${counts.all === 1 ? 'client' : 'clients'}`,
    `${roles.length} live ${roles.length === 1 ? 'search' : 'searches'}`,
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
            {access.canManage
              ? 'The companies we are retained by, and the exact searches we are working for them. Everything here was chosen by hand — the jobs board is the sourced watchlist.'
              : 'The companies Refery is retained by. Every search here is a real mandate: submit someone and a person reads it. Clients you are assigned to open in full.'}
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

      <DeskTabs view={view} counts={counts} canManage={access.canManage} />

      {visible.length === 0 ? (
        <p className={`px-5 py-12 text-center ${LEDE}`}>
          {view === 'mine'
            ? 'You are not assigned to a client yet. Request access on any card and Refery will brief you.'
            : view === 'setup'
              ? 'Every published client has live searches and a published brief. Nothing to set up.'
              : 'No partner companies are published yet.'}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map(company => (
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
  )
}
