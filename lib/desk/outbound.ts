/**
 * Every email the desk sends goes through here, so the candidate's timeline,
 * the follow-up engine and the Slack thread all see the same row.
 *
 * Sends as lily@refery.io through the Gmail API. A failure never throws: it
 * is written to candidate_emails.error and surfaced in the Slack thread,
 * because a decision that silently failed to send is the one loophole this
 * whole design exists to close.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMessage, threadMessages } from '@/lib/google'
import { plainLinks, textToHtml } from '@/lib/desk/html'

export interface OutboundInput {
  candidateId: string | null
  kind: string
  to: string
  toName?: string | null
  cc?: string[]
  subject: string
  body: string
  /** HTML version of the body, for emails that carry links and buttons. */
  html?: string | null
  /** Reply into this Gmail thread when set. */
  threadId?: string | null
  sentBy: string
  meta?: Record<string, unknown>
}

export interface OutboundResult {
  ok: boolean
  emailId: string | null
  threadId: string | null
  messageId: string | null
  error?: string
}

/** The newest message in a thread, for the reply headers. */
async function threadHead(threadId: string): Promise<{ messageId: string | null; subject: string | null } | null> {
  const t = await threadMessages(threadId)
  const last = t.messages[t.messages.length - 1]
  return last ? { messageId: last.messageId, subject: last.subject } : null
}

export async function sendDeskEmail(admin: SupabaseClient, input: OutboundInput): Promise<OutboundResult> {
  const { data: row } = await admin
    .from('candidate_emails')
    .insert({
      candidate_id: input.candidateId,
      kind: input.kind,
      to_email: input.to.toLowerCase(),
      cc_emails: (input.cc ?? []).map(x => x.toLowerCase()),
      subject: input.subject,
      body: plainLinks(input.body),
      gmail_thread_id: input.threadId ?? null,
      sent_by: input.sentBy,
      meta: input.meta ?? {},
    })
    .select('id')
    .single()
  const emailId = (row?.id as string) ?? null

  let thread: { threadId: string; messageId: string | null; subject?: string | null } | null = null
  if (input.threadId) {
    const head = await threadHead(input.threadId)
    thread = { threadId: input.threadId, messageId: head?.messageId ?? null, subject: head?.subject ?? null }
  }

  const sent = await sendMessage({
    to: input.to,
    toName: input.toName ?? null,
    cc: input.cc,
    subject: input.subject,
    body: plainLinks(input.body),
    html: input.html ?? textToHtml(input.body),
    thread,
  })

  if (sent.error) {
    if (emailId) await admin.from('candidate_emails').update({ error: sent.error }).eq('id', emailId)
    return { ok: false, emailId, threadId: null, messageId: null, error: sent.error }
  }

  if (emailId) {
    await admin
      .from('candidate_emails')
      .update({ sent_at: new Date().toISOString(), gmail_thread_id: sent.threadId ?? input.threadId ?? null, gmail_message_id: sent.messageId ?? null, error: null })
      .eq('id', emailId)
  }
  if (input.candidateId) {
    await admin.from('candidate_activity_log').insert({
      candidate_id: input.candidateId,
      activity_type: 'email_sent',
      description: `${input.kind.replace(/_/g, ' ')} to ${input.to}: "${input.subject}"`,
      source: 'desk',
      metadata: { email_id: emailId, kind: input.kind, thread_id: sent.threadId ?? null, by: input.sentBy },
    })
  }
  return { ok: true, emailId, threadId: sent.threadId ?? input.threadId ?? null, messageId: sent.messageId ?? null }
}

export async function logActivity(
  admin: SupabaseClient,
  candidateId: string,
  activityType: string,
  description: string,
  extra: { from?: string | null; to?: string | null; metadata?: Record<string, unknown>; source?: string; performedBy?: string | null } = {},
): Promise<void> {
  await admin.from('candidate_activity_log').insert({
    candidate_id: candidateId,
    activity_type: activityType,
    description,
    source: extra.source ?? 'desk',
    from_state: extra.from ?? null,
    to_state: extra.to ?? null,
    metadata: extra.metadata ?? {},
    performed_by: extra.performedBy ?? null,
  })
}

/** Move Journey A from the desk, with the log entry every move carries. */
export async function moveJourney(
  admin: SupabaseClient,
  candidateId: string,
  to: string,
  description: string,
  opts: { by?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<{ from: string | null }> {
  const { data: before } = await admin.from('candidates').select('journey_stage').eq('id', candidateId).maybeSingle()
  const from = (before?.journey_stage as string | null) ?? null
  if (from === to) return { from }
  const now = new Date().toISOString()
  await admin
    .from('candidates')
    .update({ journey_stage: to, journey_stage_at: now, journey_stage_source: 'desk', updated_at: now })
    .eq('id', candidateId)
  await logActivity(admin, candidateId, 'journey_stage_changed', description, {
    from,
    to,
    metadata: { ...(opts.metadata ?? {}), by: opts.by ?? null },
  })
  return { from }
}

/** Schedule a follow-up; the engine in followups.ts runs it when due. */
export async function scheduleFollowup(
  admin: SupabaseClient,
  input: { candidateId: string; kind: string; inDays?: number; inHours?: number; toEmail?: string | null; threadId?: string | null; jobId?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  const ms = (input.inDays ?? 0) * 86_400_000 + (input.inHours ?? 0) * 3_600_000
  await admin.from('candidate_followups').insert({
    candidate_id: input.candidateId,
    kind: input.kind,
    due_at: new Date(Date.now() + ms).toISOString(),
    to_email: input.toEmail ?? null,
    gmail_thread_id: input.threadId ?? null,
    job_id: input.jobId ?? null,
    meta: input.meta ?? {},
  })
}

/** Cancel every pending follow-up of these kinds. Called when the thing they were waiting for happened. */
export async function cancelFollowups(admin: SupabaseClient, candidateId: string, kinds?: string[], note = 'superseded'): Promise<void> {
  let q = admin
    .from('candidate_followups')
    .update({ status: 'cancelled', note, done_at: new Date().toISOString() })
    .eq('candidate_id', candidateId)
    .eq('status', 'pending')
  if (kinds?.length) q = q.in('kind', kinds)
  await q
}

export async function deskSetting<T>(admin: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('desk_settings').select('value').eq('key', key).maybeSingle()
  return data && data.value !== null && data.value !== undefined ? (data.value as T) : fallback
}
