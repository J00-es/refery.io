import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'
import { markIntroMade, sendIntroForPartner } from '@/lib/desk/intro'

/**
 * The two buttons a partner has on someone we asked them to introduce.
 *
 *   made          "I made the intro": the timers on them stop, the person is
 *                 intro sent, and we watch for the candidate to book.
 *   send_for_me   "Have Lily reach out": Refery writes to the candidate saying
 *                 it came from the partner, with the partner cc'd.
 *
 * The same two actions run from the emailed link (see lib/desk/intro.ts).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireCandidateAccess(id)
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const { appUser } = access

  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const admin = createAdminClient()
  const { data: c } = await admin.from('candidates').select('*').eq('id', id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (String(c.journey_stage) !== 'intro_requested') {
    return NextResponse.json({ error: 'We are not waiting on an intro for this person right now.' }, { status: 409 })
  }

  if (body.action === 'made') {
    const r = await markIntroMade(admin, c, appUser.email)
    return NextResponse.json(r, { status: r.ok ? 200 : 409 })
  }
  if (body.action === 'send_for_me') {
    const r = await sendIntroForPartner(admin, c, { by: appUser.email, via: 'page', ownerHint: appUser.fullName ?? null })
    return NextResponse.json(r.ok ? r : { ...r, error: r.message }, { status: r.ok ? 200 : 500 })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
