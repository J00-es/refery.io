/**
 * A seat goes live: the bench wakes up.
 *
 * Retrieval picks the nearest people on the bench; one model call reads their
 * summaries against the brief; the strong ones (and the possible ones when
 * strong is thin) go on one card with numbered reactions. Warm people are
 * ordered first because the action for them is different: hiring manager
 * first, anonymised, then the candidate once the founder bites.
 *
 * Since 2026-09-09:
 *   - retrieval is the eligibility policy plus similarity, not a grade gate.
 *     ENGINE_BENCH_V2 = off (default, the old function), shadow (both run,
 *     v2 recorded on the run row, the card unchanged) or on. The exclusion
 *     list is applied before the limit, so a seat never runs out of people
 *     it has already seen.
 *   - "met" means an attributable call happened, or the journey says so;
 *     a non-null legacy verdict is not evidence of a meeting.
 *   - every evaluated pair is kept (pool, match_assessments); `results` is the
 *     model's positive list and is never overwritten; `shown` is the slate.
 *   - the model call is on the shared ledger; a Slack failure after the run
 *     is saved goes to the outbox and is retried without a second call.
 *   - a reaction re-checks the policy at the moment of action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { addReaction, esc, postThreadReply, type SlackBlock } from '@/lib/slack-bot'
import { postToDesk } from '@/lib/desk-notifications'
import { structured } from '@/lib/desk/model'
import { loadLiveSeats, seatBrief, seatBand, type Seat } from '@/lib/desk/seats'
import { loadOwner, properName } from '@/lib/desk/people'
import { latestPanel } from '@/lib/desk/panel'
import { applyDecision } from '@/lib/desk/decide'
import { draftHmBlurb } from '@/lib/desk/verdict'
import type { ParsedResumeData } from '@/lib/types'
import { metEvidence, policyInputsFor } from '@/lib/engine/decisions'
import { evaluateEligibility, POLICY_VERSION, REASON_TEXT, explainEligibility } from '@/lib/engine/policy'
import { keepKnownIds } from '@/lib/engine/fit'
import { BudgetDeferredError } from '@/lib/engine/ledger'
import { drainOutbox, enqueueOutbox } from '@/lib/engine/outbox'
import { claimMatchItems, completeMatchItem, LeaseLostError, renewMatchLease, type QueueOutcome } from '@/lib/engine/queue'
import { stripPercentiles } from '@/lib/engine/grade'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six'] as const
const MAX_SHOWN = 6
const RETRIEVAL_LIMIT = 40
const MET_STAGES = ['warm', 'committee_call', 'post_committee_not_fit', 'placed']

export type BenchRetrievalMode = 'off' | 'shadow' | 'on'
export function benchRetrievalMode(): BenchRetrievalMode {
  const v = (process.env.ENGINE_BENCH_V2 ?? 'off').toLowerCase()
  return v === 'on' || v === 'shadow' ? v : 'off'
}

const BenchSchema = z.object({
  results: z.array(
    z.object({
      candidate_id: z.string(),
      fit: z.enum(['strong', 'possible']),
      reason: z.string().describe('One clause a founder would repeat, grounded in the summary. Under 140 characters.'),
      blockers: z.array(z.string()).describe('Observations against the seat from the summary. Logistics are shown as facts; do not restate them. Empty when none.'),
    }),
  ).describe('Only the people rated strong or possible. Everyone else is a no and is not listed.'),
})

interface BenchPerson {
  id: string
  name: string
  grade: string | null
  stage: string
  ownerUserId: string | null
  met: boolean
  summary: string
  facts: string
  routes: string[]
  rank: number
}

interface Retrieved {
  candidate_id: string
  panel_grade?: string | null
  journey_stage?: string | null
  retrieval_routes?: string[] | null
}

async function retrieveV1(admin: SupabaseClient, jobId: string, limit: number): Promise<Retrieved[]> {
  const { data, error } = await admin.rpc('bench_candidates_for_job', { job_uuid: jobId, lim: limit })
  if (error) throw new Error(`bench_candidates_for_job: ${error.message}`)
  return ((data ?? []) as Retrieved[]).map(r => ({ ...r, retrieval_routes: ['embedding'] }))
}

async function retrieveV2(admin: SupabaseClient, jobId: string, limit: number, exclude: string[]): Promise<Retrieved[]> {
  const { data, error } = await admin.rpc('bench_candidates_for_job_v2', { p_job_id: jobId, p_limit: limit, p_exclude: exclude })
  if (error) throw new Error(`bench_candidates_for_job_v2: ${error.message}`)
  return (data ?? []) as Retrieved[]
}

async function hydrate(admin: SupabaseClient, retrieved: Retrieved[]): Promise<BenchPerson[]> {
  const ids = retrieved.map(r => r.candidate_id)
  if (!ids.length) return []
  const [{ data: rows }, met] = await Promise.all([
    admin
      .from('candidates')
      .select('id, name, panel_grade, journey_stage, owner_user_id, recruiter_verdict, location, visa_status, salary_expectation_min, experience_years, remote_preference, parsed_data')
      .in('id', ids),
    metEvidence(admin, ids),
  ])
  const order = new Map(ids.map((id, i) => [id, i]))
  const routes = new Map(retrieved.map(r => [r.candidate_id, r.retrieval_routes ?? ['embedding']]))
  return ((rows ?? []) as Record<string, unknown>[])
    .sort((a, b) => (order.get(a.id as string) ?? 99) - (order.get(b.id as string) ?? 99))
    .map(r => {
      const p = (r.parsed_data ?? {}) as Partial<ParsedResumeData>
      const w = p.work_history?.[0]
      const role = w ? [w.title, w.company].filter(Boolean).join(' at ') : p.headline ?? ''
      const money = typeof r.salary_expectation_min === 'number' ? `asks $${Math.round((r.salary_expectation_min as number) / 1000)}k` : 'comp unknown'
      const stage = String(r.journey_stage)
      const isMet = MET_STAGES.includes(stage) || met.has(r.id as string)
      return {
        id: r.id as string,
        name: properName(r.name as string),
        grade: (r.panel_grade as string) ?? null,
        stage,
        ownerUserId: (r.owner_user_id as string) ?? null,
        met: isMet,
        summary: `${role}. ${stripPercentiles(String(r.recruiter_verdict ?? p.summary ?? '')).slice(0, 500)}`,
        facts: [
          (r.location as string) ?? p.location ?? 'location unknown',
          (r.visa_status as string) ?? p.work_authorization ?? 'visa unknown',
          money,
          typeof r.experience_years === 'number' ? `${r.experience_years} yrs` : null,
          (r.remote_preference as string) ?? null,
          isMet ? 'met' : 'not met',
        ]
          .filter(Boolean)
          .join(' · '),
        routes: routes.get(r.id as string) ?? ['embedding'],
        rank: (order.get(r.id as string) ?? 0) + 1,
      }
    })
}

export interface BenchRunResult {
  posted: boolean
  checked: number
  strong: number
  outcome: QueueOutcome
  error?: string
  runId?: string | null
}

export async function runBenchMatch(admin: SupabaseClient, jobId: string, trigger: string, lease?: string | null): Promise<BenchRunResult> {
  const [seat] = await loadLiveSeats(admin, [jobId])
  if (!seat) return { posted: false, checked: 0, strong: 0, outcome: 'input_error', error: 'seat is not live' }

  // People already shown for this seat (weekly runs only surface new names),
  // and people already in play on it, are excluded before the limit.
  const seen = new Set<string>()
  if (trigger === 'weekly') {
    const { data: prior } = await admin.from('search_match_runs').select('results, shown').eq('job_id', jobId)
    for (const r of prior ?? []) {
      for (const x of ((r.shown ?? r.results) as { candidate_id: string }[]) ?? []) seen.add(x.candidate_id)
    }
  }
  const { data: subs } = await admin.from('role_submissions').select('candidate_id').eq('job_id', jobId).not('status', 'in', '(declined,withdrawn)')
  for (const s of subs ?? []) seen.add(s.candidate_id as string)

  const mode = benchRetrievalMode()
  let retrieved: Retrieved[]
  let shadow: Record<string, unknown> | null = null
  if (mode === 'on') {
    retrieved = await retrieveV2(admin, jobId, RETRIEVAL_LIMIT, [...seen])
  } else {
    retrieved = (await retrieveV1(admin, jobId, RETRIEVAL_LIMIT)).filter(r => !seen.has(r.candidate_id))
    if (mode === 'shadow') {
      try {
        const v2 = await retrieveV2(admin, jobId, RETRIEVAL_LIMIT, [...seen])
        const v1Ids = new Set(retrieved.map(r => r.candidate_id))
        shadow = {
          retrieval_version: 'bench-v2',
          policy_version: POLICY_VERSION,
          pool: v2.map(r => ({ candidate_id: r.candidate_id, grade: r.panel_grade ?? null, stage: r.journey_stage ?? null, routes: r.retrieval_routes ?? [] })),
          only_in_v2: v2.filter(r => !v1Ids.has(r.candidate_id)).map(r => r.candidate_id),
          only_in_v1: retrieved.filter(r => !v2.some(x => x.candidate_id === r.candidate_id)).map(r => r.candidate_id),
        }
      } catch (err) {
        shadow = { error: err instanceof Error ? err.message : String(err) }
      }
    }
  }

  const pool = await hydrate(admin, retrieved)
  if (!pool.length) return { posted: false, checked: 0, strong: 0, outcome: 'empty', error: retrieved.length ? 'nobody new' : 'bench is empty' }

  const system = `You match people on a recruiting bench to one open seat. Facts first: logistics (visa, location, pay, years) are shown as facts and are the desk's call, not yours; do not list them as blockers and do not downgrade a fit for them. "strong" means the evidence in the summary meets every Must line; at most a handful strong. Return only strong and possible; everyone else is a no and is not listed. Grade is a hint, not a rule: a B+ or an ungraded person with an exact fit can be strong, and say so in the reason. Never write a percentile.\n\nTHE SEAT\n${seatBrief(seat)}`
  const user = pool.map(p => `CANDIDATE ${p.id}\n${p.name} · ${p.grade ?? 'ungraded'} · ${p.facts}\n${p.summary}`).join('\n\n')

  // Thinking tokens count against this on adaptive models, so it is generous.
  let call
  try {
    call = await structured('bench', { system, user, schema: BenchSchema, maxOutputTokens: 12000 }, { admin, source: 'desk', task: 'bench', discretionary: trigger === 'weekly', metadata: { job_id: jobId, trigger, pool_size: pool.length } })
  } catch (err) {
    if (err instanceof BudgetDeferredError) return { posted: false, checked: pool.length, strong: 0, outcome: 'deferred_budget', error: err.message }
    return { posted: false, checked: pool.length, strong: 0, outcome: 'provider_error', error: err instanceof Error ? err.message : String(err) }
  }
  const byId = new Map(pool.map(p => [p.id, p]))
  const { kept: results, dropped } = keepKnownIds(call.output.results, 'candidate_id', new Set(byId.keys()))
  if (dropped) console.warn(`[desk:bench] dropped ${dropped} result(s) for ids the model was not given`)
  const strong = results.filter(r => r.fit === 'strong')
  const possible = results.filter(r => r.fit === 'possible')
  const shown = [...strong, ...(strong.length < 3 ? possible.slice(0, 3 - strong.length) : [])]
    .sort((a, b) => Number(byId.get(b.candidate_id)!.met) - Number(byId.get(a.candidate_id)!.met))
    .slice(0, MAX_SHOWN)
    .map(r => ({ ...r, met: byId.get(r.candidate_id)!.met }))

  // Nothing is written unless this worker still owns the item.
  if (lease && !(await renewMatchLease(admin, jobId, lease))) throw new LeaseLostError(jobId)

  const { data: run, error: runError } = await admin
    .from('search_match_runs')
    .insert({
      job_id: jobId,
      trigger,
      model: call.model,
      checked: pool.length,
      results,
      cost_usd: call.costUsd,
      pool: pool.map(p => ({ candidate_id: p.id, grade: p.grade, stage: p.stage, met: p.met, routes: p.routes, rank: p.rank })),
      pool_size: pool.length,
      shown,
      retrieval_version: mode === 'on' ? 'bench-v2' : 'bench-v1',
      policy_version: POLICY_VERSION,
      shadow,
      usage_id: call.usageId,
    })
    .select('id')
    .single()
  if (runError || !run) return { posted: false, checked: pool.length, strong: strong.length, outcome: 'failed', error: `run not saved: ${runError?.message}` }

  // Every evaluated pair is a record, positive or not.
  const resultById = new Map(results.map(r => [r.candidate_id, r]))
  const assessments = pool.map(p => {
    const r = resultById.get(p.id)
    return {
      job_id: jobId,
      candidate_id: p.id,
      policy_version: POLICY_VERSION,
      rubric_version: 'bench-v1',
      retrieval_routes: p.routes,
      retrieval_rank: p.rank,
      eligibility: {},
      role_fit: r ? r.fit : 'not_supported',
      blockers: (r?.blockers ?? []).map(b => ({ kind: 'question', code: 'model_observation', detail: b })),
      next_action: r ? (p.met ? 'client_intro' : 'screening_call') : 'no_current_role',
      client_intro_ready: false,
      model: call.model,
      search_match_run_id: run.id,
    }
  })
  const { error: assessError } = await admin.from('match_assessments').insert(assessments)
  if (assessError) console.warn(`[desk:bench] match assessments not recorded: ${assessError.message}`)

  if (!shown.length) return { posted: false, checked: pool.length, strong: 0, outcome: 'empty', error: 'nobody strong or possible', runId: run.id as string }

  const posted = await postBenchCard(admin, { runId: run.id as string, seat, trigger, shown, pool, callModel: call.model, costUsd: call.costUsd, strongCount: strong.length })
  if (!posted.ok) {
    await enqueueOutbox(admin, { kind: 'bench_card', idempotencyKey: `bench_card:${run.id}`, payload: { run_id: run.id } })
    return { posted: false, checked: pool.length, strong: strong.length, outcome: 'succeeded', error: `card queued for retry: ${posted.error}`, runId: run.id as string }
  }
  return { posted: true, checked: pool.length, strong: strong.length, outcome: 'succeeded', runId: run.id as string }
}

async function postBenchCard(
  admin: SupabaseClient,
  input: { runId: string; seat: Seat; trigger: string; shown: { candidate_id: string; fit: string; reason: string; blockers: string[]; met: boolean }[]; pool: BenchPerson[]; callModel: string; costUsd: number; strongCount: number },
): Promise<{ ok: boolean; error?: string }> {
  const { seat, shown } = input
  const byId = new Map(input.pool.map(p => [p.id, p]))
  const lines: string[] = []
  for (let i = 0; i < shown.length; i++) {
    const r = shown[i]
    const p = byId.get(r.candidate_id)
    if (!p) continue
    const owner = await loadOwner(admin, p.ownerUserId)
    const ownerLine = owner ? (owner.isUs ? 'you' : owner.firstName) : 'no owner'
    const action = p.met ? 'anonymised blurb to the founder first' : owner && !owner.isUs ? `intro ask to ${owner.firstName}` : 'email them directly'
    lines.push(
      `${i + 1} · *<${APP_URL}/candidates/${p.id}|${esc(p.name)}>* ${p.grade ? `*${esc(p.grade)}*` : ''} · ${esc(stripPercentiles(r.reason))} · ${p.met ? '*met*' : 'not met'} · owner: ${esc(ownerLine)}${r.blockers.length ? ` · :speech_balloon: ${esc(r.blockers.join('; '))}` : ''}\n      ${r.fit === 'strong' ? ':large_green_circle:' : ':large_yellow_circle:'} ${r.fit} → :${NUMBERS[i]}: ${action}`,
    )
  }
  const meta = [seat.location?.split(/[,(]/)[0], seat.remotePolicy, seatBand(seat), seat.visaRequirement?.replace(/_/g, ' ')].filter(Boolean).join(' · ')
  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `:new: *${esc(seat.companyName)} · ${esc(seat.headline || seat.title)}* ${input.trigger === 'weekly' ? 'weekly re-match' : 'went live'} · ${esc(meta)}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `From the bench: *${input.strongCount} strong* of ${input.pool.length} checked · ${input.callModel.split('/')[1]} · $${input.costUsd.toFixed(2)}` }] },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `React with the number to act on one person · :fire: acts on every strong one · :zzz: dismisses  ·  <${APP_URL}/searches/${seat.companyId}/roles/${seat.jobId}|open the search>` }] },
  ]
  const posted = await postToDesk(`${seat.companyName}: ${input.strongCount} strong from the bench`, blocks)
  if (!posted.ok || !posted.ts || !posted.channel) return { ok: false, error: posted.error }
  await admin.from('search_match_runs').update({ slack_channel_id: posted.channel, slack_message_ts: posted.ts }).eq('id', input.runId)
  await admin.from('match_slates').insert({ job_id: seat.jobId, search_match_run_id: input.runId, audience: 'desk', ordering: shown.map((r, i) => ({ position: i + 1, candidate_id: r.candidate_id, fit: r.fit })) }).then(({ error }) => {
    if (error) console.warn(`[desk:bench] slate not recorded: ${error.message}`)
  })
  for (let i = 0; i < shown.length; i++) await addReaction(posted.channel, posted.ts, NUMBERS[i])
  await addReaction(posted.channel, posted.ts, 'fire')
  await addReaction(posted.channel, posted.ts, 'zzz')
  return { ok: true }
}

/** Post a saved run's card again, from the outbox. Never calls a model. */
async function repostBenchCard(admin: SupabaseClient, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const runId = String(payload.run_id ?? '')
  const { data: run } = await admin.from('search_match_runs').select('id, job_id, trigger, model, cost_usd, results, shown, pool, slack_message_ts').eq('id', runId).maybeSingle()
  if (!run) return { ok: false, error: 'run not found' }
  if (run.slack_message_ts) return { ok: true }
  const [seat] = await loadLiveSeats(admin, [run.job_id as string])
  if (!seat) return { ok: true } // the seat closed; nothing to post
  const shown = ((run.shown ?? run.results) as { candidate_id: string; fit: string; reason: string; blockers: string[]; met?: boolean }[]).map(r => ({ ...r, met: !!r.met }))
  const poolRows = (run.pool as { candidate_id: string }[] | null) ?? shown
  const pool = await hydrate(admin, poolRows.map(p => ({ candidate_id: p.candidate_id })))
  return postBenchCard(admin, { runId, seat, trigger: String(run.trigger), shown, pool, callModel: String(run.model ?? 'model'), costUsd: Number(run.cost_usd ?? 0), strongCount: shown.filter(r => r.fit === 'strong').length })
}

