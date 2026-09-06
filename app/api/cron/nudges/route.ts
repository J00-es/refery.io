import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { nudgesEnabled, runAllNudges } from '@/lib/nudges'

/**
 * The lifecycle reminders, once a day.
 *
 * One job rather than six, because they are all the same shape: find people in
 * a state, check nobody has chased them, send, record. Splitting them would
 * multiply the cron config without changing anything that matters.
 *
 * 09:00 UTC. Nothing sends at night, and nothing fires inside 24 hours of the
 * thing it is about, so a person always had a chance to act before we point out
 * that they have not.
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Same posture as the digests: an unset secret means local development, and
  // the route is harmless without one because every send is idempotent.
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!nudgesEnabled()) {
    return NextResponse.json({ ok: true, disabled: true, results: [] })
  }

  const admin = createAdminClient()

  try {
    const results = await runAllNudges(admin)
    const sent = results.reduce((n, r) => n + r.sent, 0)
    const failed = results.reduce((n, r) => n + r.failed, 0)
    if (sent || failed) {
      console.log('[nudges]', JSON.stringify(results))
    }
    return NextResponse.json({ ok: true, sent, failed, results })
  } catch (err) {
    console.error('[nudges] run failed:', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
