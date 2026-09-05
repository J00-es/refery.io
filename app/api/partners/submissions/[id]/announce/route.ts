import { NextResponse } from 'next/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { announceSubmission } from '@/lib/desk-notifications'

/**
 * Post (or re-post) a submission's card to #refery-desk. Admin only.
 *
 * Exists for the two cases where the automatic card is not enough: it did not
 * land (the bot was not in the channel yet), or the card has been improved and
 * Lily wants to see the current one for a submission that already exists.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!access.canUseDesk) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!access.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const result = await announceSubmission(id)
  if (!result.sent) return NextResponse.json({ error: result.error ?? 'Could not post the card' }, { status: 502 })
  return NextResponse.json({ ok: true })
}
