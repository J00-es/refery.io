/**
 * The sequence for a seat, the drafts it renders, and the batch that one
 * approval covers.
 *
 * A sequence is two steps by default: the first email and one follow-up in
 * the same thread. Lily edits the templates; the merge fields are filled
 * from the seat and the person's record, and the opener is the graded hook
 * only when its evidence was found in the record, otherwise a plain line
 * that is true of anyone we found.
 *
 * A batch freezes people, mailboxes, addresses and rendered drafts under one
 * hash. Approving it (on the page or with :+1: on the Slack card) creates a
 * run per person from those frozen drafts and nothing else: a person added
 * later or a template edited later is a new batch with a new approval.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { postBatch, registerBatchApplier, type BatchItem as SlackBatchItem } from '@/lib/batches'
import { deskChannel } from '@/lib/desk-notifications'
import { sha256 } from '@/lib/engine/evidence'
import { approvedBrief } from '@/lib/sourcing/brief'
import { relationshipCheck } from '@/lib/sourcing/checks'
import { loadMailboxes } from '@/lib/sourcing/mailboxes'
import { pickAddress } from '@/lib/sourcing/people'
import { isReady, notReadyBecause, type BatchItem, type BatchRow, type MailboxRow, type PersonRow, type PoolRow, type RenderedDraft, type SequenceRow, type SequenceStep } from '@/lib/sourcing/types'

export const DEFAULT_STEPS: SequenceStep[] = [
  {
    n: 1,
    day: 0,
    subject: '{title} at {company}',
    body: `Hi {first},

{opener}

I run Refery, a small search firm. {company} is hiring a {title}: {pay_line}, {location_line}. I know the founders and can say what the work actually is.

Would you take fifteen minutes with me this week to hear about it? No CV needed, and I will tell you straight if it is not a fit. If you would rather I did not write again, reply "no thanks" and I will not.

Best,
{signer}`,
  },
  {
    n: 2,
    day: 4,
    subject: '',
    body: `Hi {first}, a short follow-up in case the first note got buried. If the timing is wrong, a one-line no is genuinely useful to me and I will leave you be.

Best,
{signer}`,
  },
]

export async function loadSequence(admin: SupabaseClient, jobId: string): Promise<SequenceRow> {
  const { data } = await admin.from('sourcing_sequences').select('*').eq('job_id', jobId).maybeSingle()
  if (data) return data as SequenceRow
  const mailboxes = await loadMailboxes(admin)
  const { data: created, error } = await admin
    .from('sourcing_sequences')
    .insert({ job_id: jobId, steps: DEFAULT_STEPS, mailbox_ids: mailboxes.filter(m => m.status === 'active').map(m => m.id) })
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_sequences insert: ${error.message}`)
  return created as SequenceRow
}

export async function saveSequence(admin: SupabaseClient, jobId: string, patch: Partial<Pick<SequenceRow, 'steps' | 'mailbox_ids' | 'address_preference' | 'send_days' | 'followup_days' | 'window_start' | 'window_end' | 'mode' | 'sending'>>): Promise<SequenceRow> {
  const cur = await loadSequence(admin, jobId)
  const templatesChanged = patch.steps && JSON.stringify(patch.steps) !== JSON.stringify(cur.steps)
  const { data, error } = await admin
    .from('sourcing_sequences')
    .update({ ...patch, ...(templatesChanged ? { version: cur.version + 1 } : {}) })
    .eq('job_id', jobId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data as SequenceRow
}

export interface SeatFacts {
  jobId: string
  companyName: string
  title: string
  location: string | null
  remotePolicy: string | null
  payLine: string
}

export async function seatFacts(admin: SupabaseClient, jobId: string): Promise<SeatFacts> {
  const { data } = await admin.from('partner_roles_v').select('company_name, title, headline, location, remote_policy, salary_min, salary_max, salary_currency').eq('job_id', jobId).maybeSingle()
  const cur = (data?.salary_currency as string | null) ?? 'USD'
  const sym = cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$'
  const k = (n: number) => `${sym}${Math.round(n / 1000)}k`
  const payLine = data?.salary_min && data?.salary_max ? `${k(data.salary_min)} to ${k(data.salary_max)} base` : 'competitive pay'
  return {
    jobId,
    companyName: (data?.company_name as string) ?? 'the client',
    title: ((data?.headline as string | null) ?? (data?.title as string)) || 'a role',
    location: (data?.location as string | null) ?? null,
    remotePolicy: (data?.remote_policy as string | null) ?? null,
    payLine,
  }
}

function locationLine(seat: SeatFacts): string {
  const where = seat.location ?? 'location on request'
  const pol = seat.remotePolicy ? seat.remotePolicy.replace(/_/g, ' ') : null
  return pol ? `${pol} in ${where}` : where
}

/** The merge fields, all of them true of this person and this seat. */
export function mergeFields(person: PersonRow, pool: Pick<PoolRow, 'hook' | 'hook_ok'>, seat: SeatFacts, mailbox: MailboxRow): Record<string, string> {
  const first = person.first_name ?? person.full_name.split(/\s+/)[0] ?? 'there'
  const opener = pool.hook_ok && pool.hook
    ? pool.hook
    : person.current_title && person.current_employer
      ? `I came across your profile, ${person.current_title} at ${person.current_employer}, and thought of a search I am running.`
      : 'I came across your profile and thought of a search I am running.'
  return {
    first,
    opener,
    company: seat.companyName,
    title: seat.title,
    pay_line: seat.payLine,
    location_line: locationLine(seat),
    employer: person.current_employer ?? '',
    signer: mailbox.signs_as,
  }
}

