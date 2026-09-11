import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { pushToUser } from '@/lib/push'

/**
 * A signed-in person's browser registers (POST) or removes (DELETE) its push
 * endpoint. One row per endpoint; the same browser re-posting only refreshes
 * last_seen_at. The endpoint is the credential, so it is never returned.
 */
export const dynamic = 'force-dynamic'

interface Body {
  subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  userAgent?: unknown
  endpoint?: unknown
}

async function whoAmI() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const appUser = await getAppUser()
  if (!appUser?.isActive) return null
  return { authUserId: user.id, appUserId: appUser.id }
}

export async function POST(request: NextRequest) {
  const me = await whoAmI()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as Body | null
  const sub = body?.subscription
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : ''
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : ''
  if (!/^https:\/\/.{10,2000}$/.test(endpoint) || !p256dh || !auth) {
    return NextResponse.json({ error: 'Not a push subscription' }, { status: 400 })
  }
  const userAgent = typeof body?.userAgent === 'string' ? body.userAgent.slice(0, 300) : null
  const now = new Date().toISOString()
  const admin = createAdminClient()
  const { data: existing } = await admin.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle()
  const { error } = await admin.from('push_subscriptions').upsert(
    {
      user_id: me.appUserId,
      auth_user_id: me.authUserId,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
      last_seen_at: now,
      last_error: null,
    },
    { onConflict: 'endpoint' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // A brand-new device hears one note straight away, so the person knows it
  // worked without waiting for the next search or decision.
  if (!existing) {
    await pushToUser(admin, me.appUserId, {
      title: 'Notifications are on',
      body: 'You will hear when a search opens for you or one of your candidates moves. Nothing else.',
      url: '/dashboard',
      tag: 'welcome',
    })
  }
  return NextResponse.json({ ok: true, welcomed: !existing })
}

export async function DELETE(request: NextRequest) {
  const me = await whoAmI()
  if (!me) return NextResponse.json({ error: 'Sign in first' }, { status: 401 })
  const body = (await request.json().catch(() => null)) as Body | null
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return NextResponse.json({ error: 'No endpoint' }, { status: 400 })
  await createAdminClient().from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', me.appUserId)
  return NextResponse.json({ ok: true })
}
