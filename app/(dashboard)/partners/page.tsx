import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Inbox, MessageCircle, UserPlus } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { BTN_QUIET, CARD, FOCUS, H1, H2, LEDE, META, detailLine } from '@/lib/desk-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { DEFAULT_FEE_PERCENTAGE, DEFAULT_SCOUT_SHARE } from '@/lib/fees'
import {
  PRIORITY_ORDER,
  submissionStatus,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerCompanyView,
  type PartnerRoleRow,
} from '@/lib/partners'
import { PartnerCompanyCard, type CompanyCardRole } from '@/components/partners/company-card'
import { RequestAccess } from '@/components/partners/request-access'
import { DeskPalette, type PaletteTarget } from '@/components/partners/desk-palette'
import { ViewAs } from '@/components/partners/view-as'
import {
  ClientGroupHeader,
  IntroduceCompany,
  NeedsYou,
  Numbers,
  OnRequestRow,
  ProposedCard,
  ThisWeek,
  WorkingRow,
  type MineOnRole,
  type NeedsYouItem,
  type WeekItem,
} from '@/components/partners/home-sections'
import { resolveFee } from '@/lib/fees'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Searches: the partner's home.
 *
 * Three questions, in the order a partner asks them on a Sunday evening: what
 * needs me, what am I on, what else is out there. Proposals sit first because
 * they are waiting on the viewer; working searches are grouped by client so a
 * partner on three Augustus seats reads the client once; everything else is
 * anonymised and one click from a request. The rail carries their own week.
 *
 * Every count on the page is about the viewer's own work. Other partners'
 * candidates never appear, not even as a number; the stage strip says how far
 * a search has got instead.
 */
