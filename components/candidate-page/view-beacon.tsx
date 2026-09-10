'use client'

import { useEffect } from 'react'

/** One "view" per browser session per page. Nothing else is measured. */
export function ViewBeacon({ slug, via }: { slug: string; via: string | null }) {
  useEffect(() => {
    let session: string | null = null
    try {
      const key = 'refery_jd_session'
      session = sessionStorage.getItem(key)
      if (!session) {
        session = Math.random().toString(36).slice(2, 12)
        sessionStorage.setItem(key, session)
      }
      const seen = sessionStorage.getItem(`refery_jd_seen_${slug}`)
      if (seen) return
      sessionStorage.setItem(`refery_jd_seen_${slug}`, '1')
    } catch {
      // Private mode: still count the view, just without a session id.
    }
    fetch(`/api/j/${slug}/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'view', via, session }), keepalive: true }).catch(() => undefined)
  }, [slug, via])
  return null
}
