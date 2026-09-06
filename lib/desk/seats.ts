/**
 * The live seats: every open role on a live search, in the two forms the desk
 * needs. `brief` is what the panel reads. `label(named)` is how an email refers
 * to it, with the client named only for a partner who has signed, because that
 * is the rule Lily gave Veronica.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { shortIndustry } from '@/lib/partners'

export interface Seat {
  jobId: string
  companyId: string
  companyName: string
  title: string
  headline: string
  location: string | null
  remotePolicy: string | null
  salaryMin: number | null
  salaryMax: number | null
  visaRequirement: string | null
  yearsMin: number | null
  yearsMax: number | null
  musts: string[]
  notFor: string | null
  context: string | null
  searchStage: string
  stage: string | null
  industry: string | null
  /** "a seed-stage AI lab in San Francisco" */
  anon: string
  hiringManagerName: string | null
  hiringManagerEmail: string | null
  decisionDays: number | null
}

const k = (n: number) => `$${Math.round(n / 1000)}k`

/** "a seed-stage AI lab in San Francisco": what an email says before the client is named. */
export function anonSeatLabel(input: { alias?: string | null; stage?: string | null; industry?: string | null; location?: string | null }): string {
  if (input.alias?.trim()) return input.alias.trim()
  const stage = (input.stage ?? '').toLowerCase().replace(/_/g, ' ').trim()
  const stageWord = /seed/.test(stage) ? 'seed-stage' : /series/.test(stage) ? stage.replace(/^series\s*/, 'Series ') : stage ? `${stage}` : 'early-stage'
  const ind = shortIndustry(input.industry)?.toLowerCase() ?? 'startup'
  const city = (input.location ?? '').split(/[,(]/)[0].trim()
  const article = /^[aeiou]/i.test(stageWord) ? 'an' : 'a'
  return `${article} ${stageWord} ${ind}${/company|startup|lab/.test(ind) ? '' : ' company'}${city ? ` in ${city}` : ''}`
}

export function seatLabel(seat: Seat, named: boolean): string {
  const where = seat.location ? seat.location.replace(/\s*\(.*\)$/, '') : null
  if (named) return `${seat.headline || seat.title} at ${seat.companyName}${where ? ` (${where})` : ''}`
  return `${seat.headline || seat.title} at ${seat.anon}`
}

export function seatBand(seat: Seat): string | null {
  if (seat.salaryMin && seat.salaryMax) return `${k(seat.salaryMin)} to ${k(seat.salaryMax)}`
  if (seat.salaryMax) return `up to ${k(seat.salaryMax)}`
  if (seat.salaryMin) return `${k(seat.salaryMin)}+`
  return null
}

/** The brief as the panel reads it. Facts only, in a fixed order, so the cached prefix stays byte-stable. */
export function seatBrief(seat: Seat): string {
  const years =
    seat.yearsMin != null && seat.yearsMax != null
      ? `${seat.yearsMin} to ${seat.yearsMax} years`
      : seat.yearsMin
        ? `${seat.yearsMin}+ years`
        : seat.yearsMax
          ? `up to ${seat.yearsMax} years`
          : 'years not stated'
  return [
    `SEAT ${seat.jobId}`,
    `${seat.headline || seat.title} at ${seat.companyName} (${seat.stage ?? 'stage unknown'}${seat.industry ? `, ${seat.industry}` : ''})`,
    `Location: ${seat.location ?? 'not stated'} · ${seat.remotePolicy ?? 'policy not stated'}`,
    `Pay: ${seatBand(seat) ?? 'not stated'} · Work authorisation: ${seat.visaRequirement?.replace(/_/g, ' ') ?? 'not stated'} · ${years}`,
    seat.musts.length ? `Must: ${seat.musts.join('; ')}` : null,
    seat.notFor ? `Not for: ${seat.notFor}` : null,
    seat.context ? `Context: ${seat.context.slice(0, 600)}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function loadLiveSeats(admin: SupabaseClient, jobIds?: string[]): Promise<Seat[]> {
  let q = admin
    .from('partner_roles_v')
    .select(
      'job_id, company_id, company_name, company_stage, title, headline, location, remote_policy, salary_min, salary_max, visa_requirement, experience_years_min, experience_years_max, hard_requirements, not_for, context, search_stage, hiring_manager_name, is_live, job_status, decision_days',
    )
    .eq('is_live', true)
    .eq('job_status', 'open')
    .order('company_name')
  if (jobIds?.length) q = q.in('job_id', jobIds)
  const { data } = await q
  const rows = (data ?? []) as Record<string, unknown>[]

  const companyIds = [...new Set(rows.map(r => r.company_id as string).filter(Boolean))]
  const { data: companies } = companyIds.length
    ? await admin.from('companies').select('id, industry, vertical, stage, location').in('id', companyIds)
    : { data: [] }
  const co = new Map((companies ?? []).map(c => [c.id as string, c as Record<string, unknown>]))
  const { data: hms } = companyIds.length
    ? await admin.from('client_companies').select('company_id, contact_name, contact_email, anon_alias').in('company_id', companyIds)
    : { data: [] }
  const hm = new Map((hms ?? []).map(c => [c.company_id as string, c as Record<string, unknown>]))

  return rows.map(r => {
    const c = co.get(r.company_id as string) ?? {}
    const h = hm.get(r.company_id as string) ?? {}
    const industry = (c.vertical as string | null) || (c.industry as string | null) || null
    return {
      jobId: r.job_id as string,
      companyId: r.company_id as string,
      companyName: (r.company_name as string) ?? 'a client',
      title: r.title as string,
      headline: (r.headline as string) ?? (r.title as string),
      location: (r.location as string) ?? null,
      remotePolicy: (r.remote_policy as string) ?? null,
      salaryMin: (r.salary_min as number) ?? null,
      salaryMax: (r.salary_max as number) ?? null,
      visaRequirement: (r.visa_requirement as string) ?? null,
      yearsMin: (r.experience_years_min as number) ?? null,
      yearsMax: (r.experience_years_max as number) ?? null,
      musts: Array.isArray(r.hard_requirements) ? (r.hard_requirements as string[]) : [],
      notFor: (r.not_for as string) ?? null,
      context: (r.context as string) ?? null,
      searchStage: (r.search_stage as string) ?? 'sourcing',
      stage: (r.company_stage as string) ?? (c.stage as string) ?? null,
      industry,
      anon: anonSeatLabel({ alias: (h.anon_alias as string) ?? null, stage: (c.stage as string) ?? (r.company_stage as string) ?? null, industry, location: (r.location as string) ?? (c.location as string) ?? null }),
      hiringManagerName: (r.hiring_manager_name as string) ?? (h.contact_name as string) ?? null,
      hiringManagerEmail: (h.contact_email as string) ?? null,
      decisionDays: (r.decision_days as number) ?? null,
    }
  })
}
