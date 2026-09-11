/**
 * One evidence record per human, reused across searches.
 *
 * A person arrives as an Apollo stub (first name, masked surname, title,
 * employer), as a bench candidate (full record, already consented), or by
 * hand (a LinkedIn URL). Enrichment fills the record once; every later
 * search reads the same row instead of buying the profile again. Emails keep
 * their status and source so "verified by Apollo on 10 Sep" and "guessed"
 * are never the same thing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApolloPerson, ApolloStub } from '@/lib/sourcing/apollo'
import type { ContactStatus, PersonEmail, PersonHistory, PersonRow } from '@/lib/sourcing/types'
import type { ParsedResumeData } from '@/lib/types'

const norm = (e: string) => e.trim().toLowerCase()

function isPersonalDomain(address: string): boolean {
  const d = address.split('@')[1] ?? ''
  return /^(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|me|proton|protonmail|pm|hey|fastmail|aol|msn|ymail)\./i.test(d) || /^(gmail|yahoo|hotmail|outlook|icloud|proton|protonmail|hey|fastmail|aol)\.com$/i.test(d)
}

/** Merge emails by address; a stronger status wins, a bounce always sticks. */
export function mergeEmails(existing: PersonEmail[], incoming: PersonEmail[]): PersonEmail[] {
  const rank: Record<PersonEmail['status'], number> = { bounced: 5, invalid: 4, verified: 3, found: 2, guessed: 1 }
  const byAddr = new Map<string, PersonEmail>()
  for (const e of [...existing, ...incoming]) {
    const a = norm(e.address)
    if (!a.includes('@')) continue
    const cur = byAddr.get(a)
    if (!cur || rank[e.status] > rank[cur.status]) byAddr.set(a, { ...e, address: a })
  }
  return [...byAddr.values()]
}

export function contactStatusOf(emails: PersonEmail[]): ContactStatus {
  const live = emails.filter(e => e.status !== 'bounced' && e.status !== 'invalid')
  if (live.some(e => e.status === 'verified')) return 'verified'
  if (live.some(e => e.status === 'found')) return 'found'
  if (live.some(e => e.status === 'guessed')) return 'guessed'
  return 'none'
}

/** The address to write to, by the sequence's preference, or null. Never one that bounced. */
export function pickAddress(emails: PersonEmail[], preference: 'personal_first' | 'work_first' | 'work_only'): PersonEmail | null {
  const live = emails.filter(e => e.status === 'verified' || e.status === 'found' || e.status === 'guessed')
  const score = (e: PersonEmail) => (e.status === 'verified' ? 3 : e.status === 'found' ? 2 : 1)
  const personal = live.filter(e => e.kind === 'personal').sort((a, b) => score(b) - score(a))
  const work = live.filter(e => e.kind !== 'personal').sort((a, b) => score(b) - score(a))
  if (preference === 'work_only') return work[0] ?? null
  if (preference === 'work_first') return work[0] ?? personal[0] ?? null
  return personal[0] ?? work[0] ?? null
}

function apolloEmailStatus(s: string | null): PersonEmail['status'] | null {
  const v = (s ?? '').toLowerCase()
  if (v === 'verified') return 'verified'
  if (v === 'likely to engage' || v === 'likely_to_engage') return 'found'
  if (v === 'extrapolated' || v === 'guessed') return 'guessed'
  if (v === 'unavailable' || v === 'invalid') return null
  return v ? 'found' : null
}

