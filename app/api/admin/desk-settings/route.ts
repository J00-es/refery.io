import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'

const KEYS = new Set(['bench_autosend_hours', 'referrer_nudge_days', 'candidate_nudge_days', 'hm_chase_hours', 'decision_reminder_days'])

export async function GET() {
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data } = await createAdminClient().from('desk_settings').select('key, value, updated_at')
  return NextResponse.json({ settings: Object.fromEntries((data ?? []).map(r => [r.key, r.value])) })
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
