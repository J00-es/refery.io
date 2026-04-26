import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateAgreementHash,
  getAgreementText,
  getAgreementVersion,
  AGREEMENT_VERSIONS,
  AgreementType,
} from '@/lib/agreements'

/**
 * Compare two semver-ish version strings ("1.1.0" > "1.0.0").
 * Returns true if `a` is strictly greater than `b`.
 */
function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return true
    if (da < db) return false
  }
  return false
}

// GET - Get agreement details for public signing (no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const adminClient = createAdminClient()

  const { data: link, error } = await adminClient
    .from('agreement_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (error || !link) {
    return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
  }

  // Expired
  if (new Date(link.expires_at) < new Date()) {
    if (link.status !== 'expired') {
      await adminClient
        .from('agreement_links')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', link.id)
    }
    return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
  }

  // Already signed
  if (link.status === 'signed') {
    return NextResponse.json(
      { error: 'Agreement already signed', signed_at: link.signed_at },
      { status: 400 },
    )
  }

  // Revoked
  if (link.status === 'revoked') {
    return NextResponse.json(
      { error: 'Agreement link has been revoked' },
      { status: 410 },
    )
  }

  /**
   * Auto-upgrade unsigned links to the latest agreement version.
   * Preserves legal integrity (signed records are immutable above) while
   * ensuring partners always see the most current terms before they sign.
   */
  let agreementContent: string = link.agreement_content
  let agreementVersion: string = link.agreement_version
  let agreementHash: string = link.agreement_hash

  const type = link.agreement_type as AgreementType
  const latestVersion = AGREEMENT_VERSIONS[type]

  if (latestVersion && isNewer(latestVersion, agreementVersion)) {
    const latestContent = getAgreementText(type)
    const latestHash = await generateAgreementHash(latestContent)

    const { error: upgradeError } = await adminClient
      .from('agreement_links')
      .update({
        agreement_content: latestContent,
        agreement_version: latestVersion,
        agreement_hash: latestHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.id)

    if (upgradeError) {
      console.error(
        '[agreements/public GET] auto-upgrade failed (continuing with stored version):',
        upgradeError,
      )
    } else {
      agreementContent = latestContent
      agreementVersion = latestVersion
      agreementHash = latestHash
    }
  }

  // Mark as viewed if first time
  if (link.status === 'sent') {
    await adminClient
      .from('agreement_links')
      .update({
        status: 'viewed',
        viewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.id)
  }

  return NextResponse.json({
    id: link.id,
    recruiter_name: link.recruiter_name,
    recruiter_email: link.recruiter_email,
    agreement_type: link.agreement_type,
    agreement_version: agreementVersion,
    agreement_content: agreementContent,
    agreement_hash: agreementHash,
    status: link.status === 'sent' ? 'viewed' : link.status,
    expires_at: link.expires_at,
  })
}

// POST - Sign the agreement (no auth required, public endpoint)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const adminClient = createAdminClient()

  const { data: link, error: linkError } = await adminClient
    .from('agreement_links')
    .select('*')
    .eq('token', token)
    .maybeSingle()

  if (linkError || !link) {
    return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
  }

  if (link.status === 'signed') {
    return NextResponse.json({ error: 'Agreement already signed' }, { status: 400 })
  }
  if (link.status === 'revoked') {
    return NextResponse.json(
      { error: 'Agreement link has been revoked' },
      { status: 410 },
    )
  }
  if (link.status === 'expired' || new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
  }

  const body = await request.json()
  const { signer_name, signer_email, accepted } = body

  if (!signer_name || !signer_email || !accepted) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  /**
   * Mirror the GET auto-upgrade so a partner who lands on a stale link and
   * signs immediately is bound to the latest version (not the snapshot from
   * when the link was created).
   */
  let storedContent: string = link.agreement_content
  let storedVersion: string = link.agreement_version
  let storedHash: string = link.agreement_hash

  const type = link.agreement_type as AgreementType
  const latestVersion = AGREEMENT_VERSIONS[type]
  if (latestVersion && isNewer(latestVersion, storedVersion)) {
    const latestContent = getAgreementText(type)
    const latestHash = await generateAgreementHash(latestContent)
    const { error: upgradeError } = await adminClient
      .from('agreement_links')
      .update({
        agreement_content: latestContent,
        agreement_version: latestVersion,
        agreement_hash: latestHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', link.id)
    if (!upgradeError) {
      storedContent = latestContent
      storedVersion = latestVersion
      storedHash = latestHash
    }
  }

  // Verify integrity of (now possibly upgraded) content
  const computedHash = await generateAgreementHash(storedContent)
  if (computedHash !== storedHash) {
    return NextResponse.json(
      { error: 'Agreement integrity check failed' },
      { status: 400 },
    )
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  const ipAddress = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : request.headers.get('x-real-ip') || null
  const userAgent = request.headers.get('user-agent') || null
  const signedAt = new Date().toISOString()

  // Create immutable signature record
  const { data: signature, error: signatureError } = await adminClient
    .from('agreement_signatures')
    .insert({
      link_id: link.id,
      recruiter_id: link.recruiter_id,
      signer_name,
      signer_email,
      agreement_type: link.agreement_type,
      agreement_version: storedVersion,
      agreement_hash: storedHash,
      acceptance_method: 'clickwrap_unique_link',
      ip_address: ipAddress,
      user_agent: userAgent,
      signed_at: signedAt,
    })
    .select()
    .single()

  if (signatureError) {
    console.error('[agreements/public POST] signature insert failed:', signatureError)
    return NextResponse.json({ error: 'Failed to record signature' }, { status: 500 })
  }

  const { error: updateError } = await adminClient
    .from('agreement_links')
    .update({ status: 'signed', signed_at: signedAt, updated_at: signedAt })
    .eq('id', link.id)
  if (updateError) {
    console.error('[agreements/public POST] link update failed:', updateError)
  }

  await adminClient
    .from('prospect_recruiters')
    .update({ status: 'active', updated_at: signedAt })
    .eq('id', link.recruiter_id)

  // Confirmation email (fire and forget)
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
    await fetch(`${baseUrl}/api/email/agreement-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: signer_email,
        signer_name,
        agreement_type: link.agreement_type,
        agreement_version: storedVersion,
        signed_at: signedAt,
        agreement_hash: storedHash,
      }),
    })
  } catch (emailError) {
    console.error('[agreements/public POST] confirmation email failed:', emailError)
  }

  return NextResponse.json({
    success: true,
    signature_id: signature.id,
    signed_at: signedAt,
    agreement_hash: storedHash,
  })
}