export async function upsertFromApolloStub(admin: SupabaseClient, stub: ApolloStub): Promise<PersonRow> {
  const { data: existing } = await admin.from('sourcing_people').select('*').eq('apollo_id', stub.id).maybeSingle()
  if (existing) return existing as PersonRow
  const surname = stub.last_name_obfuscated ? ` ${stub.last_name_obfuscated}` : ''
  const { data, error } = await admin
    .from('sourcing_people')
    .insert({
      full_name: `${stub.first_name}${surname}`.trim() || 'Unknown',
      first_name: stub.first_name || null,
      current_title: stub.title,
      current_employer: stub.organization,
      apollo_id: stub.id,
      facts: stub.has_email ? [{ claim: 'Apollo holds an email for this person', source: 'apollo search', url: null, observed_at: new Date().toISOString() }] : [],
    })
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_people insert: ${error.message}`)
  return data as PersonRow
}

/** Fill a record from a full Apollo person. Called once per person per enrichment. */
export async function applyApolloPerson(admin: SupabaseClient, personId: string, p: ApolloPerson, credits: number): Promise<PersonRow> {
  const { data: cur } = await admin.from('sourcing_people').select('*').eq('id', personId).maybeSingle()
  const row = (cur ?? {}) as Partial<PersonRow>
  const now = new Date().toISOString()
  const incoming: PersonEmail[] = []
  const st = apolloEmailStatus(p.email_status)
  if (p.email && st) incoming.push({ address: p.email, kind: isPersonalDomain(p.email) ? 'personal' : 'work', status: st, source: 'apollo', checked_at: now })
  for (const e of p.personal_emails) incoming.push({ address: e, kind: 'personal', status: 'found', source: 'apollo', checked_at: now })
  const history: PersonHistory[] = p.employment_history.map(h => ({ title: h.title, employer: h.organization_name, start: h.start_date, end: h.end_date, current: h.current, description: h.description }))
  const location = [p.city, p.state, p.country].filter(Boolean).join(', ') || row.location || null
  const links = { ...(row.links ?? {}), ...(p.linkedin_url ? { linkedin: p.linkedin_url } : {}), ...(p.github_url ? { github: p.github_url } : {}) }
  const facts = [...(row.facts ?? [])]
  if (p.headline) facts.push({ claim: `Headline: ${p.headline}`, source: 'apollo', url: p.linkedin_url, observed_at: now })
  const { data, error } = await admin
    .from('sourcing_people')
    .update({
      full_name: p.name || row.full_name,
      first_name: p.first_name ?? row.first_name ?? null,
      last_name: p.last_name ?? row.last_name ?? null,
      headline: p.headline ?? row.headline ?? null,
      current_title: p.title ?? row.current_title ?? null,
      current_employer: p.organization_name ?? row.current_employer ?? null,
      employer_domain: p.organization_domain ?? row.employer_domain ?? null,
      location,
      links,
      emails: mergeEmails(row.emails ?? [], incoming),
      history: history.length ? history : row.history ?? [],
      facts: facts.slice(-30),
      apollo_id: p.id,
      last_enriched_at: now,
      enrichment_credits: (row.enrichment_credits ?? 0) + credits,
    })
    .eq('id', personId)
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_people update: ${error.message}`)
  return data as PersonRow
}

