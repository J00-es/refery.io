import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { FOCUS } from '@/lib/candidate-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
} from '@/lib/partners'
import { PartnerCompanyCard, type CompanyCardRole } from '@/components/partners/company-card'
import { RequestAccess } from '@/components/partners/request-access'
import { DeskStats } from '@/components/partners/desk-stats'
import { DeskTabs, type DeskView } from '@/components/partners/desk-tabs'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

export default async function PartnersPage({ searchParams }: PageProps) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')

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

  const visible = views.filter(company => {
    if (view === 'mine') return company.unlocked
    if (view === 'setup') {
      // The setup tab is the admin's to-do list: relationships that cannot yet
      // do anything for a scout.
      return !company.admin?.isPublished || company.liveRoles === 0 || !company.briefPublished
    }
    return true
  })

  const counts = {
    all: views.length,
    mine: views.filter(c => c.unlocked).length,
    setup: views.filter(
      c => !c.admin?.isPublished || c.liveRoles === 0 || !c.briefPublished,
    ).length,
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header>
        <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[36px]">
          Partners
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6E6E68] sm:text-[15px]">
          {access.canManage
            ? 'The companies we are retained by, and the exact roles we are working for them. Everything here was chosen by hand — the jobs board is the sourced watchlist.'
            : 'The companies Refery is retained by. Every role here is a real mandate: submit someone and a person reads it. Clients you are assigned to open in full.'}
        </p>
      </header>

      <DeskStats
        companies={views}
        roles={roles.length}
        submissions={submissions.map(s => ({ status: s.status as string }))}
        showsAllSubmissions={access.seesAllSubmissions}
      />

      {access.canManage && pendingRequests > 0 && (
        <Link
          href="/partners/requests"
          className={`flex items-center gap-2.5 rounded-[14px] border border-[#E4D9BC] bg-[#FBF6E9] px-4 py-3 text-[13.5px] font-medium text-[#8A6A1F] transition-colors hover:border-[#C79A2E] ${FOCUS}`}
        >
          <Inbox className="h-4 w-4 shrink-0" />
          {pendingRequests} scout {pendingRequests === 1 ? 'is' : 'are'} asking to be put on a client
          <span className="ml-auto shrink-0 text-[12.5px] font-semibold">Review →</span>
        </Link>
      )}

      <DeskTabs view={view} counts={counts} canManage={access.canManage} />

      {visible.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-[#D8D8D0] bg-[#FAFAF6] px-5 py-10 text-center text-[14px] text-[#6E6E68]">
          {view === 'mine'
            ? 'You are not assigned to a client yet. Request access on any card above and Refery will brief you.'
            : view === 'setup'
              ? 'Every published client has live roles and a published brief. Nothing to set up.'
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
