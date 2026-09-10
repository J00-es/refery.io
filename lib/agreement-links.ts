/**
 * Issuing a client agreement link from code, the same way the admin route does
 * it, so onboarding can hand a founder a signable link without a browser.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AGREEMENT_VERSIONS,
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
    /** Minimum for Head/Director/VP/C-suite and Staff/Principal hires. Turns the document into v2.9. */
    leadershipFeePercent?: number | null
    /** Readable alias: /sign/<shortSlug>. */
    shortSlug?: string | null
    /** Per-client copy on the sign page: { from_lily, leadership }. */
    pageNotes?: Record<string, string> | null
    /** The signer types the legal entity they sign for; the document is bound to it. */
    entityEditable?: boolean
    paymentTiming?: ClientPaymentTiming
    recipientName?: string | null
    recipientEmail?: string | null
    createdBy: string
  },
): Promise<{ id: string; url: string; expiresAt: string; version: string }> {
  const feePercent = input.feePercent ?? DEFAULT_CLIENT_TERMS.feePercentage
  const timing = input.paymentTiming ?? 'net30'
  const leadership = input.leadershipFeePercent && input.leadershipFeePercent > 0 ? input.leadershipFeePercent : null
  const version = leadership && timing === 'net30' ? AGREEMENT_VERSIONS.clientTiered : clientAgreementVersion(timing)
  const content = generateClientAgreementText(input.companyName, { feePercent, paymentTiming: timing, leadershipFeePercent: leadership })
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
      agreement_version: version,
      agreement_hash: hash,
      agreement_content: content,
      fee_percentage: feePercent,
      fee_options: input.feeOptions && input.feeOptions.length >= 2 ? input.feeOptions : null,
      leadership_fee_percentage: leadership,
      short_slug: input.shortSlug ?? null,
      page_notes: input.pageNotes ?? null,
      entity_editable: input.entityEditable === true,
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
    metadata: { version, fee_percent: feePercent, fee_options: input.feeOptions ?? null, leadership_fee_percent: leadership, open_link: !input.recipientName && !input.recipientEmail, issued_by: 'onboarding' },
  })

  const url = input.shortSlug ? `${APP_URL}/sign/${input.shortSlug}` : `${APP_URL}/sign/client-agreement/${data.token}`
  return { id: data.id as string, url, expiresAt: data.expires_at as string, version }
}
