import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  AGREEMENT_VERSIONS,
  clientPaymentTimingForVersion,
  clientUpgradeTarget,
  formatFeePercent,
  generateAgreementHash,
  generateClientAgreementText,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { sendAgreementEmails } from '@/lib/send-agreement-emails'
import { isLikelyBot, logAgreementEvent } from '@/lib/agreement-events'
import { getRequestContext } from '@/lib/request-context'
import { notifySlack } from '@/lib/slack'
import { sendAgreementActivityEmail } from '@/lib/send-agreement-activity-email'

export const dynamic = 'force-dynamic'
// PDF rendering and email send take a few seconds, so raise the Vercel ceiling.
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

function getIp(request: NextRequest): string | null {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip')
}

/**
 * Bring an unsigned link up to date, so a client opening a months-old link sees
 * today's terms.
 *
 * This compares the stored content hash against a freshly generated one rather
 * than comparing version numbers. Version-only comparison silently served stale
 * text whenever a document was edited without a version bump (a wording fix, or
 * a change to the link's fee), because the version already matched.
 *
 * Negotiated versions are pinned exactly as they were sent. See
 * clientUpgradeTarget().
 */
async function refreshIfStale(
  admin: ReturnType<typeof createAdminClient>,
  link: { id: string; company_name: string; agreement_version: string; agreement_content: string; agreement_hash: string },
  feePercent: number,
): Promise<{ content: string; version: string; hash: string }> {
  const stored = {
    content: link.agreement_content,
    version: link.agreement_version,
    hash: link.agreement_hash,
  }

  // Roll onto the current standard if this link is on an older line, otherwise
  // re-render the version it is already on.
  const targetVersion = clientUpgradeTarget(link.agreement_version) ?? link.agreement_version
  const timing = clientPaymentTimingForVersion(targetVersion)

  // Negotiated or unrecognised versions are left exactly as issued.
  if (!timing || targetVersion === AGREEMENT_VERSIONS.clientDeferred) return stored

  const content = generateClientAgreementText(link.company_name, {
    feePercent,
    paymentTiming: timing,
  })
  const hash = await generateAgreementHash(content)

  if (hash === stored.hash && targetVersion === stored.version) return stored

  const { error } = await admin
    .from('client_agreement_links')
    .update({
      agreement_content: content,
      agreement_version: targetVersion,
      agreement_hash: hash,
      updated_at: new Date().toISOString(),
    })
    .eq('id', link.id)

  if (error) {
    console.error('[agreements/client] refresh failed, serving stored version:', error)
    return stored
  }

  return { content, version: targetVersion, hash }
}

