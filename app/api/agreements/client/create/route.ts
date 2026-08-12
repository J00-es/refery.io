import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import {
  ClientPaymentTiming,
  DEFAULT_CLIENT_TERMS,
  clientAgreementVersion,
  generateAgreementHash,
  generateClientAgreementText,
  generateSigningToken,
} from '@/lib/agreements'
import { logAgreementEvent } from '@/lib/agreement-events'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']
const LINK_TTL_DAYS = 30

export const dynamic = 'force-dynamic'

interface CreateBody {
  company_id?: string
  recipient_name?: string
  recipient_email?: string
  fee_percent?: number
  payment_timing?: ClientPaymentTiming
}

function isValidEmail(s: string): boolean {
  return /\S+@\S+\.\S+/.test(s)
}

export async function POST(request: NextRequest) {
  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const companyId = (body.company_id || '').trim()
  // Recipient is optional. Leaving both blank issues an "open" link: whoever
  // has signing authority fills in their own name and email at signing time,
  // so a link never has to be reissued because the signer changed.
  const recipientName = (body.recipient_name || '').trim() || null
  const recipientEmail = (body.recipient_email || '').trim() || null
  const feePercent =
    body.fee_percent !== undefined && body.fee_percent !== null
      ? Number(body.fee_percent)
      : DEFAULT_CLIENT_TERMS.feePercentage

  if (!companyId) {
    return NextResponse.json({ error: 'company_id is required' }, { status: 400 })
  }
  if (recipientEmail && !isValidEmail(recipientEmail)) {
    return NextResponse.json({ error: 'Invalid recipient_email' }, { status: 400 })
  }
  if (
    !Number.isFinite(feePercent) ||
    feePercent < 1 ||
    feePercent > 50
  ) {
    return NextResponse.json(
      { error: 'fee_percent must be a number between 1 and 50' },
      { status: 400 },
    )
  }

  const paymentTiming: ClientPaymentTiming = body.payment_timing ?? 'net10'
  if (!['start', 'day90', 'net10'].includes(paymentTiming)) {
    return NextResponse.json(
      { error: "payment_timing must be 'net10', 'day90', or 'start'" },
      { status: 400 },
    )
  }

  // Admin gate: super-admin email or users_admin.role in (super_admin, admin)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  let isAdmin = isSuperAdmin
  if (!isAdmin) {
    const { data: adminRow } = await supabase
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()
    isAdmin = !!adminRow && ['super_admin', 'admin'].includes(adminRow.role)
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Resolve company name (also acts as existence check).
  const adminClient = createAdminClient()
  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single()

  if (companyError || !company) {
    return NextResponse.json({ error: 'Company not found' }, { status: 404 })
  }

  const content = generateClientAgreementText(company.name, { feePercent, paymentTiming })
  const hash = await generateAgreementHash(content)
  const token = generateSigningToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { data: link, error: insertError } = await adminClient
    .from('client_agreement_links')
    .insert({
      token,
      company_id: company.id,
      company_name: company.name,
      recipient_name: recipientName,
      recipient_email: recipientEmail,
      agreement_version: clientAgreementVersion(paymentTiming),
      agreement_hash: hash,
      agreement_content: content,
      fee_percentage: feePercent,
      // On the deferred models this counts business days from day 90, not
      // calendar days from the start date — the agreement text is the authority.
      payment_window_days:
        paymentTiming === 'day90' ? 14 : paymentTiming === 'net10' ? 10 : DEFAULT_CLIENT_TERMS.paymentWindowDays,
      late_fee_percentage: DEFAULT_CLIENT_TERMS.lateFeePct,
      guarantee_days: DEFAULT_CLIENT_TERMS.guaranteeDays,
      intro_validity_months: DEFAULT_CLIENT_TERMS.introValidityMonths,
      status: 'sent',
      created_by: user.id,
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token, expires_at')
    .single()

  if (insertError || !link) {
    console.error('[agreements/client/create] insert failed:', insertError)
    return NextResponse.json(
      { error: 'Failed to create agreement link', details: insertError?.message },
      { status: 500 },
    )
  }

  await logAgreementEvent(adminClient, {
    linkId: link.id,
    companyId: company.id,
    eventType: 'created',
    metadata: {
      version: clientAgreementVersion(paymentTiming),
      fee_percent: feePercent,
      open_link: !recipientName && !recipientEmail,
    },
  })

  const origin = request.nextUrl.origin
  return NextResponse.json({
    id: link.id,
    token: link.token,
    sign_url: `${origin}/sign/client-agreement/${link.token}`,
    expires_at: link.expires_at,
  })
}
