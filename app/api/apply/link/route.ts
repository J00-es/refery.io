import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { viewerContext } from '@/lib/hm-brief'
import { hashIp, logEvent, sendFreshLink, tooManyAttempts } from '@/lib/apply/profile'

/** "Already with us?" A fresh private link by email. The answer never says whether we have them. */
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = String(body.email ?? '').trim()
  if (!email.includes('@')) return NextResponse.json({ error: 'An email, please.' }, { status: 400 })
  const admin = createAdminClient()
  const ipHash = hashIp(viewerContext(request.headers).ip)
  if (await tooManyAttempts(admin, ipHash)) return NextResponse.json({ ok: true })
  await logEvent(admin, { email: email.toLowerCase(), ipHash, outcome: 'link_requested' })
  await sendFreshLink(admin, email)
  return NextResponse.json({ ok: true })
}
