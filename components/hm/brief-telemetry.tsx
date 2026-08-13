'use client'

/**
 * Watches how the brief is read, so we know when to follow up and about what.
 *
 * Three beats go to `/api/b/[slug]/events`:
 *
 *   view      on mount, once.
 *   progress  every 20s while the tab is in front, and whenever it is hidden.
 *   close     on `pagehide` — a real navigation away.
 *
 * `close` is deliberately not sent when the tab is merely backgrounded. Someone
 * who switches to Slack for two minutes and comes back has not stopped reading,
 * and reporting that as "they stopped at §3" would be worse than saying nothing.
 * When `pagehide` never fires at all — a killed tab, a phone that slept — the
 * server closes the session out from the progress trail instead.
 *
 * Dwell counts only foreground time. A tab left open over lunch is not an hour
 * of attention.
 */

import { useEffect, useRef } from 'react'
import { useBriefComments } from './comments-provider'

const PROGRESS_INTERVAL_MS = 20_000

export interface TelemetrySection {
  id: string
  label: string
}

export function BriefTelemetry({
  slug,
  sections,
}: {
  slug: string
  sections: TelemetrySection[]
}) {
  const { sessionId } = useBriefComments()

  // One mutable bag rather than state: none of this should cause a re-render,
  // and the unload handler needs to read the very latest values.
  const reading = useRef({
    furthestIndex: -1,
    scrollPct: 0,
    dwellMs: 0,
    lastTickAt: Date.now(),
    closed: false,
  })

  useEffect(() => {
    if (!sessionId) return

    const url = `/api/b/${slug}/events`
    const state = reading.current
    state.lastTickAt = Date.now()

    const snapshot = (kind: 'view' | 'progress' | 'close') => {
      const furthest = state.furthestIndex >= 0 ? sections[state.furthestIndex] : undefined
      return {
        sessionId,
        kind,
        furthestSection: furthest?.id ?? null,
        furthestLabel: furthest?.label ?? null,
        scrollPct: state.scrollPct,
        dwellMs: state.dwellMs,
        referrer: document.referrer || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      }
    }

    const send = (kind: 'view' | 'progress', keepalive = false) => {
      void fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot(kind)),
        keepalive,
      }).catch(() => {
        /* Telemetry must never surface to the reader. */
      })
    }

    /** `sendBeacon` survives the page going away; `fetch` does not, reliably. */
    const sendClose = () => {
      if (state.closed) return
      state.closed = true
      accrue()
      const payload = JSON.stringify(snapshot('close'))
      const blob = new Blob([payload], { type: 'application/json' })
      if (!navigator.sendBeacon?.(url, blob)) {
        void fetch(url, { method: 'POST', body: blob, keepalive: true }).catch(() => {})
      }
    }

    /** Bank the foreground time since the last check. */
    const accrue = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') state.dwellMs += now - state.lastTickAt
      state.lastTickAt = now
    }

    // ── position ────────────────────────────────────────────────────────────
    let queued = false
    const measure = () => {
      queued = false
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - window.innerHeight

      state.scrollPct =
        scrollable <= 0
          ? 100
          : Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)))

      // The furthest heading to have crossed the upper third of the viewport —
      // the point someone has actually read down to, rather than merely scrolled past.
      const line = window.scrollY + window.innerHeight / 3
      for (let i = 0; i < sections.length; i++) {
        const el = document.getElementById(sections[i].id)
        if (el && el.offsetTop <= line && i > state.furthestIndex) state.furthestIndex = i
      }
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(measure)
    }

    const onVisibility = () => {
      accrue()
      if (document.visibilityState === 'hidden') send('progress', true)
    }

    measure()
    send('view')

    const ticker = window.setInterval(() => {
      accrue()
      if (document.visibilityState === 'visible') send('progress')
    }, PROGRESS_INTERVAL_MS)

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', sendClose)

    return () => {
      window.clearInterval(ticker)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', sendClose)
      // A client-side navigation out of the brief ends the sitting too.
      sendClose()
    }
  }, [slug, sessionId, sections])

  return null
}
