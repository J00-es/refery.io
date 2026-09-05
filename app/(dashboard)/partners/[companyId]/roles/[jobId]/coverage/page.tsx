import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { FIGURE, FOCUS, H1, LABEL, LEDE, RULE } from '@/lib/desk-ui'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { submissionStatus, type SearchAssignmentRow } from '@/lib/partners'
import { CoverageTable, type CoverageRow } from '@/components/partners/coverage-table'

export const dynamic = 'force-dynamic'

/**
 * Who is on one search. Admin only.
 *
 * Partners see their own row on their own pages and nothing else. This is the
 * one place the whole picture exists: proposed, working, declined and why,
 * silent, and who to propose next.
 */
export default async function CoveragePage({
  params,
}: {
  params: Promise<{ companyId: string; jobId: string }>
}) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  if (!access.canUseDesk || !access.canManage) notFound()

  const { companyId, jobId } = await params
  const adminClient = createAdminClient()

  const [{ data: role }, { data: assignmentRows }, { data: submissionRows }] = await Promise.all([
    adminClient
      .from('partner_roles_v')
      .select('job_id, company_id, title, headline, company_name')
      .eq('job_id', jobId)
      .maybeSingle(),
    adminClient.from('search_assignments').select('*').eq('job_id', jobId).order('proposed_at', { ascending: false }),
    adminClient
      .from('role_submissions')
      .select('submitted_by_user_id, status, created_at')
      .eq('job_id', jobId),
  ])

  if (!role || role.company_id !== companyId) notFound()

  const assignments = (assignmentRows ?? []) as SearchAssignmentRow[]
  const userIds = [...new Set(assignments.map(a => a.user_id))]
  const { data: users } = userIds.length
    ? await adminClient.from('users_admin').select('user_id, full_name, email, role').in('user_id', userIds)
    : { data: [] }
  const userById = new Map((users ?? []).map(u => [u.user_id as string, u]))

  const byUser = new Map<string, { counts: Map<string, number>; last: string | null }>()
  for (const s of submissionRows ?? []) {
    const uid = s.submitted_by_user_id as string
    const entry = byUser.get(uid) ?? { counts: new Map(), last: null }
    const label = submissionStatus(s.status as string).label.toLowerCase()
    entry.counts.set(label, (entry.counts.get(label) ?? 0) + 1)
    if (!entry.last || (s.created_at as string) > entry.last) entry.last = s.created_at as string
    byUser.set(uid, entry)
  }

  const rows: CoverageRow[] = assignments.map(a => {
    const u = userById.get(a.user_id)
    const act = byUser.get(a.user_id)
    const activity = act
      ? [...act.counts.entries()].map(([label, n]) => `${n} ${label}`).join(' · ')
      : 'Nothing yet'
    const anchor = act?.last ?? a.confirmed_at
    const silentDays = anchor ? Math.floor((Date.now() - new Date(anchor).getTime()) / 86_400_000) : null
    return {
      id: a.id,
      userId: a.user_id,
      name: (u?.full_name as string) || (u?.email as string) || 'Unknown partner',
      email: (u?.email as string) ?? '',
      role: (u?.role as string) ?? 'partner',
      status: a.status,
      why: a.why,
      proposedAt: a.proposed_at,
      expiresAt: a.expires_at,
      confirmedAt: a.confirmed_at,
      declinedAt: a.declined_at,
      declinedReason: a.declined_reason,
      activity,
      silentDays,
    }
  })

  const working = rows.filter(r => r.status === 'working').length
  const proposed = rows.filter(r => r.status === 'proposed').length
  const quiet = rows.filter(r => r.status === 'working' && r.silentDays !== null && r.silentDays >= 14).length
  const inPlay = (submissionRows ?? []).filter(s => !['declined', 'withdrawn'].includes(s.status as string)).length

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <Link
        href={`/partners/${companyId}/roles/${jobId}`}
        className={`inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#6E6E68] transition-colors hover:text-[#161613] ${FOCUS}`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {role.headline || role.title} · {role.company_name}
      </Link>

      <header>
        <h1 className={H1}>Coverage</h1>
        <p className={`mt-2 max-w-2xl ${LEDE}`}>
          Who is on this search, who has said yes, and who has gone quiet. Only you see this page.
          Partners never see a count of anything but their own work.
        </p>
      </header>

      <dl className={`grid grid-cols-2 gap-x-6 gap-y-5 border-y py-5 sm:grid-cols-4 ${RULE}`}>
        <div><dt className={FIGURE}>{working}</dt><dd className={`mt-1.5 ${LABEL}`}>working</dd></div>
        <div><dt className={`${FIGURE} text-[#8A6A1F]`}>{proposed}</dt><dd className={`mt-1.5 ${LABEL}`}>proposed, awaiting a yes</dd></div>
        <div><dt className={FIGURE}>{inPlay}</dt><dd className={`mt-1.5 ${LABEL}`}>in play on this search</dd></div>
        <div><dt className={`${FIGURE} text-[#9C3F37]`}>{quiet}</dt><dd className={`mt-1.5 ${LABEL}`}>working but silent 14+ days</dd></div>
      </dl>

      <CoverageTable jobId={jobId} rows={rows} />
    </div>
  )
}
