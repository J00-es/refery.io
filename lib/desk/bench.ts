/**
 * A seat goes live: the bench wakes up.
 *
 * Embedding similarity picks the nearest forty people on the bench; one model
 * call reads their summaries against the brief; the strong ones (and the
 * possible ones when strong is thin) go on one card with numbered reactions.
 * Warm people are ordered first because the action for them is different:
 * hiring manager first, anonymised, then the candidate once the founder bites.
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

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const NUMBERS = ['one', 'two', 'three', 'four', 'five', 'six'] as const
const MAX_SHOWN = 6

const BenchSchema = z.object({
  results: z.array(
    z.object({
      candidate_id: z.string(),
      fit: z.enum(['strong', 'possible']),
      reason: z.string().describe('One clause a founder would repeat. Under 140 characters.'),
      blockers: z.array(z.string()).describe('Hard facts against it. Empty when none.'),
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
}

async function benchFor(admin: SupabaseClient, jobId: string, limit = 40): Promise<BenchPerson[]> {
  const { data: near } = await admin.rpc('bench_candidates_for_job', { job_uuid: jobId, lim: limit })
  const ids = ((near ?? []) as { candidate_id: string }[]).map(r => r.candidate_id)
  if (!ids.length) return []
  const { data: rows } = await admin
    .from('candidates')
    .select('id, name, panel_grade, journey_stage, owner_user_id, recruiter_verdict, location, visa_status, salary_expectation_min, experience_years, remote_preference, parsed_data, lily_verdict')
    .in('id', ids)
  const order = new Map(ids.map((id, i) => [id, i]))
  return ((rows ?? []) as Record<string, unknown>[])
    .sort((a, b) => (order.get(a.id as string) ?? 99) - (order.get(b.id as string) ?? 99))
    .map(r => {
      const p = (r.parsed_data ?? {}) as Partial<ParsedResumeData>
      const w = p.work_history?.[0]
      const role = w ? [w.title, w.company].filter(Boolean).join(' at ') : p.headline ?? ''
      const money = typeof r.salary_expectation_min === 'number' ? `asks $${Math.round((r.salary_expectation_min as number) / 1000)}k` : 'comp unknown'
      return {
        id: r.id as string,
        name: properName(r.name as string),
        grade: (r.panel_grade as string) ?? null,
        stage: String(r.journey_stage),
        ownerUserId: (r.owner_user_id as string) ?? null,
        met: ['warm', 'committee_call', 'post_committee_not_fit', 'placed'].includes(String(r.journey_stage)) || !!r.lily_verdict,
        summary: `${role}. ${String(r.recruiter_verdict ?? p.summary ?? '').slice(0, 500)}`,
        facts: [
          (r.location as string) ?? p.location ?? 'location unknown',
          (r.visa_status as string) ?? p.work_authorization ?? 'visa unknown',
          money,
          typeof r.experience_years === 'number' ? `${r.experience_years} yrs` : null,
          (r.remote_preference as string) ?? null,
          r.journey_stage === 'warm' ? 'met, warm' : 'not met',
        ]
          .filter(Boolean)
          .join(' · '),
      }
    })
}

export async function runBenchMatch(admin: SupabaseClient, jobId: string, trigger: string): Promise<{ posted: boolean; checked: number; strong: number; error?: string }> {
  const [seat] = await loadLiveSeats(admin, [jobId])
  if (!seat) return { posted: false, checked: 0, strong: 0, error: 'seat is not live' }

  const bench = await benchFor(admin, jobId)
  if (!bench.length) return { posted: false, checked: 0, strong: 0, error: 'bench is empty' }

  // Weekly runs only surface new names for this seat.
  let seen = new Set<string>()
  if (trigger === 'weekly') {
    const { data: prior } = await admin.from('search_match_runs').select('results').eq('job_id', jobId)
    for (const r of prior ?? []) for (const x of (r.results as { candidate_id: string }[]) ?? []) seen.add(x.candidate_id)
  }
  // People already in play on this seat need no card.
  const { data: subs } = await admin.from('role_submissions').select('candidate_id').eq('job_id', jobId).not('status', 'in', '(declined,withdrawn)')
  for (const s of subs ?? []) seen.add(s.candidate_id as string)
  const pool = bench.filter(b => !seen.has(b.id))
  if (!pool.length) return { posted: false, checked: bench.length, strong: 0, error: 'nobody new' }

  const system = `You match people on a recruiting bench to one open seat. Facts first: a seat marked "us authorized" excludes anyone who needs new sponsorship (an H-1B transfer is a warning, not a blocker); an onsite seat excludes anyone unwilling to be in that city; a pay band $30k under the ask is a warning; years outside the asked range by more than three is a warning. "strong" means the founder would take the call today. Be strict: at most a handful strong. Return only strong and possible; everyone else is a no and is not listed. Grade is a hint, not a rule: a B+ with an exact fit can be strong, and say so in the reason.\n\nTHE SEAT\n${seatBrief(seat)}`
  const user = pool.map(p => `CANDIDATE ${p.id}\n${p.name} · ${p.grade ?? 'ungraded'} · ${p.facts}\n${p.summary}`).join('\n\n')

  // Thinking tokens count against this on adaptive models, so it is generous.
  const call = await structured('bench', { system, user, schema: BenchSchema, maxOutputTokens: 12000 })
  const byId = new Map(pool.map(p => [p.id, p]))
  const results = call.output.results.filter(r => byId.has(r.candidate_id))
  const strong = results.filter(r => r.fit === 'strong')
  const possible = results.filter(r => r.fit === 'possible')
  const shown = [...strong, ...(strong.length < 3 ? possible.slice(0, 3 - strong.length) : [])]
    .sort((a, b) => Number(byId.get(b.candidate_id)!.met) - Number(byId.get(a.candidate_id)!.met))
    .slice(0, MAX_SHOWN)

  const { data: run } = await admin
    .from('search_match_runs')
    .insert({ job_id: jobId, trigger, model: call.model, checked: pool.length, results, cost_usd: call.costUsd })
    .select('id')
    .single()

  if (!shown.length) return { posted: false, checked: pool.length, strong: 0, error: 'nobody strong or possible' }

  const lines: string[] = []
  for (let i = 0; i < shown.length; i++) {
    const r = shown[i]
    const p = byId.get(r.candidate_id)!
    const owner = await loadOwner(admin, p.ownerUserId)
    const ownerLine = owner ? (owner.isUs ? 'you' : owner.firstName) : 'no owner'
    const action = p.met ? 'anonymised blurb to the founder first' : owner && !owner.isUs ? `intro ask to ${owner.firstName}` : 'email them directly'
    lines.push(
      `${i + 1} · *<${APP_URL}/candidates/${p.id}|${esc(p.name)}>* ${p.grade ? `*${esc(p.grade)}*` : ''} · ${esc(r.reason)} · ${p.met ? '*met, warm*' : 'not met'} · owner: ${esc(ownerLine)}${r.blockers.length ? ` · :warning: ${esc(r.blockers.join('; '))}` : ''}\n      ${r.fit === 'strong' ? ':large_green_circle:' : ':large_yellow_circle:'} ${r.fit} → :${NUMBERS[i]}: ${action}`,
    )
  }
  const meta = [seat.location?.split(/[,(]/)[0], seat.remotePolicy, seatBand(seat), seat.visaRequirement?.replace(/_/g, ' ')].filter(Boolean).join(' · ')
  const blocks: SlackBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `:new: *${esc(seat.companyName)} · ${esc(seat.headline || seat.title)}* ${trigger === 'weekly' ? 'weekly re-match' : 'went live'} · ${esc(meta)}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `From the bench: *${strong.length} strong* of ${pool.length} checked · ${call.model.split('/')[1]} · $${call.costUsd.toFixed(2)}` }] },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `React with the number to act on one person · :fire: acts on every strong one · :zzz: dismisses  ·  <${APP_URL}/searches/${seat.companyId}/roles/${seat.jobId}|open the search>` }] },
  ]
  const posted = await postToDesk(`${seat.companyName}: ${strong.length} strong from the bench`, blocks)
  if (!posted.ok || !posted.ts || !posted.channel) return { posted: false, checked: pool.length, strong: strong.length, error: posted.error }
  await admin.from('search_match_runs').update({ slack_channel_id: posted.channel, slack_message_ts: posted.ts, results: shown.map(r => ({ ...r, met: byId.get(r.candidate_id)!.met })) }).eq('id', run?.id)
  for (let i = 0; i < shown.length; i++) await addReaction(posted.channel, posted.ts, NUMBERS[i])
  await addReaction(posted.channel, posted.ts, 'fire')
  await addReaction(posted.channel, posted.ts, 'zzz')
  return { posted: true, checked: pool.length, strong: strong.length }
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
  // A worker that died mid-call leaves a row running forever. Give it back.
  await admin
    .from('search_match_queue')
    .update({ status: 'queued' })
    .eq('status', 'running')
    .lt('enqueued_at', new Date(Date.now() - 8 * 60_000).toISOString())
  const { data } = await admin.from('search_match_queue').select('*').eq('status', 'queued').lt('attempts', 3).order('enqueued_at').limit(5)
  const out: Record<string, unknown>[] = []
  for (const q of data ?? []) {
    await admin.from('search_match_queue').update({ status: 'running', attempts: (q.attempts as number) + 1, enqueued_at: new Date().toISOString() }).eq('job_id', q.job_id)
    try {
      const r = await runBenchMatch(admin, q.job_id as string, q.trigger as string)
      await admin.from('search_match_queue').update({ status: 'done', error: r.error ?? null, finished_at: new Date().toISOString() }).eq('job_id', q.job_id)
      out.push({ job: q.job_id, ...r })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await admin.from('search_match_queue').update({ status: (q.attempts as number) + 1 >= 3 ? 'failed' : 'queued', error: message.slice(0, 400) }).eq('job_id', q.job_id)
      out.push({ job: q.job_id, error: message })
    }
  }
  return { runs: out }
}

/** A reaction on a bench card. */
export async function handleBenchReaction(
  admin: SupabaseClient,
  input: { reaction: string; slackUser: string; channel: string; ts: string },
): Promise<boolean> {
  const { data: run } = await admin
    .from('search_match_runs')
    .select('id, job_id, results')
    .eq('slack_channel_id', input.channel)
    .eq('slack_message_ts', input.ts)
    .maybeSingle()
  if (!run) return false
  const results = (run.results as { candidate_id: string; fit: string; met?: boolean }[]) ?? []
  const idx = NUMBERS.indexOf(input.reaction as (typeof NUMBERS)[number])
  let picked: typeof results = []
  if (idx >= 0 && results[idx]) picked = [results[idx]]
  else if (input.reaction === 'fire') picked = results.filter(r => r.fit === 'strong')
  else if (input.reaction === 'zzz') {
    await postThreadReply(input.channel, input.ts, `:zzz: <@${input.slackUser}> dismissed this list. Same people will not be shown for this seat again.`)
    return true
  } else return false

  const [seat] = await loadLiveSeats(admin, [run.job_id as string])
  for (const r of picked) {
    const { data: c } = await admin.from('candidates').select('id, name, journey_stage, owner_user_id, email, intake_source').eq('id', r.candidate_id).maybeSingle()
    if (!c) continue
    const first = properName(c.name as string).split(' ')[0]
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
