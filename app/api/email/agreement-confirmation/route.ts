import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { AGREEMENT_TYPE_LABELS, AgreementType } from '@/lib/agreements'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { 
    to, 
    signer_name, 
    agreement_type, 
    agreement_version, 
    signed_at,
    agreement_hash 
  } = body

  if (!to || !signer_name || !agreement_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If no Resend API key, just log and return success
  if (!resend) {
    console.log('[Agreement Confirmation Email]', {
      to,
      signer_name,
      agreement_type,
      signed_at,
    })
    return NextResponse.json({ success: true, message: 'Email skipped - no API key' })
  }

  const agreementTitle = AGREEMENT_TYPE_LABELS[agreement_type as AgreementType] || agreement_type
  const signedDate = new Date(signed_at).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  })

  try {
    const { data, error } = await resend.emails.send({
      from: 'Refery <partners@refery.io>',
      to: [to],
      subject: `Agreement Signed - ${agreementTitle}`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 32px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600;">Agreement Signed</h1>
    <p style="margin: 0; opacity: 0.9; font-size: 14px;">Your Refery Partner Agreement is now active</p>
  </div>
  
  <div style="background: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="margin: 0 0 24px 0;">Dear ${signer_name},</p>
    
    <p style="margin: 0 0 24px 0;">Thank you for signing your Refery Partner Agreement. This email confirms that your agreement has been successfully executed.</p>
    
    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
      <h2 style="margin: 0 0 16px 0; font-size: 16px; font-weight: 600; color: #059669;">Agreement Details</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Agreement Type</td>
          <td style="padding: 8px 0; font-weight: 500; text-align: right;">${agreementTitle}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Version</td>
          <td style="padding: 8px 0; font-weight: 500; text-align: right;">${agreement_version}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Signed By</td>
          <td style="padding: 8px 0; font-weight: 500; text-align: right;">${signer_name}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Date &amp; Time</td>
          <td style="padding: 8px 0; font-weight: 500; text-align: right;">${signedDate}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Document Hash</td>
          <td style="padding: 8px 0; font-family: monospace; font-size: 12px; text-align: right;">${agreement_hash.slice(0, 16)}...</td>
        </tr>
      </table>
    </div>
    
    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 14px; color: #065f46;">
        <strong>What&apos;s Next?</strong><br>
        You now have full access to the Refery platform. Log in to view available roles, submit candidates, and track your pipeline.
      </p>
    </div>
    
    <p style="margin: 0 0 24px 0; font-size: 14px;">
      Your agreement protects your candidate submissions for 24 months and guarantees a 70% payout on successful placements. These terms are locked and cannot be changed without your written consent.
    </p>
    
    <p style="margin: 0 0 8px 0; font-size: 14px;">If you have any questions, reach out to us at <a href="mailto:partners@refery.io" style="color: #059669;">partners@refery.io</a>.</p>
    
    <p style="margin: 24px 0 0 0; font-size: 14px;">
      Welcome to Refery,<br>
      <strong>The Refery Team</strong>
    </p>
  </div>
  
  <div style="text-align: center; padding: 24px; color: #9ca3af; font-size: 12px;">
    <p style="margin: 0 0 8px 0;">This is an automated confirmation. Please keep this email for your records.</p>
    <p style="margin: 0;">&copy; ${new Date().getFullYear()} Refery, Inc. All rights reserved.</p>
  </div>
</body>
</html>
      `,
    })

    if (error) {
      console.error('Failed to send agreement confirmation email:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (error) {
    console.error('Email send error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
