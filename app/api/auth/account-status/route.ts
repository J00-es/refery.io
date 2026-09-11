import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/current-user'
import { resolveAccountState, type AccountState } from '@/lib/account-state'
import { announceFirmDraft, sanitizeFirmDraft, saveFirmDraft } from '@/lib/firm-drafts'

/**
 * "Do I already have an account, and what can I do with it?"
 *
 * Asked by the sign-up form the moment somebody leaves the details step, so
 * that a person who already has an account learns it in one field rather than
 * after filling eight and accepting a contract. That was the actual complaint:
 * a partner filled the whole firm form, clicked accept, and got "user already
 * registered" with nowhere to go.
 *
 * When the form was describing a firm, what they typed is kept on the server
 * for them (see lib/firm-drafts), so the form really is waiting after login,
 * whichever way they get back in.
 *
 * On enumeration: this does not leak anything `supabase.auth.signUp` does not
 * already return from the same form, in the same session, to the same person.
 * What it changes is when they find out. It is still rate limited, still says
 * nothing about anyone's name or firm, and answers only the question the form
 * needs to route them.
 */

export const dynamic = 'force-dynamic'

export type { AccountState }

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
  const known = await resolveAccountState(admin, email)

  // Keep the firm they described, for a partner who can still create one.
  const draft = sanitizeFirmDraft(body?.firm)
  if (draft && (known.state === 'partner' || known.state === 'pending')) {
    await saveFirmDraft(admin, email, draft, { source: 'sign-up', accountState: known.state })
    await announceFirmDraft(known, email, draft).catch((err) => console.error('[account-status] slack:', err))
  }

  return NextResponse.json(known)
}
