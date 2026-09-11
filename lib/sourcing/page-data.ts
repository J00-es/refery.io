/**
 * What the sourcing pages read. Server only; every loader takes the admin
 * client because the tables are service-role only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { notFound, redirect } from 'next/navigation'
import { getAppUser } from '@/lib/current-user'
import { creditsThisMonth } from '@/lib/sourcing/apollo'
import { approvedBrief, latestBrief } from '@/lib/sourcing/brief'
import { effectiveCap, loadMailboxes, mailboxHealth, forecast, type MailboxHealth } from '@/lib/sourcing/mailboxes'
import { loadSequence } from '@/lib/sourcing/sequence'
import type { BatchRow, BriefRow, PersonRow, PoolRow, RunRow, SequenceRow } from '@/lib/sourcing/types'

/** Super admins only. Everyone else sees a 404, not a locked page. */
export async function requireSourcingUser(): Promise<{ email: string }> {
  const user = await getAppUser()
  if (!user) redirect('/auth/login')
  if (!user.isSuperAdmin) notFound()
  return { email: user.email }
}

export interface Seat {
  jobId: string
  companyId: string | null
  companyName: string
  title: string
  location: string | null
  remotePolicy: string | null
  salaryMin: number | null
  salaryMax: number | null
  currency: string | null
}

export async function loadSeats(admin: SupabaseClient): Promise<Seat[]> {
  const { data } = await admin
    .from('partner_roles_v')
    .select('job_id, company_id, company_name, title, headline, location, remote_policy, salary_min, salary_max, salary_currency')
    .eq('is_live', true)
    .eq('job_status', 'open')
    .order('company_name')
  return (data ?? []).map(r => ({
    jobId: r.job_id as string,
    companyId: (r.company_id as string | null) ?? null,
    companyName: r.company_name as string,
    title: ((r.headline as string | null) ?? (r.title as string)) || 'Role',
    location: (r.location as string | null) ?? null,
    remotePolicy: (r.remote_policy as string | null) ?? null,
    salaryMin: (r.salary_min as number | null) ?? null,
    salaryMax: (r.salary_max as number | null) ?? null,
    currency: (r.salary_currency as string | null) ?? null,
  }))
}

export async function loadSeat(admin: SupabaseClient, jobId: string): Promise<Seat | null> {
  const seats = await loadSeats(admin)
  const hit = seats.find(s => s.jobId === jobId)
  if (hit) return hit
  // A seat that just went off live keeps its page readable.
  const { data } = await admin.from('jobs').select('id, title, company_name, company_id, location, remote_policy, salary_min, salary_max, salary_currency').eq('id', jobId).maybeSingle()
  if (!data) return null
  return { jobId: data.id, companyId: data.company_id, companyName: data.company_name ?? 'Client', title: data.title, location: data.location, remotePolicy: data.remote_policy, salaryMin: data.salary_min, salaryMax: data.salary_max, currency: data.salary_currency }
}

export interface SeatSummary extends Seat {
  brief: { version: number; status: BriefRow['status']; approvedAt: string | null } | null
  hasDraft: boolean
  pool: { found: number; promising: number; graded: number; fit: number; ready: number }
  runs: { queued: number; active: number; replied: number; interested: number; bounced: number; done: number; paused: number }
  sequence: { sending: boolean; mode: string } | null
  proposed: number
}

export async function loadSeatSummaries(admin: SupabaseClient): Promise<SeatSummary[]> {
  const seats = await loadSeats(admin)
  const ids = seats.map(s => s.jobId)
  if (!ids.length) return []
  const [{ data: briefs }, { data: pool }, { data: runs }, { data: seqs }, { data: batches }] = await Promise.all([
    admin.from('sourcing_briefs').select('job_id, version, status, approved_at').in('job_id', ids).order('version', { ascending: false }),
    admin.from('sourcing_pool').select('job_id, screen, fit_status, decision, graded_at').in('job_id', ids),
    admin.from('sourcing_runs').select('job_id, state, reply_kind').in('job_id', ids),
    admin.from('sourcing_sequences').select('job_id, sending, mode').in('job_id', ids),
    admin.from('sourcing_batches').select('job_id').in('job_id', ids).eq('status', 'proposed'),
  ])
  return seats.map(s => {
    const bs = (briefs ?? []).filter(b => b.job_id === s.jobId)
    const approved = bs.find(b => b.status === 'approved')
    const latest = bs[0]
    const p = (pool ?? []).filter(r => r.job_id === s.jobId)
    const r = (runs ?? []).filter(x => x.job_id === s.jobId)
    const seq = (seqs ?? []).find(x => x.job_id === s.jobId)
    return {
      ...s,
      brief: approved ? { version: approved.version, status: 'approved', approvedAt: approved.approved_at } : latest ? { version: latest.version, status: latest.status, approvedAt: null } : null,
      hasDraft: Boolean(latest && latest.status === 'draft'),
      pool: {
        found: p.length,
        promising: p.filter(x => x.screen === 'promising').length,
        graded: p.filter(x => x.graded_at).length,
        fit: p.filter(x => x.fit_status === 'fit').length,
        ready: p.filter(x => x.decision === 'ready').length,
      },
      runs: {
        queued: r.filter(x => x.state === 'queued').length,
        active: r.filter(x => x.state === 'active' || x.state === 'ooo').length,
        replied: r.filter(x => x.state === 'replied').length,
        interested: r.filter(x => x.reply_kind === 'interested').length,
        bounced: r.filter(x => x.state === 'bounced').length,
        done: r.filter(x => x.state === 'done').length,
        paused: r.filter(x => x.state === 'paused' || x.state === 'error').length,
      },
      sequence: seq ? { sending: seq.sending, mode: seq.mode } : null,
      proposed: (batches ?? []).filter(b => b.job_id === s.jobId).length,
    }
  })
}

