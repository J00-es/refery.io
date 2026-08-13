import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BatchUpload } from '@/components/batch-upload'
import { JobList } from '@/components/job-list'
import type { JobRow } from '@/components/jobs/job-card'
import { getAppUser } from '@/lib/current-user'
import { FOCUS } from '@/lib/candidate-ui'
import {
  POSTED_BANDS,
  SALARY_BANDS,
  functionFilterClauses,
} from '@/lib/job-ui'
import { JobsBoardNote } from '@/components/jobs/jobs-board-note'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const many = (v: string | string[] | undefined) => one(v).split(',').filter(Boolean)

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

export default async function JobsPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const adminClient = createAdminClient()
  const appUser = await getAppUser()

  if (!appUser) {
    return <div>Please log in to view jobs.</div>
  }

  const isAdmin = appUser.isAdmin
  // Pipeline visibility follows the candidate rule, not the admin-console one:
  // only the super admin sees candidates that are not their own, so only they
  // get a board-wide pipeline count. Everyone else sees their own count.
  const canViewAllPipeline = appUser.canViewAllCandidates

  const q = one(sp.q).trim()
  const fns = many(sp.fn)
  const locs = many(sp.loc)
  const locq = one(sp.locq).trim()
  const levels = many(sp.lvl)
  const remotes = many(sp.remote)
  const stages = many(sp.stage)
  const pay = many(sp.pay)
  const statuses = isAdmin ? many(sp.status) : []
  const posted = one(sp.posted)
  const withCands = one(sp.cands) === '1'
  const paidOnly = one(sp.paid) === '1'
  const sort = one(sp.sort) || 'newest'
  const page = Math.max(1, parseInt(one(sp.page) || '1', 10) || 1)

  /*
    All filtering runs in Postgres against jobs_list. The table holds ~73k rows;
    the previous implementation pulled a 2,000-row slice and filtered it in the
    browser, so most of the board was simply unreachable and the header count
    described the slice rather than the board.
  */
  let query = adminClient.from('jobs_list').select('*', { count: 'exact' })

  // Only admins see drafts and closed roles. Everyone else sees open roles,
  // which is what the old page enforced too.
  if (!isAdmin) query = query.eq('status', 'open')
  else if (statuses.length) query = query.in('status', statuses)

  if (q) {
    const safe = q.replace(/[,()]/g, ' ')
    query = query.or(`title.ilike.%${safe}%,company_name.ilike.%${safe}%,location.ilike.%${safe}%`)
  }

  // Department is free text and fragmented, so each function bucket expands to
  // a set of ILIKE patterns, all OR-ed into one clause.
  if (fns.length) {
    const clauses = functionFilterClauses(fns)
    if (clauses.length) query = query.or(clauses.join(','))
  }

  // Metro/region buckets, normalised in Postgres — see job_location_buckets().
  // A role matching any selected market qualifies, so this is an array overlap
  // rather than a containment check.
  if (locs.length) query = query.overlaps('location_buckets', locs)

  // The buckets cover ~85% of open roles; the rest is a long tail of one-off
  // towns and office names. This keeps every one of them reachable.
  if (locq) query = query.ilike('location', `%${locq.replace(/[%*]/g, ' ')}%`)

  if (levels.length) query = query.in('seniority', levels)

  if (remotes.length) query = query.in('remote_policy', remotes)
  if (stages.length) query = query.in('company_stage', stages)

  // Salary bands match on salary_max, which is null on 87% of rows — so a band
  // silently drops them. This makes that exclusion something you can ask for
  // on its own rather than only stumble into.
  if (paidOnly) query = query.not('salary_max', 'is', null)

  // Salary bands are OR-ed with each other. Matched against salary_max so a
  // wide posted range still lands in the band a referrer would expect.
  if (pay.length) {
    const clauses = pay
      .map(k => SALARY_BANDS.find(b => b.key === k))
      .filter((b): b is (typeof SALARY_BANDS)[number] => Boolean(b))
      .map(b => {
        if (b.min === null) return `salary_max.lt.${b.max}`
        if (b.max === null) return `salary_max.gte.${b.min}`
        return `and(salary_max.gte.${b.min},salary_max.lt.${b.max})`
      })
    if (clauses.length) query = query.or(clauses.join(','))
  }

  if (posted) {
    const band = POSTED_BANDS.find(b => b.key === posted)
    if (band) query = query.gte('created_at', daysAgoIso(band.days))
  }
  if (withCands) {
    // "Roles with candidates" means *my* candidates unless you are the super
    // admin. candidate_owner_ids makes that one array-contains rather than
    // inlining thousands of job ids — one recruiter matches 2,064 roles.
    query = canViewAllPipeline
      ? query.gt('pipeline_count', 0)
      : query.contains('candidate_owner_ids', [appUser.id])
  }

  switch (sort) {
    case 'salary':
      query = query.order('salary_max', { ascending: false, nullsFirst: false })
      break
    case 'pipeline':
      // Ordering by the board-wide count would rank roles by other partners'
      // activity, so this sort is super-admin only; others fall through.
      if (canViewAllPipeline) {
        query = query.order('pipeline_count', { ascending: false })
        break
      }
      query = query.order('created_at', { ascending: false, nullsFirst: false })
      break
    case 'company':
      query = query.order('company_name', { ascending: true })
      break
    case 'title':
      query = query.order('title', { ascending: true })
      break
    default:
      query = query.order('created_at', { ascending: false, nullsFirst: false })
  }

  const from = (page - 1) * PAGE_SIZE
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1)
  let jobs = (data ?? []) as unknown as JobRow[]

  // Replace the board-wide count with this viewer's own, for just the 24 rows
  // on screen. Without this a partner reads another partner's submission
  // volume off every card.
  if (!canViewAllPipeline && jobs.length) {
    const { data: mine } = await adminClient
      .from('job_candidate_owner_counts')
      .select('job_id, cnt')
      .eq('owner_user_id', appUser.id)
      .in('job_id', jobs.map(j => j.id))
    const byJob = new Map((mine ?? []).map(r => [r.job_id as string, r.cnt as number]))
    jobs = jobs.map(j => ({ ...j, pipeline_count: byJob.get(j.id) ?? 0 }))
  }

  /*
    The board used to open on a strip of four counts — open roles, new this week,
    with candidates, remote. Each was also a filter shortcut, but every one of
    those filters is in the row below, so the strip was four numbers nobody
    decided anything with. Removing it also removes four count queries per page
    load against an 80k-row view.
  */

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[36px]">
            Jobs
          </h1>
          <p className="mt-2 text-[14px] text-[#6E6E68] sm:text-[15px]">
            {isAdmin
              ? 'Every role on the board — filter by function, pay, stage or pipeline.'
              : 'Open roles across the network. Find one, refer someone great.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <BatchUpload type="jobs" />
          <Link
            href="/jobs/new"
            className={`flex h-11 items-center rounded-full bg-[#1F4D3A] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] ${FOCUS}`}
          >
            Add role
          </Link>
        </div>
      </header>

      {/* Most of this board is sourced, not signed, and nobody can read that
          off a job card — so the explanation sits on the page itself. It no
          longer counts or marks the roles we do have an agreement on: doing that
          next to a company name disclosed the client list to the whole network.
          Those live on the Partners desk, behind assignment. */}
      <JobsBoardNote />

      <JobList
        jobs={jobs}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        isAdmin={isAdmin}
        canViewAllPipeline={canViewAllPipeline}
      />
    </div>
  )
}
