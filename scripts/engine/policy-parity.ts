/**
 * Does the TypeScript policy agree with the SQL policy on every production
 * candidate? Read-only.
 *
 *   pnpm engine:parity
 *
 * Before the migration lands, public.candidate_eligibility does not exist;
 * the script then compares the TypeScript aggregate against the aggregate
 * the SQL function produced inside the rolled-back validation run of
 * 2026-09-09 (recorded below). After the migration it compares row by row.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment (.env.local). Prints nothing personal: ids are truncated and
 * no names, emails or documents are read.
 */

import { createClient } from '@supabase/supabase-js'
import { evaluateEligibility, type PolicyInput, type ReasonCode } from '../../lib/engine/policy'

// From the validation transaction of 2026-09-09 (scripts/engine/2026-09-09-02-*.sql applied and rolled back).
const SQL_AGGREGATE_2026_09_09 = {
  can_match: 171,
  can_match_bplus: 24,
  can_match_ungraded: 6,
  client_intro_ready: 0,
  reason_counts: {
    not_met_yet: 127,
    human_not_fit: 2,
    calibration_sample: 24,
    candidate_not_told: 1,
    filed_not_a_candidate: 23,
    temporarily_off_market: 10,
    human_not_fit_after_call: 6,
    candidate_consent_unknown: 324,
    legacy_not_fit_unverified: 127,
  } as Record<string, number>,
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  const admin = createClient(url, key, { auth: { persistSession: false } })

  const { data: rows, error } = await admin
    .from('candidates')
    .select('id, panel_grade, journey_stage, journey_stage_source, availability_status, person_type, intake_source, consent_told_candidate')
    .order('created_at')
  if (error) throw error

  // Inputs the policy needs beyond the row. Both tables are new; before the
  // migration they are absent and the answers are empty, as they are in SQL.
  const dnc = new Set<string>()
  const overrides = new Map<string, PolicyInput['overrides']>()
  const { data: d } = await admin.from('candidate_human_decisions').select('candidate_id').eq('kind', 'contact').eq('value', 'do_not_contact').is('revoked_at', null)
  for (const r of d ?? []) dnc.add(r.candidate_id as string)
  const { data: ov } = await admin.from('candidate_eligibility_overrides').select('candidate_id, effect, scope, job_id, expires_at').is('revoked_at', null).order('created_at')
  for (const o of ov ?? []) {
    if (o.expires_at && new Date(o.expires_at) <= new Date()) continue
    const list = overrides.get(o.candidate_id as string) ?? []
    list.push({ effect: o.effect, scope: o.scope, job_id: o.job_id })
    overrides.set(o.candidate_id as string, list)
  }

  const ts = new Map<string, ReturnType<typeof evaluateEligibility>>()
  for (const c of rows ?? []) {
    ts.set(
      c.id as string,
      evaluateEligibility({
        journey_stage: c.journey_stage,
        journey_stage_source: c.journey_stage_source,
        availability_status: c.availability_status,
        person_type: c.person_type,
        intake_source: c.intake_source,
        consent_told_candidate: c.consent_told_candidate,
        do_not_contact: dnc.has(c.id as string),
        overrides: overrides.get(c.id as string) ?? [],
      }),
    )
  }

  // Aggregate
  const agg = { can_match: 0, can_match_bplus: 0, can_match_ungraded: 0, client_intro_ready: 0, reason_counts: {} as Record<string, number> }
  for (const c of rows ?? []) {
    const e = ts.get(c.id as string)!
    if (e.can_match) agg.can_match++
    if (e.can_match && c.panel_grade === 'B+') agg.can_match_bplus++
    if (e.can_match && c.panel_grade == null) agg.can_match_ungraded++
    if (e.client_intro_ready) agg.client_intro_ready++
    for (const r of e.reasons) agg.reason_counts[r] = (agg.reason_counts[r] ?? 0) + 1
  }
  console.log(`candidates: ${rows?.length ?? 0}`)
  console.log('typescript aggregate:', JSON.stringify(agg))

  // Row by row against SQL when the function exists.
  const probe = await admin.rpc('candidate_eligibility', { p_candidate_id: rows?.[0]?.id })
  if (probe.error) {
    console.log(`sql policy not deployed yet (${probe.error.message.slice(0, 80)}); comparing with the 2026-09-09 validation aggregate`)
    const diffs: string[] = []
    for (const k of ['can_match', 'can_match_bplus', 'can_match_ungraded', 'client_intro_ready'] as const) {
      if (agg[k] !== SQL_AGGREGATE_2026_09_09[k]) diffs.push(`${k}: ts=${agg[k]} sql=${SQL_AGGREGATE_2026_09_09[k]}`)
    }
    for (const k of new Set([...Object.keys(agg.reason_counts), ...Object.keys(SQL_AGGREGATE_2026_09_09.reason_counts)])) {
      if ((agg.reason_counts[k] ?? 0) !== (SQL_AGGREGATE_2026_09_09.reason_counts[k] ?? 0)) diffs.push(`${k}: ts=${agg.reason_counts[k] ?? 0} sql=${SQL_AGGREGATE_2026_09_09.reason_counts[k] ?? 0}`)
    }
    console.log(diffs.length ? `AGGREGATE MISMATCH\n${diffs.join('\n')}` : 'aggregate parity: OK (note: production moves; a small drift since the validation run is expected, a structural one is not)')
    process.exit(diffs.length ? 1 : 0)
  }

  let mismatches = 0
  for (const c of rows ?? []) {
    const { data: sql } = await admin.rpc('candidate_eligibility', { p_candidate_id: c.id })
    const s = sql as { can_assess: boolean; can_match: boolean; can_contact: string; client_intro_ready: boolean; reasons: ReasonCode[] }
    const t = ts.get(c.id as string)!
    const same = s.can_assess === t.can_assess && s.can_match === t.can_match && s.can_contact === t.can_contact && s.client_intro_ready === t.client_intro_ready && JSON.stringify(s.reasons) === JSON.stringify(t.reasons)
    if (!same) {
      mismatches++
      console.log(`MISMATCH ${String(c.id).slice(0, 8)} sql=${JSON.stringify(s)} ts=${JSON.stringify({ can_assess: t.can_assess, can_match: t.can_match, can_contact: t.can_contact, client_intro_ready: t.client_intro_ready, reasons: t.reasons })}`)
    }
  }
  console.log(mismatches ? `row parity: ${mismatches} mismatches` : `row parity: OK on ${rows?.length ?? 0} candidates`)
  process.exit(mismatches ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
