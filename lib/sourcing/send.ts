/**
 * Sending what is due, a few per mailbox per tick.
 *
 * The cron calls this every ten minutes. Each tick sends at most a handful
 * per mailbox, which is what spaces sends minutes apart without a scheduler.
 * Before every send the run is read again, the address is checked against
 * the never list, the person's relationship is checked again, and the
 * mailbox's room for today is checked. A send that times out is reconciled
 * against the mailbox before it is ever retried, because Gmail may have
 * accepted it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getMessageMetaAs, searchMessagesAs, sendMessageAs } from '@/lib/google'
import { relationshipCheck } from '@/lib/sourcing/checks'
import { loadMailboxes, mailboxHealth, mailboxToken, type MailboxHealth } from '@/lib/sourcing/mailboxes'
import { loadSequence } from '@/lib/sourcing/sequence'
import type { MailboxRow, PersonRow, RunRow, SequenceRow } from '@/lib/sourcing/types'

const PER_MAILBOX_PER_TICK = 3
const MAX_ERRORS = 3

/** A time zone from the seat's location; the recipient's is unknown, the seat's is the best guess. */
export function timezoneFor(location: string | null | undefined): string {
  const t = (location ?? '').toLowerCase()
  if (/san francisco|\bsf\b|bay area|palo alto|mountain view|oakland|berkeley|san jose|menlo park|burlingame|los angeles|seattle|portland|\bca\b|\bwa\b/.test(t)) return 'America/Los_Angeles'
  if (/denver|boulder|salt lake|\bco\b|\but\b/.test(t)) return 'America/Denver'
  if (/chicago|austin|dallas|houston|minneapolis|\btx\b|\bil\b/.test(t)) return 'America/Chicago'
  if (/new york|nyc|brooklyn|boston|miami|atlanta|washington|philadelphia|toronto|\bny\b|\bma\b|\bfl\b|\bga\b|\bdc\b/.test(t)) return 'America/New_York'
  if (/london|\buk\b|united kingdom|england|dublin|lisbon|portugal/.test(t)) return 'Europe/London'
  if (/barcelona|madrid|spain|paris|berlin|amsterdam|munich|zurich|milan|rome|stockholm|copenhagen|europe|germany|france|netherlands|switzerland|italy|sweden|denmark/.test(t)) return 'Europe/Madrid'
  if (/india|bangalore|bengaluru|mumbai|delhi|hyderabad/.test(t)) return 'Asia/Kolkata'
  if (/singapore/.test(t)) return 'Asia/Singapore'
  if (/sydney|melbourne|australia/.test(t)) return 'Australia/Sydney'
  return 'America/Los_Angeles'
}

function localParts(tz: string, at = new Date()): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at)
  const wd = parts.find(p => p.type === 'weekday')?.value ?? 'Mon'
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? '0')
  const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return { weekday: days[wd] ?? 1, minutes: h * 60 + m }
}

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Is now inside the sequence's window for this step, in the seat's time zone? */
export function inWindow(seq: SequenceRow, step: number, tz: string, at = new Date()): { ok: boolean; why?: string } {
  const { weekday, minutes } = localParts(tz, at)
  if (step === 0) {
    if (!seq.send_days.includes(weekday)) return { ok: false, why: 'not a first-email day' }
    if (minutes < mins(seq.window_start) || minutes > mins(seq.window_end)) return { ok: false, why: 'outside the morning window' }
    return { ok: true }
  }
  if (!seq.followup_days.includes(weekday)) return { ok: false, why: 'not a follow-up day' }
  if (minutes < 8 * 60 || minutes > 17 * 60) return { ok: false, why: 'outside working hours' }
  return { ok: true }
}

export interface SendReport {
  sent: number
  skipped: number
  errors: number
  notes: string[]
}

async function event(admin: SupabaseClient, run: RunRow, kind: string, extra: Record<string, unknown> = {}): Promise<void> {
  await admin.from('sourcing_events').insert({ run_id: run.id, job_id: run.job_id, person_id: run.person_id, mailbox_id: run.mailbox_id, kind, ...extra })
}

async function errorCount(admin: SupabaseClient, runId: string): Promise<number> {
  const { count } = await admin.from('sourcing_events').select('id', { count: 'exact', head: true }).eq('run_id', runId).eq('kind', 'error')
  return count ?? 0
}

