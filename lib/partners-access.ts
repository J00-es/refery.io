/**
 * Who this viewer is on the partner desk. Server-only.
 *
 * Split out from lib/partners.ts so that module stays importable from client
 * components: it holds the status ladder and the redaction rules, which the
 * browser needs, while this one reaches for `next/headers` and the service-role
 * client, which the browser must never see.
 */

import 'server-only'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser, type AppUser } from '@/lib/current-user'
import {
  DESK_SUPER_ADMIN_ONLY,
  type PartnerAccess,
  type PartnerPreview,
  type SearchAssignmentRow,
} from '@/lib/partners'

/**
 * The cookie a super admin sets to look at the desk as one of their scouts.
 *
 * A cookie rather than a query parameter: the whole point is to walk every page
 * and every sub-page, and a parameter would have to be threaded through every
 * link on the surface — where one missed `href` silently drops you back into the
 * admin view without saying so.
 */
export const PREVIEW_COOKIE = 'refery_desk_preview'

/**
 * Resolves what this viewer may see on the partner desk.
 *
 * Three distinct powers, kept apart on purpose:
 *
 *   the desk       — which roles are mandates, who is assigned, where a
 *                    submission has got to. Admin work, so `isAdmin`.
 *   the client     — a company's real name and its brief. Admins, plus anyone
 *                    assigned to that company.
 *   the candidates — someone else's book of business. Super admin only, the
 *                    same rule `canViewAllCandidates` enforces everywhere else.
 *
 * Running the desk and reading every partner's candidates are genuinely
 * different things, and an admin gets the first without the second.
 *
 * Returns null when there is no session or the account is not active, so every
 * caller has one thing to check.
 */
export async function resolvePartnerAccess(): Promise<PartnerAccess | null> {
  const realUser = await getAppUser()
  if (!realUser || !realUser.isActive) return null

  const adminClient = createAdminClient()
  const preview = await resolvePreview(realUser)
  // While previewing, the desk answers as the persona — so every "mine" filter
  // downstream is the persona's without any of them knowing about previews.
  const appUser = preview?.appUser ?? realUser

  const [{ data: assignments }, { data: searchRows }, { data: requests }] = await Promise.all([
    adminClient.from('company_assignments').select('company_id').eq('user_id', appUser.id),
    adminClient.from('search_assignments').select('*').eq('user_id', appUser.id),
    adminClient
      .from('company_access_requests')
      .select('company_id')
      .eq('user_id', appUser.id)
      .eq('status', 'pending'),
  ])

  const searchAssignments = (searchRows ?? []) as SearchAssignmentRow[]
  // A declined search does not unlock its client; anything else does. A
  // proposal counts too, because the partner has to read the brief to decide.
  const assignedCompanyIds = new Set<string>([
    ...(assignments ?? []).map(a => a.company_id as string),
    ...searchAssignments.filter(a => a.status !== 'declined').map(a => a.company_id),
  ])

  return {
    appUser,
    realUser,
    preview: preview?.info ?? null,
    /*
      Reaching the desk is the real user's right, not the persona's. Checking the
      persona here would 404 the moment a super admin previewed a scout, since
      the desk is super-admin-only while it is being built — which is exactly
      when previewing is most useful.
    */
    canUseDesk: DESK_SUPER_ADMIN_ONLY ? realUser.isSuperAdmin : true,
    canManage: appUser.isAdmin,
    seesEverything: appUser.isAdmin,
    seesAllSubmissions: appUser.isAdmin,
    seesAllCandidates: appUser.canViewAllCandidates,
    assignedCompanyIds,
    assignmentByJob: new Map(searchAssignments.map(a => [a.job_id, a])),
    pendingRequestCompanyIds: new Set((requests ?? []).map(r => r.company_id as string)),
  }
}

/**
 * Reads the preview cookie and turns it into a persona.
 *
 * Only a super admin is honoured. A forged cookie is not an escalation — it only
 * ever grants *less* than the holder already has — but ignoring it for everyone
 * else keeps one rule instead of two.
 */
async function resolvePreview(
  realUser: AppUser,
): Promise<{ appUser: AppUser; info: PartnerPreview } | null> {
  if (!realUser.isSuperAdmin) return null

  const store = await cookies()
  const userId = store.get(PREVIEW_COOKIE)?.value
  if (!userId || userId === realUser.id) return null

  const adminClient = createAdminClient()
  const { data: row } = await adminClient
    .from('users_admin')
    .select('user_id, email, full_name, role, status')
    .eq('user_id', userId)
    .maybeSingle()

  if (!row || row.status !== 'active') return null

  const role = row.role as AppUser['role']
  return {
    appUser: {
      id: row.user_id as string,
      email: (row.email as string) ?? '',
      role,
      status: row.status as string,
      fullName: (row.full_name as string) ?? null,
      // A persona never inherits the previewer's powers. These are derived from
      // the persona's own role exactly as getAppUser would derive them.
      isSuperAdmin: false,
      isAdmin: role === 'admin',
      canViewAllCandidates: false,
      isActive: true,
    },
    info: {
      userId: row.user_id as string,
      name: (row.full_name as string) || (row.email as string) || 'Unknown user',
      role,
    },
  }
}

/**
 * Who really pressed the button, when that is not the persona.
 *
 * A super admin viewing the desk as a partner may act for them: submit a
 * candidate, accept a proposal, ask a question. The row belongs to the partner
 * (their credit, their protection, their fee), because that is the point of
 * doing it on their behalf. But a record of something a person did not do is a
 * lie, so every write made this way also stamps `acted_by_user_id` with the
 * real user. Null when someone is acting as themselves.
 *
 * Lily asked for this on 5 Sep 2026, after the read-only preview refused a
 * submission she wanted to make for Gina.
 */
export function actingFor(access: PartnerAccess): string | null {
  return access.preview ? access.realUser.id : null
}
