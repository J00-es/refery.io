import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Anonymised open roles, for the sign-up page.
 *
 * Partners repeatedly ask to see the work before they commit (Tim Kirby wanted
 * sample JDs to match against his database before signing). This answers that
 * without naming a client, since every company name on the platform is
 * confidential under the Partner Terms.
 *
 * Only roles at companies with a *signed* agreement count. A company that is
 * still deciding, or that declined, is not live inventory and must not be shown
 * as though it were.
 */

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Below this the block stays hidden. Three roles reads worse than no roles.
const MIN_ROLES_TO_SHOW = 4
const MAX_ROLES = 6

function band(min: number | null, max: number | null): string | null {
  const k = (n: number) => `$${Math.round(n / 1000)}k`
  if (min && max) return `${k(min)} to ${k(max)}`
  if (min) return `from ${k(min)}`
  if (max) return `up to ${k(max)}`
  return null
}

export async function GET() {
  try {
    const admin = createAdminClient()

    const { data: signed } = await admin
      .from('client_agreement_links')
      .select('company_id')
      .eq('status', 'signed')

    const companyIds = Array.from(new Set((signed ?? []).map((r) => r.company_id))).filter(Boolean)
    if (companyIds.length === 0) {
      return NextResponse.json({ roles: [], total: 0 })
    }

    const { data: jobs, error } = await admin
      .from('jobs')
      .select('id, title, location, salary_min, salary_max, created_at')
      .in('company_id', companyIds)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[roles/preview] query failed:', error)
      return NextResponse.json({ roles: [], total: 0 })
    }

    const all = jobs ?? []
    if (all.length < MIN_ROLES_TO_SHOW) {
      return NextResponse.json({ roles: [], total: all.length })
    }

    return NextResponse.json({
      total: all.length,
      roles: all.slice(0, MAX_ROLES).map((j) => ({
        title: (j.title || '').trim(),
        location: (j.location || '').trim() || null,
        compensation: band(j.salary_min, j.salary_max),
      })),
    })
  } catch (err) {
    console.error('[roles/preview] error:', err)
    return NextResponse.json({ roles: [], total: 0 })
  }
}