export function renderTemplate(text: string, fields: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, key: string) => (key in fields ? fields[key] : m))
}

export function renderDrafts(steps: SequenceStep[], fields: Record<string, string>): RenderedDraft[] {
  return steps.map(s => ({ n: s.n, day: s.day, subject: renderTemplate(s.subject, fields), body: renderTemplate(s.body, fields) }))
}

/** Anything left in braces is a missing fact; the draft must not send. */
export function unresolved(drafts: RenderedDraft[]): string[] {
  const out = new Set<string>()
  for (const d of drafts) for (const m of `${d.subject}\n${d.body}`.matchAll(/\{([a-z_]+)\}/g)) out.add(m[1])
  return [...out]
}

export interface ProposeResult {
  batch: BatchRow | null
  skipped: { name: string; why: string }[]
  slack: { ok: boolean; error?: string }
}

/**
 * Freeze a batch for the given pool rows (or every ready row when none are
 * given), post the card, and return what could not go in and why.
 */
export async function proposeBatch(admin: SupabaseClient, jobId: string, by: string, poolIds?: string[]): Promise<ProposeResult> {
  const seq = await loadSequence(admin, jobId)
  const brief = await approvedBrief(admin, jobId)
  const seat = await seatFacts(admin, jobId)
  const mailboxes = (await loadMailboxes(admin)).filter(m => seq.mailbox_ids.includes(m.id) && m.status === 'active')
  const skipped: { name: string; why: string }[] = []
  if (!mailboxes.length) return { batch: null, skipped: [{ name: 'everyone', why: 'the sequence has no active mailbox' }], slack: { ok: false } }

  let q = admin.from('sourcing_pool').select('*, sourcing_people(*)').eq('job_id', jobId).eq('decision', 'ready')
  if (poolIds?.length) q = q.in('id', poolIds)
  const { data } = await q.limit(60)
  const rows = ((data ?? []) as unknown as (PoolRow & { sourcing_people: PersonRow })[])

  const items: BatchItem[] = []
  let i = 0
  for (const row of rows) {
    const person = row.sourcing_people
    const check = await relationshipCheck(admin, person, jobId)
    const fresh = { ...row, relationship_status: check.status, relationship_note: check.note }
    await admin.from('sourcing_pool').update({ relationship_status: check.status, relationship_note: check.note }).eq('id', row.id)
    if (!isReady(fresh)) {
      skipped.push({ name: person.full_name, why: notReadyBecause(fresh).join(', ') })
      continue
    }
    const address = pickAddress(person.emails, seq.address_preference)
    if (!address) {
      skipped.push({ name: person.full_name, why: 'no address the preference allows' })
      continue
    }
    const mailbox = mailboxes[i++ % mailboxes.length]
    const drafts = renderDrafts(seq.steps, mergeFields(person, row, seat, mailbox))
    const missing = unresolved(drafts)
    if (missing.length) {
      skipped.push({ name: person.full_name, why: `template needs ${missing.join(', ')}` })
      continue
    }
    items.push({ pool_id: row.id, person_id: person.id, name: person.full_name, mailbox_id: mailbox.id, address: address.address, drafts, hash: sha256(JSON.stringify([person.id, mailbox.id, address.address, drafts])) })
  }
  if (!items.length) return { batch: null, skipped, slack: { ok: false } }

  const { data: batch, error } = await admin
    .from('sourcing_batches')
    .insert({ job_id: jobId, sequence_id: seq.id, sequence_version: seq.version, brief_version: brief?.version ?? null, items, status: 'proposed', created_by: by })
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_batches insert: ${error.message}`)

  const mailboxName = (id: string) => mailboxes.find(m => m.id === id)?.address ?? id
  const slackItems: SlackBatchItem[] = items.map((it, n) => ({
    n: n + 1,
    id: it.pool_id,
    label: `*${it.name}* · ${rows.find(r => r.id === it.pool_id)?.sourcing_people.current_title ?? '?'} at ${rows.find(r => r.id === it.pool_id)?.sourcing_people.current_employer ?? '?'} · ${it.address} · from ${mailboxName(it.mailbox_id)}`,
    decision: 'send',
    data: { batch_id: batch.id, hash: it.hash },
  }))
  const posted = await postBatch(admin, {
    kind: 'sourcing_outreach',
    channel: deskChannel('decide'),
    title: `${seat.companyName} · ${seat.title}: ${items.length} ${items.length === 1 ? 'person' : 'people'} to write to`,
    intro: `Step 1 now, step 2 in the same thread ${seq.steps[1]?.day ?? 4} days later unless they reply. Drafts are frozen on the batch; open the pool page to read them. Approving here or on the page is the same decision.`,
    items: slackItems,
    decisions: ['send'],
    footer: `Profile v${brief?.version ?? '?'} · sequence v${seq.version} · ${skipped.length ? `${skipped.length} not included: ${skipped.slice(0, 3).map(s => `${s.name} (${s.why})`).join('; ')}` : 'everyone ready is on the card'} · <${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')}/sourcing/${jobId}?tab=pool|pool page>`,
  })
  if (posted.ok) await admin.from('sourcing_batches').update({ slack_batch_id: posted.id ?? null, slack_ts: posted.ts ?? null, slack_channel: deskChannel('decide') }).eq('id', batch.id)
  return { batch: { ...(batch as BatchRow), slack_batch_id: posted.id ?? null }, skipped, slack: { ok: posted.ok, error: posted.error } }
}

