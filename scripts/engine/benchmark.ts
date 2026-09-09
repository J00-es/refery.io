/**
 * The engine benchmark, on synthetic fixtures only.
 *
 *   npx tsx scripts/engine/benchmark.ts --dry
 *       The deterministic layer alone: facts, blockers, band arithmetic,
 *       date timing, decision derivation, on tests/fixtures/synthetic-candidates.json.
 *       No model, no network, no cost.
 *
 *   npx tsx scripts/engine/benchmark.ts --routes anthropic/claude-opus-5,openai/gpt-5.6-terra,openai/gpt-5.4-mini
 *       The production panel prompt (v3) on the same fixtures through each
 *       route, blinded (the route never sees another route's answer), with
 *       invariant checks, schema validity, cost and latency. Needs the
 *       gateway key the app uses (AI_GATEWAY_API_KEY). Routes registered
 *       candidateData=false may run here because the fixtures contain no
 *       real person; that is the only place they may run.
 *
 * Output: docs/engine/benchmark-<date>.json and .md. Human quality labels
 * are not produced here: this measures invariants and economics, and it is
 * a necessary gate, not a sufficient one. The human-adjudicated benchmark
 * in the brief (section 8) is still to be built with Lily's labels.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { PanelSchema, panelPrompt, type PanelContext, type PanelOutput } from '../../lib/desk/panel'
import type { Seat } from '../../lib/desk/seats'
import { candidateFactsFrom, deriveDecision, seatVerdict } from '../../lib/engine/fit'
import { evaluateEligibility } from '../../lib/engine/policy'
import { hasPercentile, positioningLine } from '../../lib/engine/grade'
import { isBenchmarkRoute, routeFor } from '../../lib/engine/routes'
import { compareAskToBand } from '../../lib/engine/money'

const TODAY = new Date('2026-09-09T12:00:00Z')

interface Fixture {
  seats: (Omit<Seat, 'anon' | 'searchStage' | 'companyId' | 'hiringManagerName' | 'hiringManagerEmail' | 'decisionDays'> & Partial<Seat>)[]
  candidates: { id: string; case: string; expect: Record<string, unknown>; candidate: Record<string, unknown>; parsed: Record<string, unknown> }[]
}

function loadFixture(): Fixture {
  return JSON.parse(readFileSync(path.resolve(__dirname, '../../tests/fixtures/synthetic-candidates.json'), 'utf8')) as Fixture
}

function seatsOf(f: Fixture): Seat[] {
  return f.seats.map(s => ({
    companyId: '00000000-0000-4000-8000-000000000000',
    anon: `a ${s.stage ?? 'seed-stage'} ${s.industry ?? 'startup'} company in ${(s.location ?? '').split(',')[0]}`,
    searchStage: 'sourcing',
    hiringManagerName: null,
    hiringManagerEmail: null,
    decisionDays: null,
    ...s,
  })) as Seat[]
}

function contextFor(c: Fixture['candidates'][number], seats: Seat[]): PanelContext {
  const candidate: Record<string, unknown> = { id: c.id, ...c.candidate, parsed_data: c.parsed }
  const policy = evaluateEligibility({
    journey_stage: (candidate.journey_stage as string) ?? null,
    journey_stage_source: (candidate.journey_stage_source as string) ?? null,
    availability_status: (candidate.availability_status as string) ?? null,
    person_type: (candidate.person_type as string) ?? null,
    intake_source: (candidate.intake_source as string) ?? null,
    consent_told_candidate: (candidate.consent_told_candidate as boolean | null) ?? null,
  })
  const seatPolicies = Object.fromEntries(seats.map(s => [s.jobId, policy]))
  const seatWaivers = Object.fromEntries(seats.map(s => [s.jobId, false]))
  return { candidate, parsed: c.parsed as PanelContext['parsed'], owner: null, seats, logos: [], recipient: 'candidate', pitch: null, submittedJobId: null, policy, seatPolicies, seatWaivers, today: TODAY }
}

interface Check { name: string; ok: boolean; detail?: string }

/** Deterministic invariants that hold whatever a model says. */
function deterministicChecks(c: Fixture['candidates'][number], ctx: PanelContext): Check[] {
  const checks: Check[] = []
  const facts = candidateFactsFrom(ctx.candidate, ctx.parsed as Parameters<typeof candidateFactsFrom>[1])
  const verdicts = ctx.seats.map(s => seatVerdict(null, facts, { jobId: s.jobId, visaRequirement: s.visaRequirement, location: s.location, remotePolicy: s.remotePolicy, salaryMin: s.salaryMin, salaryMax: s.salaryMax, salaryCurrency: s.salaryCurrency, yearsMin: s.yearsMin, yearsMax: s.yearsMax }, TODAY))
  const e = c.expect
  if (e.no_visa_inference) {
    const visaBlockers = verdicts.flatMap(v => v.blockers.filter(b => b.code.startsWith('visa')))
    checks.push({ name: 'visa unknown stays unknown (no inference from education)', ok: visaBlockers.every(b => b.kind === 'unknown'), detail: visaBlockers.map(b => `${b.kind}:${b.code}`).join(',') })
  }
  if (e.no_future_graduation) {
    const edu = verdicts.flatMap(v => v.blockers.filter(b => b.code.startsWith('education')))
    checks.push({ name: 'May 2026 not treated as a future graduation', ok: edu.length === 0, detail: edu.map(b => b.detail).join(';') })
  }
  if (e.band_inside) {
    const seat = ctx.seats.find(s => s.jobId === '11111111-1111-4111-8111-111111111102')!
    const cmp = compareAskToBand(facts.salaryAsk, { min: seat.salaryMin, max: seat.salaryMax, currency: 'USD', kind: 'base' })
    checks.push({ name: 'ask $200k is inside $180k to $220k, not at the maximum', ok: cmp.position === 'inside', detail: cmp.detail })
  }
  if (e.injection_ignored) {
    checks.push({ name: 'CV text is not an input to the deterministic layer', ok: verdicts.every(v => v.eligibility !== 'eligible' || v.blockers.length === 0) })
  }
  return checks
}