// GET: load agreement for the public sign page. Token IS the auth.
export async function GET(
  request: NextRequest,
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

    const feePercent = Number(link.fee_percentage)
    const { content, version, hash } = await refreshIfStale(adminClient, link, feePercent)

    const ip = getIp(request)
    const userAgent = request.headers.get('user-agent')
    const geo = getRequestContext(request)

    // Log the open and alert the admin, after the document is already on its
    // way to the reader. Mail scanners and link previewers fetch this URL too,
    // so they are filtered out rather than reported as opens.
    if (!isLikelyBot(userAgent)) {
      const origin = request.nextUrl.origin
      after(async () => {
        try {
          const nowIso = new Date().toISOString()

          if (link.status === 'sent') {
            await adminClient
              .from('client_agreement_links')
              .update({ status: 'viewed', viewed_at: nowIso, updated_at: nowIso })
              .eq('id', link.id)
          }

          const logged = await logAgreementEvent(adminClient, {
            linkId: link.id,
            companyId: link.company_id,
            eventType: 'viewed',
            ipAddress: ip,
            userAgent,
            location: geo.location,
            metadata: { version },
          })

          if (!logged.logged) return

          const result = await sendAgreementActivityEmail({
            companyName: link.company_name,
            recipientLabel: link.recipient_name
              ? `${link.recipient_name}${link.recipient_email ? ` (${link.recipient_email})` : ''}`
              : null,
            eventType: 'viewed',
            seq: logged.seq,
            device: logged.device,
            ipAddress: ip,
            occurredAtHuman: new Date().toUTCString().replace(' GMT', ' UTC'),
            version,
            feePercent: formatFeePercent(feePercent),
            companyUrl: `${origin}/companies/${link.company_id}`,
            signUrl: `${origin}/sign/client-agreement/${token}`,
          })
          if (!result.sent) {
            console.error('[agreements/client GET] activity email failed:', result.error)
          }

          await notifySlack({
            stream: 'clients',
            emoji: logged.seq === 1 ? ':eyes:' : ':repeat:',
            title:
              logged.seq === 1
                ? `${link.company_name} opened the agreement`
                : `${link.company_name} opened the agreement again (#${logged.seq})`,
            context:
              logged.seq >= 3
                ? 'Opened repeatedly without signing. Usually someone else needs to approve it, or one term is sticking.'
                : 'Warmest this lead will be all week.',
            fields: [
              { label: 'Sent to', value: link.recipient_name ?? 'Open link' },
              { label: 'Terms', value: `v${version} · ${formatFeePercent(feePercent)}% fee` },
              { label: 'Location', value: geo.location || 'Unknown' },
              { label: 'Device', value: logged.device || 'Unknown' },
            ],
            links: [{ label: 'Open company', url: `${origin}/companies/${link.company_id}` }],
          })

        } catch (err) {
          console.error('[agreements/client GET] view logging failed:', err)
        }
      })
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

// POST: sign the agreement.
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

    // Re-check on POST, by the same rule as GET.
    const feePercent = Number(link.fee_percentage)
    const {
      content: storedContent,
      version: storedVersion,
      hash: storedHash,
    } = await refreshIfStale(adminClient, link, feePercent)

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
    const geo = getRequestContext(request)
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

    // The signature is now durable, so the signer gets their answer here.
    // Rendering the PDF and sending three emails used to run before this
    // response, which meant a slow render or a slow mail API surfaced to the
    // signer as "Failed to sign agreement" even though the signature had been
    // recorded. All of it now runs in after(), once the response is sent.
    const origin = request.nextUrl.origin
    const signedAtHuman = signedAt.toUTCString().replace(' GMT', ' UTC')

    after(async () => {
      try {
        const signedEvent = await logAgreementEvent(adminClient, {
          linkId: link.id,
          companyId: link.company_id,
          eventType: 'signed',
          ipAddress: ip,
          userAgent,
          location: geo.location,
          metadata: {
            signer_name: signerName,
            signer_email: signerEmail,
            signer_title: signerTitle,
            version: storedVersion,
          },
        })

        if (signedEvent.logged) {
          const activity = await sendAgreementActivityEmail({
            companyName: link.company_name,
            recipientLabel: `${signerName}${signerTitle ? `, ${signerTitle}` : ''} (${signerEmail})`,
            eventType: 'signed',
            seq: signedEvent.seq,
            device: signedEvent.device,
            ipAddress: ip,
            occurredAtHuman: signedAtHuman,
            version: storedVersion,
            feePercent: formatFeePercent(feePercent),
            companyUrl: `${origin}/companies/${link.company_id}`,
            signUrl: `${origin}/sign/client-agreement/${token}`,
          })
          if (!activity.sent) {
            console.error('[agreements/client POST] activity email failed:', activity.error)
          }

          await notifySlack({
            stream: 'clients',
            emoji: ':handshake:',
            title: `${link.company_name} signed the agreement`,
            context: 'Countersigned PDF is on its way to them.',
            fields: [
              { label: 'Signer', value: `${signerName}${signerTitle ? `, ${signerTitle}` : ''}` },
              { label: 'Email', value: signerEmail },
              { label: 'Terms', value: `v${storedVersion} · ${formatFeePercent(feePercent)}% fee` },
              { label: 'Location', value: geo.location || 'Unknown' },
            ],
            links: [{ label: 'Open company', url: `${origin}/companies/${link.company_id}` }],
          })
        }

        const pdfBuffer = await generateAgreementPdf({
          kind: 'client',
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

        const pdfPath = `${slugify(link.company_name)}/${link.id}.pdf`
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
          adminUrl: `${origin}/companies/${link.company_id}`,
          pdfBuffer,
          pdfFilename: `Refery-Services-Agreement-${slugify(link.company_name)}.pdf`,
        })
        if (result.errors.length) {
          console.error('[agreements/client POST] email errors:', result.errors)
        }
      } catch (err) {
        console.error('[agreements/client POST] post-signature work failed:', err)
      }
    })

    return NextResponse.json({
      success: true,
      signature_id: signature.id,
      signed_at: signedAtIso,
      agreement_hash: storedHash,
    })
  } catch (err) {
    console.error('[agreements/client POST] error:', err)
    return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
  }
}
