/**
 * Does the TypeScript policy agree with the SQL policy on every production
 * candidate? Read-only.
 *
 *   pnpm engine:parity                    row by row against the SQL policy; any RPC error fails the gate
 *   pnpm engine:parity -- --pre-migration  aggregate against the rolled-back validation run of
 *                                          2026-09-09 (a diagnostic, never a release gate)
 *
 * The release gate is the row-by-row mode: every candidate, every reason, in
 * order, plus the candidate-role pairs that carry a declined submission or a
 * job-scoped override, asked of both sides for the same job.
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

  const preMigration = process.argv.includes('--pre-migration')
  if (preMigration) {
    console.log('pre-migration diagnostic: comparing with the 2026-09-09 validation aggregate (not a release gate)')
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

  // Release gate: every RPC must answer, and answer the same.
  const probe = await admin.rpc('candidate_eligibility', { p_candidate_id: rows?.[0]?.id })
  if (probe.error) {
    console.log(`GATE FAILED: candidate_eligibility is not callable (${probe.error.message.slice(0, 120)})`)
    process.exit(1)
  }
  let mismatches = 0
  let rpcErrors = 0
  for (const c of rows ?? []) {
    const { data: sql, error: rpcError } = await admin.rpc('candidate_eligibility', { p_candidate_id: c.id })
    if (rpcError || !sql) {
      rpcErrors++
      console.log(`RPC ERROR ${String(c.id).slice(0, 8)}: ${rpcError?.message ?? 'empty'}`)
      continue
    }
    const s = sql as { can_assess: boolean; can_match: boolean; can_contact: string; client_intro_ready: boolean; reasons: ReasonCode[] }
    const t = ts.get(c.id as string)!
    const same = s.can_assess === t.can_assess && s.can_match === t.can_match && s.can_contact === t.can_contact && s.client_intro_ready === t.client_intro_ready && JSON.stringify(s.reasons) === JSON.stringify(t.reasons)
    if (!same) {
      mismatches++
      console.log(`MISMATCH ${String(c.id).slice(0, 8)} sql=${JSON.stringify(s)} ts=${JSON.stringify({ can_assess: t.can_assess, can_match: t.can_match, can_contact: t.can_contact, client_intro_ready: t.client_intro_ready, reasons: t.reasons })}`)
    }
  }
  // Candidate-role pairs on record, read-only: both sides asked about the same job.
  const { data: declined } = await admin.from('role_submissions').select('candidate_id, job_id').eq('status', 'declined').limit(5)
  const { data: jobOverrides } = await admin.from('candidate_eligibility_overrides').select('candidate_id, job_id').is('revoked_at', null).not('job_id', 'is', null).limit(10)
  const pairs = [...(declined ?? []), ...(jobOverrides ?? [])].map(p => ({ candidate_id: p.candidate_id as string, job_id: p.job_id as string }))
  let pairMismatches = 0
  for (const p of pairs) {
    const c = (rows ?? []).find(r => r.id === p.candidate_id)
    if (!c) continue
    const { data: sql, error: rpcError } = await admin.rpc('candidate_eligibility', { p_candidate_id: p.candidate_id, p_job_id: p.job_id })
    if (rpcError || !sql) {
      rpcErrors++
      continue
    }
    const [{ data: sub }, { data: pipe }] = await Promise.all([
      admin.from('role_submissions').select('id').eq('candidate_id', p.candidate_id).eq('job_id', p.job_id).eq('status', 'declined').limit(1),
      admin.from('job_candidate_pipeline').select('id, stage').eq('candidate_id', p.candidate_id).eq('job_id', p.job_id),
    ])
    let hmPassed = false
    const ids = (pipe ?? []).map(x => x.id as string)
    if (ids.length) {
      const { data: internal } = await admin.from('pipeline_internal_state').select('pipeline_id').in('pipeline_id', ids).eq('internal_stage', 'hm_passed')
      hmPassed = !!internal?.length
    }
    const t = evaluateEligibility({
      journey_stage: c.journey_stage,
      journey_stage_source: c.journey_stage_source,
      availability_status: c.availability_status,
      person_type: c.person_type,
      intake_source: c.intake_source,
      consent_told_candidate: c.consent_told_candidate,
      do_not_contact: dnc.has(p.candidate_id),
      overrides: overrides.get(p.candidate_id) ?? [],
      job_id: p.job_id,
      rejected_for_job: !!sub?.length || (pipe ?? []).some(x => x.stage === 'rejected') || hmPassed,
    })
    const s = sql as { can_match: boolean; can_contact: string; client_intro_ready: boolean; reasons: ReasonCode[] }
    if (s.can_match !== t.can_match || s.can_contact !== t.can_contact || s.client_intro_ready !== t.client_intro_ready || JSON.stringify(s.reasons) !== JSON.stringify(t.reasons)) {
      pairMismatches++
      console.log(`PAIR MISMATCH ${p.candidate_id.slice(0, 8)}/${p.job_id.slice(0, 8)} sql=${JSON.stringify(s)} ts=${JSON.stringify(t)}`)
    }
  }
  console.log(`pair checks: ${pairs.length} pairs, ${pairMismatches} mismatches`)
  console.log(mismatches ? `row parity: ${mismatches} mismatches` : `row parity: OK on ${rows?.length ?? 0} candidates`)
  console.log(`rpc errors: ${rpcErrors}`)
  process.exit(mismatches || pairMismatches || rpcErrors ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
