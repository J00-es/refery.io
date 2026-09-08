/**
 * The communications ledger: every automated email is a row here before it is
 * anything else.
 *
 * Four rules, and they are the whole design:
 *
 *   Queued, then sent.   A decision writes a row with `send_after`. A cron
 *                        flushes due rows once a minute. Nothing sends inline,
 *                        so a Slack reaction can be undone for three minutes
 *                        and a crash between decide and send costs a delayed
 *                        email, never a duplicate one.
 *
 *   One budget.          One optional email per person per 72 hours, counted
 *                        across every template. Essential mail (a receipt, a
 *                        decision, a submission confirmation) is exempt.
 *
 *   Stops at send time.  A row carries a `stop` check that is re-evaluated when
 *                        the cron reaches it, from live data. A reply, a
 *                        completed step, a paused account, or a failing access
 *                        check cancels the row with a reason.
 *
 *   Retry, never twice.  The row id is the provider idempotency key. A failed
 *                        send keeps its row and is retried, and the provider
 *                        refuses a duplicate.
 *
 * Sends through Resend as lily@refery.io, reply-to lily@refery.io. No model is
 * called here or anywhere it reaches.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { postThreadReply } from '@/lib/slack-bot'
import type { RenderedEmail } from '@/lib/voice/templates'

export const OPTIONAL_BUDGET_MS = 72 * 60 * 60 * 1000
/** A decision email waits this long so a thread reply can still cancel it. */
export const DECISION_DELAY_MS = 3 * 60 * 1000
export const MAX_ATTEMPTS = 5

export type StopCheck =
  | { kind: 'none' }
  /** Cancel if the application left this status. */
  | { kind: 'application_status'; applicationId: string; status: string }
  /** Cancel if the person has an active account (they finished setup). */
  | { kind: 'no_account_yet'; email: string }
  /** Cancel if the person's account is not active or their access check fails. */
  | { kind: 'account_active'; userId: string }
  /** Cancel if the assignment left `proposed`. */
  | { kind: 'assignment_proposed'; assignmentId: string }

export interface QueueInput {
  to: string
  toName?: string | null
  userId?: string | null
  applicationId?: string | null
  email: RenderedEmail
  /** Milliseconds from now. Defaults to immediate for essential mail. */
  delayMs?: number
  stop?: StopCheck
  /** Refuses a second row with the same key. */
  dedupeKey?: string
  slack?: { channel: string; ts: string } | null
  meta?: Record<string, unknown>
}

export interface QueueResult {
  ok: boolean
  id?: string
  reason?: 'duplicate' | 'budget' | 'error'
  error?: string
  sendAfter?: string
}

/**
 * Optional mail spends the budget at queue time as well as at send time: a
 * partner who was written to yesterday does not get a second row scheduled
 * for tomorrow morning only to have it held.
 */
async function budgetAllows(admin: SupabaseClient, toEmail: string): Promise<boolean> {
  const since = new Date(Date.now() - OPTIONAL_BUDGET_MS).toISOString()
  const { data } = await admin
    .from('communications')
    .select('id')
    .eq('to_email', toEmail)
    .eq('essential', false)
    .in('status', ['sent', 'queued', 'sending'])
    .gt('created_at', since)
    .limit(1)
  return !(data && data.length)
}

