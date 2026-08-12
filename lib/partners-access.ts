/**
 * Who this viewer is on the partner desk. Server-only.
 *
 * Split out from lib/partners.ts so that module stays importable from client
 * components: it holds the status ladder and the redaction rules, which the
 * browser needs, while this one reaches for `next/headers` and the service-role
 * client, which the browser must never see.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { DESK_SUPER_ADMIN_ONLY, type PartnerAccess } from '@/lib/partners'

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
  const appUser = await getAppUser()
  if (!appUser || !appUser.isActive) return null

  const adminClient = createAdminClient()
  const [{ data: assignments }, { data: requests }] = await Promise.all([
    adminClient.from('company_assignments').select('company_id').eq('user_id', appUser.id),
    adminClient
      .from('company_access_requests')
      .select('company_id')
      .eq('user_id', appUser.id)
      .eq('status', 'pending'),
  ])

  return {
    appUser,
    canUseDesk: DESK_SUPER_ADMIN_ONLY ? appUser.isSuperAdmin : true,
    canManage: appUser.isAdmin,
    seesEverything: appUser.isAdmin,
    seesAllSubmissions: appUser.isAdmin,
    seesAllCandidates: appUser.canViewAllCandidates,
    assignedCompanyIds: new Set((assignments ?? []).map(a => a.company_id as string)),
    pendingRequestCompanyIds: new Set((requests ?? []).map(r => r.company_id as string)),
  }
}
