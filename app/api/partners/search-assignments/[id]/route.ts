import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { actingFor, resolvePartnerAccess } from '@/lib/partners-access'
import type { SearchAssignmentStatus } from '@/lib/partners'
import { noteProposalDeclined } from '@/lib/desk-notifications'
import { sendSearchProposalEmail } from '@/lib/search-proposal-email'

/**
 * A partner answering a proposal, or an admin moving an assignment.
 *
 * A partner may only touch their own row, and only in two directions: confirm
 * (`working`) or decline with a reason. The reason is required because it is
 * the whole point of asking: "no SF supply" and "comp too low" tell Refery
 * different things about where to look next. An admin can set any status,
 * which is how a working partner gets paused rather than removed.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { id } = await params
  const body = await req.json().catch(() => null)

  // A nudge re-sends the proposal email and nothing else. Admin only, and only
  // while the row is still a proposal; a partner who said yes or no is done.
  if (body?.action === 'nudge') {
    if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const adminClient = createAdminClient()
    const { data: row } = await adminClient
      .from('search_assignments')
      .select('id, job_id, company_id, user_id, status, why')
      .eq('id', id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (row.status !== 'proposed') return NextResponse.json({ error: 'Only a proposal can be nudged.' }, { status: 409 })
    const [{ data: role }, { data: partner }] = await Promise.all([
      adminClient
        .from('partner_roles_v')
        .select('job_id, company_id, title, headline, company_name, salary_min, salary_max, fee_percentage, fee_flat, scout_payout, scout_share, location')
        .eq('job_id', row.job_id)
        .maybeSingle(),
      adminClient.from('users_admin').select('email, full_name').eq('user_id', row.user_id).maybeSingle(),
    ])
    if (!role || !partner?.email) return NextResponse.json({ error: 'Could not find the search or the partner.' }, { status: 404 })
    const sent = await sendSearchProposalEmail({
      to: partner.email as string,
      fullName: (partner.full_name as string) ?? '',
      role,
      why: (row.why as string | null) ?? '',
      jobId: row.job_id as string,
      companyId: row.company_id as string,
    })
    if (!sent.sent) return NextResponse.json({ error: sent.error ?? 'The email did not send.' }, { status: 502 })
    await adminClient
      .from('search_assignments')
      .update({ nudged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
    return NextResponse.json({ ok: true, nudged: true })
  }

  const status = body?.status as SearchAssignmentStatus | undefined
  const reason =
    typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 500) : null

  if (!status || !['proposed', 'working', 'declined', 'paused'].includes(status)) {
    return NextResponse.json({ error: 'Unknown status' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: row } = await adminClient
    .from('search_assignments')
    .select('id, user_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const mine = row.user_id === access.appUser.id
  if (!access.canManage) {
    if (!mine) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (status !== 'working' && status !== 'declined') {
      return NextResponse.json({ error: 'You can confirm or decline a search.' }, { status: 403 })
    }
    if (status === 'declined' && !reason) {
      return NextResponse.json({ error: 'Say why in one line, so we know where to look next.' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status, updated_at: now, acted_by_user_id: actingFor(access) }
  if (status === 'working') {
    patch.confirmed_at = now
    patch.expires_at = null
    patch.declined_at = null
    patch.declined_reason = null
  }
  if (status === 'declined') {
    patch.declined_at = now
    patch.declined_reason = reason
    patch.expires_at = null
  }
  if (status === 'paused') patch.paused_at = now
  if (status === 'proposed') {
    patch.proposed_at = now
    patch.declined_at = null
    patch.declined_reason = null
  }
  if (access.canManage && typeof body?.note === 'string') patch.note = body.note.trim().slice(0, 1000) || null

  const { error } = await adminClient.from('search_assignments').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A partner saying no is one of the three things the super admin hears about
  // at once: the search needs someone else, and the reason says where to look.
  if (status === 'declined' && !access.canManage) {
    after(() => noteProposalDeclined(id, reason))
  }

  return NextResponse.json({ ok: true, status })
}

/** Take a partner off a search entirely. Admin only; a partner declines instead. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('search_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
