import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/current-user'
import { getMembership } from '@/lib/firms'

/**
 * "Do I already have an account, and what can I do with it?"
 *
 * Asked by the sign-up form the moment somebody types their email, so that a
 * person who already has an account learns it in one field rather than after
 * filling eight and accepting a contract. That was the actual complaint: a
 * partner filled the whole firm form, clicked accept, and got "user already
 * registered" with nowhere to go.
 *
 * On enumeration: this does not leak anything `supabase.auth.signUp` does not
 * already return from the same form, in the same session, to the same person.
 * What it changes is when they find out. It is still rate limited, still says
 * nothing about anyone's name or firm, and answers only the question the form
 * needs to route them.
 */

export const dynamic = 'force-dynamic'

/**
 * What to do with this person, rather than what we know about them.
 *
 * Deliberately phrased as routing states: the caller should never have to infer
 * a next step by combining two fields, because that is where a case gets missed.
 */
export type AccountState =
  | 'none'            // no account: carry on with sign-up
  | 'pending'         // account exists, not approved yet
  | 'partner'         // active partner, no firm: can set one up
  | 'in_firm'         // already belongs to a firm
  | 'not_partner'     // account exists but is not a scout or recruiter

/** Crude, in-memory, per-instance. Enough to stop a script, cheap enough to keep. */
const seen = new Map<string, { n: number; until: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hit = seen.get(ip)
  if (!hit || hit.until < now) {
    seen.set(ip, { n: 1, until: now + WINDOW_MS })
    return false
  }
  hit.n += 1
  return hit.n > MAX_PER_WINDOW
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json({ state: 'none' as AccountState }, { status: 200 })
  }

  const body = await req.json().catch(() => null)
  const raw = typeof body?.email === 'string' ? body.email : ''
  if (!raw.includes('@')) return NextResponse.json({ state: 'none' as AccountState })

  const email = normalizeEmail(raw)
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('users_admin')
    .select('user_id, role, status, full_name')
    .eq('email', email)
    .maybeSingle()

  if (!row) return NextResponse.json({ state: 'none' as AccountState })

  const PARTNER_ROLES = ['recruiter', 'scout', 'admin', 'super_admin']
  if (!PARTNER_ROLES.includes(row.role as string)) {
    return NextResponse.json({ state: 'not_partner' as AccountState })
  }

  if (row.status !== 'active') {
    return NextResponse.json({ state: 'pending' as AccountState })
  }

  // Only now, and only for an active partner, is a firm lookup meaningful.
  const membership = row.user_id ? await getMembership(admin, row.user_id as string) : null
  if (membership) {
    return NextResponse.json({
      state: 'in_firm' as AccountState,
      // The name is safe to return: this person has proved nothing, but they
      // already knew the address, and "you are in a firm" without saying which
      // is a worse experience than the marginal disclosure is a risk.
      firmName: membership.firm.name,
    })
  }

  return NextResponse.json({
    state: 'partner' as AccountState,
    firstName: ((row.full_name as string) || '').trim().split(/\s+/)[0] || null,
  })
}