/**
 * After a timeout: did the message go? Search the mailbox for a message to
 * this address with this subject in the last day; a hit means Gmail accepted
 * the send and the run moves on as if it had answered.
 */
async function reconcile(token: string, run: RunRow, subject: string, sinceMs: number): Promise<{ id: string; threadId: string; messageId: string | null } | null> {
  const q = `to:${run.address} subject:"${subject.replace(/"/g, '')}" newer_than:1d`
  const { messages } = await searchMessagesAs(token, q, 3)
  const hit = messages.find(m => m.internalDate >= sinceMs - 120_000)
  return hit ? { id: hit.id, threadId: hit.threadId, messageId: hit.messageId } : null
}

export async function sendRun(admin: SupabaseClient, run: RunRow, mailbox: MailboxRow, seq: SequenceRow, token: string): Promise<'sent' | 'skipped' | 'error'> {
  // Read again: a reply or a pause since the run was selected wins.
  const { data: freshRow } = await admin.from('sourcing_runs').select('*').eq('id', run.id).maybeSingle()
  const fresh = freshRow as RunRow | null
  if (!fresh || !['queued', 'active', 'ooo'].includes(fresh.state)) return 'skipped'
  const step = fresh.step
  const draft = fresh.drafts[step]
  if (!draft) {
    await admin.from('sourcing_runs').update({ state: 'done', stopped_reason: 'sequence complete' }).eq('id', run.id)
    return 'skipped'
  }

  const { data: personRow } = await admin.from('sourcing_people').select('*').eq('id', run.person_id).maybeSingle()
  const person = personRow as PersonRow | null
  if (!person) return 'skipped'
  const { data: sup } = await admin.from('sourcing_suppressions').select('reason').eq('email', run.address.toLowerCase()).maybeSingle()
  if (sup || person.do_not_contact) {
    await admin.from('sourcing_runs').update({ state: 'stopped', stopped_reason: sup?.reason ?? person.do_not_contact_reason ?? 'do not contact' }).eq('id', run.id)
    await event(admin, fresh, 'suppressed', { summary: sup?.reason ?? 'do not contact' })
    return 'skipped'
  }
  const check = await relationshipCheck(admin, person, run.job_id, { excludeRunId: run.id })
  if (check.status !== 'clear' && check.status !== 'contacted_recently') {
    await admin.from('sourcing_runs').update({ state: 'stopped', stopped_reason: check.note ?? check.status }).eq('id', run.id)
    await event(admin, fresh, 'stopped', { summary: check.note ?? check.status })
    return 'skipped'
  }
  if (fresh.pool_id) {
    const { data: pool } = await admin.from('sourcing_pool').select('decision').eq('id', fresh.pool_id).maybeSingle()
    if (pool && pool.decision !== 'ready') {
      await admin.from('sourcing_runs').update({ state: 'stopped', stopped_reason: `pool decision is ${pool.decision}` }).eq('id', run.id)
      await event(admin, fresh, 'stopped', { summary: `pool decision is ${pool.decision}` })
      return 'skipped'
    }
  }

  const attemptedAt = Date.now()
  const thread = step > 0 && fresh.gmail_thread_id ? { threadId: fresh.gmail_thread_id, messageId: fresh.first_message_id, subject: fresh.first_subject } : null
  const subject = thread ? (fresh.first_subject ?? draft.subject) : draft.subject
  const res = await sendMessageAs(token, {
    to: run.address,
    toName: person.full_name,
    subject,
    body: draft.body,
    thread,
    headers: { 'X-Refery-Run': `${run.id}:${step + 1}` },
  })

  let sentId = res.messageId ?? null
  let threadId = res.threadId ?? null
  if (res.error) {
    const ambiguous = /abort|timeout|timed out|fetch failed|ECONNRESET|5\d\d/i.test(res.error)
    const found = ambiguous ? await reconcile(token, fresh, subject, attemptedAt) : null
    if (found) {
      sentId = found.id
      threadId = found.threadId
    } else {
      const errors = (await errorCount(admin, run.id)) + 1
      await event(admin, fresh, 'error', { step: step + 1, summary: res.error.slice(0, 300) })
      const fatal = errors >= MAX_ERRORS || /^4(0[0134]|29)/.test(res.error)
      await admin
        .from('sourcing_runs')
        .update(fatal ? { state: 'error', last_error: res.error.slice(0, 500) } : { last_error: res.error.slice(0, 500), next_at: new Date(Date.now() + 60 * 60_000).toISOString() })
        .eq('id', run.id)
      return 'error'
    }
  }

  const meta = sentId ? await getMessageMetaAs(token, sentId) : null
  const nextStep = fresh.drafts[step + 1]
  const nextAt = nextStep ? new Date(Date.now() + Math.max(1, nextStep.day) * 86_400_000).toISOString() : null
  await admin
    .from('sourcing_runs')
    .update({
      step: step + 1,
      state: nextStep ? 'active' : 'done',
      stopped_reason: nextStep ? null : 'sequence complete, no reply',
      next_at: nextAt,
      gmail_thread_id: threadId ?? fresh.gmail_thread_id,
      gmail_message_ids: [...fresh.gmail_message_ids, ...(sentId ? [sentId] : [])],
      first_subject: fresh.first_subject ?? subject,
      first_message_id: fresh.first_message_id ?? meta?.messageId ?? null,
      last_sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', run.id)
  await event(admin, fresh, 'sent', { step: step + 1, gmail_message_id: sentId, summary: subject.slice(0, 200), payload: { address: run.address, mailbox: mailbox.address } })
  await admin.from('sourcing_people').update({ last_contacted_at: new Date().toISOString() }).eq('id', run.person_id)
  return 'sent'
}

export async function runDue(admin: SupabaseClient): Promise<SendReport> {
  const report: SendReport = { sent: 0, skipped: 0, errors: 0, notes: [] }
  const mailboxes = await loadMailboxes(admin)
  const health = new Map<string, MailboxHealth>()
  for (const m of mailboxes) health.set(m.id, await mailboxHealth(admin, m))

  const { data: dueRows } = await admin
    .from('sourcing_runs')
    .select('*')
    .in('state', ['queued', 'active', 'ooo'])
    .lte('next_at', new Date().toISOString())
    .order('next_at')
    .limit(200)
  const due = (dueRows ?? []) as RunRow[]
  if (!due.length) return report

  const seqCache = new Map<string, SequenceRow>()
  const tzCache = new Map<string, string>()
  const perMailbox = new Map<string, number>()
  for (const run of due) {
    const h = health.get(run.mailbox_id)
    if (!h) {
      report.skipped++
      continue
    }
    if (h.blocked) {
      report.skipped++
      if (!report.notes.includes(`${h.mailbox.address}: ${h.blocked}`)) report.notes.push(`${h.mailbox.address}: ${h.blocked}`)
      continue
    }
    const used = perMailbox.get(run.mailbox_id) ?? 0
    if (used >= Math.min(PER_MAILBOX_PER_TICK, h.room)) {
      report.skipped++
      continue
    }
    let seq = seqCache.get(run.job_id)
    if (!seq) {
      seq = await loadSequence(admin, run.job_id)
      seqCache.set(run.job_id, seq)
    }
    if (!seq.sending) {
      report.skipped++
      continue
    }
    let tz = tzCache.get(run.job_id)
    if (!tz) {
      const { data: seat } = await admin.from('partner_roles_v').select('location').eq('job_id', run.job_id).maybeSingle()
      tz = timezoneFor(seat?.location as string | null)
      tzCache.set(run.job_id, tz)
    }
    const w = inWindow(seq, run.step, tz)
    if (!w.ok) {
      report.skipped++
      continue
    }
    const token = await mailboxToken(h.mailbox)
    if (!token) {
      report.notes.push(`${h.mailbox.address}: no token`)
      await admin.from('sourcing_mailboxes').update({ status: 'error', last_error: 'could not mint a token' }).eq('id', h.mailbox.id)
      report.skipped++
      continue
    }
    const out = await sendRun(admin, run, h.mailbox, seq, token)
    if (out === 'sent') {
      report.sent++
      perMailbox.set(run.mailbox_id, used + 1)
    } else if (out === 'error') report.errors++
    else report.skipped++
  }
  return report
}
