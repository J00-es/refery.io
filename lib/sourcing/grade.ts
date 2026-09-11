/**
 * Reading people against the brief, in three passes that get dearer as the
 * pool gets smaller:
 *
 *   screen   twenty stubs per cheap call: is this title at this employer
 *            worth a credit? Bench and manual people skip it.
 *   enrich   one Apollo credit per promising person, inside a monthly cap
 *            kept in desk_settings (sourcing_apollo_monthly_cap, default 1000).
 *   grade    one structured call per enriched person: a verdict on every
 *            requirement with the evidence it rests on, a grade, three
 *            bullets, and a hook only when the record states the fact.
 *
 * The hook is checked, not trusted: the evidence line must appear in the
 * record or the hook is dropped and the email opens plainly.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { structured } from '@/lib/desk/model'
import { BudgetDeferredError } from '@/lib/engine/ledger'
import { approvedBrief, briefText, effectiveSpec } from '@/lib/sourcing/brief'
import { creditsThisMonth, matchPerson } from '@/lib/sourcing/apollo'
import { applyApolloPerson, contactStatusOf, personText } from '@/lib/sourcing/people'
import { relationshipCheck } from '@/lib/sourcing/checks'
import { GradeOutput, type BriefSpec, type PersonRow, type PoolRow } from '@/lib/sourcing/types'

const DEFAULT_CREDIT_CAP = 1000

export interface PipelineResult {
  screened: number
  screenedOut: number
  enriched: number
  enrichCredits: number
  graded: number
  fit: number
  notes: string[]
}

async function setting<T>(admin: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('desk_settings').select('value').eq('key', key).maybeSingle()
  return (data?.value as T | undefined) ?? fallback
}

async function seatOf(admin: SupabaseClient, jobId: string): Promise<{ companyName: string; title: string }> {
  const { data } = await admin.from('partner_roles_v').select('company_name, title').eq('job_id', jobId).maybeSingle()
  return { companyName: (data?.company_name as string) ?? 'the client', title: (data?.title as string) ?? 'the role' }
}

// ── screen ──────────────────────────────────────────────────────────────────

const ScreenBatch = z.object({
  verdicts: z.array(z.object({ id: z.string(), promising: z.boolean(), reason: z.string() })),
})

function screenBrief(spec: BriefSpec, companyName: string, title: string): string {
  return [
    `SEARCH: ${title} at ${companyName}`,
    `WHO: ${spec.who}`,
    `TITLES WANTED: ${spec.titles.join(', ') || 'any'}`,
    `LOOKALIKE EMPLOYERS: ${spec.employers.map(e => e.name).join(', ') || 'none named'}`,
    `MUST (from the stub we can only judge title, employer, location and years): ${spec.requirements.filter(r => r.mandatory).map(r => r.label).join('; ')}`,
    `NOT FOR: ${spec.not_for.map(n => n.text).join('; ') || 'nothing stated'}`,
    `LOCATION: ${spec.locations.join(', ') || 'anywhere'} (${spec.onsite}) · YEARS: ${spec.years.min ?? '?'} to ${spec.years.max ?? '?'}`,
  ].join('\n')
}

export async function screenPending(admin: SupabaseClient, jobId: string, limit = 100): Promise<{ screened: number; out: number; notes: string[] }> {
  const brief = await approvedBrief(admin, jobId)
  if (!brief) return { screened: 0, out: 0, notes: ['no approved profile'] }
  const spec = effectiveSpec(brief)
  const seat = await seatOf(admin, jobId)
  const { data: rows } = await admin
    .from('sourcing_pool')
    .select('id, person_id, source, sourcing_people(full_name, current_title, current_employer, location, headline, last_enriched_at)')
    .eq('job_id', jobId)
    .eq('screen', 'pending')
    .limit(limit)
  const notes: string[] = []
  let screened = 0
  let out = 0
  const pending = (rows ?? []) as unknown as { id: string; person_id: string; source: string; sourcing_people: { full_name: string; current_title: string | null; current_employer: string | null; location: string | null; headline: string | null; last_enriched_at: string | null } | null }[]

  // A full record needs no screen.
  const full = pending.filter(r => r.source !== 'apollo' || r.sourcing_people?.last_enriched_at)
  if (full.length) {
    await admin.from('sourcing_pool').update({ screen: 'promising', screen_reason: 'full record on file' }).in('id', full.map(r => r.id))
    screened += full.length
  }
  const stubs = pending.filter(r => !full.includes(r))
  for (let i = 0; i < stubs.length; i += 20) {
    const batch = stubs.slice(i, i + 20)
    const user = batch.map(r => `id=${r.id} · ${r.sourcing_people?.current_title ?? '?'} at ${r.sourcing_people?.current_employer ?? '?'}${r.sourcing_people?.location ? ` · ${r.sourcing_people.location}` : ''}`).join('\n')
    try {
      const r = await structured(
        'classify',
        {
          system: `You screen search stubs for a recruiting desk. For each stub decide whether the title and employer make the person plausibly worth reading in full against the search below. Be generous on titles that could hide the right work (a "Software Engineer" at a real-time video company may be exactly it) and strict on titles that cannot (a recruiter, a salesperson for an engineering seat, a VP for an IC seat). Missing location is not a reason to screen out. One line of reason each.\n\n${screenBrief(spec, seat.companyName, seat.title)}`,
          user,
          schema: ScreenBatch,
          maxOutputTokens: 2500,
        },
        { task: 'sourcing_screen', metadata: { job_id: jobId, n: batch.length } },
      )
      const byId = new Map(r.output.verdicts.map(v => [v.id, v]))
      for (const row of batch) {
        const v = byId.get(row.id)
        if (!v) continue
        await admin.from('sourcing_pool').update({ screen: v.promising ? 'promising' : 'screened_out', screen_reason: v.reason.slice(0, 300), model: r.model }).eq('id', row.id)
        screened++
        if (!v.promising) out++
      }
    } catch (err) {
      if (err instanceof BudgetDeferredError) {
        notes.push('model budget deferred; screening resumes on the next run')
        break
      }
      notes.push(`screen failed: ${err instanceof Error ? err.message : String(err)}`)
      break
    }
  }
  return { screened, out, notes }
}

// ── enrich ──────────────────────────────────────────────────────────────────

export async function enrichPromising(admin: SupabaseClient, jobId: string, limit = 40, revealPersonal = true): Promise<{ enriched: number; credits: number; notes: string[] }> {
  const notes: string[] = []
  const cap = await setting<number>(admin, 'sourcing_apollo_monthly_cap', DEFAULT_CREDIT_CAP)
  const used = (await creditsThisMonth(admin)).apollo
  if (used >= cap) return { enriched: 0, credits: 0, notes: [`Apollo cap reached: ${used} of ${cap} credits this month; raise sourcing_apollo_monthly_cap in desk settings to continue`] }

  const { data: rows } = await admin
    .from('sourcing_pool')
    .select('id, person_id, sourcing_people(id, apollo_id, links, full_name, employer_domain, last_enriched_at)')
    .eq('job_id', jobId)
    .eq('screen', 'promising')
    .limit(200)
  const todo = ((rows ?? []) as unknown as { id: string; person_id: string; sourcing_people: { id: string; apollo_id: string | null; links: { linkedin?: string }; full_name: string; employer_domain: string | null; last_enriched_at: string | null } | null }[])
    .filter(r => r.sourcing_people && !r.sourcing_people.last_enriched_at)
    .slice(0, limit)

  let enriched = 0
  let credits = 0
  for (const r of todo) {
    if (used + credits >= cap) {
      notes.push(`stopped at the Apollo cap (${cap} credits this month)`)
      break
    }
    const p = r.sourcing_people!
    const m = await matchPerson(admin, {
      apolloId: p.apollo_id ?? undefined,
      linkedinUrl: p.links?.linkedin ?? undefined,
      name: p.apollo_id || p.links?.linkedin ? undefined : p.full_name,
      domain: p.employer_domain ?? undefined,
      jobId,
      personId: p.id,
      revealPersonal,
    })
    if (m.error) {
      notes.push(`Apollo match: ${m.error}`)
      if (/^(401|403|429)/.test(m.error)) break
      continue
    }
    if (!m.person) {
      await admin.from('sourcing_people').update({ last_enriched_at: new Date().toISOString() }).eq('id', p.id)
      await admin.from('sourcing_pool').update({ screen: 'screened_out', screen_reason: 'Apollo has no record to read' }).eq('id', r.id)
      continue
    }
    const person = await applyApolloPerson(admin, p.id, m.person, m.credits)
    await admin.from('sourcing_pool').update({ contact_status: contactStatusOf(person.emails) }).eq('id', r.id)
    enriched++
    credits += m.credits
  }
  return { enriched, credits, notes }
}

// ── grade ───────────────────────────────────────────────────────────────────

const GRADE_SYSTEM = `You grade one person against one recruiting search for a small search firm. You only know what the record says. Rules:
- For every requirement key in the brief return a verdict: supported (the record states it), contradicted (the record states the opposite), or unknown (the record does not say). Quote or closely paraphrase the evidence line. Never infer a skill from an employer's reputation.
- fit: "fit" when no mandatory requirement is contradicted and most are supported; "near_miss" when the mandatory ones are unknown rather than contradicted, or one preference is missing; "not_fit" when a mandatory requirement is contradicted or a not-for applies.
- Location: an onsite search needs the person in or near the location. Being elsewhere with relocation unknown is "near_miss" with the location requirement unknown, not "not_fit". Relocation "unwilling" contradicts.
- grade: A = fit and the strong signals are present; B = fit or near miss with gaps a call can settle; C = not a fit.
- why: up to three bullets, each resting on a line of the record.
- hook: one sentence for the top of a first email about a specific thing this person did, ONLY if the record states it (a named project, a product they shipped, a specific role at a specific place doing a specific thing). If the record has only titles and employers, hook is null. hook_evidence is the exact record line. Never flatter, never guess.
- No em dashes anywhere.`

/** The hook's evidence line must be in the record, or the hook is dropped. Exported for the tests. */
export function evidenceInRecord(evidence: string | null, record: string): boolean {
  if (!evidence) return false
  const words = evidence.toLowerCase().split(/[^a-z0-9+#.]+/).filter(w => w.length > 3)
  if (!words.length) return false
  const text = record.toLowerCase()
  const hits = words.filter(w => text.includes(w)).length
  return hits / words.length >= 0.6
}

export async function gradePromising(admin: SupabaseClient, jobId: string, limit = 40): Promise<{ graded: number; fit: number; notes: string[] }> {
  const brief = await approvedBrief(admin, jobId)
  if (!brief) return { graded: 0, fit: 0, notes: ['no approved profile'] }
  const spec = effectiveSpec(brief)
  const seat = await seatOf(admin, jobId)
  const briefBlock = briefText(spec, seat.companyName, seat.title)
  const notes: string[] = []

  const { data: rows } = await admin
    .from('sourcing_pool')
    .select('*, sourcing_people(*)')
    .eq('job_id', jobId)
    .eq('screen', 'promising')
    .in('decision', ['none', 'ready', 'held'])
    .or(`fit_status.eq.unknown,brief_version.neq.${brief.version},brief_version.is.null`)
    .limit(200)
  const todo = ((rows ?? []) as unknown as (PoolRow & { sourcing_people: PersonRow | null })[]).filter(r => r.sourcing_people?.last_enriched_at).slice(0, limit)

  let graded = 0
  let fit = 0
  for (const r of todo) {
    const person = r.sourcing_people!
    const record = personText(person)
    try {
      const g = await structured(
        'bench',
        { system: `${GRADE_SYSTEM}\n\n${briefBlock}`, user: record, schema: GradeOutput, maxOutputTokens: 1500 },
        { task: 'sourcing_grade', metadata: { job_id: jobId, person_id: person.id } },
      )
      const o = g.output
      const known = new Set(spec.requirements.map(q => q.key))
      const requirements = o.requirements.filter(v => known.has(v.key))
      // A mandatory requirement the model forgot is unknown, not supported.
      for (const q of spec.requirements) if (!requirements.some(v => v.key === q.key)) requirements.push({ key: q.key, verdict: 'unknown', evidence: null })
      const mandatoryContradicted = requirements.some(v => v.verdict === 'contradicted' && spec.requirements.find(q => q.key === v.key)?.mandatory)
      const fitStatus = mandatoryContradicted ? 'not_fit' : o.fit
      const hookOk = Boolean(o.hook && o.hook_evidence && evidenceInRecord(o.hook_evidence, record))
      const check = await relationshipCheck(admin, person, jobId)
      await admin
        .from('sourcing_pool')
        .update({
          brief_version: brief.version,
          grade: fitStatus === 'not_fit' ? 'C' : o.grade,
          fit_status: fitStatus,
          requirements,
          why: o.why,
          watch_for: o.watch_for,
          hook: hookOk ? o.hook : null,
          hook_evidence: hookOk ? o.hook_evidence : null,
          hook_ok: hookOk,
          contact_status: contactStatusOf(person.emails),
          relationship_status: check.status,
          relationship_note: check.note,
          graded_at: new Date().toISOString(),
          model: g.model,
        })
        .eq('id', r.id)
      graded++
      if (fitStatus === 'fit') fit++
    } catch (err) {
      if (err instanceof BudgetDeferredError) {
        notes.push('model budget deferred; grading resumes on the next run')
        break
      }
      notes.push(`grade failed for ${person.full_name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return { graded, fit, notes }
}

/** Re-run the relationship and contact checks on a pool row, for the moment before a decision or a send. */
export async function recheck(admin: SupabaseClient, poolId: string): Promise<PoolRow | null> {
  const { data } = await admin.from('sourcing_pool').select('*, sourcing_people(*)').eq('id', poolId).maybeSingle()
  if (!data) return null
  const row = data as unknown as PoolRow & { sourcing_people: PersonRow }
  const check = await relationshipCheck(admin, row.sourcing_people, row.job_id)
  const { data: updated } = await admin
    .from('sourcing_pool')
    .update({ relationship_status: check.status, relationship_note: check.note, contact_status: contactStatusOf(row.sourcing_people.emails) })
    .eq('id', poolId)
    .select('*')
    .single()
  return (updated as PoolRow) ?? null
}

/** The whole pass, bounded, for the API and the cron. */
export async function runPipeline(admin: SupabaseClient, jobId: string, opts: { screen?: number; enrich?: number; grade?: number } = {}): Promise<PipelineResult> {
  const s = await screenPending(admin, jobId, opts.screen ?? 100)
  const e = await enrichPromising(admin, jobId, opts.enrich ?? 30)
  const g = await gradePromising(admin, jobId, opts.grade ?? 30)
  return { screened: s.screened, screenedOut: s.out, enriched: e.enriched, enrichCredits: e.credits, graded: g.graded, fit: g.fit, notes: [...s.notes, ...e.notes, ...g.notes] }
}
