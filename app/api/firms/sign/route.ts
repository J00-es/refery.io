import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestContext } from '@/lib/request-context'
import {
  AGREEMENT_VERSIONS,
  FIRM_ADDENDUM_TEXT,
  PARTNER_TERMS_TEXT,
  generateAgreementHash,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { findFirmAwaitingSignature, signFirmAgreement } from '@/lib/firms'
import {
  announceFirmSignup,
  sendFirmReceipt,
  sendFirmSignedNotice,
  sendFirmSignedPdf,
} from '@/lib/firm-notify'

// Rendering the PDF adds a few seconds. Give it room, as sign-up does.
export const maxDuration = 60

/**
 * A nominated signer binds the firm.
 *
 * Unauthenticated by design: the signer has no account and does not need one.
 * The token is the credential, and it is single use, hashed at rest, and burned
 * in the same statement that records the signature.
 *
 * This is where the approval card is finally posted. Announcing at creation
 * would have put an unsigned firm in front of Lily with nothing to decide.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  if (!token) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (name.length < 2) {
    return NextResponse.json({ error: 'Please type your full legal name' }, { status: 400 })
  }
  // Two separate representations, and neither stands in for the other.
  if (body?.authorised !== true || body?.accepted !== true) {
    return NextResponse.json(
      { error: 'Both confirmations are needed to sign' },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const pending = await findFirmAwaitingSignature(admin, token)
  if (!pending) {
    return NextResponse.json({ error: 'This link is no longer valid' }, { status: 404 })
  }

  const ctx = getRequestContext(req)
  const signed = await signFirmAgreement(admin, {
    firmId: pending.id,
    name,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  })
  if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 409 })

  const firm = signed.firm

  // Everything past this point is best effort. The signature is recorded and
  // must not be undone because an email or Slack failed.
  const versions = {
    partner: AGREEMENT_VERSIONS.partner,
    submission: AGREEMENT_VERSIONS.partnerSubmission,
    addendum: AGREEMENT_VERSIONS.firmAddendum,
  }

  /**
   * The evidence, in the order it has to happen.
   *
   * The acceptance row first, because its id is the reference printed on the
   * PDF. Then the PDF. Then the email carrying it. Each step is allowed to fail
   * without undoing the signature, which is already recorded on the firm.
   */
  const signedAt = new Date().toISOString()
  // What was actually accepted: the Partner Terms as modified by the Addendum.
  // Hashing them together is what makes "this exact text" provable later.
  const acceptedText = `${PARTNER_TERMS_TEXT}\n\n${FIRM_ADDENDUM_TEXT}`
  const termsHash = await generateAgreementHash(acceptedText)

  let acceptanceId = firm.id
  try {
    const { data: acceptance } = await admin
      .from('agreement_acceptances')
      .insert({
        // Null: a firm signer binds a company without holding an account.
        user_id: null,
        partner_org_id: firm.id,
        user_email: firm.signer_email ?? '',
        user_name: name,
        company_name: firm.legal_name,
        ip_address: ctx.ip,
        user_agent: ctx.userAgent,
        agreement_version: AGREEMENT_VERSIONS.firmAddendum,
        agreement_hash: termsHash,
        acceptance_method: 'clickwrap_typed_name_and_button',
        agreement_type: 'firm_addendum',
        accepted_at: signedAt,
      })
      .select('id')
      .single()
    if (acceptance?.id) acceptanceId = acceptance.id as string
  } catch (err) {
    console.error('[firms/sign] acceptance row failed:', err)
  }

  // The full row, for the jurisdiction on the card and the person who has been
  // waiting for this to happen.
  const { data: full } = await admin
    .from('partner_orgs')
    .select('jurisdiction, company_number, signer_title, signer_email, created_by_user_id')
    .eq('id', firm.id)
    .single()

  let setUpBy: string | null = null
  let creatorEmail: string | null = null
  if (full?.created_by_user_id) {
    const { data: creator } = await admin
      .from('users_admin')
      .select('full_name, email')
      .eq('id', full.created_by_user_id as string)
      .single()
    if (creator) {
      creatorEmail = creator.email as string
      setUpBy = (creator.full_name as string) || (creator.email as string)
    }
  }

  let pdfBuffer: Buffer | null = null
  try {
    pdfBuffer = await generateAgreementPdf({
      kind: 'firm',
      content: acceptedText,
      companyName: firm.legal_name,
      signerName: name,
      signerTitle: (full?.signer_title as string) ?? null,
      signerEmail: firm.signer_email ?? '',
      signedAt,
      version: AGREEMENT_VERSIONS.firmAddendum,
      termsHash,
      agreementLinkId: acceptanceId,
      ipAddress: ctx.ip,
    })
  } catch (err) {
    // A missing PDF must never cost somebody their signature.
    console.error('[firms/sign] pdf failed:', err)
  }

  await Promise.allSettled([
    pdfBuffer
      ? sendFirmSignedPdf(firm.signer_email ?? '', firm, name, signedAt, acceptanceId, pdfBuffer)
      : sendFirmReceipt(firm.signer_email ?? '', firm, name, versions),
    creatorEmail ? sendFirmSignedNotice(creatorEmail, firm, name) : Promise.resolve(),
    announceFirmSignup({
      firm,
      signerName: name,
      signerEmail: firm.signer_email ?? '',
      signerTitle: (full?.signer_title as string) ?? null,
      jurisdiction: (full?.jurisdiction as string) ?? null,
      companyNumber: (full?.company_number as string) ?? null,
      setUpBy: setUpBy && setUpBy !== name ? setUpBy : null,
      versions,
    }),
  ])

  return NextResponse.json({ ok: true, firm: { name: firm.name, status: firm.status } })
}
