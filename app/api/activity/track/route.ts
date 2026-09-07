import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { resolveRoute } from '@/lib/activity'

/**
 * Page-visit beacon for signed-in people.
 *
 * The ActivityBeacon in the dashboard layout posts the pathname on every route
 * change. This resolves who is asking from the session cookie, reduces the
 * path to its route pattern, and writes one row. Paths only: no IP, no user
 * agent, no query string, nothing typed into a form.
 *
 * Best-effort throughout. A beacon that fails must never be visible to the
 * person browsing, so every exit is a 204.
 */

export const dynamic = 'force-dynamic'

/** The same page reloaded inside this window counts once. */
const DEDUPE_MS = 30_000

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { path?: unknown } | null
    const path = typeof body?.path === 'string' ? body.path.slice(0, 500) : ''
    const resolved = path ? resolveRoute(path) : null
    if (!resolved) return new NextResponse(null, { status: 204 })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return new NextResponse(null, { status: 204 })

    const admin = createAdminClient()

    const { data: last } = await admin
      .from('user_activity')
      .select('path, at')
      .eq('user_id', user.id)
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (last && last.path === path && Date.now() - new Date(last.at).getTime() < DEDUPE_MS) {
      return new NextResponse(null, { status: 204 })
    }

    await admin.from('user_activity').insert({
      user_id: user.id,
      path: path.split('?')[0],
      route: resolved.route,
      entity_id: resolved.entityId,
    })
  } catch (err) {
    console.error('[activity/track] failed:', err)
  }
  return new NextResponse(null, { status: 204 })
}