/** A bench candidate becomes a person record (or is found again by candidate_id). */
export async function upsertFromCandidate(admin: SupabaseClient, candidateId: string): Promise<PersonRow | null> {
  const { data: existing } = await admin.from('sourcing_people').select('*').eq('candidate_id', candidateId).maybeSingle()
  if (existing) return existing as PersonRow
  const { data: c } = await admin.from('candidates').select('id, name, email, linkedin_url, location, relocation_ok, parsed_data, experience_years').eq('id', candidateId).maybeSingle()
  if (!c) return null
  const parsed = (c.parsed_data ?? {}) as Partial<ParsedResumeData>
  const history: PersonHistory[] = (parsed.work_history ?? []).map(h => ({
    title: h.title ?? null,
    employer: h.company ?? null,
    start: h.start_date ?? null,
    end: h.end_date ?? null,
    current: Boolean(h.is_current) || /present|current/i.test(String(h.end_date ?? h.duration ?? '')),
    description: [h.description, ...(h.highlights ?? [])].filter(Boolean).join(' ') + (h.technologies?.length ? ` Technologies: ${h.technologies.join(', ')}` : '') || null,
  }))
  const education = (parsed.education ?? []).map(e => ({
    school: e.institution ?? null,
    degree: [e.degree, e.field].filter(Boolean).join(', ') || null,
    end: e.end_year ?? e.year ?? null,
  }))
  const current = history.find(h => h.current) ?? history[0]
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('sourcing_people')
    .insert({
      full_name: c.name,
      first_name: String(c.name).trim().split(/\s+/)[0] || null,
      headline: parsed.summary ? String(parsed.summary).slice(0, 300) : null,
      current_title: parsed.current_title ?? current?.title ?? null,
      current_employer: parsed.current_company ?? current?.employer ?? null,
      location: c.location,
      relocation: c.relocation_ok === true ? 'willing' : c.relocation_ok === false ? 'unwilling' : 'unknown',
      links: c.linkedin_url ? { linkedin: c.linkedin_url } : {},
      emails: c.email ? [{ address: norm(c.email), kind: isPersonalDomain(c.email) ? 'personal' : 'unknown', status: 'verified', source: 'bench', checked_at: now }] : [],
      history,
      education,
      facts: [{ claim: 'On the Refery bench; consent to be put forward already asked', source: 'bench', url: null, observed_at: now }],
      candidate_id: c.id,
      last_enriched_at: now,
    })
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_people insert (bench): ${error.message}`)
  return data as PersonRow
}

/** A person added by hand: a LinkedIn URL, resolved through Apollo later. */
export async function upsertManual(admin: SupabaseClient, input: { name: string; linkedin?: string | null; email?: string | null; title?: string | null; employer?: string | null }): Promise<PersonRow> {
  if (input.linkedin) {
    const { data: existing } = await admin.from('sourcing_people').select('*').ilike('links->>linkedin', input.linkedin).maybeSingle()
    if (existing) return existing as PersonRow
  }
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('sourcing_people')
    .insert({
      full_name: input.name,
      first_name: input.name.trim().split(/\s+/)[0] || null,
      current_title: input.title ?? null,
      current_employer: input.employer ?? null,
      links: input.linkedin ? { linkedin: input.linkedin } : {},
      emails: input.email ? [{ address: norm(input.email), kind: isPersonalDomain(input.email) ? 'personal' : 'work', status: 'found', source: 'manual', checked_at: now }] : [],
    })
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_people insert (manual): ${error.message}`)
  return data as PersonRow
}

/** The record as the grader reads it: plain text, provenance kept. */
export function personText(p: PersonRow): string {
  const hist = p.history.length
    ? p.history.map(h => `- ${h.title ?? '?'} at ${h.employer ?? '?'} (${h.start ?? '?'} to ${h.current ? 'now' : h.end ?? '?'})${h.description ? `: ${h.description.slice(0, 400)}` : ''}`).join('\n')
    : '(no employment history on record)'
  const edu = p.education.length ? p.education.map(e => `- ${e.degree ?? ''} ${e.school ?? ''} ${e.end ?? ''}`.trim()).join('\n') : null
  return [
    `NAME: ${p.full_name}`,
    p.headline ? `HEADLINE: ${p.headline}` : null,
    `CURRENT: ${p.current_title ?? '?'} at ${p.current_employer ?? '?'}`,
    `LOCATION: ${p.location ?? 'unknown'} · relocation: ${p.relocation}`,
    `HISTORY:\n${hist}`,
    edu ? `EDUCATION:\n${edu}` : null,
    p.facts.length ? `OTHER FACTS:\n${p.facts.map(f => `- ${f.claim} [${f.source}]`).join('\n')}` : null,
    p.links.linkedin ? `LINKEDIN: ${p.links.linkedin}` : null,
    p.links.github ? `GITHUB: ${p.links.github}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Mark one address bounced on the record. */
export async function markBounced(admin: SupabaseClient, personId: string, address: string): Promise<void> {
  const { data } = await admin.from('sourcing_people').select('emails').eq('id', personId).maybeSingle()
  const emails = ((data?.emails as PersonEmail[]) ?? []).map(e => (norm(e.address) === norm(address) ? { ...e, status: 'bounced' as const, checked_at: new Date().toISOString() } : e))
  await admin.from('sourcing_people').update({ emails }).eq('id', personId)
}
