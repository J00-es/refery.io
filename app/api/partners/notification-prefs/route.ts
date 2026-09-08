import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'

export const dynamic = 'force-dynamic'

const DEFAULTS = { needs_you: true, suggestions: true, movement: true, sunday: true, setup_reminders: true, whatsapp: '' }

/** What this partner wants to hear about, and where. Confirmations and decisions are always on. */
export async function GET() {
  const user = await getAppUser()
  if (!user?.isActive) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await createAdminClient().from('notification_prefs').select('*').eq('user_id', user.id).maybeSingle()
  return NextResponse.json({ ...DEFAULTS, ...(data ?? {}), whatsapp: data?.whatsapp ?? '' })
}

export async function PUT(req: Request) {
  const user = await getAppUser()
  if (!user?.isActive) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const bool = (k: keyof typeof DEFAULTS) => (typeof body[k] === 'boolean' ? body[k] : DEFAULTS[k])
  const { error } = await createAdminClient()
    .from('notification_prefs')
    .upsert(
      {
        user_id: user.id,
        needs_you: bool('needs_you'),
        suggestions: bool('suggestions'),
        movement: bool('movement'),
        sunday: bool('sunday'),
        setup_reminders: bool('setup_reminders'),
        whatsapp: typeof body.whatsapp === 'string' ? body.whatsapp.trim().slice(0, 40) || null : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
