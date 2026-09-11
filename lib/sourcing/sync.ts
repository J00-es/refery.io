/**
 * Reading replies, per mailbox, from Gmail's history.
 *
 * Every message added since the last history id is looked at once. If it
 * belongs to a thread one of our runs opened, then:
 *
 *   a bounce           the run stops, the address is marked bounced, and no
 *                      other address is tried on its own
 *   an auto-reply      the run pauses until the return date, then continues
 *   a person's reply   the run stops for good, the reply is classified, and
 *                      a "no" or "do not contact" is honoured with silence
 *   Lily's own message the run stops: a human took the thread over
 *
 * A mailbox whose sync fails is marked, and send.ts refuses to send from a
 * mailbox whose last sync failed or is stale. Reply processing never needs
 * the model to have budget: classification failure leaves the run stopped
 * with kind "other" for Lily to read.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { addressOf, getMessageMetaAs, historyAs, profileAs, threadMessagesAs, type GmailMessageMeta, type GmailThreadMessage } from '@/lib/google'
import { structured } from '@/lib/desk/model'
import { postToDesk } from '@/lib/desk-notifications'
import { esc } from '@/lib/slack-bot'
import { loadMailboxes, mailboxToken } from '@/lib/sourcing/mailboxes'
import { contactStatusOf, markBounced } from '@/lib/sourcing/people'
import type { MailboxRow, PersonRow, ReplyKind, RunRow } from '@/lib/sourcing/types'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

const BOUNCE_FROM = /mailer-daemon|postmaster|mail delivery (subsystem|system)|noreply@.*bounce/i
const BOUNCE_SUBJECT = /delivery status notification|undeliverable|delivery (has )?failed|returned mail|mail delivery failed/i
const OOO_SUBJECT = /out of (the )?office|automatic reply|auto-?reply|autoreply|abwesenheit|away from|on leave|on holiday|vacation|absence/i

const ReplySchema = z.object({
  kind: z.enum(['interested', 'question', 'not_now', 'not_interested', 'wrong_person', 'do_not_contact', 'other']),
  summary: z.string().describe('One line, under 140 characters, on what they said.'),
  revisit_on: z.string().nullable().describe('ISO date if they named a time to come back, else null.'),
})

export interface SyncReport {
  mailbox: string
  read: number
  replies: number
  bounces: number
  ooo: number
  handled: number
  error?: string
}

function isAuto(m: GmailThreadMessage | GmailMessageMeta): boolean {
  const h = (m as GmailThreadMessage).autoHeaders
  if (h) {
    if (h.autoSubmitted && !/^no$/i.test(h.autoSubmitted)) return true
    if (/bulk|auto_reply|junk/i.test(h.precedence)) return true
    if (h.autoResponseSuppress) return true
  }
  return OOO_SUBJECT.test(m.subject)
}

/** "back on 16 September", "return on 09/16", "until Sep 20": the first date that parses, else a week. */
export function returnDate(text: string, now = new Date()): Date {
  const m = text.match(/(?:back|return(?:ing)?|until|from|on)\s+(?:on\s+|the\s+)?([A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}(?:,?\s+\d{4})?|\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)/i)
  if (m) {
    const raw = m[1].replace(/(\d)(st|nd|rd|th)/, '$1')
    const withYear = /\d{4}/.test(raw) ? raw : `${raw} ${now.getUTCFullYear()}`
    // Parsed as UTC so the calendar date survives whatever zone the server runs in.
    const d = new Date(`${withYear} UTC`)
    if (!Number.isNaN(d.getTime())) {
      if (d.getTime() < now.getTime()) d.setUTCFullYear(d.getUTCFullYear() + 1)
      if (d.getTime() - now.getTime() < 60 * 86_400_000) return d
    }
  }
  return new Date(now.getTime() + 7 * 86_400_000)
}

async function classify(text: string, personName: string): Promise<z.infer<typeof ReplySchema>> {
  const system = `You classify one email reply to a recruiter's note about a role. Kinds:
  interested      they want to hear more, take the call, or asked for a time
  question        they asked something before deciding (equity, remote, the company)
  not_now         timing is off; they may name when to come back
  not_interested  a clear no
  wrong_person    they say we have the wrong person or role
  do_not_contact  they ask not to be written to again, or to be removed
  other           anything else
Summary is one line. revisit_on is a date only if they gave one.`
  try {
    const r = await structured('classify', { system, user: `Reply from ${personName}:\n\n${text.slice(0, 3000)}`, schema: ReplySchema, maxOutputTokens: 200 }, { task: 'sourcing_reply' })
    return r.output
  } catch (err) {
    console.warn('[sourcing:sync] classify failed:', err instanceof Error ? err.message : err)
    return { kind: 'other', summary: 'reply received; could not be read automatically', revisit_on: null }
  }
}

