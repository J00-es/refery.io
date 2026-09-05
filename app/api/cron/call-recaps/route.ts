/**
 * Post-call recaps: Granola note in, Slack card and Gmail draft out.
 *
 * Runs every ten minutes. A Granola note only exists once the call is over and
 * written up, so a note appearing is the closest thing to a call-ended event
 * available: Granola has no webhooks.
 *
 * The scheduler is `pg_cron` inside Supabase rather than a Vercel cron, because
 * this project is on the Hobby plan where crons may only run daily. See
 * scripts/call-recaps-schedule.sql.
 *
 * Two properties matter more than anything else here:
 *
 *   It never sends email. The draft lands in Lily's mailbox and she presses
 *   send. The credential is scoped to gmail.compose, so that is enforced by
 *   Google and not merely by this code being careful.
 *
 *   It never pays twice for the same call. Every note is claimed by inserting
 *   into call_recaps against a unique index BEFORE any model call, so an
 *   overlapping run, a retry, or a manual trigger cannot re-summarise a call
 *   that is already done.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  counterparties,
  noteDetail,
  recentNotes,
  transcriptText,
  type GranolaNoteDetail,
} from '@/lib/granola'
import { createDraft, draftUrl, findThread } from '@/lib/google'
import { recapBlocks, summariseCall, RECAP_AFFORDANCES } from '@/lib/call-recap'
import { loadBrainContext, logBrainRetrieval } from '@/lib/brain-knowledge'
import { addReaction, postMessage } from '@/lib/slack-bot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * How far back each run looks.
 *
 * Wide on purpose. The unique index makes re-reading a note free, so the only
 * cost of a generous window is one Granola list call, and it means a deploy, an
 * outage, or a missed schedule catches up on its own instead of leaving a hole.
 */
const LOOKBACK_HOURS = Number(process.env.CALL_RECAP_LOOKBACK_HOURS || 24)

/**
 * Ceiling for the `?hours=` override below.
 *
 * A manual trigger sometimes needs to reach past the schedule: the first run
 * after this feature is switched on has a backlog behind it, and a run missed
 * during an outage leaves a hole wider than the default window. 30 days covers
 * both without letting one request walk the whole Granola history.
 */
const MAX_LOOKBACK_HOURS = 24 * 30

/** Calls to process per run, so one busy afternoon cannot run past maxDuration. */
const MAX_PER_RUN = 5

/**
 * Below this a transcript is fragments of unintelligible audio, and there is
 * nothing in it to recap. A real fifteen-minute call flattens to about 15,000
 * characters, so this is roughly a two-minute conversation.
 */
const MIN_TRANSCRIPT_CHARS = 2000

/** Granola's own write-up, which can stand in when the audio was poor. */
const MIN_SUMMARY_CHARS = 400

/** After three failures a note is left alone, and the digest can surface it. */
const MAX_ATTEMPTS = 3

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

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // No secret means anyone could trigger model spend and a Slack post, so it
  // stays shut rather than open.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

interface Resolved {
  entityType: string
  entityId: string | null
  name: string
  email: string | null
}

type Admin = ReturnType<typeof createAdminClient>

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

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}

async function run(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const channel = process.env.SLACK_CHANNEL_CALLS
  if (!channel) {
    return NextResponse.json({ error: 'SLACK_CHANNEL_CALLS not set' }, { status: 500 })
  }

  const admin = createAdminClient()

  // `?hours=` widens the window for a manual run. The schedule never sets it,
  // so steady-state behaviour is unchanged.
  const requested = Number(request.nextUrl.searchParams.get('hours'))
  const lookbackHours =
    Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_LOOKBACK_HOURS)
      : LOOKBACK_HOURS

  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000)

  const notes = await recentNotes(since)
  if (!notes.length) {
    return NextResponse.json({ ok: true, lookback_hours: lookbackHours, looked_at: 0, posted: 0, results: [] })
  }

  // Newest first, because a run budget means some notes wait for the next run
  // and the value of a recap decays fast. Granola returns notes oldest first,
  // so without this a backlog would spend the budget on the stalest calls: a
  // follow-up drafted to someone Lily spoke to three weeks ago, while this
  // morning's call waited another ten minutes. Irrelevant in steady state,
  // where a run sees one or two notes, and decisive on the first run after a
  // backfill.
  notes.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  // One query rather than one per note. `attempts` decides whether a note that
  // has already failed is worth another model call.
  const { data: seenRows } = await admin
    .from('call_recaps')
    .select('granola_note_id, status, attempts')
    .in('granola_note_id', notes.map(n => n.id))

  const seen = new Map((seenRows ?? []).map(r => [r.granola_note_id as string, r]))

  const results: Record<string, unknown>[] = []
  let posted = 0

  for (const note of notes) {
    if (posted >= MAX_PER_RUN) {
      results.push({ note: note.id, skipped: 'run budget reached, next run will take it' })
      continue
    }

    const already = seen.get(note.id)
    if (already?.status === 'posted') continue
    if (already && (already.attempts as number) >= MAX_ATTEMPTS) {
      results.push({ note: note.id, skipped: `given up after ${MAX_ATTEMPTS} attempts` })
      continue
    }

    try {
      const outcome = await handleNote(admin, channel, note.id, Boolean(already))
      results.push(outcome)
      if (outcome.posted) posted++
    } catch (err) {
      const message = (err as Error).message
      console.error(`[call-recaps] ${note.id} threw:`, err)
      // The claim row already exists by the time most failures happen, so this
      // records the reason where the next run can read it.
      await admin
        .from('call_recaps')
        .update({ status: 'failed', error: message.slice(0, 500) })
        .eq('granola_note_id', note.id)
      results.push({ note: note.id, error: message })
    }
  }

  return NextResponse.json({ ok: true, lookback_hours: lookbackHours, looked_at: notes.length, posted, results })
}

async function handleNote(
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
