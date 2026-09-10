import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { confirmReferral, disownReferral, referralByToken, undoDisown } from '@/lib/referrals'

/**
 * The one-tap answers from the email. The token is the credential: it can
 * only answer this one referral, for 30 days. Undo is the same token inside
 * the three-minute window.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const r = await referralByToken(admin, token)
  if (!r) return NextResponse.json({ error: 'This link does not work.' }, { status: 404 })
  if (new Date(r.token_expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'This link has expired. Sign in to Refery and answer from the candidate page.' }, { status: 410 })
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (action === 'confirm') {
    const out = await confirmReferral(admin, r, { relationship: body?.relationship ?? null, why: body?.why ?? null, by: 'email' })
    return NextResponse.json(out, { status: out.ok ? 200 : 409 })
  }
  if (action === 'disown') {
    const out = await disownReferral(admin, r, 'email')
    return NextResponse.json(out, { status: out.ok ? 200 : 409 })
  }
  if (action === 'undo') {
    const out = await undoDisown(admin, r)
    return NextResponse.json(out, { status: out.ok ? 200 : 409 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
