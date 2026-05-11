import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  AGREEMENT_VERSIONS,
  formatFeePercent,
  generateAgreementHash,
  generateClientAgreementText,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { sendAgreementEmails } from '@/lib/send-agreement-emails'

export const dynamic = 'force-dynamic'
// PDF rendering + email send takes a few seconds — bump Vercel function ceiling.
export const maxDuration = 60

const STORAGE_BUCKET = 'signed-agreements'
const PDF_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'company'
  )
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

function getIp(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}

// GET — load agreement for the public sign page. Token IS the auth.
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
      .from('client_agreement_links')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (error || !link) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      if (link.status !== 'expired') {
        await adminClient
          .from('client_agreement_links')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', link.id)
      }
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }
    if (link.status === 'revoked') {
      return NextResponse.json({ error: 'Agreement link has been revoked' }, { status: 410 })
    }
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

    // Auto-upgrade unsigned links to the latest version, matching the partner
    // flow in /api/agreements/public/[token].
    let content: string = link.agreement_content
    let version: string = link.agreement_version
    let hash: string = link.agreement_hash
    const feePercent = Number(link.fee_percentage)
    const latestVersion = AGREEMENT_VERSIONS.client

    if (isNewer(latestVersion, version)) {
      const latestContent = generateClientAgreementText(link.company_name, {
        feePercent,
      })
      const latestHash = await generateAgreementHash(latestContent)

      const { error: upgradeError } = await adminClient
        .from('client_agreement_links')
        .update({
          agreement_content: latestContent,
          agreement_version: latestVersion,
          agreement_hash: latestHash,
          updated_at: new Date().toISOString(),
        })
        .eq('id', link.id)

      if (!upgradeError) {
        content = latestContent
        version = latestVersion
        hash = latestHash
      }
    }

    if (link.status === 'sent') {
      await adminClient
        .from('client_agreement_links')
        .update({
          status: 'viewed',
          viewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', link.id)
    }

    return NextResponse.json({
      id: link.id,
      company_name: link.company_name,
      recipient_name: link.recipient_name,
      recipient_email: link.recipient_email,
      agreement_version: version,
      agreement_content: content,
      agreement_hash: hash,
      fee_percentage: feePercent,
      fee_percent_display: formatFeePercent(feePercent),
      status: link.status === 'sent' ? 'viewed' : link.status,
      expires_at: link.expires_at,
    })
  } catch (err) {
    console.error('[agreements/client GET] error:', err)
    return NextResponse.json({ error: 'Failed to load agreement' }, { status: 500 })
  }
}

