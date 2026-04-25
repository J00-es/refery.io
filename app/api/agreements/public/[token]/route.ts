import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { generateAgreementHash } from '@/lib/agreements'

// GET - Get agreement details for public signing (no auth required)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Use admin client to bypass RLS for public access
    const adminClient = createAdminClient()

    const { data: link, error } = await adminClient
      .from('agreement_links')
      .select('*')
      .eq('token', token)
      .single()

    if (error || !link) {
      console.error('Agreement link not found:', error)
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      // Update status to expired if not already
      if (link.status !== 'expired') {
        await adminClient
          .from('agreement_links')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', link.id)
      }
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }

    // Check if already signed
    if (link.status === 'signed') {
      return NextResponse.json({ 
        error: 'Agreement already signed',
        signed_at: link.signed_at 
      }, { status: 400 })
    }

    // Check if revoked
    if (link.status === 'revoked') {
      return NextResponse.json({ error: 'Agreement link has been revoked' }, { status: 410 })
    }

    // Mark as viewed if first time
    if (link.status === 'sent') {
      await adminClient
        .from('agreement_links')
        .update({ 
          status: 'viewed', 
          viewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', link.id)
    }

    // Return agreement details (excluding sensitive info)
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
    console.error('Error fetching agreement:', err)
    return NextResponse.json({ error: 'Failed to load agreement' }, { status: 500 })
  }
}

// POST - Sign the agreement (no auth required, public endpoint)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Use admin client to bypass RLS for public access
    const adminClient = createAdminClient()

    // Get the agreement link
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

    const body = await request.json()
    const { signer_name, signer_email, accepted } = body

    if (!signer_name || !signer_email || !accepted) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get IP address
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : 
      request.headers.get('x-real-ip') || null

    const userAgent = request.headers.get('user-agent') || null

    // Verify agreement hash matches
    const computedHash = await generateAgreementHash(link.agreement_content)
    if (computedHash !== link.agreement_hash) {
      return NextResponse.json({ error: 'Agreement integrity check failed' }, { status: 400 })
    }

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
      console.error('Failed to create signature:', signatureError)
      return NextResponse.json({ error: 'Failed to record signature' }, { status: 500 })
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
      console.error('Failed to update link status:', updateError)
    }

    // Update recruiter status to indicate agreement signed
    await adminClient
      .from('prospect_recruiters')
      .update({
        status: 'active',
        updated_at: signedAt,
      })
      .eq('id', link.recruiter_id)

    // Send confirmation email (fire and forget)
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
      await fetch(`${baseUrl}/api/email/agreement-confirmation`, {
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
      })
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError)
    }

    return NextResponse.json({
      success: true,
      signature_id: signature.id,
      signed_at: signedAt,
      agreement_hash: link.agreement_hash,
    })
  } catch (err) {
    console.error('Error signing agreement:', err)
    return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
  }
}
