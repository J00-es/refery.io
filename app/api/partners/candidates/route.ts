import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter } from '@/lib/current-user'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { submissionStatus } from '@/lib/partners'

/**
 * The candidates a scout can put forward for a role.
 *
 * Scoped to their own book — `candidateOwnershipFilter` runs the check in
 * Postgres rather than filtering an already-truncated page — and annotated with
 * what is already in flight for this role.
 *
 * A candidate another scout submitted comes back marked `taken` with no name
 * attached to it. The picker needs to say "someone has this person on this
 * role" so nobody wastes an evening on a duplicate, but saying *who* would turn
 * the desk into a leaderboard of each other's pipelines.
 */
export async function GET(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const jobId = url.searchParams.get('job_id')
  const q = (url.searchParams.get('q') ?? '').trim()

  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 })

  const adminClient = createAdminClient()

  const { data: role } = await adminClient
    .from('partner_roles')
    .select('job_id, company_id')
    .eq('job_id', jobId)
    .maybeSingle()

  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const unlocked =
    access.seesEverything || access.assignedCompanyIds.has(role.company_id as string)
  if (!unlocked) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let query = adminClient
    .from('candidates')
    .select(
      'id, name, location, panel_grade, availability_status, journey_stage, experience_years, skills, updated_at',
    )
    .order('updated_at', { ascending: false })
    .limit(60)

  if (!access.seesAllCandidates) {
    query = query.or(candidateOwnershipFilter(access.appUser.id))
  }

  // Name only, and a plain `ilike` rather than a second `.or()`: the ownership
  // filter already owns the `or` slot, and stacking two would AND two disjunctions
  // in a way that is easy to get subtly wrong.
  if (q) query = query.ilike('name', `%${q.replace(/[%,()]/g, ' ')}%`)

  const [{ data: candidates, error }, { data: submissions }] = await Promise.all([
    query,
    adminClient
      .from('role_submissions')
      .select('candidate_id, status, submitted_by_user_id')
      .eq('job_id', jobId),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const claimed = new Map(
    (submissions ?? []).map(s => [
      s.candidate_id as string,
      { mine: s.submitted_by_user_id === access.appUser.id, status: s.status as string },
    ]),
  )

  return NextResponse.json({
    candidates: (candidates ?? []).map(c => {
      const claim = claimed.get(c.id as string)
      return {
        ...c,
        submitted: Boolean(claim),
        submitted_by_me: claim?.mine ?? false,
        submitted_status: claim ? submissionStatus(claim.status).label : null,
      }
    }),
  })
}
