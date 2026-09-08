/**
 * The per-note recap processor, shared by two triggers.
 *
 *   app/api/cron/call-recaps   polls Granola every ten minutes (pg_cron)
 *   app/api/webhooks/granola   is called by Granola the moment a note is written
 *
 * Both hand a note id to `recapNote`, which claims it, summarises it, posts the
 * Slack card and creates the Gmail draft. The claim is an insert into
 * call_recaps against a unique index BEFORE any model call, so the two
 * triggers, a retry, an overlapping run or a manual trigger can never
 * re-summarise a call that is already done. That property is what makes it
 * safe to have both triggers on at once: the webhook is the fast path, the poll
 * is the safety net, and whichever reaches a note first wins.
 *
 * It never sends email. The draft lands in Lily's mailbox and she presses send.
 */

import { createAdminClient } from '@/lib/supabase/server'
import {
  counterparties,
  noteDetail,
  transcriptText,
  type GranolaNoteDetail,
} from '@/lib/granola'
import { createDraft, draftUrl, findThread } from '@/lib/google'
import { recapBlocks, summariseCall, RECAP_AFFORDANCES } from '@/lib/call-recap'
import { loadBrainContext, logBrainRetrieval } from '@/lib/brain-knowledge'
import { addReaction, postMessage } from '@/lib/slack-bot'

/**
 * Below this a transcript is fragments of unintelligible audio, and there is
 * nothing in it to recap. A real fifteen-minute call flattens to about 15,000
 * characters, so this is roughly a two-minute conversation.
 */
const MIN_TRANSCRIPT_CHARS = 2000

/** Granola's own write-up, which can stand in when the audio was poor. */
const MIN_SUMMARY_CHARS = 400

/** After three failures a note is left alone, and the digest can surface it. */
export const MAX_ATTEMPTS = 3

/**
 * A pending claim younger than this belongs to a run that is still working.
 *
 * With two triggers, the poll routinely sees the webhook's claim while the
 * webhook is mid-summary. Without this guard it would read that as a crashed
 * attempt, bump the counter and run the same call again. Six minutes is the
 * function's 300 s ceiling with room for the clock: a claim older than that
 * and still pending really is dead, and the retry path is right to take it.
 */
export const IN_FLIGHT_MINUTES = 6

export function inFlight(
  row: { status?: string | null; updated_at?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!row || row.status !== 'pending' || !row.updated_at) return false
  const age = now - new Date(row.updated_at).getTime()
  return Number.isFinite(age) && age < IN_FLIGHT_MINUTES * 60 * 1000
}

/**
 * Resolution order is load-bearing, and is the same order the Python ingester
 * uses. A person can sit in several tables at once, so the most specific
 * relationship has to win.
 */
const RESOLUTION_ORDER: { entityType: string; table: string; nameColumn: string }[] = [
  { entityType: 'candidate', table: 'candidates', nameColumn: 'name' },
  { entityType: 'prospect_recruiter', table: 'prospect_recruiters', nameColumn: 'name' },
  { entityType: 'scout_application', table: 'scout_applications', nameColumn: 'full_name' },
  { entityType: 'company_contact', table: 'company_contacts', nameColumn: 'name' },
  { entityType: 'outreach_recipient', table: 'outreach_recipients', nameColumn: 'name' },
]


interface Resolved {
  entityType: string
  entityId: string | null
  name: string
  email: string | null
}

export type Admin = ReturnType<typeof createAdminClient>

async function resolvePerson(
  admin: Admin,
  people: { name?: string | null; email?: string | null }[],
): Promise<Resolved | null> {
  const emails = people.map(p => (p.email ?? '').toLowerCase()).filter(Boolean)
  if (!emails.length) return null

  for (const { entityType, table, nameColumn } of RESOLUTION_ORDER) {
    const { data, error } = await admin
      .from(table)
      .select(`id, email, ${nameColumn}`)
      .in('email', emails)
      .limit(1)

    if (error) {
      // A missing table or a renamed column must not take the whole run down;
      // the later tables in the order may still resolve this person.
      console.error(`[call-recaps] lookup in ${table} failed:`, error.message)
      continue
    }

    // The select list is built from a table-specific name column, which the
    // client's typed parser cannot resolve for a table it only knows as a
    // string. The shape is checked by hand below instead.
    const row = data?.[0] as unknown as Record<string, unknown> | undefined
    if (!row) continue

    const email = String(row.email ?? '')
    const fromGranola = people.find(p => (p.email ?? '').toLowerCase() === email.toLowerCase())
    return {
      entityType,
      entityId: String(row.id),
      name: String(row[nameColumn] ?? fromGranola?.name ?? email),
      email,
    }
  }

  // Nobody matched. Granola still knows who was on the call, and they still
  // need a recap, so this is a card with a caveat rather than a dropped call.
  const first = people[0]
  return {
    entityType: 'unresolved',
    entityId: null,
    name: first.name?.trim() || (first.email ?? 'Unknown'),
    email: first.email ?? null,
  }
}