async function alreadySeen(admin: SupabaseClient, gmailId: string, kind: string): Promise<boolean> {
  const { data } = await admin.from('sourcing_events').select('id').eq('gmail_message_id', gmailId).eq('kind', kind).maybeSingle()
  return Boolean(data)
}

async function runForThread(admin: SupabaseClient, mailboxId: string, threadId: string): Promise<(RunRow & { person: PersonRow | null }) | null> {
  const { data } = await admin.from('sourcing_runs').select('*, sourcing_people(*)').eq('mailbox_id', mailboxId).eq('gmail_thread_id', threadId).maybeSingle()
  if (!data) return null
  const row = data as unknown as RunRow & { sourcing_people: PersonRow | null }
  return { ...row, person: row.sourcing_people }
}

async function seatLabel(admin: SupabaseClient, jobId: string): Promise<string> {
  const { data } = await admin.from('partner_roles_v').select('company_name, title').eq('job_id', jobId).maybeSingle()
  return data ? `${data.company_name} · ${data.title}` : 'a search'
}

/** One message in one of our threads. Returns what it was. */
async function handleMessage(admin: SupabaseClient, mailbox: MailboxRow, token: string, meta: GmailMessageMeta): Promise<'reply' | 'bounce' | 'ooo' | 'ours' | 'ignored'> {
  const run = await runForThread(admin, mailbox.id, meta.threadId)
  if (!run) return 'ignored'
  const from = addressOf(meta.from)
  const self = mailbox.address.toLowerCase()

  // Our own message that this desk did not send: Lily answered by hand, so
  // the thread is hers now and the sequence stops.
  if (from === self) {
    if (run.gmail_message_ids.includes(meta.id)) return 'ours'
    if (['queued', 'active', 'ooo', 'paused'].includes(run.state)) {
      await admin.from('sourcing_runs').update({ state: 'stopped', stopped_reason: 'Lily wrote in the thread herself' }).eq('id', run.id)
      await admin.from('sourcing_events').insert({ run_id: run.id, job_id: run.job_id, person_id: run.person_id, mailbox_id: mailbox.id, kind: 'stopped', gmail_message_id: meta.id, summary: 'handled by hand in Gmail' })
    }
    return 'ours'
  }

  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(meta.subject)) {
    if (await alreadySeen(admin, meta.id, 'bounce')) return 'ignored'
    await admin.from('sourcing_runs').update({ state: 'bounced', stopped_reason: 'address bounced' }).eq('id', run.id)
    await admin.from('sourcing_events').insert({ run_id: run.id, job_id: run.job_id, person_id: run.person_id, mailbox_id: mailbox.id, kind: 'bounce', gmail_message_id: meta.id, summary: meta.subject.slice(0, 200) })
    await markBounced(admin, run.person_id, run.address)
    if (run.pool_id) {
      // Another address may still be live, but it is never tried on its own.
      const { data: p } = await admin.from('sourcing_people').select('emails').eq('id', run.person_id).maybeSingle()
      await admin.from('sourcing_pool').update({ contact_status: contactStatusOf((p?.emails as PersonRow['emails']) ?? []), relationship_status: 'clear', relationship_note: `${run.address} bounced; nothing else is tried without you` }).eq('id', run.pool_id)
    }
    return 'bounce'
  }

  // Read the thread for the body and the auto-reply headers.
  const { messages } = await threadMessagesAs(token, meta.threadId)
  const msg = messages.find(m => m.id === meta.id)
  if (!msg) return 'ignored'

  if (isAuto(msg)) {
    if (await alreadySeen(admin, meta.id, 'ooo')) return 'ignored'
    const back = returnDate(`${msg.subject}\n${msg.text}`)
    const resume = new Date(back.getTime() + 86_400_000)
    if (['queued', 'active', 'ooo'].includes(run.state)) await admin.from('sourcing_runs').update({ state: 'ooo', next_at: resume.toISOString() }).eq('id', run.id)
    await admin.from('sourcing_events').insert({ run_id: run.id, job_id: run.job_id, person_id: run.person_id, mailbox_id: mailbox.id, kind: 'ooo', gmail_message_id: meta.id, summary: `auto-reply; resumes ${resume.toISOString().slice(0, 10)}` })
    return 'ooo'
  }

  if (await alreadySeen(admin, meta.id, 'reply')) return 'ignored'
  const name = run.person?.full_name ?? 'the person'
  const c = await classify(msg.text || msg.snippet, name)
  await admin
    .from('sourcing_runs')
    .update({ state: 'replied', stopped_reason: 'they replied', reply_kind: c.kind, reply_summary: c.summary })
    .eq('id', run.id)
  await admin.from('sourcing_events').insert({
    run_id: run.id,
    job_id: run.job_id,
    person_id: run.person_id,
    mailbox_id: mailbox.id,
    kind: 'reply',
    gmail_message_id: meta.id,
    classification: c.kind,
    summary: c.summary.slice(0, 300),
    payload: { from, text: (msg.text || msg.snippet).slice(0, 2000), revisit_on: c.revisit_on },
  })

  if (c.kind === 'do_not_contact') {
    await admin.from('sourcing_suppressions').upsert({ email: run.address.toLowerCase(), person_id: run.person_id, reason: 'asked not to be contacted', source: 'reply', created_by: 'sync' }, { onConflict: 'email', ignoreDuplicates: true })
    await admin.from('sourcing_people').update({ do_not_contact: true, do_not_contact_reason: 'asked not to be contacted' }).eq('id', run.person_id)
    if (run.pool_id) await admin.from('sourcing_pool').update({ relationship_status: 'do_not_contact', relationship_note: 'asked not to be contacted', decision: 'not_fit', decision_reason: 'asked not to be contacted', decided_by: 'sync', decided_at: new Date().toISOString() }).eq('id', run.pool_id)
  } else if (c.kind === 'wrong_person' && run.pool_id) {
    await admin.from('sourcing_pool').update({ decision: 'not_fit', decision_reason: `wrong person: ${c.summary}`, decided_by: 'sync', decided_at: new Date().toISOString() }).eq('id', run.pool_id)
  } else if (c.kind === 'not_now' && c.revisit_on) {
    await admin.from('sourcing_events').insert({ run_id: run.id, job_id: run.job_id, person_id: run.person_id, mailbox_id: mailbox.id, kind: 'revisit', summary: `come back on ${c.revisit_on}`, payload: { revisit_on: c.revisit_on } })
  }

  // The ones that need a person go to the desk channel; a no is silent.
  if (c.kind === 'interested' || c.kind === 'question' || c.kind === 'other') {
    const seat = await seatLabel(admin, run.job_id)
    const label = c.kind === 'interested' ? ':tada: Interested' : c.kind === 'question' ? ':question: A question' : ':email: A reply'
    await postToDesk(`${label} from *${esc(name)}* on ${esc(seat)}: ${esc(c.summary)}\n<${APP_URL}/sourcing/replies|replies> · thread in ${esc(mailbox.address)}`)
  }
  return 'reply'
}

