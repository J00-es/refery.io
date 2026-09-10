/**
 * Issuing a client agreement link from code, the same way the admin route does
 * it, so onboarding can hand a founder a signable link without a browser.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_CLIENT_TERMS,
  clientAgreementVersion,
  generateAgreementHash,
  generateClientAgreementText,
  generateSigningToken,
  type ClientPaymentTiming,
} from '@/lib/agreements'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const LINK_TTL_DAYS = 30

export async function issueClientAgreementLink(
  admin: SupabaseClient,
  input: {
    companyId: string
    companyName: string
    feePercent?: number
    /** Fee plans the signer may pick from on the sign page; feePercent is then the recommended default. */
    feeOptions?: number[]
    paymentTiming?: ClientPaymentTiming
    recipientName?: string | null
    recipientEmail?: string | null
    createdBy: string
  },
): Promise<{ id: string; url: string; expiresAt: string; version: string }> {
  const feePercent = input.feePercent ?? DEFAULT_CLIENT_TERMS.feePercentage
  const timing = input.paymentTiming ?? 'net30'
  const content = generateClientAgreementText(input.companyName, { feePercent, paymentTiming: timing })
  const hash = await generateAgreementHash(content)
  const token = generateSigningToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { data, error } = await admin
    .from('client_agreement_links')
    .insert({
      token,
      company_id: input.companyId,
      company_name: input.companyName,
      recipient_name: input.recipientName ?? null,
      recipient_email: input.recipientEmail ?? null,
      agreement_version: clientAgreementVersion(timing),
      agreement_hash: hash,
      agreement_content: content,
      fee_percentage: feePercent,
      fee_options: input.feeOptions && input.feeOptions.length >= 2 ? input.feeOptions : null,
      payment_window_days: timing === 'day90' ? 14 : timing === 'net10' ? 10 : DEFAULT_CLIENT_TERMS.paymentWindowDays,
      late_fee_percentage: DEFAULT_CLIENT_TERMS.lateFeePct,
      guarantee_days: DEFAULT_CLIENT_TERMS.guaranteeDays,
      intro_validity_months: DEFAULT_CLIENT_TERMS.introValidityMonths,
      status: 'sent',
      created_by: input.createdBy,
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token, expires_at')
    .single()
  if (error || !data) throw new Error(`agreement link: ${error?.message ?? 'insert failed'}`)

  await admin.from('client_agreement_events').insert({
    link_id: data.id,
    company_id: input.companyId,
    event_type: 'created',
    metadata: { version: clientAgreementVersion(timing), fee_percent: feePercent, fee_options: input.feeOptions ?? null, open_link: !input.recipientName && !input.recipientEmail, issued_by: 'onboarding' },
  })

  return { id: data.id as string, url: `${APP_URL}/sign/client-agreement/${data.token}`, expiresAt: data.expires_at as string, version: clientAgreementVersion(timing) }
}
