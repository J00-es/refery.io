/**
 * Reading telemetry for a public hiring-manager brief.
 *
 * The page beats here three ways: once when it opens, periodically while it is
 * being read, and once on unload. Every beat is stored; only two of them are
 * worth interrupting anyone for, and the whole design of this route is deciding
 * which.
 *
 *   view      → "they opened it", once per sitting.
 *   progress  → kept as the trail, never announced.
 *   close     → "they stopped at §5", once per sitting.
 *
 * The endpoint is unauthenticated by necessity — the reader has no account —
 * so it must stay boring under abuse: it writes bounded rows, never reflects
 * input back, and answers the same way whether or not the slug exists.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  briefRef,
  describeDevice,
  findPublishedBrief,
  notifyBriefOpened,
  notifyBriefRead,
  viewerContext,
  type BriefRef,
  type ViewerContext,
} from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** A reload inside this window is the same sitting, not fresh interest. */
const SITTING_WINDOW_MS = 30 * 60 * 1000
/** Quiet for this long with no unload beacon and we close the session ourselves. */
const STALE_AFTER_MS = 10 * 60 * 1000
/** Below this, someone opened the tab and left. Not worth a notification. */
const MIN_DWELL_FOR_SUMMARY_MS = 15 * 1000

type Kind = 'view' | 'progress' | 'close'

interface Beat {
  sessionId: string
  kind: Kind
  furthestSection?: string | null
  furthestLabel?: string | null
  scrollPct?: number | null
  dwellMs?: number | null
  referrer?: string | null
  timezone?: string | null
}

// ── input ───────────────────────────────────────────────────────────────────

const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

function bounded(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.min(max, Math.max(min, Math.round(v)))
}

function parseBeat(raw: unknown): Beat | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const sessionId = typeof o.sessionId === 'string' ? o.sessionId : ''
  if (!SESSION_PATTERN.test(sessionId)) return null

  const kind = o.kind
  if (kind !== 'view' && kind !== 'progress' && kind !== 'close') return null

  return {
    sessionId,
    kind,
    furthestSection: text(o.furthestSection, 120),
    furthestLabel: text(o.furthestLabel, 160),
    scrollPct: bounded(o.scrollPct, 0, 100),
    // Capped at eight hours: a tab left open overnight is not eight hours of
    // reading, and an unbounded number here is an unbounded number in Slack.
    dwellMs: bounded(o.dwellMs, 0, 8 * 60 * 60 * 1000),
    referrer: text(o.referrer, 300),
    timezone: text(o.timezone, 60),
  }
}

// ── route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params

  const beat = parseBeat(await request.json().catch(() => null))
  // 204 rather than 400 throughout: this is a fire-and-forget beacon, and the
  // page has nothing useful to do with a failure.
  if (!beat) return new NextResponse(null, { status: 204 })

  const brief = await findPublishedBrief(slug)
  if (!brief) return new NextResponse(null, { status: 204 })

  const viewer = viewerContext(request.headers)
  const db = createAdminClient()
  const ref = briefRef(brief)

  // Asked before the insert, because after it the answer is always "yes".
  const isNewSitting = beat.kind === 'view' ? await startsNewSitting(brief.id, beat, viewer) : false

  const { data: inserted } = await db
    .from('hm_brief_events')
    .insert({
      brief_id: brief.id,
      session_id: beat.sessionId,
      kind: beat.kind,
      furthest_section: beat.furthestSection,
      furthest_label: beat.furthestLabel,
      scroll_pct: beat.scrollPct,
      dwell_ms: beat.dwellMs,
      referrer: beat.referrer,
      // The browser's own zone beats geo-IP's, which reports the exit node.
      timezone: beat.timezone ?? viewer.timezone,
      device: describeDevice(viewer.userAgent),
      ip: viewer.ip,
      country: viewer.country,
      region: viewer.region,
      city: viewer.city,
      latitude: viewer.latitude,
      longitude: viewer.longitude,
      user_agent: viewer.userAgent,
    })
    // A close row can collide with one the sweep already wrote; that is the
    // index doing its job, not an error worth reporting.
    .select('id')
    .maybeSingle()

  if (beat.kind === 'view' && isNewSitting && inserted?.id) {
    if (await claim(inserted.id)) await notifyBriefOpened(ref, viewer, beat.referrer ?? null)
  }

  if (beat.kind === 'close' && inserted?.id && (beat.dwellMs ?? 0) >= MIN_DWELL_FOR_SUMMARY_MS) {
    if (await claim(inserted.id)) {
      await notifyBriefRead(ref, viewer, {
        furthestLabel: beat.furthestLabel ?? null,
        scrollPct: beat.scrollPct ?? null,
        dwellMs: beat.dwellMs ?? null,
      })
    }
  }

  // Piggybacked on live traffic rather than run from a cron: the sessions that
  // need closing out are always older than the one being written right now.
  if (beat.kind !== 'progress') {
    await sweepStaleSessions(brief.id, ref, beat.sessionId).catch(err =>
      console.error('[hm-brief] sweep failed:', err),
    )
  }

  return new NextResponse(null, { status: 204 })
}

