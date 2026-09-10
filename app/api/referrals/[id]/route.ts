import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { confirmReferral, disownReferral, referralById, rescueReferral, undoDisown } from '@/lib/referrals'

/**
 * The partner's two answers about a person who came through their link,
 * from the candidate page or the list. The same functions sit behind the
 * one-tap email links (/rf/<token>). Only the referrer (or the super admin)
 * may answer; a super admin may also rescue a disowned person.
 */
export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAppUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const admin = createAdminClient()
  const r = await referralById(admin, id)
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const mine = r.referrer_user_id === user.id
  if (!mine && !user.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const action = body?.action
  if (action === 'confirm') {
    const out = await confirmReferral(admin, r, { relationship: body?.relationship ?? null, why: body?.why ?? null, by: body?.by === 'list' ? 'list' : 'page' })
    return NextResponse.json(out, { status: out.ok ? 200 : 409 })
  }
  if (action === 'disown') {
    const out = await disownReferral(admin, r, body?.by === 'list' ? 'list' : 'page')
    return NextResponse.json(out, { status: out.ok ? 200 : 409 })
  }
  if (action === 'undo') {
    const out = await undoDisown(admin, r)
    return NextResponse.json(out, { status: out.ok ? 200 : 409 })
  }
  if (action === 'rescue') {
    if (!user.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const ok = await rescueReferral(admin, r)
    return NextResponse.json({ ok, message: ok ? 'Kept as a self-submission owned by you.' : 'Nothing to rescue.' }, { status: ok ? 200 : 409 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
