import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeBrief } from '@/lib/brief'
import { resolvePartnerAccess } from '@/lib/partners-access'
import {
  PRIORITY_ORDER,
  assignmentFor,
  canWorkSearch,
  toCompanyView,
  type PartnerCompanyRow,
  type PartnerRoleRow,
  type SearchAssignmentRow,
} from '@/lib/partners'
import { ClientBrief, type ClientBriefSubmission } from '@/components/partners/client-brief'
import { ManageCompany } from '@/components/partners/manage-company'

export const dynamic = 'force-dynamic'

/**
 * The client page is the client brief.
 *
 * It used to be a company card with the searches under it and the brief
 * rendered as a document at the bottom, which meant a partner scrolled past
 * everything they already knew to reach the bar. Now the page is the brief the
 * canvas drew (artboard 2b): masthead, TL;DR with the searches ledger, the
 * numbered sections, and the live searches generated from the desk with their
 * own stage and buttons. See components/partners/client-brief.tsx.
 */
export default async function PartnerCompanyPage({ params }: { params: Promise<{ companyId: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) redirect('/auth/login')
  // The desk is in beta: super admins and beta users only. See DESK_BETA_ONLY.
  if (!access.canUseDesk) notFound()

  const { companyId } = await params
  const adminClient = createAdminClient()

  const { data: row } = await adminClient.from('partner_companies_v').select('*').eq('company_id', companyId).maybeSingle()
  if (!row) notFound()
  const companyRow = row as PartnerCompanyRow
  // An unpublished client is an admin's working draft, so it 404s for everyone
  // else rather than confirming it exists.
  if (!access.canManage && (!companyRow.is_published || !companyRow.is_active)) notFound()
  const company = toCompanyView(companyRow, access)

  const [{ data: roleRows }, { data: subRows }, { data: briefRow }, { data: matchRows }] = await Promise.all([
    adminClient.from('partner_roles_v').select('*').eq('company_id', companyId),
    adminClient
      .from('role_submissions_v')
      .select('id, job_id, candidate_name, status, submitted_by_user_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    company.unlocked && companyRow.company_brief_id
      ? adminClient
          .from('partner_briefs')
          .select('id, title, status, content, updated_at, published_at, version')
          .eq('id', companyRow.company_brief_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    company.unlocked
      ? adminClient.from('partner_role_match_counts').select('job_id, match_count').eq('owner_user_id', access.appUser.id)
      : Promise.resolve({ data: [] }),
  ])

  // Live searches only, priority first. Closed ones are admin housekeeping and
  // live on the coverage pages.
  const roles = ((roleRows ?? []) as PartnerRoleRow[])
    .filter(r => r.is_live && r.job_status === 'open')
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title))
  const jobIds = new Set(roles.map(r => r.job_id))

  const assignmentByJob: Record<string, SearchAssignmentRow | undefined> = {}
  const canWorkByJob: Record<string, boolean> = {}
  for (const r of roles) {
    assignmentByJob[r.job_id] = assignmentFor(access, r.job_id) ?? undefined
    canWorkByJob[r.job_id] = canWorkSearch(access, r.job_id, companyId)
  }
  const matchesByJob: Record<string, number> = {}
  for (const m of matchRows ?? []) if (jobIds.has(m.job_id as string)) matchesByJob[m.job_id as string] = m.match_count as number

  // The rail shows the reader's own activity; an admin sees the desk's.
  const mySubmissions: ClientBriefSubmission[] = (subRows ?? [])
    .filter(s => access.seesAllSubmissions || s.submitted_by_user_id === access.appUser.id)
    .map(s => ({
      id: s.id as string,
      jobId: s.job_id as string,
      candidateName: (s.candidate_name as string | null) ?? null,
      status: s.status as string,
      createdAt: s.created_at as string,
    }))

  // A draft brief is only legible to the person writing it.
  const brief =
    briefRow && (briefRow.status === 'published' || access.canManage)
      ? {
          content: normalizeBrief(briefRow.content),
          status: briefRow.status as string,
          version: briefRow.version as number,
          publishedAt: (briefRow.published_at as string | null) ?? null,
          updatedAt: (briefRow.updated_at as string | null) ?? null,
        }
      : null

  return (
    <ClientBrief
      company={company}
      brief={brief}
      roles={roles}
      assignmentByJob={assignmentByJob}
      canWorkByJob={canWorkByJob}
      matchesByJob={matchesByJob}
      mySubmissions={mySubmissions}
      isAdmin={access.canManage}
      adminSlot={
        access.canManage && company.admin ? (
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
            liveRoles={roles.length}
          />
        ) : null
      }
    />
  )
}
