import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'

/** Queue the panel for this person now. Super admin only; it spends money. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const appUser = await getAppUser()
  if (!appUser?.isSuperAdmin) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const admin = createAdminClient()
  const { error } = await admin.rpc('enqueue_candidate_panel', { p_candidate_id: id, p_reason: 'manual' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, message: 'Queued. The panel runs within a minute and the card lands in #refery-desk.' })
}
