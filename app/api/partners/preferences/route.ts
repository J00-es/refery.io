import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { suggestFirstSearch } from '@/lib/onboarding/matcher'

export const dynamic = 'force-dynamic'

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [])

/** Saves and confirms the partner's preferences, then suggests a search if none is open. */
export async function PUT(req: Request) {
  const user = await getAppUser()
  if (!user?.isActive) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await admin.from('partner_preferences').upsert(
    {
      user_id: user.id,
      own_location: typeof body.own_location === 'string' ? body.own_location.slice(0, 120) : null,
      network_cities: strings(body.network_cities),
      functions: strings(body.functions),
      stages: strings(body.stages),
      relationship_types: strings(body.relationship_types),
      would_relocate: Boolean(body.would_relocate),
      source: 'edit',
      confirmed_at: now,
      updated_at: now,
      updated_by: user.email,
    },
    { onConflict: 'user_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Preferences changed, so a no-match from before no longer stands.
  await admin.from('users_admin').update({ no_match_at: null }).eq('user_id', user.id)
  const result = await suggestFirstSearch(admin, { userId: user.id, email: user.email, fullName: user.fullName }, { by: 'preferences', sendEmail: false })
  return NextResponse.json({ ok: true, suggestion: result })
}