export async function syncMailbox(admin: SupabaseClient, mailbox: MailboxRow): Promise<SyncReport> {
  const report: SyncReport = { mailbox: mailbox.address, read: 0, replies: 0, bounces: 0, ooo: 0, handled: 0 }
  const fail = async (error: string) => {
    await admin.from('sourcing_mailboxes').update({ last_sync_at: new Date().toISOString(), last_sync_ok: false, last_error: error.slice(0, 300) }).eq('id', mailbox.id)
    report.error = error
    return report
  }
  const token = await mailboxToken(mailbox)
  if (!token) return fail('no token')

  if (!mailbox.last_history_id) {
    const p = await profileAs(token)
    if (p.error || !p.historyId) return fail(p.error ?? 'no history id')
    await admin.from('sourcing_mailboxes').update({ last_history_id: p.historyId, last_sync_at: new Date().toISOString(), last_sync_ok: true, last_error: null }).eq('id', mailbox.id)
    return report
  }

  const h = await historyAs(token, mailbox.last_history_id)
  if (h.error) return fail(h.error)
  let ids = h.messageIds
  let nextHistory = h.historyId

  // History older than Gmail keeps: read our open threads directly, then resume from now.
  if (h.expired) {
    const { data: open } = await admin.from('sourcing_runs').select('gmail_thread_id').eq('mailbox_id', mailbox.id).in('state', ['queued', 'active', 'ooo', 'paused']).not('gmail_thread_id', 'is', null).limit(200)
    ids = []
    for (const r of open ?? []) {
      const { messages } = await threadMessagesAs(token, r.gmail_thread_id as string)
      for (const m of messages) ids.push(m.id)
    }
    const p = await profileAs(token)
    nextHistory = p.historyId ?? null
  }

  for (const id of ids) {
    const meta = await getMessageMetaAs(token, id)
    if (!meta) continue
    report.read++
    try {
      const what = await handleMessage(admin, mailbox, token, meta)
      if (what === 'reply') report.replies++
      else if (what === 'bounce') report.bounces++
      else if (what === 'ooo') report.ooo++
      if (what !== 'ignored') report.handled++
    } catch (err) {
      console.error('[sourcing:sync] message failed:', err instanceof Error ? err.message : err)
    }
  }
  await admin
    .from('sourcing_mailboxes')
    .update({ last_history_id: nextHistory ?? mailbox.last_history_id, last_sync_at: new Date().toISOString(), last_sync_ok: true, last_error: null, ...(mailbox.status === 'error' ? { status: 'active' } : {}) })
    .eq('id', mailbox.id)
  return report
}

export async function syncAll(admin: SupabaseClient): Promise<SyncReport[]> {
  const out: SyncReport[] = []
  for (const m of await loadMailboxes(admin)) {
    if (m.status === 'paused') continue
    out.push(await syncMailbox(admin, m))
  }
  return out
}
