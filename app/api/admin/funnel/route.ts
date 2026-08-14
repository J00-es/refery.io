import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { loadFunnel } from '@/lib/funnel'

/**
 * The whole partner funnel in one response.
 *
 * Reads through the service-role client because it spans five tables the
 * caller has no RLS grant on, so the role check has to happen here.
 *
 * Names of applicants and dormant partners are personal data, so this stays
 * admin-only rather than following the analytics endpoint's wider gate.
 */

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!appUser.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const raw = Number(request.nextUrl.searchParams.get('days'))
  // The sign-up beacon only started recording on 2026-08-13, so a 30-day
  // default reads as a collapse rather than as missing history. Anything
  // outside 1..90 is a typo, not a request.
  const windowDays = Number.isFinite(raw) && raw >= 1 && raw <= 90 ? Math.floor(raw) : 30

  try {
    const funnel = await loadFunnel(createAdminClient(), { windowDays })
    return NextResponse.json(funnel)
  } catch (err) {
    console.error('[admin/funnel] failed:', err)
    return NextResponse.json({ error: 'Failed to load funnel' }, { status: 500 })
  }
}
