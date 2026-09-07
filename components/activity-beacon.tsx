'use client'

/**
 * Tells the server which signed-in page is open, once per route change.
 *
 * Mounted in the dashboard layout, which does not re-render on client-side
 * navigation, so the pathname hook is what catches every page rather than
 * only the first. `keepalive` lets the request survive a navigation that is
 * already under way. Production only, so local browsing never lands in the
 * live activity log.
 */

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function ActivityBeacon() {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname || process.env.NODE_ENV !== 'production') return
    void fetch('/api/activity/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {
      /* Telemetry must never surface to the person browsing. */
    })
  }, [pathname])

  return null
}