/**
 * Mirror the note into ingested_signals.
 *
 * The nightly Python ingester writes the same rows with the same conflict
 * target, so doing it here just means the transcript is available to the
 * extraction pipeline hours earlier. Failure is logged and ignored: the recap
 * is the job, this is a courtesy to everything downstream.
 */
async function mirrorSignal(
  admin: Admin,
  detail: GranolaNoteDetail,
  resolved: Resolved,
  occurredAt: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('ingested_signals')
    .upsert(
      {
        source: 'granola',
        source_ref: detail.id,
        occurred_at: occurredAt,
        title: detail.title ?? detail.calendar_event?.event_title ?? '(untitled call)',
        body: detail.summary_text ?? null,
        participants: counterparties(detail),
        raw: {
          transcript: detail.transcript ?? null,
          transcript_text: transcriptText(detail, resolved.name.split(/\s+/)[0] || 'Them'),
          web_url: detail.web_url ?? null,
          calendar_event: detail.calendar_event ?? null,
        },
        entity_type: resolved.entityType,
        entity_id: resolved.entityId,
        resolved_by: resolved.entityId ? 'participant_email' : null,
        resolution_note: resolved.entityId
          ? `matched ${resolved.email}`
          : 'no participant matched a CRM entity',
      },
      { onConflict: 'source,source_ref' },
    )
    .select('id')
    .maybeSingle()

  if (error) {
    console.error(`[call-recaps] could not mirror signal for ${detail.id}:`, error.message)
    return null
  }
  return data?.id ?? null
}

/**
 * Refresh the ingested_signals mirror for a note that was already recapped.
 *
 * Granola's `note.edited` event fires when Lily tidies a write-up after the
 * call. The recap has gone out by then and is not redone, but the corrected
 * summary is what the extraction pipeline should read, so the mirror is
 * brought up to date. One fetch and one upsert; failure is logged and ignored.
 */
export async function refreshMirror(admin: Admin, noteId: string): Promise<Record<string, unknown>> {
  const detail = await noteDetail(noteId)
  if (!detail) return { note: noteId, skipped: 'detail fetch failed' }

  const people = counterparties(detail)
  if (!people.length) return { note: noteId, skipped: 'no external participant' }

  const resolved = await resolvePerson(admin, people)
  if (!resolved) return { note: noteId, skipped: 'could not identify anyone on the call' }

  const occurredAt =
    detail.calendar_event?.scheduled_start_time ?? detail.created_at ?? new Date().toISOString()
  const signalId = await mirrorSignal(admin, detail, resolved, occurredAt)
  return { note: noteId, refreshed: Boolean(signalId) }
}

/**
 * Recap one note end to end. `isRetry` means a claim row already exists from
 * an earlier failed attempt, so the attempt counter is bumped instead of a new
 * row being inserted.
 */