export default async function PartnersPage({ searchParams }: PageProps) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  // The desk is super-admin-only while it is being built — see DESK_SUPER_ADMIN_ONLY.
  if (!access.canUseDesk) notFound()

  const sp = await searchParams
  const clientsView = access.canManage && one(sp.view) === 'clients'

  const adminClient = createAdminClient()

  let companyQuery = adminClient
    .from('partner_companies_v')
    .select('*')
    .order('live_roles', { ascending: false })
    .order('added_at', { ascending: false })
  if (!access.canManage) companyQuery = companyQuery.eq('is_published', true).eq('is_active', true)

  const { data: companyRows } = await companyQuery
  const companies = (companyRows ?? []) as PartnerCompanyRow[]
  const companyIds = companies.map(c => c.company_id)
  const since = new Date(Date.now() - 7 * DAY_MS).toISOString()

  const [{ data: roleRows }, { data: submissionRows }, { data: requestRows }, { data: matchRows }, claimsRes] =
    await Promise.all([
      companyIds.length
        ? adminClient.from('partner_roles_v').select('*').in('company_id', companyIds).eq('is_live', true).eq('job_status', 'open')
        : Promise.resolve({ data: [] }),
      adminClient
        .from('role_submissions_v')
        .select('id, company_id, job_id, status, submitted_by_user_id, candidate_name, job_title, company_name, updated_at, work_authorization, hm_rating, hm_note, decline_reason, review_note')
        .then(res =>
          access.seesAllSubmissions
            ? res
            : { ...res, data: (res.data ?? []).filter(r => r.submitted_by_user_id === access.appUser.id) },
        ),
      access.canManage
        ? adminClient.from('company_access_requests').select('id').eq('status', 'pending')
        : Promise.resolve({ data: [] }),
      adminClient.from('partner_role_match_counts').select('job_id, match_count').eq('owner_user_id', access.appUser.id),
      access.seesAllSubmissions
        ? adminClient.from('submission_claims').select('id', { count: 'exact', head: true }).eq('status', 'active')
        : adminClient.from('submission_claims').select('id', { count: 'exact', head: true }).eq('status', 'active').eq('holder_user_id', access.appUser.id),
    ])

  const roles = ((roleRows ?? []) as PartnerRoleRow[]).sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title),
  )
  const submissions = submissionRows ?? []
  const views = companies.map(row => toCompanyView(row, access))
  const viewByCompany = new Map(views.map(v => [v.companyId, v]))
  const matchesByJob = new Map((matchRows ?? []).map(r => [r.job_id as string, r.match_count as number]))
  const protectedCount = claimsRes.count ?? 0

  // Recent movement on the viewer's submissions, for the rail.
  const submissionIds = submissions.map(s => s.id as string)
  const { data: eventRows } = submissionIds.length
    ? await adminClient
        .from('role_submission_events')
        .select('submission_id, to_status, note, created_at')
        .in('submission_id', submissionIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(12)
    : { data: [] }
  const submissionById = new Map(submissions.map(s => [s.id as string, s]))

  const mineByJob = new Map<string, MineOnRole>()
  for (const s of submissions) {
    const entry = mineByJob.get(s.job_id as string) ?? { byStatus: {}, matches: 0 }
    entry.byStatus[s.status as string] = (entry.byStatus[s.status as string] ?? 0) + 1
    mineByJob.set(s.job_id as string, entry)
  }
  for (const role of roles) {
    const entry = mineByJob.get(role.job_id) ?? { byStatus: {}, matches: 0 }
    entry.matches = matchesByJob.get(role.job_id) ?? 0
    mineByJob.set(role.job_id, entry)
  }

  /*
    Three buckets. An admin works everything. A partner is on a search when
    Refery proposed it (waiting on them) or they confirmed it, or when a legacy
    company-level grant covers the client. Everything else is on request.
  */
  const proposed: PartnerRoleRow[] = []
  const working: PartnerRoleRow[] = []
  const onRequest: PartnerRoleRow[] = []
  for (const role of roles) {
    const a = access.assignmentByJob.get(role.job_id)
    if (access.canManage) working.push(role)
    else if (a?.status === 'proposed') proposed.push(role)
    else if (a?.status === 'working' || (!a && access.assignedCompanyIds.has(role.company_id))) working.push(role)
    else if (!a || a.status === 'declined' || a.status === 'paused') onRequest.push(role)
  }

  const workingByCompany = new Map<string, PartnerRoleRow[]>()
  for (const role of working) {
    const list = workingByCompany.get(role.company_id) ?? []
    list.push(role)
    workingByCompany.set(role.company_id, list)
  }
  const liveByCompany = new Map<string, number>()
  for (const role of roles) liveByCompany.set(role.company_id, (liveByCompany.get(role.company_id) ?? 0) + 1)
  const workingGroups = [...workingByCompany.entries()]
    .map(([companyId, list]) => ({ company: viewByCompany.get(companyId), list }))
    .filter((g): g is { company: PartnerCompanyView; list: PartnerRoleRow[] } => Boolean(g.company))
    .sort((a, b) => {
      const urgency = (l: PartnerRoleRow[]) => Math.min(...l.map(r => PRIORITY_ORDER[r.priority]))
      return urgency(a.list) - urgency(b.list) || b.list.length - a.list.length || a.company.name.localeCompare(b.company.name)
    })

  // Needs you.
  const needsYou: NeedsYouItem[] = []
  if (proposed.length) {
    needsYou.push({
      text: `${proposed.length} ${proposed.length === 1 ? 'search is' : 'searches are'} proposed to you. Confirm the ones you will work.`,
      href: '#proposed',
      action: 'Review',
      tone: 'amber',
    })
  }
  const missingAuth = submissions.filter(
    s => !s.work_authorization && ['submitted', 'shortlisted', 'sent_to_client'].includes(s.status as string),
  )
  if (missingAuth.length) {
    const first = missingAuth[0]
    needsYou.push({
      text:
        missingAuth.length === 1
          ? `${first.candidate_name} is missing work authorisation. ${first.company_name} will ask.`
          : `${missingAuth.length} of your submissions are missing work authorisation. Clients ask on the first read.`,
      href: `/partners/${first.company_id}/roles/${first.job_id}`,
      action: 'Add',
      tone: 'amber',
    })
  }
  const freshReads = submissions.filter(s => s.hm_rating && s.updated_at && s.updated_at >= since)
  if (freshReads.length) {
    const first = freshReads[0]
    const label = ['', 'strong no', 'no', 'yes', 'strong yes'][first.hm_rating as number] ?? ''
    needsYou.push({
      text: `New read from the hiring manager on ${first.candidate_name}${label ? `: ${label}` : ''}.`,
      href: `/partners/${first.company_id}/roles/${first.job_id}`,
      action: 'Read',
      tone: 'green',
    })
  }
  if (access.canManage && (requestRows ?? []).length) {
    needsYou.push({
      text: `${requestRows!.length} ${requestRows!.length === 1 ? 'partner is' : 'partners are'} asking to be put on a client.`,
      href: '/partners/requests',
      action: 'Review',
      tone: 'amber',
    })
  }

  // This week.
  const week: WeekItem[] = (eventRows ?? []).flatMap(e => {
    const s = submissionById.get(e.submission_id as string)
    if (!s) return []
    const meta = submissionStatus(e.to_status as string)
    const where = `${s.job_title} at ${s.company_name}`
    const text =
      e.to_status === 'declined'
        ? `is not moving forward at ${s.company_name}.${s.decline_reason ? ` Reason: ${s.decline_reason}` : ''}`
        : e.to_status === 'submitted'
          ? `submitted to ${where}.`
          : `${meta.label.toLowerCase()} · ${where}.${e.note ? ` ${e.note}` : ''}`
    return [{ lead: (s.candidate_name as string) ?? 'A candidate', text, at: e.created_at as string, tone: meta.dot }]
  })

  const inPlay = submissions.filter(s => submissionStatus(s.status as string).category === 'in_progress').length
  const interviewing = submissions.filter(s => s.status === 'client_interview').length
  const myCandidatesInPlay = inPlay

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
      label: role.headline || role.title,
      detail: viewByCompany.get(role.company_id)?.name ?? null,
    })),
  ]

  const summary = access.canManage
    ? detailLine(`${roles.length} live ${roles.length === 1 ? 'search' : 'searches'} at ${workingGroups.length} ${workingGroups.length === 1 ? 'client' : 'clients'}`, inPlay > 0 && `${inPlay} in play`)
    : detailLine(
        `${working.length} working${workingGroups.length ? ` at ${workingGroups.length} ${workingGroups.length === 1 ? 'client' : 'clients'}` : ''}`,
        proposed.length > 0 && `${proposed.length} proposed to you`,
        myCandidatesInPlay > 0 && `${myCandidatesInPlay} of your candidates in play`,
      )

  // ── the admin's client grid, kept behind ?view=clients ───────────────────
  if (clientsView) {
    const rolesByCompany = new Map<string, CompanyCardRole[]>()
    for (const role of roles) {
      const list = rolesByCompany.get(role.company_id) ?? []
      list.push({ jobId: role.job_id, title: role.headline || role.title, location: role.location, priority: role.priority, scoutPayout: resolveFee(role).payoutLow })
      rolesByCompany.set(role.company_id, list)
    }
    return (
      <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className={H1}>Clients</h1>
            <p className={`mt-2 ${META}`}>{views.length} clients · published and unpublished. Partners see only published ones, anonymised until they are on a search there.</p>
          </div>
          <Link href="/partners" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>Back to searches</Link>
        </header>
        <div className="grid gap-4 lg:grid-cols-2">
          {views.map(company => (
            <PartnerCompanyCard
              key={company.companyId}
              company={company}
              roles={rolesByCompany.get(company.companyId) ?? []}
              mySubmissions={submissions.filter(s => s.company_id === company.companyId).length}
              requestAccess={<RequestAccess companyId={company.companyId} companyLabel={company.name} pending={company.requestPending} />}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-7 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className={H1}>Searches</h1>
          <p className={`mt-2 ${LEDE}`}>
            The searches you are on, what moved this week, and what needs you. Every search is one role at a
            client we are retained by, with a brief behind it and a person reading what you submit. Refery
            charges the client {DEFAULT_FEE_PERCENTAGE}% of first-year base and pays you {DEFAULT_SCOUT_SHARE}% of
            that, unless a search says otherwise.
          </p>
          <p className={`mt-2.5 ${META}`}>{summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          {access.canManage ? (
            <>
              {access.realUser.isSuperAdmin && !access.preview && <ViewAs />}
              <Link href="/partners?view=clients" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                Clients
              </Link>
            </>
          ) : (
            <>
              <Link href="/candidates/new" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                <UserPlus className="h-4 w-4" />
                Add a candidate
              </Link>
              <a href="mailto:lily@refery.io?subject=Refery%20question" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                <MessageCircle className="h-4 w-4" />
                Ask Refery
              </a>
            </>
          )}
          <DeskPalette targets={paletteTargets} hasRequests={(requestRows ?? []).length > 0} />
        </div>
      </header>

      <NeedsYou items={needsYou} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-9">
          {proposed.length > 0 && (
            <section id="proposed" className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={H2}>Proposed to you</h2>
                <p className={META}>We put you on a search when your bench fits it. Say yes only where you have real supply.</p>
              </div>
              {proposed.map(role => (
                <ProposedCard
                  key={role.job_id}
                  role={role}
                  company={viewByCompany.get(role.company_id)}
                  assignment={access.assignmentByJob.get(role.job_id)!}
                  myMatches={matchesByJob.get(role.job_id) ?? 0}
                />
              ))}
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className={H2}>
                {access.canManage ? 'Live searches' : 'Working'}
                <span className="ml-2 text-[15px] font-medium text-[#9C9C95]">{working.length}</span>
              </h2>
              {!access.canManage && working.length > 0 && <p className={META}>Grouped by client. The brief is shared; the searches are yours one by one.</p>}
            </div>
            {workingGroups.length === 0 ? (
              <p className={`px-5 py-10 text-center ${LEDE}`}>
                {access.canManage
                  ? 'No live searches yet. Publish a client and pick its roles from the client setup panel.'
                  : 'You are not on a search yet. When Refery proposes one it appears above; anything open to you on request is below.'}
              </p>
            ) : (
              workingGroups.map(({ company, list }) => (
                <div key={company.companyId} className="space-y-2.5">
                  <ClientGroupHeader
                    company={company}
                    onCount={list.length}
                    totalCount={liveByCompany.get(company.companyId) ?? list.length}
                    canManage={access.canManage}
                  />
                  {list.map(role => (
                    <WorkingRow key={role.job_id} role={role} mine={mineByJob.get(role.job_id) ?? { byStatus: {}, matches: 0 }} isAdmin={access.canManage} />
                  ))}
                </div>
              ))
            )}
          </section>

          {onRequest.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={H2}>
                  Open to you, on request
                  <span className="ml-2 text-[15px] font-medium text-[#9C9C95]">{onRequest.length}</span>
                </h2>
                <p className={META}>Client name and brief unlock once you are on any search there.</p>
              </div>
              <div className={`divide-y divide-[#E4E3DC] ${CARD}`}>
                {onRequest.map(role => {
                  const company = viewByCompany.get(role.company_id)
                  return (
                    <OnRequestRow
                      key={role.job_id}
                      role={role}
                      companyLabel={company?.name ?? 'Confidential client'}
                      requestAccess={
                        <RequestAccess
                          companyId={role.company_id}
                          companyLabel={`${role.headline || role.title}`}
                          pending={company?.requestPending ?? false}
                        />
                      }
                    />
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <ThisWeek items={week} />
          <Numbers inPlay={inPlay} interviewing={interviewing} protectedCount={protectedCount} isAdmin={access.canManage} />
          {!access.canManage && <IntroduceCompany />}
          {access.canManage && (requestRows ?? []).length > 0 && (
            <Link href="/partners/requests" className={`flex items-center gap-2.5 rounded-[14px] bg-[#F5EEDD] px-4 py-3 text-[13.5px] font-medium text-[#8A6A1F] ${FOCUS}`}>
              <Inbox className="h-4 w-4" />
              {requestRows!.length} access {requestRows!.length === 1 ? 'request' : 'requests'} waiting
            </Link>
          )}
        </aside>
      </div>
    </div>
  )
}
