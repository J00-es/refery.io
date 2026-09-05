import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, CHIP, CHIP_BAD, CHIP_VALUE, CHIP_WARN, FIGURE, FOCUS, H1, H2, LABEL, LEDE, META, RULE } from '@/lib/desk-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { PRIORITY_ORDER, searchStageMeta, type PartnerRoleRow, type SearchAssignmentRow } from '@/lib/partners'

export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000
const QUIET_DAYS = 14

/**
 * Coverage across every live search. Admin only.
 *
 * The per-search coverage page answers "who is on this one". This page
 * answers the Sunday question before it: which searches have nobody working
 * them, which have partners who have gone quiet, and which are fine. Sorted so
 * the searches that need a proposal come first. Partners never see it.
 */
export default async function CoverageOverviewPage() {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  if (!access.canUseDesk || !access.canManage) notFound()

  const adminClient = createAdminClient()
  const { data: roleRows } = await adminClient
    .from('partner_roles_v')
    .select('*')
    .eq('is_live', true)
    .eq('job_status', 'open')
  const roles = ((roleRows ?? []) as PartnerRoleRow[]).sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title),
  )
  const jobIds = roles.map(r => r.job_id)

  const [{ data: assignmentRows }, { data: submissionRows }] = await Promise.all([
    jobIds.length
      ? adminClient.from('search_assignments').select('*').in('job_id', jobIds)
      : Promise.resolve({ data: [] }),
    jobIds.length
      ? adminClient.from('role_submissions').select('job_id, submitted_by_user_id, status, created_at').in('job_id', jobIds)
      : Promise.resolve({ data: [] }),
  ])
  const assignments = (assignmentRows ?? []) as SearchAssignmentRow[]
  const submissions = submissionRows ?? []
  const now = Date.now()

  // Last submission per (job, partner), for the silence test.
  const lastByJobUser = new Map<string, string>()
  for (const s of submissions) {
    const key = `${s.job_id}:${s.submitted_by_user_id}`
    const at = s.created_at as string
    if (!lastByJobUser.has(key) || at > (lastByJobUser.get(key) as string)) lastByJobUser.set(key, at)
  }

  const cards = roles.map(role => {
    const mine = assignments.filter(a => a.job_id === role.job_id)
    const working = mine.filter(a => a.status === 'working')
    const proposed = mine.filter(a => a.status === 'proposed')
    const declined = mine.filter(a => a.status === 'declined')
    const quiet = working.filter(a => {
      const anchor = lastByJobUser.get(`${role.job_id}:${a.user_id}`) ?? a.confirmed_at
      return anchor ? now - new Date(anchor).getTime() >= QUIET_DAYS * DAY_MS : false
    })
    const inPlay = submissions.filter(
      s => s.job_id === role.job_id && !['declined', 'withdrawn'].includes(s.status as string),
    ).length
    const need: 'nobody' | 'quiet' | 'fine' = working.length === 0 ? 'nobody' : quiet.length === working.length ? 'quiet' : 'fine'
    return { role, working: working.length, proposed: proposed.length, declined: declined.length, quiet: quiet.length, inPlay, need }
  })

  const order = { nobody: 0, quiet: 1, fine: 2 }
  cards.sort((a, b) => order[a.need] - order[b.need] || PRIORITY_ORDER[a.role.priority] - PRIORITY_ORDER[b.role.priority])

  const nobody = cards.filter(c => c.need === 'nobody').length
  const quietSearches = cards.filter(c => c.need === 'quiet').length
  const awaiting = cards.reduce((n, c) => n + c.proposed, 0)
  const partnersWorking = new Set(assignments.filter(a => a.status === 'working').map(a => a.user_id)).size

  const groups = new Map<string, typeof cards>()
  for (const c of cards) {
    const list = groups.get(c.role.company_id) ?? []
    list.push(c)
    groups.set(c.role.company_id, list)
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-7 px-1 pb-16 sm:px-0">
      <Link href="/searches" className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}>
        <ArrowLeft className="h-3.5 w-3.5" />
        Searches
      </Link>

      <header>
        <h1 className={H1}>Coverage</h1>
        <p className={`mt-2 max-w-2xl ${LEDE}`}>
          Every live search and who is working it. Searches with nobody on them come first, then the ones where
          everyone has gone quiet. Only you see this page.
        </p>
      </header>

      <dl className={`grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5 sm:grid-cols-4 ${RULE}`}>
        <div><dt className={`${FIGURE} ${nobody ? 'text-[#9C3F37]' : ''}`}>{nobody}</dt><dd className={`mt-1.5 ${LABEL}`}>{nobody === 1 ? 'search with nobody working it' : 'searches with nobody working them'}</dd></div>
        <div><dt className={`${FIGURE} ${quietSearches ? 'text-[#8A6A1F]' : ''}`}>{quietSearches}</dt><dd className={`mt-1.5 ${LABEL}`}>where everyone is silent {QUIET_DAYS}+ days</dd></div>
        <div><dt className={`${FIGURE} text-[#8A6A1F]`}>{awaiting}</dt><dd className={`mt-1.5 ${LABEL}`}>proposals awaiting a yes</dd></div>
        <div><dt className={FIGURE}>{partnersWorking}</dt><dd className={`mt-1.5 ${LABEL}`}>partners working at least one search</dd></div>
      </dl>

      {cards.length === 0 ? (
        <p className={`py-10 ${LEDE}`}>No live searches.</p>
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([companyId, list]) => (
            <section key={companyId} className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={H2}>
                  <Link href={`/searches/${companyId}`} className={`hover:underline underline-offset-4 ${FOCUS}`}>
                    {list[0].role.company_name}
                  </Link>
                  <span className="ml-2 text-[15px] font-medium text-[#9C9C95]">{list.length}</span>
                </h2>
              </div>
              <ul className={`divide-y divide-[#E4E3DC] ${CARD}`}>
                {list.map(c => {
                  const stage = searchStageMeta(c.role.search_stage)
                  const chip =
                    c.need === 'nobody'
                      ? { cls: CHIP_BAD, label: 'Nobody working it' }
                      : c.need === 'quiet'
                        ? { cls: CHIP_WARN, label: `All silent ${QUIET_DAYS}+ days` }
                        : { cls: CHIP_VALUE, label: 'Covered' }
                  return (
                    <li key={c.role.job_id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_170px_260px_auto] sm:items-center">
                      <div className="min-w-0">
                        <Link
                          href={`/searches/${companyId}/roles/${c.role.job_id}`}
                          className={`block truncate text-[14.5px] font-semibold text-[#161613] hover:underline underline-offset-4 ${FOCUS}`}
                        >
                          {c.role.headline || c.role.title}
                        </Link>
                        <p className={META}>
                          {c.role.priority === 'urgent' ? 'Urgent · ' : ''}
                          {stage.label}
                          {c.inPlay ? ` · ${c.inPlay} in play` : ' · nothing in play'}
                        </p>
                      </div>
                      <div>
                        <span className={chip.cls}>{chip.label}</span>
                      </div>
                      <p className={`text-[13px] leading-relaxed ${c.need === 'fine' ? 'text-[#6E6E68]' : 'text-[#2A2A26]'}`}>
                        {[
                          `${c.working} working`,
                          c.quiet ? `${c.quiet} silent` : null,
                          c.proposed ? `${c.proposed} proposed` : null,
                          c.declined ? `${c.declined} declined` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      <div className="flex justify-end">
                        <Link
                          href={`/searches/${companyId}/roles/${c.role.job_id}/coverage`}
                          className={`${c.need === 'fine' ? CHIP : 'inline-flex min-h-[34px] items-center rounded-full bg-[#1F3A2F] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#142E24]'} ${FOCUS}`}
                        >
                          {c.need === 'nobody' ? 'Propose partners' : c.need === 'quiet' ? 'Check in' : 'Coverage'}
                        </Link>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
