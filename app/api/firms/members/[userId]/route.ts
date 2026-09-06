import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { firmsEnabled, getMembership, removeMember } from '@/lib/firms'
import { sendFirmMemberRemoved } from '@/lib/firm-notify'

/**
 * Removing someone from a firm.
 *
 * Mandatory before any external firm, because the alternative is a database
 * change by us, and "email Lily and wait" is not an access-revocation process.
 *
 * Access is resolved per request, so the moment this returns, their next page
 * load shows them none of the firm's work.
 */

export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params

  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!firmsEnabled(appUser)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const membership = await getMembership(admin, appUser.id)

  if (!membership) return NextResponse.json({ error: 'You are not in a firm' }, { status: 404 })
  if (membership.role !== 'admin') {
    return NextResponse.json({ error: 'Only a firm admin can remove people' }, { status: 403 })
  }

  // Read them before they are gone, so the notice can name them.
  const { data: person } = await admin
    .from('users_admin')
    .select('email, full_name')
    .eq('user_id', userId)
    .maybeSingle()

  const result = await removeMember(admin, {
    firmId: membership.firm.id,
    userId,
    actorId: appUser.id,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 })

  // A removal notice is security evidence, not courtesy: it is how an
  // unauthorised removal or a compromised admin account gets noticed.
  if (person?.email) {
    await sendFirmMemberRemoved(
      person.email as string,
      appUser.email,
      membership.firm,
      (person.full_name as string) || (person.email as string),
    )
  }

  return NextResponse.json({ removed: userId, reassigned: result.reassigned })
}