/**
 * Approve: claim the batch, then one run per item that is still clear at
 * this moment. The claim is the status flip, so a second click or a Slack
 * retry finds it already approved and creates nothing.
 */
export async function approveBatch(admin: SupabaseClient, batchId: string, by: string, skipPoolIds: string[] = []): Promise<{ runs: number; skipped: { name: string; why: string }[]; already?: boolean }> {
  const { data: claimed } = await admin
    .from('sourcing_batches')
    .update({ status: 'approved', approved_by: by, approved_at: new Date().toISOString() })
    .eq('id', batchId)
    .eq('status', 'proposed')
    .select('*')
    .maybeSingle()
  if (!claimed) return { runs: 0, skipped: [], already: true }
  const batch = claimed as BatchRow
  const skipped: { name: string; why: string }[] = []
  let runs = 0
  for (const it of batch.items) {
    if (skipPoolIds.includes(it.pool_id)) {
      skipped.push({ name: it.name, why: 'skipped on the card' })
      continue
    }
    const { data: person } = await admin.from('sourcing_people').select('*').eq('id', it.person_id).maybeSingle()
    if (!person) continue
    const check = await relationshipCheck(admin, person as PersonRow, batch.job_id)
    if (check.status !== 'clear') {
      skipped.push({ name: it.name, why: check.note ?? check.status })
      await admin.from('sourcing_pool').update({ relationship_status: check.status, relationship_note: check.note }).eq('id', it.pool_id)
      continue
    }
    const { error } = await admin.from('sourcing_runs').insert({
      batch_id: batch.id,
      job_id: batch.job_id,
      person_id: it.person_id,
      pool_id: it.pool_id,
      mailbox_id: it.mailbox_id,
      address: it.address,
      sequence_version: batch.sequence_version,
      drafts: it.drafts,
      step: 0,
      state: 'queued',
      next_at: new Date().toISOString(),
    })
    if (error) {
      skipped.push({ name: it.name, why: error.message })
      continue
    }
    await admin.from('sourcing_pool').update({ relationship_status: 'in_sequence', relationship_note: 'queued' }).eq('id', it.pool_id)
    runs++
  }
  return { runs, skipped }
}

export async function cancelBatch(admin: SupabaseClient, batchId: string): Promise<boolean> {
  const { data } = await admin.from('sourcing_batches').update({ status: 'cancelled' }).eq('id', batchId).eq('status', 'proposed').select('id').maybeSingle()
  return Boolean(data)
}

// The Slack card's :+1: is the same approval as the page's button.
registerBatchApplier('sourcing_outreach', async (admin, { batch, slackUser }) => {
  const batchId = (batch.items[0]?.data as { batch_id?: string } | undefined)?.batch_id
  if (!batchId) return { lines: [':warning: This card carries no batch id; nothing was sent.'], summary: {} }
  const skip = batch.items.filter(i => i.decision === 'skip').map(i => i.id)
  const out = await approveBatch(admin, batchId, `slack:${slackUser}`, skip)
  if (out.already) return { lines: ['This batch was already approved on the page; nothing more was queued.'], summary: { already: true } }
  const lines = [`Queued ${out.runs} ${out.runs === 1 ? 'person' : 'people'}. First emails go out in the next send window; replies land in this channel.`]
  if (out.skipped.length) lines.push(`Not queued: ${out.skipped.map(s => `${s.name} (${s.why})`).join('; ')}.`)
  return { lines, summary: { runs: out.runs, skipped: out.skipped.length } }
})
