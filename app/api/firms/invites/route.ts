import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { createInvite, firmsEnabled, getMembership, INVITE_DAYS, type FirmRole } from '@/lib/firms'
import { sendFirmInvite } from '@/lib/firm-notify'

/**
 * Inviting a colleague into a firm.
 *
 * Only a firm admin can do it, and only into their own firm. The token is
 * returned by createInvite exactly once and goes straight into the email; only
 * its hash is stored, so a leaked database row cannot be used to join.
 *
 * A firm that is still pending cannot invite anyone. Letting it would mean
 * people accepting personal terms to join something that may never be approved.
 */

export const dynamic = 'force-dynamic'

const ROLES: FirmRole[] = ['admin', 'recruiter', 'coordinator']

export async function POST(req: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!firmsEnabled(appUser)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()
  const membership = await getMembership(admin, appUser.id)

  if (!membership) return NextResponse.json({ error: 'You are not in a firm' }, { status: 404 })
  if (membership.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only a firm admin can invite people' },
      { status: 403 },
    )
  }
  if (membership.firm.status !== 'active') {
    return NextResponse.json(
      { error: 'Your firm is still being reviewed. You can invite people once it is active.' },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = ROLES.includes(body?.role) ? (body.role as FirmRole) : 'recruiter'

  if (!email) return NextResponse.json({ error: 'An email address is required' }, { status: 400 })

  // One firm per person, so an invitation to someone already placed elsewhere
  // would create a link that can never be redeemed. Say so now.
  const { data: existingUser } = await admin
    .from('users_admin')
    .select('user_id')
    .eq('email', email)
    .maybeSingle()

  if (existingUser?.user_id) {
    const theirs = await getMembership(admin, existingUser.user_id as string)
    if (theirs) {
      return NextResponse.json(
        {
          error:
            theirs.firm.id === membership.firm.id
              ? 'They are already in your firm'
              : 'They already belong to another firm on Refery',
        },
        { status: 409 },
      )
    }
  }

  const invite = await createInvite(admin, {
    firmId: membership.firm.id,
    email,
    role,
    invitedBy: appUser.id,
  })
  if (!invite.ok) return NextResponse.json({ error: invite.error }, { status: 500 })

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://refery.xyz'
  const joinUrl = `${origin.replace(/\/$/, '')}/join/${membership.firm.slug}?token=${invite.token}`

  const sent = await sendFirmInvite(
    email,
    membership.firm,
    appUser.fullName ?? appUser.email,
    joinUrl,
    INVITE_DAYS,
  )

  // The invitation exists either way. If the email failed, the admin needs to
  // know rather than wondering why nobody arrived.
  return NextResponse.json({ invited: email, role, emailed: sent.sent, error: sent.error })
}
