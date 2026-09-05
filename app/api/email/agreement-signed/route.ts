import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to, signerName, companyName, agreementVersion, signedAt, agreementHash } = body

    if (!to || !signerName || !companyName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!resend) {
      console.log('Email not sent - RESEND_API_KEY not configured')
      console.log('Would send to:', to)
      console.log('Subject: Agreement Signed - Refery Recruitment Services')
      return NextResponse.json({ success: true, message: 'Email skipped - no API key' })
    }

    const signedDate = new Date(signedAt).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #111827; padding: 24px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px; font-style: italic;">refery</h1>
        </div>
        
        <div style="background-color: #f9fafb; padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="width: 64px; height: 64px; background-color: #d1fae5; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 style="margin: 0; color: #111827; font-size: 24px;">Agreement Signed Successfully</h2>
          </div>
          
          <p style="margin-bottom: 24px;">Dear ${signerName},</p>
          
          <p>Thank you for signing the Recruitment Services Agreement on behalf of <strong>${companyName}</strong>. This email confirms your acceptance of the agreement terms.</p>
          
          <div style="background-color: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <h3 style="margin-top: 0; color: #111827; font-size: 16px;">Agreement Details</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Company</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 500;">${companyName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Signed By</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 500;">${signerName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Agreement Version</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 500;">v${agreementVersion}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Signed On</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 500;">${signedDate}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #6b7280;">Document Hash</td>
                <td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 12px;">${agreementHash.slice(0, 16)}...</td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #f0fdf4; border: 1px solid #d1fae5; border-radius: 8px; padding: 16px; margin: 24px 0;">
            <h4 style="margin: 0 0 8px 0; color: #059669; font-size: 14px;">Key Terms Reminder</h4>
            <ul style="margin: 0; padding-left: 20px; color: #065f46; font-size: 14px;">
              <li>10% placement fee</li>
              <li>Invoiced on the start date, due 30 calendar days after it</li>
              <li>One free replacement search if the hire leaves within 90 days</li>
            </ul>
          </div>
          
          <p style="margin-top: 24px;">If you have any questions about this agreement or need assistance, please don't hesitate to reach out to our team.</p>
          
          <p style="margin-top: 24px;">Best regards,<br><strong>The Refery Team</strong></p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
          <p style="margin: 0;">This is an automated confirmation email from Refery.</p>
          <p style="margin: 8px 0 0 0;">&copy; ${new Date().getFullYear()} Refery, Inc. All rights reserved.</p>
        </div>
      </body>
      </html>
    `

    const { data, error } = await resend.emails.send({
      from: 'Refery <agreements@refery.io>',
      to: [to],
      subject: `Agreement Signed - ${companyName} Recruitment Services Agreement`,
      html: htmlContent,
    })

    if (error) {
      console.error('Failed to send email:', error)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, messageId: data?.id })
  } catch (error) {
    console.error('Error in email API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
