import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'

/**
 * The company's own roles, for the mandate picker.
 *
 * Ingested roles are the raw material: a client with 16 open jobs on their
 * careers page has typically retained us on two or three of them. This returns
 * all of them with the ones already selected flagged, so the picker is a
 * checklist rather than a search.
 *
 * Drafts and closed roles are included for admins because a mandate often
 * arrives before the posting does, and a closed row explains why a mandate has
 * gone quiet.
 */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { companyId } = await params
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  const adminClient = createAdminClient()

  let query = adminClient
    .from('jobs')
    .select('id, title, department, location, remote_policy, status, salary_min, salary_max, created_at')
    .eq('company_id', companyId)
    .order('status', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(200)

  if (q) query = query.ilike('title', `%${q.replace(/[%,()]/g, ' ')}%`)

  const [{ data: jobs, error }, { data: selected }] = await Promise.all([
    query,
    adminClient.from('partner_roles').select('job_id, is_live').eq('company_id', companyId),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const chosen = new Map((selected ?? []).map(r => [r.job_id as string, r.is_live as boolean]))

  return NextResponse.json({
    jobs: (jobs ?? []).map(j => ({
      ...j,
      is_mandate: chosen.has(j.id as string),
      is_live: chosen.get(j.id as string) ?? false,
    })),
  })
}
