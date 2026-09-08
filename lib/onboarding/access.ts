/**
 * Can this partner actually do the thing we told them they could.
 *
 * Approved is not an account. An account is not signed terms. Signed terms is
 * not Searches access. Each is a separate fact with its own reason, and a
 * false value is Refery's to fix, never the partner's. Ajmal was told he could
 * begin and hit the agreement gate the next day; this is the check that would
 * have said so first.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/current-user'

export interface AccessCheck {
  account: { ok: boolean; reason: string | null }
  partnerTerms: { ok: boolean; reason: string | null; version: string | null }
  searches: { ok: boolean; reason: string | null }
  preferences: { ok: boolean; reason: string | null }
  firm: { ok: boolean; reason: string | null; name: string | null }
  /** Every check passed. */
  allOk: boolean
  /** The first failing check, in the order a partner meets them. */
  firstFailure: string | null
}

export async function accessCheck(admin: SupabaseClient, userId: string): Promise<AccessCheck> {
  const { data: u } = await admin
    .from('users_admin')
    .select('user_id, email, status, role')
    .eq('user_id', userId)
    .maybeSingle()

  const email = normalizeEmail(u?.email)
  const account = u
    ? u.status === 'active'
      ? { ok: true, reason: null }
      : { ok: false, reason: `account is ${u.status}` }
    : { ok: false, reason: 'no account row' }

  const [{ data: terms }, { data: prefs }, { data: membership }] = await Promise.all([
    email
      ? admin
          .from('agreement_acceptances')
          .select('agreement_version, accepted_at')
          .eq('user_email', email)
          .in('agreement_type', ['scout', 'recruiter', 'scout_partner'])
          .order('accepted_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('partner_preferences').select('confirmed_at, network_cities, functions').eq('user_id', userId).maybeSingle(),
    admin
      .from('partner_org_members')
      .select('org_id, removed_at, accepted_user_terms_at, partner_orgs(name, status)')
      .eq('user_id', userId)
      .is('removed_at', null)
      .limit(1)
      .maybeSingle(),
  ])

  const partnerTerms = terms
    ? { ok: true, reason: null, version: terms.agreement_version as string }
    : { ok: false, reason: 'partner terms not on file under this email', version: null }

  // Searches opened to every active partner with partner terms on file on
  // 8 September 2026 (Lily's decision 1). The beta flag no longer gates it.
  const searches =
    account.ok && partnerTerms.ok
      ? { ok: true, reason: null }
      : { ok: false, reason: !account.ok ? 'account not active' : 'partner terms not on file' }

  const preferences = prefs && (prefs.network_cities?.length || prefs.functions?.length)
    ? { ok: true, reason: null }
    : { ok: false, reason: 'no preferences yet' }

  const org = (membership as { partner_orgs?: { name?: string; status?: string } | null } | null)?.partner_orgs ?? null
  const firm = membership
    ? org?.status === 'active'
      ? { ok: true, reason: null, name: org?.name ?? null }
      : { ok: false, reason: `firm is ${org?.status ?? 'pending'}`, name: org?.name ?? null }
    : { ok: true, reason: null, name: null }

  const checks: Array<[string, boolean]> = [
    ['account', account.ok],
    ['partner terms', partnerTerms.ok],
    ['searches', searches.ok],
    ['firm', firm.ok],
  ]
  const firstFailure = checks.find(([, ok]) => !ok)?.[0] ?? null

  return { account, partnerTerms, searches, preferences, firm, allOk: firstFailure === null, firstFailure }
}
