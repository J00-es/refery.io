import { NextResponse } from 'next/server'
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
import { getMembership } from '@/lib/firms'
import {
  DESK_BETA_ONLY,
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

  const [{ data: assignments }, { data: searchRows }, { data: requests }, { data: terms }] = await Promise.all([
    adminClient.from('company_assignments').select('company_id').eq('user_id', appUser.id),
    adminClient.from('search_assignments').select('*').eq('user_id', appUser.id),
    adminClient
      .from('company_access_requests')
      .select('company_id')
      .eq('user_id', appUser.id)
      .eq('status', 'pending'),
    // Partner terms on file is what opens the desk since 8 September 2026.
    // Read for the real user, not the persona: reaching the desk is their right.
    adminClient
      .from('agreement_acceptances')
      .select('id')
      .eq('user_email', realUser.email)
      .in('agreement_type', ['scout', 'recruiter', 'scout_partner'])
      .limit(1),
  ])
  const hasPartnerTerms = Boolean(terms && terms.length)

  const searchAssignments = (searchRows ?? []) as SearchAssignmentRow[]
  // A declined search does not unlock its client; anything else does. A
  // proposal counts too, because the partner has to read the brief to decide.
  const assignedCompanyIds = new Set<string>([
    ...(assignments ?? []).map(a => a.company_id as string),
    ...searchAssignments.filter(a => a.status !== 'declined').map(a => a.company_id),
  ])

  /**
   * A coordinator is a firm's researcher or contractor: they see what is
   * assigned to them and cannot commit the firm. Reported here rather than
   * looked up per route, because the per-route version is what missed the
   * search-confirmation endpoint.
   */
  const membership = await getMembership(adminClient, appUser.id)
  const isCoordinator = membership?.role === 'coordinator'

  return {
    appUser,
    realUser,
    isCoordinator,
    preview: preview?.info ?? null,
    /*
      Reaching the desk is the real user's right, not the persona's. Checking the
      persona here would 404 the moment a super admin previewed a scout who is
      not yet in the beta — which is exactly when previewing is most useful.
    */
    canUseDesk: realUser.isAdmin || realUser.isBeta || (DESK_BETA_ONLY ? false : hasPartnerTerms),
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
    .select('user_id, email, full_name, role, status, is_beta')
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
      isBeta: Boolean(row.is_beta),
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

/**
 * Refuses a coordinator, or returns null to carry on.
 *
 * Lives here rather than in each route so the four write paths cannot drift
 * apart, which is how the first version of this check ended up existing only in
 * the UI.
 */
export function refuseCoordinator(access: { isCoordinator?: boolean }): NextResponse | null {
  if (!access.isCoordinator) return null
  return NextResponse.json(
    {
      error:
        'Coordinators cannot submit candidates or commit the firm to a search. Ask a firm admin to change your role, or to do this themselves.',
    },
    { status: 403 },
  )
}
