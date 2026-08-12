import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * Marking a role as a mandate — the act that moves a job off the sourced
 * watchlist and onto the partner desk.
 *
 * Admin only, and deliberately idempotent: the picker sends the full selection
 * for a company every time, so re-sending an unchanged set is a no-op rather
 * than a duplicate-key error.
 */
export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const companyId = typeof body?.company_id === 'string' ? body.company_id : null
  const jobIds: string[] = Array.isArray(body?.job_ids)
    ? body.job_ids.filter((id: unknown): id is string => typeof id === 'string')
    : []

  if (!companyId) return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
  if (!jobIds.length) return NextResponse.json({ error: 'No roles selected' }, { status: 400 })

  const adminClient = createAdminClient()

  // Every job must belong to the company it is being filed under. Without this
  // an admin could file another company's role under a client a scout is
  // assigned to, and the scout would see a role we have no mandate for.
  const { data: jobs } = await adminClient
    .from('jobs')
    .select('id, company_id')
    .in('id', jobIds)

  const valid = (jobs ?? []).filter(j => j.company_id === companyId).map(j => j.id as string)
  const rejected = jobIds.filter(id => !valid.includes(id))
  if (!valid.length) {
    return NextResponse.json(
      { error: 'None of those roles belong to this company' },
      { status: 400 },
    )
  }

  const { error } = await adminClient.from('partner_roles').upsert(
    valid.map(jobId => ({
      job_id: jobId,
      company_id: companyId,
      added_by: access.appUser.id,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'job_id', ignoreDuplicates: true },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ added: valid.length, rejected })
}