export async function queueEmail(admin: SupabaseClient, input: QueueInput): Promise<QueueResult> {
  const to = input.to.trim().toLowerCase()
  if (!to) return { ok: false, reason: 'error', error: 'no recipient' }

  if (!input.email.essential && !(await budgetAllows(admin, to))) {
    return { ok: false, reason: 'budget' }
  }

  const sendAfter = new Date(Date.now() + (input.delayMs ?? 0)).toISOString()
  const { data, error } = await admin
    .from('communications')
    .insert({
      to_email: to,
      to_name: input.toName ?? null,
      user_id: input.userId ?? null,
      application_id: input.applicationId ?? null,
      template_id: input.email.templateId,
      template_version: input.email.version,
      job: input.email.job,
      essential: input.email.essential,
      subject: input.email.subject,
      body: input.email.text,
      send_after: sendAfter,
      dedupe_key: input.dedupeKey ?? null,
      state_snapshot: input.stop ?? { kind: 'none' },
      slack_channel_id: input.slack?.channel ?? null,
      slack_message_ts: input.slack?.ts ?? null,
      meta: input.meta ?? {},
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { ok: false, reason: 'duplicate' }
    return { ok: false, reason: 'error', error: error.message }
  }
  return { ok: true, id: data.id as string, sendAfter }
}

/** Cancels every queued row for one application or person. Returns how many. */
export async function cancelQueued(
  admin: SupabaseClient,
  where: { applicationId?: string; toEmail?: string; templateId?: string },
  reason: string,
): Promise<number> {
  let q = admin
    .from('communications')
    .update({ status: 'cancelled', stop_reason: reason })
    .eq('status', 'queued')
  if (where.applicationId) q = q.eq('application_id', where.applicationId)
  if (where.toEmail) q = q.eq('to_email', where.toEmail.toLowerCase())
  if (where.templateId) q = q.eq('template_id', where.templateId)
  const { data } = await q.select('id')
  return data?.length ?? 0
}

/** The stop check, evaluated from live rows the moment before sending. */
async function shouldStop(admin: SupabaseClient, stop: StopCheck): Promise<string | null> {
  switch (stop.kind) {
    case 'none':
      return null
    case 'application_status': {
      const { data } = await admin.from('scout_applications').select('status').eq('id', stop.applicationId).maybeSingle()
      return data && data.status !== stop.status ? `application is now ${data.status}` : null
    }
    case 'no_account_yet': {
      const { data } = await admin.from('users_admin').select('status').eq('email', stop.email).maybeSingle()
      return data?.status === 'active' ? 'account is active' : null
    }
    case 'account_active': {
      const { data } = await admin.from('users_admin').select('status').eq('user_id', stop.userId).maybeSingle()
      return data?.status === 'active' ? null : 'account is not active'
    }
    case 'assignment_proposed': {
      const { data } = await admin.from('search_assignments').select('status').eq('id', stop.assignmentId).maybeSingle()
      return data && data.status !== 'proposed' ? `assignment is now ${data.status}` : null
    }
  }
}

export interface FlushResult {
  sent: number
  failed: number
  cancelled: number
  held: number
}

/**
 * Sends everything due. Called once a minute by the cron.
 *
 * Claims each row by moving it to `sending` with a conditional update, so two
 * overlapping runs cannot both send it. The provider idempotency key is the
 * row id, which is the second lock.
 */
export async function flushQueue(admin: SupabaseClient, limit = 25): Promise<FlushResult> {
  const out: FlushResult = { sent: 0, failed: 0, cancelled: 0, held: 0 }
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return out
  const resend = new Resend(apiKey)

  const { data: due } = await admin
    .from('communications')
    .select('*')
    .eq('status', 'queued')
    .lte('send_after', new Date().toISOString())
    .lt('attempts', MAX_ATTEMPTS)
    .order('send_after', { ascending: true })
    .limit(limit)

  for (const row of due ?? []) {
    const { data: claimed } = await admin
      .from('communications')
      .update({ status: 'sending', attempts: (row.attempts as number) + 1 })
      .eq('id', row.id)
      .eq('status', 'queued')
      .select('id')
    if (!claimed?.length) continue

    const stop = (row.state_snapshot ?? { kind: 'none' }) as StopCheck
    const stopReason = await shouldStop(admin, stop)
    if (stopReason) {
      await admin.from('communications').update({ status: 'cancelled', stop_reason: stopReason }).eq('id', row.id)
      await say(row, `:no_entry_sign: Email ${row.template_id} to ${row.to_email} cancelled: ${stopReason}.`)
      out.cancelled++
      continue
    }

    // The budget is re-checked at send time for optional mail: something
    // essential may have gone out since this row was queued.
    if (!row.essential) {
      const since = new Date(Date.now() - OPTIONAL_BUDGET_MS).toISOString()
      const { data: recent } = await admin
        .from('communications')
        .select('id')
        .eq('to_email', row.to_email)
        .eq('status', 'sent')
        .gt('sent_at', since)
        .neq('id', row.id)
        .limit(1)
      if (recent?.length) {
        const later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        await admin.from('communications').update({ status: 'queued', send_after: later, stop_reason: 'held by 72h budget' }).eq('id', row.id)
        out.held++
        continue
      }
    }

    try {
      const res = await resend.emails.send(
        {
          from: row.from_address as string,
          to: row.to_email as string,
          replyTo: row.reply_to as string,
          subject: row.subject as string,
          text: row.body as string,
        },
        { idempotencyKey: `comm-${row.id}` },
      )
      if (res.error) throw new Error(res.error.message || JSON.stringify(res.error))
      await admin
        .from('communications')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: res.data?.id ?? null, error: null })
        .eq('id', row.id)
      await say(row, `:email: Sent "${row.subject}" to ${row.to_email}.`)
      out.sent++
    } catch (err) {
      const message = err instanceof Error ? err.message : 'send failed'
      const exhausted = (row.attempts as number) + 1 >= MAX_ATTEMPTS
      await admin
        .from('communications')
        .update({
          status: exhausted ? 'failed' : 'queued',
          error: message.slice(0, 500),
          send_after: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        })
        .eq('id', row.id)
      if (exhausted) await say(row, `:warning: Email ${row.template_id} to ${row.to_email} failed after ${MAX_ATTEMPTS} tries: ${message}. The decision stands; send by hand.`)
      out.failed++
    }
  }
  return out
}

/** A line in the Slack thread the row belongs to, when it has one. */
async function say(row: Record<string, unknown>, text: string) {
  const channel = row.slack_channel_id as string | null
  const ts = row.slack_message_ts as string | null
  if (channel && ts) {
    try {
      await postThreadReply(channel, ts, text)
    } catch {
      /* a thread line is a courtesy; the ledger is the record */
    }
  }
}

/** For desks and digests: the most recent rows for a person. */
export async function recentCommunications(admin: SupabaseClient, toEmail: string, limit = 5) {
  const { data } = await admin
    .from('communications')
    .select('id, template_id, subject, status, send_after, sent_at, error, stop_reason, created_at')
    .eq('to_email', toEmail.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit)
  return data ?? []
}