export async function recapNote(
  admin: Admin,
  channel: string,
  noteId: string,
  isRetry: boolean,
): Promise<Record<string, unknown>> {
  const detail = await noteDetail(noteId)
  if (!detail) return { note: noteId, skipped: 'detail fetch failed' }

  const people = counterparties(detail)
  if (!people.length) {
    // An internal meeting or a solo recording. Nobody to recap to.
    return { note: noteId, skipped: 'no external participant' }
  }

  const occurredAt =
    detail.calendar_event?.scheduled_start_time ?? detail.created_at ?? new Date().toISOString()
  const title = detail.title ?? detail.calendar_event?.event_title ?? '(untitled call)'

  const resolved = await resolvePerson(admin, people)
  if (!resolved) return { note: noteId, skipped: 'could not identify anyone on the call' }

  // Naming the speaker is worth the lookup order above: a transcript labelled
  // "Devangi:" reads far better to the model than "Them:", and the recap is
  // written in the second person about that specific individual.
  const transcript = transcriptText(detail, resolved.name.split(/\s+/)[0] || 'Them')
  const summaryText = detail.summary_text ?? ''

  // Either source alone can carry a call. Granola sometimes writes a full
  // summary from audio it transcribed only patchily, and a long transcript can
  // arrive before the summary is generated.
  if (transcript.length < MIN_TRANSCRIPT_CHARS && summaryText.length < MIN_SUMMARY_CHARS) {
    return {
      note: noteId,
      skipped: `too little to recap (transcript ${transcript.length}, summary ${summaryText.length})`,
    }
  }

  // Claim before spending anything. On a first pass the insert is what reserves
  // the note; a conflict means another run got there first and this one stops.
  if (!isRetry) {
    const { error: claimError } = await admin.from('call_recaps').insert({
      granola_note_id: noteId,
      entity_type: resolved.entityType,
      entity_id: resolved.entityId,
      person_name: resolved.name,
      person_email: resolved.email,
      occurred_at: occurredAt,
      title,
      status: 'pending',
      attempts: 1,
    })
    if (claimError) {
      return { note: noteId, skipped: `already claimed (${claimError.code})` }
    }
  } else {
    const { data: bumped } = await admin.rpc('increment_call_recap_attempt', {
      note_id: noteId,
      max_attempts: MAX_ATTEMPTS,
    })
    if (bumped === false) return { note: noteId, skipped: 'attempt budget exhausted' }
  }

  const signalId = await mirrorSignal(admin, detail, resolved, occurredAt)

  // Refery's own terms, read fresh from the Brain on every draft rather than
  // carried in the prompt file. The skill file describes how Lily writes; what
  // the company actually charges and owes belongs in a document she can edit
  // without a deploy. Empty context is survivable: the prompt then forbids
  // commercial claims outright instead of letting the model recall them.
  const brain = await loadBrainContext(admin, 'call-recap')

  const { recap, model } = await summariseCall({
    personName: resolved.name,
    personEmail: resolved.email,
    entityType: resolved.entityType,
    title,
    occurredAt,
    transcript,
    summaryText: summaryText || null,
    brainContext: brain.block,
  })

  // Which version of the terms wrote which email. Worth having the first time
  // someone asks why a draft quoted the number it did.
  await logBrainRetrieval(admin, brain, {
    agent: 'call-recap',
    granola_note_id: noteId,
    person: resolved.name,
    model,
  })

  // The draft is best-effort. A Gmail failure, most likely a refresh token
  // without gmail.compose, must still leave the card standing: the summary is
  // the part that cannot be reconstructed by hand in thirty seconds.
  // The skill only defines a candidate, scout and recruiter variant. An
  // investor or vendor call would be written to the nearest of those three,
  // which is worse than writing nothing: the card still goes up, and Lily can
  // ask for a draft by hand if she wants one.
  const draftable = recap.callType !== 'other'

  let draft: { draftId?: string; threadId?: string; subject: string; error?: string } = {
    subject: recap.emailSubject,
    error: !resolved.email
      ? 'no email address for this person'
      : !draftable
        ? 'not a candidate, scout or recruiter call, so no recap template fits'
        : undefined,
  }
  if (resolved.email && draftable) {
    const thread = await findThread(resolved.email)
    draft = await createDraft({
      to: resolved.email,
      toName: resolved.name,
      subject: recap.emailSubject,
      body: recap.emailBody,
      thread,
    })
  }

  const card = recapBlocks({
    recap,
    personName: resolved.name,
    personEmail: resolved.email,
    occurredAt,
    scheduledStart: detail.calendar_event?.scheduled_start_time ?? null,
    scheduledEnd: detail.calendar_event?.scheduled_end_time ?? null,
    granolaUrl: detail.web_url ?? null,
    appUrl:
      resolved.entityType === 'candidate' && resolved.entityId
        ? `https://refery.xyz/candidates/${resolved.entityId}`
        : null,
    draftUrl: draft.draftId ? draftUrl(draft.draftId) : null,
    draftError: draft.error ?? null,
    unresolvedNote:
      resolved.entityType === 'unresolved'
        ? `Not in Refery yet. The draft is addressed to ${resolved.email ?? 'nobody'}, but nothing was linked to a record.`
        : null,
    // The three verdict reactions write to a candidate record, so offering them
    // on a scout or recruiter call would only earn a reply saying there is no
    // verdict to set.
    verdictsApply: resolved.entityType === 'candidate' && Boolean(resolved.entityId),
  })

  const sent = await postMessage(channel, card.text, card.blocks)
  if (!sent.ok || !sent.ts) {
    throw new Error(`slack post failed: ${sent.error ?? 'unknown'}`)
  }

  // Written back before the reactions go on, for the same reason intake does
  // it: the handler that reads a reaction resolves the row by (channel, ts),
  // and a message it cannot resolve is worse than one with no emoji yet.
  await admin
    .from('call_recaps')
    .update({
      signal_id: signalId,
      slack_channel_id: sent.channel ?? channel,
      slack_message_ts: sent.ts,
      summary: recap,
      model,
      gmail_draft_id: draft.draftId ?? null,
      gmail_thread_id: draft.threadId ?? null,
      email_subject: draft.subject,
      email_body: recap.emailBody,
      email_error: draft.error ?? null,
      status: 'posted',
      error: null,
    })
    .eq('granola_note_id', noteId)

  for (const name of RECAP_AFFORDANCES) {
    await addReaction(sent.channel ?? channel, sent.ts, name)
  }

  return {
    note: noteId,
    posted: true,
    person: resolved.name,
    type: recap.callType,
    resolved_as: resolved.entityType,
    draft: draft.draftId ? 'created' : `none (${draft.error})`,
    model,
  }
}
