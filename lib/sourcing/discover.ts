/**
 * Finding people for a seat, from the sources that cost nothing to search.
 *
 *   bench   the people we already know, nearest by the desk's own retrieval
 *           (lexical plus embedding, lib/desk/bench.ts's v2 function)
 *   apollo  stubs from the free search, filtered by the brief's lookalike
 *           employers, titles, locations and years
 *   manual  a LinkedIn URL or a name Lily adds by hand
 *
 * Nothing here spends a credit or calls a model. A found person is a pool
 * row with screen = pending; grade.ts decides who is worth a credit.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { approvedBrief, effectiveSpec } from '@/lib/sourcing/brief'
import { searchPeople, type ApolloStub } from '@/lib/sourcing/apollo'
import { upsertFromApolloStub, upsertFromCandidate, upsertManual } from '@/lib/sourcing/people'

export interface DiscoverResult {
  bench: number
  apollo: number
  apolloTotal: number
  added: number
  notes: string[]
}

async function addToPool(admin: SupabaseClient, jobId: string, personId: string, source: 'apollo' | 'bench' | 'manual' | 'partner', meta: Record<string, unknown>, screen: 'pending' | 'promising'): Promise<boolean> {
  const { data, error } = await admin
    .from('sourcing_pool')
    .upsert({ job_id: jobId, person_id: personId, source, source_meta: meta, screen }, { onConflict: 'job_id,person_id', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(`sourcing_pool upsert: ${error.message}`)
  return Boolean(data?.length)
}

export async function discoverForJob(admin: SupabaseClient, jobId: string, opts: { benchLimit?: number; apolloPages?: number; apolloPerPage?: number } = {}): Promise<DiscoverResult> {
  const brief = await approvedBrief(admin, jobId)
  if (!brief) throw new Error('approve the profile first; discovery reads its titles, employers and locations')
  const spec = effectiveSpec(brief)
  const notes: string[] = []
  let added = 0

  // Bench: the desk's own retrieval, already lexical + embedding with the
  // eligibility policy applied. The record is complete, so it skips screening.
  let bench = 0
  const { data: retrieved, error: rpcError } = await admin.rpc('bench_candidates_for_job_v2', { p_job_id: jobId, p_limit: opts.benchLimit ?? 40, p_exclude: [] })
  if (rpcError) notes.push(`bench retrieval failed: ${rpcError.message}`)
  for (const r of (retrieved ?? []) as { candidate_id: string; similarity?: number; retrieval_routes?: string[] }[]) {
    const person = await upsertFromCandidate(admin, r.candidate_id)
    if (!person) continue
    if (await addToPool(admin, jobId, person.id, 'bench', { similarity: r.similarity ?? null, routes: r.retrieval_routes ?? null }, 'promising')) added++
    bench++
  }

  // Apollo: one query on lookalike employers, one on titles alone when the
  // employer list is short. Free; stubs only.
  let apollo = 0
  let apolloTotal = 0
  const domains = spec.employers.map(e => e.domain).filter((d): d is string => Boolean(d))
  const titles = spec.titles.slice(0, 12)
  const locations = spec.onsite === 'remote' ? [] : spec.locations.slice(0, 6)
  const years = { yearsMin: spec.years.min, yearsMax: spec.years.max }
  const queries: { label: string; filters: Parameters<typeof searchPeople>[0]; pages: number }[] = []
  if (domains.length) queries.push({ label: 'lookalike employers', filters: { titles, locations, employerDomains: domains, ...years }, pages: opts.apolloPages ?? 2 })
  if (titles.length && (domains.length < 4 || spec.keywords.length)) {
    queries.push({ label: 'titles and keywords', filters: { titles, locations, keywords: spec.keywords.slice(0, 3).join(' ') || undefined, ...years }, pages: 1 })
  }
  if (!queries.length) notes.push('the profile has no employers or titles to search on; edit it and run again')

  // "Find more" continues where the last run stopped: the highest page each
  // query has already read is on the pool rows it produced.
  const { data: readPages } = await admin.from('sourcing_pool').select('source_meta').eq('job_id', jobId).eq('source', 'apollo')
  const lastPage = new Map<string, number>()
  for (const r of readPages ?? []) {
    const m = r.source_meta as { query?: string; page?: number }
    if (m.query && typeof m.page === 'number') lastPage.set(m.query, Math.max(lastPage.get(m.query) ?? 0, m.page))
  }

  const seen = new Set<string>()
  for (const q of queries) {
    const from = (lastPage.get(q.label) ?? 0) + 1
    for (let page = from; page < from + q.pages; page++) {
      const r = await searchPeople({ ...q.filters, page, perPage: opts.apolloPerPage ?? 100 })
      if (r.error) {
        notes.push(`Apollo (${q.label}): ${r.error}`)
        break
      }
      apolloTotal = Math.max(apolloTotal, r.total)
      const fresh: ApolloStub[] = r.people.filter(p => !seen.has(p.id))
      for (const stub of fresh) {
        seen.add(stub.id)
        const person = await upsertFromApolloStub(admin, stub)
        // A bench person found again through Apollo keeps the bench row.
        if (await addToPool(admin, jobId, person.id, 'apollo', { query: q.label, page, has_email: stub.has_email }, 'pending')) added++
        apollo++
      }
      if (r.people.length < (opts.apolloPerPage ?? 100)) break
    }
  }
  if (apolloTotal > apollo) notes.push(`Apollo reports ${apolloTotal} people for these filters; ${apollo} read so far. "Find more" reads the next pages.`)

  return { bench, apollo, apolloTotal, added, notes }
}

/** Lily adds one person by hand: a name and a LinkedIn URL, resolved on the next enrichment pass. */
export async function addManual(admin: SupabaseClient, jobId: string, input: { name: string; linkedin?: string | null; email?: string | null; title?: string | null; employer?: string | null }): Promise<{ personId: string; added: boolean }> {
  const person = await upsertManual(admin, input)
  // Lily chose them, so they skip the screen; enrichment resolves the LinkedIn URL.
  const added = await addToPool(admin, jobId, person.id, 'manual', {}, 'promising')
  return { personId: person.id, added }
}
