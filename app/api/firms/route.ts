import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { getRequestContext } from '@/lib/request-context'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { createFirm, firmsEnabled, getMembership } from '@/lib/firms'
import { announceFirmSignup, sendFirmReceipt } from '@/lib/firm-notify'

/**
 * Creating a firm.
 *
 * The gates, in the order they matter:
 *
 *   beta      firms are not open. A real firm must not reach this until the
 *             data-sharing terms are done, which is counsel's last condition.
 *   signed in the signer has an account already; this turns it into a firm.
 *   one firm  a person belongs to one firm. Joining a second is a transfer,
 *             and a transfer is a deliberate act, not a second sign-up.
 *
 * The firm is created `pending`. Nobody gets anything until it is approved,
 * exactly like a partner sign-up, and approval is your reaction in Slack.
 */

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!firmsEnabled(appUser)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const admin = createAdminClient()

  const existing = await getMembership(admin, appUser.id)
  if (existing) {
    return NextResponse.json(
      { error: `You are already part of ${existing.firm.name}` },
      { status: 409 },
    )
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const legalName = typeof body?.legal_name === 'string' ? body.legal_name.trim() : ''
  const accepted = body?.accepted === true

  if (!name || !legalName) {
    return NextResponse.json(
      { error: 'We need the firm name and the registered legal entity' },
      { status: 400 },
    )
  }
  // The acceptance is the whole point of this request. Without it there is no
  // agreement, and a firm row would be a record of nothing.
  if (!accepted) {
    return NextResponse.json({ error: 'The terms have to be accepted' }, { status: 400 })
  }

  const ctx = getRequestContext(req)

  const created = await createFirm(admin, {
    name,
    legalName,
    jurisdiction: typeof body?.jurisdiction === 'string' ? body.jurisdiction : null,
    companyNumber: typeof body?.company_number === 'string' ? body.company_number : null,
    billingEmail: typeof body?.billing_email === 'string' ? body.billing_email : null,
    signerUserId: appUser.id,
    signerTitle: typeof body?.signer_title === 'string' ? body.signer_title : null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  })

  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 500 })

  const versions = {
    partner: AGREEMENT_VERSIONS.partner,
    submission: AGREEMENT_VERSIONS.partnerSubmission,
    addendum: AGREEMENT_VERSIONS.firmAddendum,
  }

  // Both best effort, and both after the firm exists: a signer who accepted
  // must never lose their acceptance because an email or Slack failed.
  await sendFirmReceipt(appUser.email, created.firm, appUser.fullName ?? appUser.email, versions)
  const slack = await announceFirmSignup({
    firm: created.firm,
    signerName: appUser.fullName ?? appUser.email,
    signerEmail: appUser.email,
    signerTitle: typeof body?.signer_title === 'string' ? body.signer_title : null,
    jurisdiction: typeof body?.jurisdiction === 'string' ? body.jurisdiction : null,
    companyNumber: typeof body?.company_number === 'string' ? body.company_number : null,
    versions,
  })

  return NextResponse.json({
    firm: { id: created.firm.id, name: created.firm.name, slug: created.firm.slug, status: created.firm.status },
    announced: slack.sent,
  })
}
