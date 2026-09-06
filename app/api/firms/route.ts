import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { getRequestContext } from '@/lib/request-context'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { createFirm, firmsEnabled, getMembership, SIGNATURE_DAYS } from '@/lib/firms'
import { announceFirmSignup, sendFirmReceipt, sendFirmSignatureRequest } from '@/lib/firm-notify'

const appUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'https://refery.xyz'

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
  // Who binds the company. Absent, or explicitly self, means the person here.
  const signerSelf = body?.signer_self !== false
  const signerName =
    typeof body?.signer_name === 'string' ? body.signer_name.trim() : ''
  const signerEmail =
    typeof body?.signer_email === 'string' ? body.signer_email.trim() : ''

  if (!name || !legalName) {
    return NextResponse.json(
      { error: 'We need the firm name and the registered legal entity' },
      { status: 400 },
    )
  }
  // The acceptance is the whole point of this request. Without it there is no
  // agreement, and a firm row would be a record of nothing.
  if (signerSelf && !accepted) {
    return NextResponse.json({ error: 'The terms have to be accepted' }, { status: 400 })
  }
  // Nominating somebody is not accepting on their behalf, so this branch asks
  // for a person to send it to rather than for a tick.
  if (!signerSelf && (!signerName || !signerEmail.includes('@'))) {
    return NextResponse.json(
      { error: 'We need the name and email of the person who can sign' },
      { status: 400 },
    )
  }

  const ctx = getRequestContext(req)

  const created = await createFirm(admin, {
    name,
    legalName,
    jurisdiction: typeof body?.jurisdiction === 'string' ? body.jurisdiction : null,
    companyNumber: typeof body?.company_number === 'string' ? body.company_number : null,
    billingEmail: typeof body?.billing_email === 'string' ? body.billing_email : null,
    createdByUserId: appUser.id,
    signerTitle: typeof body?.signer_title === 'string' ? body.signer_title : null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    signer: signerSelf
      ? { self: true, name: appUser.fullName ?? appUser.email, email: appUser.email }
      : { self: false, name: signerName, email: signerEmail },
  })

  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 500 })

  const versions = {
    partner: AGREEMENT_VERSIONS.partner,
    submission: AGREEMENT_VERSIONS.partnerSubmission,
    addendum: AGREEMENT_VERSIONS.firmAddendum,
  }

  // Nothing that follows may cost the firm its acceptance, so all of it is best
  // effort and all of it happens after the row exists.
  if (!signerSelf && created.signatureToken) {
    // Nobody has signed yet, so there is nothing for Lily to approve. The card
    // goes up when the signature lands.
    await sendFirmSignatureRequest(
      signerEmail,
      created.firm,
      appUser.fullName ?? appUser.email,
      `${appUrl()}/firm/sign/${created.firm.slug}?token=${created.signatureToken}`,
      SIGNATURE_DAYS,
      versions,
    )
    return NextResponse.json({
      firm: {
        id: created.firm.id,
        name: created.firm.name,
        slug: created.firm.slug,
        status: created.firm.status,
      },
      awaitingSignature: signerEmail,
    })
  }

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
