/**
 * The checks that stand between "fit" and "ready", run when a person is
 * graded and again in the second before a send. None of them is a model.
 *
 *   do_not_contact      they asked, or the record says so
 *   client_employee     they work at a client with a live search
 *   protected           a partner submitted them, so the partner owns them
 *   on_desk             they are already in a client process on the desk
 *   in_sequence         another run is writing to them now
 *   contacted_recently  we wrote to them in the last 180 days
 *   clear               none of the above
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersonRow, RelationshipStatus } from '@/lib/sourcing/types'

const RECENT_DAYS = 180
const IN_PROCESS_STAGES = ['warm', 'committee_call', 'placed', 'client_interview', 'offer']

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

let clientCache: { at: number; rows: { name: string; domain: string | null }[] } | null = null

/** Companies with a live search, by name and domain. Cached for a minute per process. */
async function liveClients(admin: SupabaseClient): Promise<{ name: string; domain: string | null }[]> {
  if (clientCache && Date.now() - clientCache.at < 60_000) return clientCache.rows
  const { data: seats } = await admin.from('partner_roles_v').select('company_id, company_name').eq('is_live', true).eq('job_status', 'open')
  const ids = [...new Set((seats ?? []).map(s => s.company_id as string).filter(Boolean))]
  const { data: companies } = ids.length ? await admin.from('companies').select('id, name, website').in('id', ids) : { data: [] }
  const rows = (companies ?? []).map(c => ({ name: String(c.name ?? '').toLowerCase(), domain: domainOf(c.website as string | null) }))
  clientCache = { at: Date.now(), rows }
  return rows
}

export interface CheckResult {
  status: RelationshipStatus
  note: string | null
}

export async function relationshipCheck(admin: SupabaseClient, person: PersonRow, jobId: string, opts: { excludeRunId?: string } = {}): Promise<CheckResult> {
  if (person.do_not_contact) return { status: 'do_not_contact', note: person.do_not_contact_reason ?? 'asked not to be contacted' }
  const addresses = person.emails.map(e => e.address.toLowerCase())
  if (addresses.length) {
    const { data: sup } = await admin.from('sourcing_suppressions').select('email, reason').in('email', addresses).limit(1)
    if (sup?.length) return { status: 'do_not_contact', note: sup[0].reason }
  }

  const clients = await liveClients(admin)
  const employer = (person.current_employer ?? '').toLowerCase().trim()
  const domain = (person.employer_domain ?? '').toLowerCase()
  const client = clients.find(c => (employer && c.name && (c.name === employer || employer.startsWith(c.name) || c.name.startsWith(employer))) || (domain && c.domain && c.domain === domain))
  if (client) return { status: 'client_employee', note: `works at ${person.current_employer}, a client with a live search` }

  if (person.candidate_id) {
    const { data: subs } = await admin.from('role_submissions').select('id, job_id, created_at').eq('candidate_id', person.candidate_id).limit(3)
    if (subs?.length) return { status: 'protected', note: `submitted by a partner (${subs.length} submission${subs.length === 1 ? '' : 's'}); the partner owns the relationship` }
    const { data: cand } = await admin.from('candidates').select('journey_stage').eq('id', person.candidate_id).maybeSingle()
    if (cand?.journey_stage && IN_PROCESS_STAGES.includes(cand.journey_stage)) return { status: 'on_desk', note: `already ${cand.journey_stage.replace(/_/g, ' ')} on the desk` }
  }

  let runs = admin.from('sourcing_runs').select('id, job_id, state').eq('person_id', person.id).in('state', ['queued', 'active', 'ooo', 'paused'])
  if (opts.excludeRunId) runs = runs.neq('id', opts.excludeRunId)
  const { data: active } = await runs.limit(1)
  if (active?.length) return { status: 'in_sequence', note: active[0].job_id === jobId ? 'already in this search’s sequence' : 'in another search’s sequence' }

  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString()
  const { data: sent } = await admin.from('sourcing_events').select('job_id, created_at').eq('person_id', person.id).eq('kind', 'sent').gte('created_at', since).order('created_at', { ascending: false }).limit(1)
  if (sent?.length) return { status: 'contacted_recently', note: `written to on ${sent[0].created_at.slice(0, 10)}${sent[0].job_id === jobId ? ' for this search' : ' for another search'}` }
  if (person.last_contacted_at && new Date(person.last_contacted_at).getTime() > Date.now() - RECENT_DAYS * 86_400_000) {
    return { status: 'contacted_recently', note: `written to on ${person.last_contacted_at.slice(0, 10)}` }
  }

  return { status: 'clear', note: null }
}