export async function processBenchQueue(admin: SupabaseClient, weekly: boolean): Promise<Record<string, unknown>> {
  if (weekly) {
    const seats = await loadLiveSeats(admin)
    for (const s of seats) {
      await admin
        .from('search_match_queue')
        .upsert({ job_id: s.jobId, trigger: 'weekly', status: 'queued', attempts: 0, error: null, enqueued_at: new Date().toISOString(), finished_at: null }, { onConflict: 'job_id' })
    }
  }
  // Cards that failed to post after their run was saved go out first.
  const outbox = await drainOutbox(admin, { bench_card: payload => repostBenchCard(admin, payload) })

  const items = await claimMatchItems(admin, 5)
  const out: Record<string, unknown>[] = []
  for (const q of items) {
    try {
      const r = await runBenchMatch(admin, q.job_id, q.trigger, q.lease_token)
      if (r.outcome === 'deferred_budget') {
        await completeMatchItem(admin, q, { status: 'queued', outcome: 'deferred_budget', error: r.error ?? null, retryInSeconds: 30 * 60 })
      } else if (r.outcome === 'provider_error') {
        await completeMatchItem(admin, q, { status: q.attempts >= 3 ? 'failed' : 'queued', outcome: 'provider_error', error: r.error ?? null, retryInSeconds: 5 * 60 })
      } else {
        await completeMatchItem(admin, q, { status: r.outcome === 'failed' ? 'failed' : 'done', outcome: r.outcome, error: r.error ?? null })
      }
      out.push({ job: q.job_id, ...r })
    } catch (err) {
      if (err instanceof LeaseLostError) {
        out.push({ job: q.job_id, outcome: 'lease_lost' })
        continue
      }
      const message = err instanceof Error ? err.message : String(err)
      const done = await completeMatchItem(admin, q, { status: q.attempts >= 3 ? 'failed' : 'queued', outcome: 'failed', error: message.slice(0, 400) })
      if (!done) console.warn(`[desk:bench] lease lost for ${q.job_id} before completion`)
      out.push({ job: q.job_id, error: message })
    }
  }
  return { runs: out, outbox }
}

