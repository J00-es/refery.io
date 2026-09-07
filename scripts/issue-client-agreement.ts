/**
 * Issues a client agreement signing link headlessly, exactly as
 * POST /api/agreements/client/create does from the app, for a session that has
 * no browser login (a script, a brief being assembled).
 *
 *   npx tsx scripts/issue-client-agreement.ts <company_id> [fee_percent] [recipient name] [recipient email]
 *
 * Leaving the recipient blank issues an open link: whoever has signing
 * authority fills in their own name and email at signing time.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  DEFAULT_CLIENT_TERMS,
  clientAgreementVersion,
  generateAgreementHash,
  generateClientAgreementText,
  generateSigningToken,
} from '../lib/agreements'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const LILY = '864aa3a4-f9e0-49c6-a35a-7ca02ffe04a7'
const LINK_TTL_DAYS = 30

async function main() {
  const [companyId, feeArg, recipientName, recipientEmail] = process.argv.slice(2)
  if (!companyId) throw new Error('company_id is required')
  const feePercent = feeArg ? Number(feeArg) : DEFAULT_CLIENT_TERMS.feePercentage
  if (!Number.isFinite(feePercent) || feePercent < 1 || feePercent > 50) throw new Error('fee must be 1 to 50')

  const { data: company, error: cErr } = await db.from('companies').select('id, name').eq('id', companyId).single()
  if (cErr || !company) throw new Error(`company not found: ${cErr?.message}`)

  const paymentTiming = 'net30' as const
  const content = generateClientAgreementText(company.name, { feePercent, paymentTiming })
  const hash = await generateAgreementHash(content)
  const token = generateSigningToken()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + LINK_TTL_DAYS * 24 * 60 * 60 * 1000)

  const { data: link, error } = await db
    .from('client_agreement_links')
    .insert({
      token,
      company_id: company.id,
      company_name: company.name,
      recipient_name: recipientName || null,
      recipient_email: recipientEmail || null,
      agreement_version: clientAgreementVersion(paymentTiming),
      agreement_hash: hash,
      agreement_content: content,
      fee_percentage: feePercent,
      payment_window_days: DEFAULT_CLIENT_TERMS.paymentWindowDays,
      late_fee_percentage: DEFAULT_CLIENT_TERMS.lateFeePct,
      guarantee_days: DEFAULT_CLIENT_TERMS.guaranteeDays,
      intro_validity_months: DEFAULT_CLIENT_TERMS.introValidityMonths,
      status: 'sent',
      created_by: LILY,
      sent_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token, expires_at')
    .single()
  if (error || !link) throw new Error(`insert failed: ${error?.message}`)

  await db.from('client_agreement_events').insert({
    link_id: link.id,
    company_id: company.id,
    event_type: 'created',
    metadata: { version: clientAgreementVersion(paymentTiming), fee_percent: feePercent, open_link: !recipientName && !recipientEmail, issued_by: 'scripts/issue-client-agreement.ts' },
  })

  console.log(JSON.stringify({ id: link.id, sign_url: `https://refery.xyz/sign/client-agreement/${link.token}`, expires_at: link.expires_at, version: clientAgreementVersion(paymentTiming), fee_percent: feePercent }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
