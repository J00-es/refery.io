import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import crypto from 'crypto'
import { RECRUITER_AGREEMENT_TEXT, SCOUT_AGREEMENT_TEXT, AGREEMENT_VERSION } from '@/lib/agreements'

// GET - Fetch agreement data for signing (requires auth)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Require authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch agreement link
    const { data: link, error: linkError } = await adminClient
      .from('agreement_links')
      .select('*')
      .eq('token', token)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid agreement link' }, { status: 404 })
    }

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }

    // Check if already signed
    if (link.status === 'signed') {
      return NextResponse.json({ 
        error: 'Agreement already signed',
        signed_at: link.signed_at 
      }, { status: 400 })
    }

    // Get agreement content
    const agreementContent = link.agreement_type === 'recruiter' 
      ? RECRUITER_AGREEMENT_TEXT 
      : SCOUT_AGREEMENT_TEXT

    return NextResponse.json({
      id: link.id,
      recruiter_name: link.recruiter_name,
      recruiter_email: link.recruiter_email,
      agreement_type: link.agreement_type,
      agreement_version: AGREEMENT_VERSION,
      agreement_content: agreementContent,
      status: link.status,
      expires_at: link.expires_at,
    })
  } catch (error) {
    console.error('Error fetching agreement:', error)
    return NextResponse.json({ error: 'Failed to fetch agreement' }, { status: 500 })
  }
}

// POST - Sign the agreement (requires auth)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { signer_name, signer_email, accepted } = body

    if (!signer_name || !signer_email || !accepted) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Require authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch agreement link
    const { data: link, error: linkError } = await adminClient
      .from('agreement_links')
      .select('*')
      .eq('token', token)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invalid agreement link' }, { status: 404 })
    }

    // Check if expired
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Agreement link has expired' }, { status: 410 })
    }

    // Check if already signed
    if (link.status === 'signed') {
      return NextResponse.json({ error: 'Agreement already signed' }, { status: 400 })
    }

    // Get IP and user agent
    const headersList = await headers()
    const ip = headersList.get('x-forwarded-for')?.split(',')[0] || 
               headersList.get('x-real-ip') || 
               'unknown'
    const userAgent = headersList.get('user-agent') || 'unknown'

    // Get agreement content
    const agreementContent = link.agreement_type === 'recruiter' 
      ? RECRUITER_AGREEMENT_TEXT 
      : SCOUT_AGREEMENT_TEXT

    // Create cryptographic hash of the agreement content for integrity verification
    const agreementHash = crypto
      .createHash('sha256')
      .update(agreementContent + AGREEMENT_VERSION + signer_email + new Date().toISOString())
      .digest('hex')

    const signedAt = new Date().toISOString()

    // Create signature record with full audit trail
    const { data: signature, error: signatureError } = await adminClient
      .from('agreement_signatures')
      .insert({
        link_id: link.id,
        recruiter_id: link.recruiter_id,
        agreement_type: link.agreement_type,
        agreement_version: AGREEMENT_VERSION,
        agreement_content: agreementContent,
        agreement_hash: agreementHash,
        signer_name,
        signer_email,
        signer_user_id: user.id, // Link to authenticated user
        ip_address: ip,
        user_agent: userAgent,
        consent_text: 'I agree to be legally bound by all terms and conditions set forth in this agreement. I understand this is a binding contract and my electronic signature has the same legal effect as a handwritten signature.',
        signed_at: signedAt,
      })
      .select()
      .single()

    if (signatureError) {
      console.error('Error creating signature:', signatureError)
      return NextResponse.json({ error: 'Failed to record signature' }, { status: 500 })
    }

    // Update link status
    await adminClient
      .from('agreement_links')
      .update({ 
        status: 'signed',
        signed_at: signedAt,
      })
      .eq('id', link.id)

    // Update recruiter record if exists
    if (link.recruiter_id) {
      await adminClient
        .from('prospect_recruiters')
        .update({ 
          agreement_signed: true,
          agreement_signed_at: signedAt,
        })
        .eq('id', link.recruiter_id)
    }

    return NextResponse.json({
      success: true,
      signature_id: signature.id,
      signed_at: signedAt,
      agreement_hash: agreementHash,
    })
  } catch (error) {
    console.error('Error signing agreement:', error)
    return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
  }
}