// POST — sign the agreement.
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
      .from('client_agreement_links')
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
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }

    const body = await request.json().catch(() => ({}))
    const signerName = (body?.signer_name || '').trim()
    const signerTitle = (body?.signer_title || '').trim() || null
    const signerEmail = (body?.signer_email || '').trim()
    const accepted = !!body?.accepted

    if (!signerName || !signerEmail || !accepted) {
      return NextResponse.json(
        { error: 'signer_name, signer_email, and accepted=true are required' },
        { status: 400 },
      )
    }
    if (!/\S+@\S+\.\S+/.test(signerEmail)) {
      return NextResponse.json({ error: 'Invalid signer_email' }, { status: 400 })
    }

    // Re-upgrade defensively on POST (mirrors partner flow).
    let storedContent: string = link.agreement_content
    let storedVersion: string = link.agreement_version
    let storedHash: string = link.agreement_hash
    const feePercent = Number(link.fee_percentage)
    const latestVersion = AGREEMENT_VERSIONS.client

    if (isNewer(latestVersion, storedVersion)) {
      const latestContent = generateClientAgreementText(link.company_name, {
        feePercent,
      })
      const latestHash = await generateAgreementHash(latestContent)
      const { error: upgradeError } = await adminClient
        .from('client_agreement_links')
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

    // Integrity check
    const computedHash = await generateAgreementHash(storedContent)
    if (computedHash !== storedHash) {
      return NextResponse.json(
        { error: 'Agreement integrity check failed' },
        { status: 400 },
      )
    }

    const ip = getIp(request)
    const userAgent = request.headers.get('user-agent') || null
    const signedAt = new Date()
    const signedAtIso = signedAt.toISOString()

    // Create immutable signature row first.
    const { data: signature, error: sigError } = await adminClient
      .from('client_agreement_signatures')
      .insert({
        link_id: link.id,
        company_id: link.company_id,
        company_name: link.company_name,
        signer_name: signerName,
        signer_title: signerTitle,
        signer_email: signerEmail,
        agreement_version: storedVersion,
        agreement_hash: storedHash,
        fee_percentage: feePercent,
        payment_window_days: link.payment_window_days,
        late_fee_percentage: link.late_fee_percentage,
        guarantee_days: link.guarantee_days,
        intro_validity_months: link.intro_validity_months,
        acceptance_method: 'clickwrap_unique_link',
        ip_address: ip,
        user_agent: userAgent,
        signed_at: signedAtIso,
      })
      .select('id')
      .single()

    if (sigError || !signature) {
      console.error('[agreements/client POST] signature insert failed:', sigError)
      return NextResponse.json(
        { error: 'Failed to record signature', details: sigError?.message },
        { status: 500 },
      )
    }

    // Mark link as signed.
    await adminClient
      .from('client_agreement_links')
      .update({
        status: 'signed',
        signed_at: signedAtIso,
        updated_at: signedAtIso,
      })
      .eq('id', link.id)

    // Generate PDF + upload + signed URL. Failures here are logged but don't
    // fail the signing — the signature is already recorded.
    let pdfBuffer: Buffer | null = null
    let pdfPath: string | null = null
    try {
      pdfBuffer = await generateAgreementPdf({
        content: storedContent,
        companyName: link.company_name,
        signerName,
        signerTitle,
        signerEmail,
        signedAt: signedAtIso,
        version: storedVersion,
        termsHash: storedHash,
        agreementLinkId: link.id,
        ipAddress: ip,
      })

      pdfPath = `${slugify(link.company_name)}/${link.id}.pdf`
      const { error: uploadError } = await adminClient.storage
        .from(STORAGE_BUCKET)
        .upload(pdfPath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) {
        console.error('[agreements/client POST] pdf upload failed:', uploadError)
      } else {
        await adminClient
          .from('client_agreement_signatures')
          .update({ pdf_url: pdfPath })
          .eq('id', signature.id)
      }
    } catch (pdfErr) {
      console.error('[agreements/client POST] pdf generation failed:', pdfErr)
    }

    // Send emails. Also fire-and-best-effort.
    try {
      if (pdfBuffer) {
        const signedAtHuman = signedAt.toUTCString().replace(' GMT', ' UTC')
        const result = await sendAgreementEmails({
          signerName,
          signerTitle,
          signerEmail,
          companyName: link.company_name,
          feePercent: formatFeePercent(feePercent),
          version: storedVersion,
          signedAtIso,
          signedAtHuman,
          ipAddress: ip,
          termsHash: storedHash,
          agreementLinkId: link.id,
          adminUrl: `${request.nextUrl.origin}/companies/${link.company_id}`,
          pdfBuffer,
          pdfFilename: `Refery-Services-Agreement-${slugify(link.company_name)}.pdf`,
        })
        if (result.errors.length) {
          console.error('[agreements/client POST] email errors:', result.errors)
        }
      } else {
        console.error('[agreements/client POST] skipped emails — no PDF buffer')
      }
    } catch (emailErr) {
      console.error('[agreements/client POST] email send threw:', emailErr)
    }

    return NextResponse.json({
      success: true,
      signature_id: signature.id,
      signed_at: signedAtIso,
      agreement_hash: storedHash,
      pdf_path: pdfPath,
    })
  } catch (err) {
    console.error('[agreements/client POST] error:', err)
    return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
  }
}