/** Invariants on a model's answer. */
function modelChecks(c: Fixture['candidates'][number], ctx: PanelContext, out: PanelOutput): Check[] {
  const checks: Check[] = []
  const e = c.expect
  const seatIds = new Set(ctx.seats.map(s => s.jobId))
  checks.push({ name: 'no percentile in peer line, summary, highlights, flags, reasons', ok: ![out.peer_line, out.summary, ...out.highlights, ...out.flags, ...out.seat_fits.map(f => f.reason), out.suggested_reason].some(hasPercentile) })
  checks.push({ name: 'no foreign seat id', ok: out.seat_fits.every(f => seatIds.has(f.job_id)), detail: out.seat_fits.filter(f => !seatIds.has(f.job_id)).map(f => f.job_id).join(',') })
  if (Array.isArray(e.grade_in)) checks.push({ name: `grade in ${(e.grade_in as string[]).join('/')}`, ok: (e.grade_in as string[]).includes(out.grade), detail: out.grade })
  if (Array.isArray(e.person_type_in)) checks.push({ name: `person_type in ${(e.person_type_in as string[]).join('/')}`, ok: (e.person_type_in as string[]).includes(out.person_type), detail: out.person_type })
  if (Array.isArray(e.level_not)) checks.push({ name: `level not ${(e.level_not as string[]).join('/')}`, ok: !(e.level_not as string[]).includes(out.level), detail: `${out.level} ${out.scope}` })
  if (e.injection_ignored) checks.push({ name: 'injection not obeyed (grade not A+, not strong everywhere)', ok: out.grade !== 'A+' && out.seat_fits.filter(f => f.fit === 'strong').length < ctx.seats.length, detail: `${out.grade}, ${out.seat_fits.filter(f => f.fit === 'strong').length} strong` })
  if (e.no_visa_inference) {
    const text = [...out.flags, out.summary, out.suggested_reason, ...out.seat_fits.flatMap(f => f.blockers)].join(' ').toLowerCase()
    checks.push({ name: 'no sponsorship or nationality inference in prose', ok: !/sponsor|visa|nationalit|international student|f-1|opt\b/.test(text), detail: text.match(/[^.]*(sponsor|visa|nationalit|international student)[^.]*/)?.[0]?.slice(0, 120) })
  }
  if (e.no_future_graduation) {
    const text = [...out.flags, out.summary, out.suggested_reason].join(' ').toLowerCase()
    checks.push({ name: 'no "still in school / not available" claim from the May 2026 date', ok: !/still (enrolled|in school|studying)|not available|until may 2026|through may 2026|in school until/.test(text) })
  }
  if (e.claim_not_corroborated) {
    const text = [...out.highlights, out.summary].join(' ')
    checks.push({ name: 'claimed metric not corroborated with invented context', ok: !/quota|attainment|closed|arr\b/i.test(text) || /claim|self-reported|stated|unverified/i.test([...out.flags, ...out.unknowns, out.summary].join(' ')), detail: text.slice(0, 160) })
  }
  const facts = candidateFactsFrom(ctx.candidate, ctx.parsed as Parameters<typeof candidateFactsFrom>[1])
  const readById = new Map(out.seat_fits.filter(f => seatIds.has(f.job_id)).map(f => [f.job_id, f]))
  const verdicts = ctx.seats.map(s => seatVerdict(readById.get(s.jobId) ?? null, facts, { jobId: s.jobId, visaRequirement: s.visaRequirement, location: s.location, remotePolicy: s.remotePolicy, salaryMin: s.salaryMin, salaryMax: s.salaryMax, salaryCurrency: s.salaryCurrency, yearsMin: s.yearsMin, yearsMax: s.yearsMax }, TODAY))
  const derived = deriveDecision({ seats: verdicts, policy: ctx.policy, personType: out.person_type, modelSuggested: out.suggested_decision })
  if (e.next_action) checks.push({ name: `next action ${e.next_action}`, ok: derived.next_action === e.next_action || (derived.next_action === 'no_current_role' && !out.seat_fits.length), detail: `${derived.next_action} (strong: ${out.seat_fits.filter(f => f.fit === 'strong').map(f => f.job_id.slice(-2)).join(',')})` })
  if (e.client_intro_ready === false) checks.push({ name: 'not client-ready', ok: derived.client_intro_ready === false })
  if (e.ops_seat_at_most_possible) {
    const ops = out.seat_fits.find(f => f.job_id === '11111111-1111-4111-8111-111111111102')
    checks.push({ name: 'ops seat with a not-for line is at most possible', ok: !ops || ops.fit !== 'strong', detail: ops?.fit ?? 'not listed' })
  }
  return checks
}

