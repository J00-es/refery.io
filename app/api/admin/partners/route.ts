import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/**
 * The partner desk.
 *
 * Reads partner_state_v, which derives every partner's lifecycle stage from the
 * application, the account, the agreements, the searches proposed and the
 * candidates submitted. Nothing here computes state: the view owns that, so the
 * page and the digest can never disagree about who is stalled.
 *
 * Service role, admin gated. The view deliberately has no RLS of its own
 * because views do not take policies, so the gate is this handler.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_state_v')
    .select('*')
    // Longest silence first inside each group: the desk is worked top down, and
    // the person who has waited longest is the one closest to being written off.
    .order('days_quiet', { ascending: false })

  if (error) {
    console.error('[admin/partners] query failed:', error)
    return NextResponse.json({ error: 'Could not load partners' }, { status: 500 })
  }

  const rows = data ?? []
  const counts = {
    total: rows.length,
    working: rows.filter(r => r.state === 'working').length,
    stalled: rows.filter(r => r.stalled).length,
    // The bucket that matters most: signed up, never asked to do anything.
    neverOffered: rows.filter(r => r.state === 'signed_idle' || r.state === 'joined_unsigned').length,
    submissions: rows.reduce((n, r) => n + (r.submissions ?? 0), 0),
  }

  return NextResponse.json({ counts, partners: rows })
}
