import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { getRequestContext } from '@/lib/request-context'
import { acceptInvite, findOpenInvite, firmsEnabled, getMembership } from '@/lib/firms'
import { sendFirmMemberJoined, sendFirmWelcome } from '@/lib/firm-notify'

/**
 * Accepting an invitation, which is the moment a person becomes bound by the
 * Team access terms.
 *
 * This is the legally significant request in the whole firm flow, so it records
 * what a signature records: the version, the time, the IP and the user agent.
 * The firm cannot accept these obligations for them, which is the entire reason
 * this endpoint exists rather than a membership row being written by the admin.
 *
 * The invited address and the signed-in account must match. Without that check,
 * a forwarded invitation would let anybody join a firm and read its clients.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!firmsEnabled(appUser)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const accepted = body?.accepted === true

  if (!accepted) {
    return NextResponse.json({ error: 'The access terms have to be accepted' }, { status: 400 })
  }

  const admin = createAdminClient()

  const invite = await findOpenInvite(admin, token)
  // Expired, revoked, already used and never existed all answer the same way:
  // a dead link should not tell a stranger which of those it was.
  if (!invite) {
    return NextResponse.json(
      { error: 'That invitation is no longer valid. Ask for a new one.' },
      { status: 404 },
    )
  }

  if (invite.email !== appUser.email) {
    return NextResponse.json(
      { error: `That invitation was sent to ${invite.email}. Sign in as that address.` },
      { status: 403 },
    )
  }

  const already = await getMembership(admin, appUser.id)
  if (already) {
    return NextResponse.json(
      {
        error:
          already.firm.id === invite.org_id
            ? 'You are already in this firm'
            : 'You already belong to another firm on Refery',
      },
      { status: 409 },
    )
  }

  const ctx = getRequestContext(req)
  const result = await acceptInvite(admin, {
    invite,
    userId: appUser.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })

  const origin = (
    process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://refery.xyz'
  ).replace(/\/$/, '')

  const name = appUser.fullName ?? appUser.email
  await sendFirmWelcome(appUser.email, invite.firm, name, origin)

  // The admin should never learn about a new seat by noticing it.
  if (invite.firm.signer_user_id) {
    const { data: signer } = await admin
      .from('users_admin')
      .select('email')
      .eq('user_id', invite.firm.signer_user_id)
      .maybeSingle()
    if (signer?.email) {
      await sendFirmMemberJoined(
        signer.email as string,
        invite.firm,
        name,
        appUser.email,
        invite.org_role,
      )
    }
  }

  return NextResponse.json({ joined: invite.firm.slug, role: invite.org_role })
}
