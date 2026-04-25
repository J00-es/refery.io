import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Force dynamic - never cache, always check fresh data
export const dynamic = 'force-dynamic'

// GET - Get agreement details for public signing (no auth required - secret token IS the auth)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
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
      .single()

    if (error || !link) {
      console.error('[v0] Agreement link not found:', error)
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      if (link.status !== 'expired') {
        await adminClient
          .from('agreement_links')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', link.id)
      }
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }

    // Check if revoked
    if (link.status === 'revoked') {
      return NextResponse.json({ error: 'Agreement link has been revoked' }, { status: 410 })
    }

    // Check if already signed
    if (link.status === 'signed') {
      return NextResponse.json({
        error: 'Agreement already signed',
        signed_at: link.signed_at,
        already_signed: true,
      }, { status: 200 })
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

    // Return agreement details
    return NextResponse.json({
      id: link.id,
      recruiter_name: link.recruiter_name,
      recruiter_email: link.recruiter_email,
      agreement_type: link.agreement_type,
      agreement_version: link.agreement_version,
      agreement_content: link.agreement_content,
      status: link.status === 'sent' ? 'viewed' : link.status,
      expires_at: link.expires_at,
    })
  } catch (err) {
    console.error('[v0] Error fetching agreement:', err)
    return NextResponse.json({ error: 'Failed to load agreement' }, { status: 500 })
  }
}

// POST - Sign the agreement (no auth required, secret token IS the auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
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
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // Validate link status
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
      return NextResponse.json({ error: 'Please provide your name, email, and accept the terms' }, { status: 400 })
    }

    // Get IP address and user agent
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor
      ? forwardedFor.split(',')[0].trim()
      : request.headers.get('x-real-ip') || null
    const userAgent = request.headers.get('user-agent') || null

    const signedAt = new Date().toISOString()

    // Create immutable signature record - only insert fields that exist in the schema
    const { data: signature, error: signatureError } = await adminClient
      .from('agreement_signatures')
      .insert({
        link_id: link.id,
        recruiter_id: link.recruiter_id,
        signer_name,
        signer_email,
        agreement_type: link.agreement_type,
        agreement_version: link.agreement_version,
        agreement_hash: link.agreement_hash,
        acceptance_method: 'clickwrap_unique_link',
        ip_address: ipAddress,
        user_agent: userAgent,
        signed_at: signedAt,
      })
      .select()
      .single()

    if (signatureError) {
      console.error('[v0] Failed to create signature:', signatureError)
      return NextResponse.json({ error: 'Failed to record signature', details: signatureError.message }, { status: 500 })
    }

    // Update the agreement link status
    const { error: updateError } = await adminClient
      .from('agreement_links')
      .update({
        status: 'signed',
        signed_at: signedAt,
        updated_at: signedAt,
      })
      .eq('id', link.id)

    if (updateError) {
      console.error('[v0] Failed to update link status:', updateError)
    }

    // Send confirmation email (fire and forget)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
      fetch(`${baseUrl}/api/email/agreement-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: signer_email,
          signer_name,
          agreement_type: link.agreement_type,
          agreement_version: link.agreement_version,
          signed_at: signedAt,
          agreement_hash: link.agreement_hash,
        }),
      }).catch((emailError) => {
        console.error('[v0] Failed to send confirmation email:', emailError)
      })
    } catch (emailError) {
      console.error('[v0] Failed to send confirmation email:', emailError)
    }

    return NextResponse.json({
      success: true,
      signature_id: signature.id,
      signed_at: signedAt,
      agreement_hash: link.agreement_hash,
    })
  } catch (err) {
    console.error('[v0] Error signing agreement:', err)
    return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
  }
}
