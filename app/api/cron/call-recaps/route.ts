/**
 * Post-call recaps: Granola note in, Slack card and Gmail draft out.
 *
 * Runs every ten minutes. A Granola note only exists once the call is over and
 * written up, so a note appearing is the closest thing to a call-ended event
 * available from the poll. Since 2026-09-08 Granola also calls
 * app/api/webhooks/granola the moment a note is written; this poll stays on as
 * the safety net that catches anything the webhook misses.
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
import { recentNotes } from '@/lib/granola'
import { MAX_ATTEMPTS, inFlight, recapNote } from '@/lib/call-recap-runner'

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

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // No secret means anyone could trigger model spend and a Slack post, so it
  // stays shut rather than open.
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
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
    .select('granola_note_id, status, attempts, updated_at')
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
    if (inFlight(already)) {
      results.push({ note: note.id, skipped: 'another run has it' })
      continue
    }
    if (already && (already.attempts as number) >= MAX_ATTEMPTS) {
      results.push({ note: note.id, skipped: `given up after ${MAX_ATTEMPTS} attempts` })
      continue
    }

    try {
      const outcome = await recapNote(admin, channel, note.id, Boolean(already))
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