export interface Spend {
  apolloCredits: number
  lookups: number
  found: number
  modelUsd: number
  modelCalls: number
  sentThisMonth: number
  repliesThisMonth: number
}

export async function loadSpend(admin: SupabaseClient): Promise<Spend> {
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const credits = await creditsThisMonth(admin)
  const { data: usage } = await admin.from('brain_ai_usage').select('actual_usd, estimate_usd').gte('created_at', start.toISOString()).like('task', 'sourcing_%')
  const { data: ev } = await admin.from('sourcing_events').select('kind').gte('created_at', start.toISOString()).in('kind', ['sent', 'reply'])
  return {
    apolloCredits: credits.apollo,
    lookups: credits.lookups,
    found: credits.found,
    modelUsd: (usage ?? []).reduce((s, u) => s + Number(u.actual_usd ?? u.estimate_usd ?? 0), 0),
    modelCalls: (usage ?? []).length,
    sentThisMonth: (ev ?? []).filter(e => e.kind === 'sent').length,
    repliesThisMonth: (ev ?? []).filter(e => e.kind === 'reply').length,
  }
}

export async function loadCapacity(admin: SupabaseClient): Promise<{ health: MailboxHealth[]; forecast: ReturnType<typeof forecast>; capToday: number }> {
  const mailboxes = await loadMailboxes(admin)
  const health: MailboxHealth[] = []
  for (const m of mailboxes) health.push(await mailboxHealth(admin, m))
  return { health, forecast: forecast(mailboxes, { steps: 2, sendDays: 3 }), capToday: mailboxes.filter(m => m.status === 'active').reduce((s, m) => s + effectiveCap(m), 0) }
}

export type PoolWithPerson = PoolRow & { person: PersonRow }

export async function loadPool(admin: SupabaseClient, jobId: string): Promise<PoolWithPerson[]> {
  const { data } = await admin.from('sourcing_pool').select('*, sourcing_people(*)').eq('job_id', jobId).order('created_at', { ascending: false }).limit(500)
  return ((data ?? []) as unknown as (PoolRow & { sourcing_people: PersonRow })[]).map(r => ({ ...r, person: r.sourcing_people }))
}

export async function loadBriefs(admin: SupabaseClient, jobId: string): Promise<{ latest: BriefRow | null; approved: BriefRow | null; history: Pick<BriefRow, 'id' | 'version' | 'status' | 'created_at' | 'approved_at' | 'approved_by'>[] }> {
  const [latest, approved, { data: history }] = await Promise.all([
    latestBrief(admin, jobId),
    approvedBrief(admin, jobId),
    admin.from('sourcing_briefs').select('id, version, status, created_at, approved_at, approved_by').eq('job_id', jobId).order('version', { ascending: false }).limit(10),
  ])
  return { latest, approved, history: (history ?? []) as Pick<BriefRow, 'id' | 'version' | 'status' | 'created_at' | 'approved_at' | 'approved_by'>[] }
}

export type RunWithPerson = RunRow & { person: PersonRow; mailbox: string }

export async function loadRuns(admin: SupabaseClient, jobId: string): Promise<RunWithPerson[]> {
  const { data } = await admin.from('sourcing_runs').select('*, sourcing_people(*), sourcing_mailboxes(address)').eq('job_id', jobId).order('updated_at', { ascending: false }).limit(500)
  return ((data ?? []) as unknown as (RunRow & { sourcing_people: PersonRow; sourcing_mailboxes: { address: string } | null })[]).map(r => ({ ...r, person: r.sourcing_people, mailbox: r.sourcing_mailboxes?.address ?? '' }))
}

export async function loadSequenceFor(admin: SupabaseClient, jobId: string): Promise<SequenceRow> {
  return loadSequence(admin, jobId)
}

export async function loadBatches(admin: SupabaseClient, jobId: string): Promise<BatchRow[]> {
  const { data } = await admin.from('sourcing_batches').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(20)
  return (data ?? []) as BatchRow[]
}

export interface ReplyItem {
  id: string
  kind: string
  classification: string | null
  summary: string | null
  created_at: string
  payload: Record<string, unknown>
  run: (RunRow & { person: PersonRow; mailbox: string }) | null
  seat: string
}

export async function loadReplies(admin: SupabaseClient, limit = 100): Promise<ReplyItem[]> {
  const { data } = await admin
    .from('sourcing_events')
    .select('id, kind, classification, summary, created_at, payload, job_id, sourcing_runs(*, sourcing_people(*), sourcing_mailboxes(address))')
    .in('kind', ['reply', 'bounce', 'ooo', 'revisit'])
    .order('created_at', { ascending: false })
    .limit(limit)
  const rows = (data ?? []) as unknown as { id: string; kind: string; classification: string | null; summary: string | null; created_at: string; payload: Record<string, unknown>; job_id: string | null; sourcing_runs: (RunRow & { sourcing_people: PersonRow; sourcing_mailboxes: { address: string } | null }) | null }[]
  const seats = await loadSeats(admin)
  const seatName = (id: string | null) => {
    const s = seats.find(x => x.jobId === id)
    return s ? `${s.companyName} · ${s.title}` : 'a search'
  }
  return rows.map(r => ({
    id: r.id,
    kind: r.kind,
    classification: r.classification,
    summary: r.summary,
    created_at: r.created_at,
    payload: r.payload ?? {},
    run: r.sourcing_runs ? { ...r.sourcing_runs, person: r.sourcing_runs.sourcing_people, mailbox: r.sourcing_runs.sourcing_mailboxes?.address ?? '' } : null,
    seat: seatName(r.job_id),
  }))
}
