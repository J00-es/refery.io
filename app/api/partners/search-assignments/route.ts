import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { PROPOSAL_DAYS } from '@/lib/partners'
import { sendSearchProposalEmail } from '@/lib/search-proposal-email'

/**
 * Putting partners on a search.
 *
 * Refery proposes; the partner confirms or declines from their Searches page
 * (see PATCH in ./[id]/route.ts). A proposal is not an assignment yet, but it
 * already unlocks the client, because nobody can say yes to a brief they cannot
 * read.
 *
 * Re-proposing someone who declined is allowed and resets their row: supply
 * changes, and "not for me in August" is not a permanent answer.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const jobId = typeof body?.job_id === 'string' ? body.job_id : null
  const why = typeof body?.why === 'string' ? body.why.trim().slice(0, 500) : ''
  const userIds: string[] = Array.isArray(body?.user_ids)
    ? body.user_ids.filter((id: unknown): id is string => typeof id === 'string')
    : []
  // An admin can also put someone straight to working, for a partner who said
  // yes on a call. Default is a proposal they confirm themselves.
  const status = body?.status === 'working' ? 'working' : 'proposed'

  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })
  if (!userIds.length) return NextResponse.json({ error: 'Pick at least one partner' }, { status: 400 })

  const adminClient = createAdminClient()
  const { data: role } = await adminClient
    .from('partner_roles_v')
    .select('job_id, company_id, title, headline, company_name, salary_min, salary_max, fee_percentage, fee_flat, scout_payout, scout_share, location')
    .eq('job_id', jobId)
    .maybeSingle()
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: users } = await adminClient
    .from('users_admin')
    .select('user_id, email, full_name, status')
    .in('user_id', userIds)
  const eligible = (users ?? []).filter(u => u.status === 'active' && u.user_id)
  if (!eligible.length) return NextResponse.json({ error: 'None of those partners are active' }, { status: 400 })

  const now = new Date()
  const expires = new Date(now.getTime() + PROPOSAL_DAYS * 24 * 60 * 60 * 1000)

  const { error } = await adminClient.from('search_assignments').upsert(
    eligible.map(u => ({
      job_id: jobId,
      company_id: role.company_id as string,
      user_id: u.user_id as string,
      status,
      why: why || null,
      proposed_by: access.appUser.id,
      proposed_at: now.toISOString(),
      expires_at: status === 'proposed' ? expires.toISOString() : null,
      confirmed_at: status === 'working' ? now.toISOString() : null,
      declined_at: null,
      declined_reason: null,
      updated_at: now.toISOString(),
    })),
    { onConflict: 'job_id,user_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best effort, never blocking: the assignment exists whether or not the
  // email goes out, and the Searches page shows it either way.
  let emailed = 0
  if (status === 'proposed') {
    for (const u of eligible) {
      const result = await sendSearchProposalEmail({
        to: u.email as string,
        fullName: (u.full_name as string) ?? '',
        role,
        why,
        jobId,
        companyId: role.company_id as string,
      })
      if (result.sent) emailed += 1
    }
  }

  return NextResponse.json({ assigned: eligible.length, status, emailed })
}
