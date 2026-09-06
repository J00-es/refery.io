/**
 * Who is who around a candidate: the owner, whether the owner is us, and
 * therefore who the first email goes to.
 *
 * The rule, from how Lily actually works:
 *   owner is a partner   → the partner gets the ask ("would you mind a warm intro")
 *   owner is us, or the person came in directly → the candidate gets the email
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPER_ADMIN_EMAILS } from '@/lib/current-user'

export interface Owner {
  userId: string
  email: string
  name: string | null
  firstName: string
  role: string
  /** Lily, under either of her identities. */
  isUs: boolean
  /** Signed Partner Terms: client names may appear in email to them. */
  signed: boolean
}

const US_DOMAINS = ['refery.io', '10kventures.co']

export async function loadOwner(admin: SupabaseClient, ownerUserId: string | null): Promise<Owner | null> {
  if (!ownerUserId) return null
  const { data } = await admin
    .from('users_admin')
    .select('user_id, email, full_name, role, accepted_terms_at')
    .eq('user_id', ownerUserId)
    .maybeSingle()
  if (!data) return null
  const email = String(data.email ?? '').toLowerCase()
  const domain = email.split('@')[1] ?? ''
  const isUs = SUPER_ADMIN_EMAILS.includes(email) || US_DOMAINS.includes(domain) || data.role === 'super_admin'
  const name = (data.full_name as string | null)?.trim() || null
  return {
    userId: data.user_id as string,
    email,
    name,
    firstName: name?.split(/\s+/)[0] || email.split('@')[0],
    role: String(data.role ?? 'scout'),
    isUs,
    signed: Boolean(data.accepted_terms_at),
  }
}

/** Lily's auth user id, for rows that must carry her name (notes, decisions). */
let cachedLily: string | null = null
export async function lilyUserId(admin: SupabaseClient): Promise<string | null> {
  if (cachedLily) return cachedLily
  const { data } = await admin
    .from('users_admin')
    .select('user_id, email')
    .in('email', SUPER_ADMIN_EMAILS)
    .limit(1)
    .maybeSingle()
  cachedLily = (data?.user_id as string | null) ?? process.env.REFERY_DEFAULT_OWNER_USER_ID ?? null
  return cachedLily
}

export function firstNameOf(full: string | null | undefined): string {
  const f = (full ?? '').trim().split(/\s+/)[0]
  if (!f) return 'there'
  // "MUHAMMAD" reads as shouting; CVs arrive in caps more often than not.
  return f === f.toUpperCase() && f.length > 2 ? f[0] + f.slice(1).toLowerCase() : f
}

export function properName(full: string | null | undefined): string {
  const s = (full ?? '').trim()
  if (!s) return 'this person'
  if (s === s.toUpperCase() && s.length > 3) {
    return s
      .toLowerCase()
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
  return s
}
