import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { verifyStandardWebhookSignature } from '@/lib/resend-webhook'
import { MAX_ATTEMPTS, inFlight, recapNote, refreshMirror } from '@/lib/call-recap-runner'

/**
 * Granola webhook: the fast path for post-call recaps.
 *
 * Granola calls here the moment a note is generated or edited, which lands the
 * Slack card and the Gmail draft within a minute of the call ending instead of
 * on the next ten-minute poll. The poll in app/api/cron/call-recaps stays on
 * as the safety net, and the call_recaps unique index means the two can never
 * recap the same call twice.
 *
 * Granola allows fifteen seconds for a 2xx before it retries, and a recap takes
 * longer than that (a model call, a Gmail draft, a Slack post). So the handler
 * verifies, acknowledges, and does the work in `after()`, the same shape as
 * the Resend inbound route.
 *
 * Registered in Granola under Settings, Connectors, Webhooks, subscribed to
 * `note.generated` and `note.edited`. Signing is Standard Webhooks, the same
 * HMAC scheme Resend uses, so the verifier is shared.
 */
export const maxDuration = 300

interface GranolaEvent {
  event_id?: string
  event_type?: string
  note_id?: string
  occurred_at?: string
}

function signatureHeaders(req: NextRequest) {
  return {
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.GRANOLA_WEBHOOK_SECRET
  if (!secret) {
    // Shut rather than open: an unsigned endpoint would let anyone trigger
    // model spend and a Slack post by guessing a note id.
    console.error('[granola-webhook] GRANOLA_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  const rawBody = await request.text()
  const reason = verifyStandardWebhookSignature(signatureHeaders(request), rawBody, secret)
  if (reason) {
    console.warn(`[granola-webhook] rejected: ${reason}`)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let event: GranolaEvent
  try {
    event = JSON.parse(rawBody) as GranolaEvent
  } catch {
    return NextResponse.json({ error: 'malformed body' }, { status: 400 })
  }

  const noteId = event.note_id
  const type = event.event_type
  if (!noteId || !type) {
    return NextResponse.json({ error: 'note_id and event_type are required' }, { status: 400 })
  }

  // Shared-with-you notes are other people's calls. Nothing to recap.
  if (type !== 'note.generated' && type !== 'note.edited') {
    return NextResponse.json({ ok: true, ignored: type })
  }

  const channel = process.env.SLACK_CHANNEL_CALLS
  if (!channel) {
    console.error('[granola-webhook] SLACK_CHANNEL_CALLS is not set')
    return NextResponse.json({ error: 'not configured' }, { status: 503 })
  }

  after(async () => {
    const admin = createAdminClient()
    try {
      const outcome = await handleEvent(admin, channel, type, noteId)
      console.log(`[granola-webhook] ${type} ${noteId}:`, JSON.stringify(outcome))
    } catch (err) {
      const message = (err as Error).message
      console.error(`[granola-webhook] ${type} ${noteId} threw:`, err)
      await admin
        .from('call_recaps')
        .update({ status: 'failed', error: message.slice(0, 500) })
        .eq('granola_note_id', noteId)
    }
  })

  return NextResponse.json({ ok: true, event: event.event_id ?? null, note: noteId, type })
}

async function handleEvent(
  admin: ReturnType<typeof createAdminClient>,
  channel: string,
  type: string,
  noteId: string,
): Promise<Record<string, unknown>> {
  const { data: existing } = await admin
    .from('call_recaps')
    .select('status, attempts, updated_at')
    .eq('granola_note_id', noteId)
    .maybeSingle()

  // Already recapped. An edit after the fact refreshes the mirrored signal so
  // the extraction pipeline reads the corrected write-up; the card and the
  // draft are left alone, Lily has probably already acted on them.
  if (existing?.status === 'posted') {
    return type === 'note.edited'
      ? await refreshMirror(admin, noteId)
      : { note: noteId, skipped: 'already posted' }
  }

  // `note.edited` often follows `note.generated` within seconds, and the poll
  // may have the note as well. Whoever claimed it first finishes it.
  if (inFlight(existing)) return { note: noteId, skipped: 'another run has it' }

  if (existing && (existing.attempts as number) >= MAX_ATTEMPTS) {
    return { note: noteId, skipped: `given up after ${MAX_ATTEMPTS} attempts` }
  }

  // A note that was too thin to recap at `note.generated` (a summary still
  // being written, say) gets another look on `note.edited`. No claim row
  // exists for a skipped note, so this is a first attempt, not a retry.
  return recapNote(admin, channel, noteId, Boolean(existing))
}
