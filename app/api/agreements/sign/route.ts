import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()
    const { token, agreement_id, signer_name, signer_title, signer_email } = body

    if (!token || !agreement_id || !signer_name || !signer_email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get client IP address
    const forwarded = request.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') || '0.0.0.0'
    const userAgent = request.headers.get('user-agent') || ''

    // Verify the agreement exists and is pending
    const { data: agreement, error: fetchError } = await supabase
      .from('company_agreements')
      .select('*')
      .eq('id', agreement_id)
      .eq('token', token)
      .single()

    if (fetchError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    if (agreement.status !== 'pending') {
      return NextResponse.json({ error: 'Agreement is not pending' }, { status: 400 })
    }

    if (agreement.expires_at && new Date(agreement.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Agreement has expired' }, { status: 400 })
    }

    // Create agreement hash for verification
    const agreementContent = JSON.stringify({
      agreement_id,
      signer_name,
      signer_title,
      signer_email,
      signed_at: new Date().toISOString(),
      ip_address: ip,
    })
    const agreementHash = crypto.createHash('sha256').update(agreementContent).digest('hex')

    // Update the agreement to signed
    const { error: updateError } = await supabase
      .from('company_agreements')
      .update({
        status: 'signed',
        signer_name,
        signer_title: signer_title || null,
        signer_email,
        signed_at: new Date().toISOString(),
        signed_ip_address: ip,
        signed_user_agent: userAgent,
        signed_agreement_hash: agreementHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agreement_id)
      .eq('token', token)

    if (updateError) {
      console.error('Error updating agreement:', updateError)
      return NextResponse.json({ error: 'Failed to sign agreement' }, { status: 500 })
    }

    // Get company info for email
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', agreement.company_id)
      .single()

    // Send confirmation email
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/email/agreement-signed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: signer_email,
          signerName: signer_name,
          companyName: company?.name || 'Unknown Company',
          agreementVersion: agreement.agreement_version,
          signedAt: new Date().toISOString(),
          agreementHash,
        }),
      })
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError)
      // Don't fail the signing if email fails
    }

    return NextResponse.json({ 
      success: true, 
      signed_at: new Date().toISOString(),
      agreement_hash: agreementHash,
    })
  } catch (error) {
    console.error('Error signing agreement:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
