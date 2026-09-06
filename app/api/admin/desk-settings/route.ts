import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'

const KEYS = new Set(['bench_autosend_hours', 'referrer_nudge_days', 'candidate_nudge_days', 'hm_chase_hours', 'decision_reminder_days'])

export async function GET() {
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await createAdminClient().from('desk_settings').select('key, value, updated_at')
  const rows = (data ?? []).filter(r => r.key !== 'google_refresh_token')
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value])) as Record<string, unknown>
  // Whether the desk can send at all: a token in the database, or one in the environment.
  const hasDbToken = (data ?? []).some(r => r.key === 'google_refresh_token' && typeof r.value === 'string' && r.value.length > 0)
  settings.google_status = {
    configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    connected: hasDbToken,
    env_token: Boolean(process.env.GOOGLE_REFRESH_TOKEN),
  }
  return NextResponse.json({ settings })
}

export async function PATCH(request: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const admin = createAdminClient()
  for (const [key, value] of Object.entries(body)) {
    if (!KEYS.has(key)) continue
    await admin.from('desk_settings').upsert({ key, value: value as never, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  }
  return NextResponse.json({ ok: true })
}
