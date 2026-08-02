import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { BatchUpload } from '@/components/batch-upload'
import { CompanyList, type CompanyStats } from '@/components/company-list'
import type { CompanyRow } from '@/components/companies/company-card'
import { getAppUser } from '@/lib/current-user'
import { FOCUS } from '@/lib/candidate-ui'
import { RAISE_BANDS, RECENCY_BANDS } from '@/lib/company-ui'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const many = (v: string | string[] | undefined) => one(v).split(',').filter(Boolean)

/** ISO date N months before today, for the "funded within" filter. */
function monthsAgo(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return d.toISOString().slice(0, 10)
}

export default async function CompaniesPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const adminClient = createAdminClient()
  const appUser = await getAppUser()
  const isAdmin = appUser?.isAdmin ?? false

  const q = one(sp.q).trim()
  const stages = many(sp.stage)
  const rounds = many(sp.round)
  const raise = many(sp.raise)
  const funded = one(sp.funded)
  const openOnly = one(sp.open) === '1'
  const dncOnly = one(sp.dnc) === '1' && isAdmin
  const sort = one(sp.sort) || 'recent_funding'
  const page = Math.max(1, parseInt(one(sp.page) || '1', 10) || 1)

  /*
    Every filter runs in Postgres against companies_list, which carries the
    active job count as a column. The previous implementation fetched the whole
    table and filtered in the browser — at ~20k rows that silently truncated at
    PostgREST's 1000-row ceiling, so the header count never matched the list.
  */
  let query = adminClient.from('companies_list').select('*', { count: 'exact' })

  if (q) {
    // Commas and parens are PostgREST `or` syntax; neutralise them.
    const safe = q.replace(/[,()]/g, ' ')
    query = query.or(`name.ilike.%${safe}%,industry.ilike.%${safe}%,location.ilike.%${safe}%`)
  }
  if (stages.length) query = query.in('stage', stages)
  if (rounds.length) query = query.in('last_funding_type', rounds)

  // Raise bands are OR-ed with each other but AND-ed with everything else.
  if (raise.length) {
    const clauses = raise
      .map(k => RAISE_BANDS.find(b => b.key === k))
      .filter((b): b is (typeof RAISE_BANDS)[number] => Boolean(b))
      .map(b =>
        b.max === null
          ? `last_funding_amount_usd.gte.${b.min}`
          : `and(last_funding_amount_usd.gte.${b.min},last_funding_amount_usd.lt.${b.max})`,
      )
    if (clauses.length) query = query.or(clauses.join(','))
  }

  if (funded) {
    const band = RECENCY_BANDS.find(b => b.key === funded)
    if (band) query = query.gte('last_funding_date', monthsAgo(band.months))
  }
  if (openOnly) query = query.gt('active_job_count', 0)
  if (dncOnly) query = query.eq('do_not_contact', true)

  switch (sort) {
    case 'largest_round':
      query = query.order('last_funding_amount_usd', { ascending: false, nullsFirst: false })
      break
    case 'name':
      query = query.order('name', { ascending: true })
      break
    case 'newest':
      query = query.order('created_at', { ascending: false, nullsFirst: false })
      break
    default:
      query = query.order('last_funding_date', { ascending: false, nullsFirst: false })
  }

  const from = (page - 1) * PAGE_SIZE
  const { data, count } = await query.range(from, from + PAGE_SIZE - 1)

  const companies: CompanyRow[] = (data ?? []).map(c => {
    const row = c as unknown as CompanyRow & { active_job_count?: number }
    return { ...row, jobCount: row.active_job_count ?? 0, isFromDatabase: true }
  })

  // Portfolio numbers for the admin strip — head-only counts, no rows fetched.
  let stats: CompanyStats | null = null
  if (isAdmin) {
    const [totalRes, openRes, fundedRes, missingRes] = await Promise.all([
      adminClient.from('companies').select('id', { count: 'exact', head: true }),
      adminClient
        .from('companies_list')
        .select('id', { count: 'exact', head: true })
        .gt('active_job_count', 0),
      adminClient
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .gte('last_funding_date', monthsAgo(6)),
      adminClient
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .is('last_funding_amount_usd', null),
    ])
    stats = {
      total: totalRes.count ?? 0,
      withOpenRoles: openRes.count ?? 0,
      fundedLast6Mo: fundedRes.count ?? 0,
      missingFunding: missingRes.count ?? 0,
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[36px]">
            Companies
          </h1>
          <p className="mt-2 text-[14px] text-[#6E6E68] sm:text-[15px]">
            Stage, last round, and who is hiring — across the whole network.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <BatchUpload type="companies" />
          <Link
            href="/companies/new"
            className={`flex h-11 items-center rounded-full bg-[#1F4D3A] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#173D2E] ${FOCUS}`}
          >
            Add company
          </Link>
        </div>
      </header>

      <CompanyList
        companies={companies}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        isAdmin={isAdmin}
        stats={stats}
      />
    </div>
  )
}
