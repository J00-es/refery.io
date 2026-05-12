import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateAgreementHash,
  getAgreementText,
  AGREEMENT_VERSIONS,
  AgreementType,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { sendPartnerAgreementEmails } from '@/lib/send-agreement-emails'

const STORAGE_BUCKET = 'signed-agreements'

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'signer'
  )
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'signer'
}

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

// Force dynamic - never cache, always check fresh data
export const dynamic = 'force-dynamic'
// PDF rendering + email send takes a few seconds — match the client route.
export const maxDuration = 60

// GET - Get agreement details for public signing (no auth required - secret token IS the auth)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: link, error } = await adminClient
      .from('agreement_links')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (error || !link) {
      console.error('[agreements/public GET] Agreement link not found:', error)
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

    // Revoked
    if (link.status === 'revoked') {
      return NextResponse.json({ error: 'Agreement link has been revoked' }, { status: 410 })
    }

    // Already signed
    if (link.status === 'signed') {
      return NextResponse.json(
        {
          error: 'Agreement already signed',
          signed_at: link.signed_at,
          already_signed: true,
        },
        { status: 200 },
      )
    }

    /**
     * Auto-upgrade unsigned links to the latest agreement version.
     * Signed records stay immutable, but unsigned partners see the latest terms.
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
          '[agreements/public GET] auto-upgrade failed, continuing with stored version:',
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
  } catch (err) {
    console.error('[agreements/public GET] Error fetching agreement:', err)
    return NextResponse.json({ error: 'Failed to load agreement' }, { status: 500 })
  }
}

// POST - Sign the agreement (no auth required, secret token IS the auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params

    if (!token || token.length < 16) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
    }

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
      return NextResponse.json({ error: 'Agreement link has been revoked' }, { status: 410 })
    }

    if (link.status === 'expired' || new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }

    const body = await request.json().catch(() => ({}))
    const signer_name = (body?.signer_name || '').trim()
    const signer_email = (body?.signer_email || '').trim()
    const accepted = !!body?.accepted

    if (!signer_name || !signer_email || !accepted) {
      return NextResponse.json(
        { error: 'Please provide your name, email, and accept the terms' },
        { status: 400 },
      )
    }

    /**
     * Mirror the GET auto-upgrade so a partner who lands on a stale link and
     * signs immediately is bound to the latest version.
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

      if (upgradeError) {
        console.error(
          '[agreements/public POST] auto-upgrade failed, continuing with stored version:',
          upgradeError,
        )
      } else {
        storedContent = latestContent
        storedVersion = latestVersion
        storedHash = latestHash
      }
    }

    // Verify integrity of the agreement content
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
      return NextResponse.json(
        { error: 'Failed to record signature', details: signatureError.message },
        { status: 500 },
      )
    }

    const { error: updateError } = await adminClient
      .from('agreement_links')
      .update({
        status: 'signed',
        signed_at: signedAt,
        updated_at: signedAt,
      })
      .eq('id', link.id)

    if (updateError) {
      console.error('[agreements/public POST] link update failed:', updateError)
    }

    await adminClient
      .from('prospect_recruiters')
      .update({ status: 'active', updated_at: signedAt })
      .eq('id', link.recruiter_id)

    // Generate signed PDF, upload to storage, save pdf_url on the signature row,
    // then send branded signer + plain admin emails. All best-effort: any
    // failure here is logged but never rolls back the signature, which has
    // already been persisted above.
    let pdfBuffer: Buffer | null = null
    let pdfPath: string | null = null
    try {
      pdfBuffer = await generateAgreementPdf({
        kind: 'partner',
        content: storedContent,
        signerName: signer_name,
        signerEmail: signer_email,
        signedAt,
        version: storedVersion,
        termsHash: storedHash,
        agreementLinkId: link.id,
        ipAddress,
        partnerType: link.agreement_type as 'scout' | 'recruiter' | null,
      })

      pdfPath = `partner-agreements/${signature.id}.pdf`
      const { error: uploadError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(pdfPath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) {
        console.error('[agreements/public POST] pdf upload failed:', uploadError)
      } else {
        await adminClient
          .from('agreement_signatures')
          .update({ pdf_url: pdfPath })
          .eq('id', signature.id)
      }
    } catch (pdfErr) {
      console.error('[agreements/public POST] pdf generation failed:', pdfErr)
    }

    try {
      if (pdfBuffer) {
        const signedAtHuman = new Date(signedAt).toUTCString().replace(' GMT', ' UTC')
        const partnerType = (link.agreement_type as 'scout' | 'recruiter' | null) ?? null
        const result = await sendPartnerAgreementEmails({
          signerName: signer_name,
          signerEmail: signer_email,
          partnerType,
          version: storedVersion,
          signedAtIso: signedAt,
          signedAtHuman,
          ipAddress,
          termsHash: storedHash,
          agreementLinkId: link.id,
          adminUrl: `${request.nextUrl.origin}/dashboard`,
          pdfBuffer,
          pdfFilename: `Refery-Partner-Agreement-${slugifyName(lastName(signer_name))}.pdf`,
        })
        if (result.errors.length) {
          console.error('[agreements/public POST] email errors:', result.errors)
        }
      } else {
        console.error('[agreements/public POST] skipped emails — no PDF buffer')
      }
    } catch (emailErr) {
      console.error('[agreements/public POST] email send threw:', emailErr)
    }

    return NextResponse.json({
      success: true,
      signature_id: signature.id,
      signed_at: signedAt,
      agreement_hash: storedHash,
    })
  } catch (err) {
    console.error('[agreements/public POST] Error signing agreement:', err)
    return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
  }
}