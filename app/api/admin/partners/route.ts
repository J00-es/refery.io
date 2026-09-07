import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

/** Stages where a search is still worth putting in front of a partner. */
const OPEN_STAGES = ['sourcing', 'shortlisting', 'client_interviewing', 'offer_out']

/**
 * The partner desk.
 *
 * Reads partner_state_v, which derives every partner's lifecycle stage from the
 * application, the account, the agreements, the searches proposed and the
 * candidates submitted. Nothing here computes state: the view owns that, so the
 * page and the digest can never disagree about who is stalled.
 *
 * Open searches come back in the same response because the desk's whole purpose
 * is proposing one to the people who have never been offered anything, and a
 * second round trip to fill a picker is a second chance to be slow.
 *
 * Service role, admin gated. Views take no RLS policies, so the gate is here.
 */
export async function GET() {
  const gate = await requireAdmin()
  if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: gate.status })

  const admin = createAdminClient()

  const [partnersResult, searchesResult] = await Promise.all([
    admin
      .from('partner_state_v')
      .select('*')
      // Longest silence first inside each group: the desk is worked top down,
      // and whoever has waited longest is closest to being written off.
      .order('days_quiet', { ascending: false }),
    admin
      .from('partner_roles_v')
      .select('job_id, title, company_name, location, search_stage')
      .in('search_stage', OPEN_STAGES)
      .order('company_name', { ascending: true }),
  ])

  if (partnersResult.error) {
    console.error('[admin/partners] partners query failed:', partnersResult.error)
    return NextResponse.json({ error: 'Could not load partners' }, { status: 500 })
  }
  if (searchesResult.error) {
    console.error('[admin/partners] searches query failed:', searchesResult.error)
  }

  const rows = partnersResult.data ?? []
  const counts = {
    total: rows.length,
    working: rows.filter(r => r.state === 'working').length,
    stalled: rows.filter(r => r.stalled).length,
    // The bucket that matters most: signed up, never asked to do anything.
    neverOffered: rows.filter(r => r.state === 'signed_idle' || r.state === 'joined_unsigned').length,
    submissions: rows.reduce((n, r) => n + (r.submissions ?? 0), 0),
  }

  return NextResponse.json({
    counts,
    partners: rows,
    // Empty rather than fatal: the desk is still readable without the picker.
    searches: searchesResult.data ?? [],
  })
}
