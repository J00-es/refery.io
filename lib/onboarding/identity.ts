/**
 * Who is this, really.
 *
 * Applications, accounts and campaign audiences meet on two keys: a normalised
 * email and a normalised LinkedIn URL. Email alone missed Keana, who held three
 * accounts under three addresses; a LinkedIn URL alone is a hint, because a
 * person can type someone else's. So a LinkedIn match is offered to Lily as a
 * likely alias, never acted on by itself, while an exact email match is
 * treated as the same person.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/current-user'

/** `https://www.linkedin.com/in/Jane-Doe-123/?utm=x` -> `jane-doe-123` */
export function linkedinKey(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim().toLowerCase()
  if (!raw) return null
  const m = raw.match(/linkedin\.com\/in\/([^/?#]+)/)
  if (!m) return null
  try {
    return decodeURIComponent(m[1]).replace(/\/+$/, '') || null
  } catch {
    return m[1].replace(/\/+$/, '') || null
  }
}

const INTERNAL_DOMAINS = new Set(['refery.io', '10kventures.co'])

/**
 * Rows that are nobody: a name under three letters, a throwaway domain, or the
 * placeholder people type to see the next screen.
 */
export function looksLikeTestRow(a: { full_name: string | null; email: string; linkedin_url?: string | null }): boolean {
  const name = (a.full_name ?? '').trim()
  const email = normalizeEmail(a.email)
  const domain = email.split('@')[1] ?? ''
  if (name.length < 3) return true
  if (/^(test|asdf|fsa|qwe|abc)/i.test(name)) return true
  if (['g.com', 'test.com', 'example.com', 'a.com'].includes(domain)) return true
  if (domain.length < 4) return true
  return false
}

export function isInternalEmail(email: string): boolean {
  const domain = normalizeEmail(email).split('@')[1] ?? ''
  return INTERNAL_DOMAINS.has(domain)
}

export interface ExistingAccount {
  userId: string | null
  email: string
  fullName: string | null
  role: string
  status: string
  /** exact email, or a LinkedIn key that Lily should confirm */
  matchedBy: 'email' | 'linkedin'
}

export interface EarlierApplication {
  id: string
  status: string | null
  createdAt: string
  decision: string | null
  matchedBy: 'email' | 'linkedin'
}

export interface Reconciliation {
  account: ExistingAccount | null
  earlier: EarlierApplication | null
  isTest: boolean
  isInternal: boolean
}

/**
 * Everything the triage card needs to say before Lily decides.
 *
 * `excludeApplicationId` keeps a fresh application from matching itself.
 */
export async function reconcile(
  admin: SupabaseClient,
  person: { email: string; linkedin_url?: string | null; full_name?: string | null },
  excludeApplicationId?: string,
): Promise<Reconciliation> {
  const email = normalizeEmail(person.email)
  const key = linkedinKey(person.linkedin_url)

  const [{ data: byEmail }, { data: byKey }] = await Promise.all([
    admin.from('users_admin').select('user_id, email, full_name, role, status').eq('email', email).maybeSingle(),
    key
      ? admin
          .from('users_admin')
          .select('user_id, email, full_name, role, status, linkedin_url')
          .ilike('linkedin_url', `%linkedin.com/in/${key}%`)
          .neq('email', email)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const account: ExistingAccount | null = byEmail
    ? { userId: byEmail.user_id, email: byEmail.email, fullName: byEmail.full_name, role: byEmail.role, status: byEmail.status, matchedBy: 'email' }
    : byKey
      ? { userId: byKey.user_id, email: byKey.email, fullName: byKey.full_name, role: byKey.role, status: byKey.status, matchedBy: 'linkedin' }
      : null

  let earlierQuery = admin
    .from('scout_applications')
    .select('id, status, created_at, decision, email, linkedin_key')
    .or(`email.eq.${email}${key ? `,linkedin_key.eq.${key}` : ''}`)
    .order('created_at', { ascending: false })
    .limit(2)
  if (excludeApplicationId) earlierQuery = earlierQuery.neq('id', excludeApplicationId)
  const { data: earlierRows } = await earlierQuery
  const e = (earlierRows ?? [])[0]
  const earlier: EarlierApplication | null = e
    ? { id: e.id, status: e.status, createdAt: e.created_at, decision: e.decision, matchedBy: e.email === email ? 'email' : 'linkedin' }
    : null

  return {
    account,
    earlier,
    isTest: looksLikeTestRow({ full_name: person.full_name ?? null, email }),
    isInternal: isInternalEmail(email),
  }
}