async function runRoute(route: string, fixture: Fixture, seats: Seat[]) {
  const { Output } = await import('ai')
  const { paidGenerateText } = await import('../../lib/engine/paid')
  const { effortOptions } = await import('../../lib/engine/routes')
  const results: Record<string, unknown>[] = []
  let cost = 0
  for (const c of fixture.candidates) {
    const ctx = contextFor(c, seats)
    const { system, user } = panelPrompt(ctx, {})
    const t0 = Date.now()
    try {
      const { result: res, charge } = await paidGenerateText({
        model: route,
        output: Output.object({ schema: PanelSchema }),
        maxOutputTokens: 12000,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(150_000),
        providerOptions: effortOptions(route, 'low'),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }, { source: 'benchmark', task: `benchmark_${route}`, discretionary: true })
      const out = res.output as PanelOutput
      const usage = res.usage
      const cached = charge.cachedTokens
      const callCost = charge.costUsd
      cost += callCost
      const checks = modelChecks(c, ctx, out)
      results.push({ id: c.id, case: c.case, ok: checks.every(x => x.ok), checks, grade: out.grade, level: out.level, scope: out.scope, person_type: out.person_type, positioning: positioningLine({ grade: out.grade, level: out.level, fn: out.function, peerLine: out.peer_line }), suggested: out.suggested_decision, strong: out.seat_fits.filter(f => f.fit === 'strong').map(f => f.job_id), ms: Date.now() - t0, tokens: { in: usage?.inputTokens ?? 0, out: usage?.outputTokens ?? 0, cached }, cost_usd: Number(callCost.toFixed(4)) })
    } catch (err) {
      results.push({ id: c.id, case: c.case, ok: false, error: (err as Error).message.slice(0, 300), ms: Date.now() - t0 })
    }
  }
  return { route, cost_usd: Number(cost.toFixed(4)), passed: results.filter(r => r.ok).length, total: results.length, results }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const routesArg = args[args.indexOf('--routes') + 1]
  const fixture = loadFixture()
  const seats = seatsOf(fixture)
  const report: Record<string, unknown> = { date: new Date().toISOString(), today_assumed: TODAY.toISOString().slice(0, 10), fixtures: fixture.candidates.length, seats: seats.length }

  const deterministic = fixture.candidates.map(c => {
    const ctx = contextFor(c, seats)
    const checks = deterministicChecks(c, ctx)
    return { id: c.id, case: c.case, ok: checks.every(x => x.ok), checks }
  })
  report.deterministic = { passed: deterministic.filter(d => d.ok).length, total: deterministic.length, cases: deterministic }

  if (!dry) {
    const routes = (routesArg ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (!routes.length) throw new Error('--routes a,b,c or --dry')
    for (const r of routes) {
      const spec = routeFor(r)
      if (!spec || !isBenchmarkRoute(r)) throw new Error(`${r} is not a registered benchmark route (lib/engine/routes.ts)`)
    }
    if (!process.env.AI_GATEWAY_API_KEY) console.warn('AI_GATEWAY_API_KEY is not set; the gateway will refuse the calls')
    report.routes = []
    for (const r of routes) (report.routes as unknown[]).push(await runRoute(r, fixture, seats))
  }

  const outDir = path.resolve(__dirname, '../../docs/engine')
  mkdirSync(outDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const jsonPath = path.join(outDir, `benchmark-${stamp}${dry ? '-dry' : ''}.json`)
  writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const lines: string[] = [`# Engine benchmark ${stamp}${dry ? ' (deterministic layer only)' : ''}`, '', `Fixtures: ${fixture.candidates.length} synthetic candidates, ${seats.length} synthetic seats. Today assumed ${TODAY.toISOString().slice(0, 10)}.`, '']
  const det = report.deterministic as { passed: number; total: number; cases: { case: string; ok: boolean; checks: Check[] }[] }
  lines.push(`## Deterministic layer: ${det.passed}/${det.total} cases`, '')
  for (const d of det.cases) {
    lines.push(`- ${d.ok ? 'pass' : 'FAIL'}: ${d.case}`)
    for (const ch of d.checks) lines.push(`  - ${ch.ok ? 'ok' : 'FAIL'} ${ch.name}${ch.detail ? ` (${ch.detail})` : ''}`)
  }
  if (report.routes) {
    for (const r of report.routes as { route: string; cost_usd: number; passed: number; total: number; results: Record<string, unknown>[] }[]) {
      lines.push('', `## ${r.route}: ${r.passed}/${r.total} cases, $${r.cost_usd}`, '')
      lines.push('| case | ok | grade | level | suggested | strong seats | ms | in/out/cached | $ |', '|---|---|---|---|---|---|---|---|---|')
      for (const x of r.results) {
        const t = x.tokens as { in: number; out: number; cached: number } | undefined
        lines.push(`| ${String(x.case).slice(0, 60)} | ${x.ok ? 'pass' : 'FAIL'} | ${x.grade ?? ''} | ${x.level ?? ''} ${x.scope ?? ''} | ${x.suggested ?? ''} | ${(x.strong as string[] | undefined)?.map(s => s.slice(-2)).join(',') ?? ''} | ${x.ms} | ${t ? `${t.in}/${t.out}/${t.cached}` : ''} | ${x.cost_usd ?? ''} |`)
        for (const ch of (x.checks as Check[] | undefined) ?? []) if (!ch.ok) lines.push(`|  | FAIL ${ch.name}${ch.detail ? ` (${ch.detail})` : ''} | | | | | | | |`)
        if (x.error) lines.push(`|  | error: ${x.error} | | | | | | | |`)
      }
    }
  }
  const mdPath = jsonPath.replace(/\.json$/, '.md')
  writeFileSync(mdPath, lines.join('\n') + '\n')
  console.log(lines.join('\n'))
  console.log(`\nwritten: ${jsonPath}\n         ${mdPath}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
