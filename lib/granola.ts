/**
 * Granola public API client.
 *
 * Used by the call-recap poller, which needs Granola directly rather than
 * through `ingested_signals`: the Python ingester runs once a night from
 * GitHub Actions, and a recap that arrives the next morning is not a recap.
 *
 * A note only exists here once Granola has finished writing it up, which makes
 * "a new note appeared" the closest thing to a call-ended event the API offers.
 * There are no webhooks, so this is polled.
 */

const BASE = 'https://public-api.granola.ai/v1'

/** One request per note for the detail fetch, so a run has to stay bounded. */
const MAX_NOTES_PER_RUN = 20

export interface GranolaAttendee {
  name?: string | null
  email?: string | null
}

export interface GranolaNote {
  id: string
  title: string | null
  created_at: string
  updated_at?: string | null
}

/**
 * One utterance. `attribution` is 'me' for Lily's microphone and 'them' for
 * everyone else, which is all the speaker resolution the API offers: on a call
 * with two guests both are 'them'.
 */
export interface TranscriptSegment {
  text?: string | null
  start_time?: string | null
  end_time?: string | null
  speaker?: { source?: string | null; attribution?: 'me' | 'them' | string | null } | null
}

export interface GranolaNoteDetail extends GranolaNote {
  attendees?: GranolaAttendee[] | null
  calendar_event?: {
    event_title?: string | null
    scheduled_start_time?: string | null
    scheduled_end_time?: string | null
    invitees?: GranolaAttendee[] | null
    organiser?: GranolaAttendee | null
  } | null
  summary_text?: string | null
  summary_markdown?: string | null
  /** An ARRAY of segments, not a string. Verified against the live API. */
  transcript?: TranscriptSegment[] | null
  web_url?: string | null
}

function apiKey(): string {
  return process.env.GRANOLA_API_KEY || ''
}

async function call<T>(path: string, params: Record<string, string> = {}): Promise<T | null> {
  const key = apiKey()
  if (!key) {
    console.warn(`[granola] ${path} skipped: GRANOLA_API_KEY is not set`)
    return null
  }

  const url = new URL(`${BASE}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) {
      console.error(`[granola] ${path} failed: ${res.status} ${await res.text().catch(() => '')}`)
      return null
    }
    return (await res.json()) as T
  } catch (err) {
    console.error(`[granola] ${path} threw:`, err)
    return null
  }
}

/**
 * Notes created since `since`, newest first.
 *
 * The list is paginated newest-first, so it stops as soon as it reaches a note
 * older than the watermark. An incremental run costs one page.
 */
export async function recentNotes(since: Date): Promise<GranolaNote[]> {
  const out: GranolaNote[] = []
  let cursor: string | undefined

  for (let page = 0; page < 5; page++) {
    const params: Record<string, string> = { limit: '100' }
    if (cursor) params.cursor = cursor

    const data = await call<{ notes?: GranolaNote[]; hasMore?: boolean; cursor?: string }>(
      '/notes',
      params,
    )
    if (!data) break

    const batch = data.notes ?? []
    out.push(...batch)

    // Every note on this page predates the watermark, so no later page can
    // contain anything new.
    if (batch.length && batch.every(n => new Date(n.created_at) <= since)) break
    if (!data.hasMore || !data.cursor) break
    cursor = data.cursor
  }

  return out
    .filter(n => new Date(n.created_at) > since)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, MAX_NOTES_PER_RUN)
}

/**
 * One note with its transcript.
 *
 * `transcript` comes back null unless `include=transcript` is passed, and it is
 * an array of segments rather than a block of text. The inline copy is
 * complete: on a checked 15-minute call it carried all 119 segments, spanning
 * the full scheduled slot, identical to what the paginated endpoint returns.
 *
 * The separate endpoint is the documented fallback for a transcript too large
 * to inline, which arrives as a 413 and so as a null here.
 */
export async function noteDetail(id: string): Promise<GranolaNoteDetail | null> {
  const detail = await call<GranolaNoteDetail>(`/notes/${id}`, { include: 'transcript' })
  if (!detail) return null
  if (detail.transcript?.length) return detail

  const segments: TranscriptSegment[] = []
  let cursor: string | undefined

  for (let page = 0; page < 40; page++) {
    const params: Record<string, string> = cursor ? { cursor } : {}
    const data = await call<{
      transcript?: TranscriptSegment[]
      hasMore?: boolean
      cursor?: string
    }>(`/notes/${id}/transcript`, params)
    if (!data) break
    segments.push(...(data.transcript ?? []))
    if (!data.hasMore || !data.cursor) break
    cursor = data.cursor
  }

  return segments.length ? { ...detail, transcript: segments } : detail
}

/**
 * Segments flattened into something a model can read.
 *
 * Consecutive turns by the same speaker are merged, because Granola splits on
 * pauses rather than on turns: the checked call was 119 segments for what a
 * reader would call about 40 exchanges, and the per-segment labels are pure
 * token cost with no added meaning.
 */
export function transcriptText(
  detail: GranolaNoteDetail,
  themLabel = 'Them',
  meLabel = 'Lily',
): string {
  const segments = detail.transcript ?? []
  const lines: { who: string; text: string }[] = []

  for (const segment of segments) {
    const text = (segment.text ?? '').trim()
    if (!text) continue
    const who = segment.speaker?.attribution === 'me' ? meLabel : themLabel
    const last = lines[lines.length - 1]
    if (last && last.who === who) last.text += ` ${text}`
    else lines.push({ who, text })
  }

  return lines.map(l => `${l.who}: ${l.text}`).join('\n')
}

/**
 * Everyone on the call who is not us.
 *
 * Attendees and calendar invitees are merged because neither is reliably
 * complete: a note can carry attendees with no calendar event, and a booking
 * made through cal.com can list the invitee only on the event.
 */
const OWN_DOMAINS = new Set(['refery.io', 'getrefery.com', '10kventures.co'])

export function counterparties(detail: GranolaNoteDetail): GranolaAttendee[] {
  const all = [
    ...(detail.attendees ?? []),
    ...(detail.calendar_event?.invitees ?? []),
    ...(detail.calendar_event?.organiser ? [detail.calendar_event.organiser] : []),
  ]

  const seen = new Set<string>()
  const out: GranolaAttendee[] = []

  for (const a of all) {
    const email = (a?.email ?? '').trim().toLowerCase()
    if (!email || seen.has(email)) continue
    if (OWN_DOMAINS.has(email.split('@')[1] ?? '')) continue
    seen.add(email)
    out.push({ name: a.name ?? null, email })
  }

  return out
}