/** A reaction on a bench card. */
export async function handleBenchReaction(
  admin: SupabaseClient,
  input: { reaction: string; slackUser: string; channel: string; ts: string },
): Promise<boolean> {
  const { data: run } = await admin
    .from('search_match_runs')
    .select('id, job_id, results, shown')
    .eq('slack_channel_id', input.channel)
    .eq('slack_message_ts', input.ts)
    .maybeSingle()
  if (!run) return false
  // The slate is what the card showed; older runs only have `results` (which was the slate then).
  const results = ((run.shown ?? run.results) as { candidate_id: string; fit: string; met?: boolean }[]) ?? []
  const idx = NUMBERS.indexOf(input.reaction as (typeof NUMBERS)[number])
  let picked: typeof results = []
  if (idx >= 0 && results[idx]) picked = [results[idx]]
  else if (input.reaction === 'fire') picked = results.filter(r => r.fit === 'strong')
  else if (input.reaction === 'zzz') {
    await postThreadReply(input.channel, input.ts, `:zzz: <@${input.slackUser}> dismissed this list. Same people will not be shown for this seat again.`)
    await admin.from('match_slates').update({ feedback: { dismissed_by: input.slackUser, dismissed_at: new Date().toISOString() } }).eq('search_match_run_id', run.id)
    return true
  } else return false

  const [seat] = await loadLiveSeats(admin, [run.job_id as string])
  for (const r of picked) {
    const { data: c } = await admin.from('candidates').select('id, name, journey_stage, journey_stage_source, availability_status, person_type, intake_source, consent_told_candidate, owner_user_id, email').eq('id', r.candidate_id).maybeSingle()
    if (!c) continue
    const first = properName(c.name as string).split(' ')[0]
    // The person may have changed since the card was posted.
    const policy = evaluateEligibility({
      journey_stage: c.journey_stage ?? null,
      journey_stage_source: c.journey_stage_source ?? null,
      availability_status: c.availability_status ?? null,
      person_type: c.person_type ?? null,
      intake_source: c.intake_source ?? null,
      consent_told_candidate: c.consent_told_candidate ?? null,
      job_id: run.job_id as string,
      ...(await policyInputsFor(admin, c.id as string, run.job_id as string)),
    })
    if (!policy.can_match || policy.can_contact === 'no') {
      const why = explainEligibility(policy).blocking.map(x => REASON_TEXT[x]).join('; ')
      await postThreadReply(input.channel, input.ts, `:no_entry: ${first}: not acted on. ${why || 'The eligibility policy excludes them for this seat now.'}`)
      continue
    }
    if (r.met || String(c.journey_stage) === 'warm') {
      const d = await draftHmBlurb(admin, { candidate: c, jobId: run.job_id as string, by: input.slackUser, channel: input.channel, ts: input.ts })
      await postThreadReply(input.channel, input.ts, d.ok ? `:memo: ${first}: drafted the anonymised blurb for ${seat?.hiringManagerName ?? 'the founder'} at ${seat?.companyName ?? 'the client'} below. :+1: on it sends.` : `:warning: ${first}: ${d.error}`)
      continue
    }
    const panel = await latestPanel(admin, c.id as string)
    if (!panel) {
      await postThreadReply(input.channel, input.ts, `:warning: ${first} has no panel yet, so no draft. Queued one; try again in two minutes.`)
      await admin.rpc('enqueue_candidate_panel', { p_candidate_id: c.id, p_reason: 'bench' })
      continue
    }
    const d = await applyDecision(admin, { candidateId: c.id as string, decision: 'intro_now', by: input.slackUser, via: 'slack', jobIds: [run.job_id as string] })
    await postThreadReply(input.channel, input.ts, `${d.ok ? ':white_check_mark:' : ':warning:'} ${first}: ${d.message}`)
  }
  return true
}

export type { Seat }
