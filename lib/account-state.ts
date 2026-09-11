import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembership } from '@/lib/firms'

/**
 * "Do I already have an account, and what can I do with it?"
 *
 * Answered as a routing state rather than as facts about a person, so that a
 * caller never has to infer a next step by combining two fields, which is
 * where a case gets missed. Asked by the sign-up form at the email field and,
 * as a backstop, by the sign-up route itself when Supabase says the address is
 * already registered.
 */
export type AccountState =
  | 'none'            // no account: carry on with sign-up
  | 'pending'         // account exists, not approved yet
  | 'partner'         // active partner, no firm: can set one up
  | 'in_firm'         // already belongs to a firm
  | 'not_partner'     // account exists but is not a scout or recruiter

export interface KnownAccount {
  state: AccountState
  firstName?: string | null
  firmName?: string | null
}

const PARTNER_ROLES = new Set(['recruiter', 'scout', 'admin', 'super_admin'])

interface AccountRow {
  role: string | null
  status: string | null
  full_name?: string | null
}

function firstNameOf(fullName: string | null | undefined): string | null {
  return (fullName ?? '').trim().split(/\s+/)[0] || null
}

/** Pure: the state for a users_admin row and the name of the firm they are in, if any. */
export function accountStateFor(row: AccountRow | null, firmName: string | null): KnownAccount {
  if (!row) return { state: 'none' }
  if (!PARTNER_ROLES.has(row.role ?? '')) return { state: 'not_partner' }
  if (row.status !== 'active') return { state: 'pending', firstName: firstNameOf(row.full_name) }
  // The firm name is safe to return: this person has proved nothing, but they
  // already knew the address, and "you are in a firm" without saying which is
  // a worse experience than the marginal disclosure is a risk.
  if (firmName) return { state: 'in_firm', firmName }
  return { state: 'partner', firstName: firstNameOf(row.full_name) }
}

export async function resolveAccountState(admin: SupabaseClient, email: string): Promise<KnownAccount> {
  const { data: row } = await admin
    .from('users_admin')
    .select('user_id, role, status, full_name')
    .eq('email', email)
    .maybeSingle()

  if (!row) return { state: 'none' }

  // Only for an active partner is a firm lookup meaningful.
  const activePartner = PARTNER_ROLES.has((row.role as string) ?? '') && row.status === 'active'
  const membership = activePartner && row.user_id ? await getMembership(admin, row.user_id as string) : null
  return accountStateFor(row as AccountRow, membership?.firm.name ?? null)
}