/**
 * Claims a row for notification.
 *
 * The update only matches while `notified_at` is still null, so of two callers
 * racing to announce the same event exactly one gets a row back and the other
 * silently stands down.
 */
async function claim(eventId: string): Promise<boolean> {
  const db = createAdminClient()
  const { data } = await db
    .from('hm_brief_events')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', eventId)
    .is('notified_at', null)
    .select('id')
  return !!data?.length
}

/**
 * Whether this open deserves an announcement.
 *
 * Two things make it not one: the session has already been seen (a re-render or
 * a retried beacon), or this IP was reading the same brief minutes ago (a
 * reload, a back button, a second tab).
 */
async function startsNewSitting(briefId: string, beat: Beat, viewer: ViewerContext): Promise<boolean> {
  const db = createAdminClient()

  const { data: seen } = await db
    .from('hm_brief_events')
    .select('id')
    .eq('brief_id', briefId)
    .eq('session_id', beat.sessionId)
    .eq('kind', 'view')
    .limit(1)
  if (seen?.length) return false

  if (!viewer.ip) return true

  const { data: recent } = await db
    .from('hm_brief_events')
    .select('id')
    .eq('brief_id', briefId)
    .eq('kind', 'view')
    .eq('ip', viewer.ip)
    .gte('created_at', new Date(Date.now() - SITTING_WINDOW_MS).toISOString())
    .limit(1)

  return !recent?.length
}

/**
 * Closes out sittings whose unload beacon never arrived.
 *
 * `pagehide` is best-effort — a killed tab, a locked phone, or a crashed
 * browser all skip it — and without this those sessions would never produce the
 * one line that matters most: where the reading stopped. The trail of `progress`
 * rows already holds the answer; this just reads it back and announces it.
 */
async function sweepStaleSessions(briefId: string, ref: BriefRef, exceptSession: string) {
  const db = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString()

  const { data: rows } = await db
    .from('hm_brief_events')
    .select(
      'session_id, kind, furthest_section, furthest_label, scroll_pct, dwell_ms, created_at, ip, country, region, city, timezone, user_agent',
    )
    .eq('brief_id', briefId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(2000)

  if (!rows?.length) return

  const sessions = new Map<string, typeof rows>()
  for (const row of rows) {
    if (row.session_id === exceptSession) continue
    const bucket = sessions.get(row.session_id)
    if (bucket) bucket.push(row)
    else sessions.set(row.session_id, [row])
  }

  for (const [sessionId, beats] of sessions) {
    if (beats.some(b => b.kind === 'close')) continue

    const last = beats[beats.length - 1]
    if (last.created_at > cutoff) continue

    const dwell = Math.max(...beats.map(b => b.dwell_ms ?? 0))
    if (dwell < MIN_DWELL_FOR_SUMMARY_MS) continue

    const scroll = Math.max(...beats.map(b => b.scroll_pct ?? 0))
    const furthest = [...beats].reverse().find(b => b.furthest_label)

    const { data: closed } = await db
      .from('hm_brief_events')
      .insert({
        brief_id: briefId,
        session_id: sessionId,
        kind: 'close',
        furthest_section: furthest?.furthest_section ?? null,
        furthest_label: furthest?.furthest_label ?? null,
        scroll_pct: scroll || null,
        dwell_ms: dwell,
        notified_at: new Date().toISOString(),
        ip: last.ip,
        country: last.country,
        region: last.region,
        city: last.city,
        timezone: last.timezone,
        user_agent: last.user_agent,
      })
      .select('id')
      .maybeSingle()

    // No row back means the unique index rejected it — a beacon landed first
    // and has already said its piece.
    if (!closed) continue

    await notifyBriefRead(
      ref,
      {
        ip: last.ip,
        country: last.country,
        region: last.region,
        city: last.city,
        latitude: null,
        longitude: null,
        timezone: last.timezone,
        userAgent: last.user_agent,
      },
      { furthestLabel: furthest?.furthest_label ?? null, scrollPct: scroll || null, dwellMs: dwell },
    )
  }
}
