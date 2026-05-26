/**
 * One-shot backfill for partner sign-ups whose welcome PDF + emails never went
 * out (the @react-pdf/pdfkit footer crash silently aborted PDF generation, so
 * `pdf_url` is NULL and no email was sent).
 *
 * GET /api/admin/backfill-partner-agreement
 *   → reports rows that need backfilling
 *
 * POST /api/admin/backfill-partner-agreement
 *   { "acceptanceId": "..." }   // backfill a single row
 *   { "all": true }             // backfill every partner row with pdf_url IS NULL
 *
 * Admin-gated: only super-admins (lily@10kventures.co) or users_admin rows with
 * role super_admin/admin may call it. Delete this route after the cleanup.
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  generateAgreementHash,
  getAgreementText,
  AGREEMENT_VERSIONS,
  type AgreementType,
} from '@/lib/agreements'
import { generateAgreementPdf } from '@/lib/generate-agreement-pdf'
import { sendPartnerAgreementEmails } from '@/lib/send-agreement-emails'

export const maxDuration = 120

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']
const STORAGE_BUCKET = 'signed-agreements'
const PARTNER_TYPES: AgreementType[] = ['scout', 'recruiter']

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || 'signer'
}

function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'signer'
  )
}

async function requireAdmin() {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 as const }
  if (SUPER_ADMIN_EMAILS.includes(user.email || '')) return { adminClient }
  const { data: adminUser } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user.email)
    .single()
  if (!adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { adminClient }
}

interface PartnerRow {
  id: string
  user_email: string
  user_name: string
  agreement_type: string
  agreement_version: string
  ip_address: string | null
  accepted_at: string
  pdf_url: string | null
}

async function processOne(
  adminClient: ReturnType<typeof createAdminClient>,
  row: PartnerRow,
  origin: string,
) {
  const partnerType = PARTNER_TYPES.find((t) => t === row.agreement_type) ?? null
  if (!partnerType) {
    return { id: row.id, ok: false, reason: `not a partner type (${row.agreement_type})` }
  }

  const content = getAgreementText(partnerType)
  const version = row.agreement_version || AGREEMENT_VERSIONS[partnerType]
  const termsHash = await generateAgreementHash(content)
  const signedAt = row.accepted_at
  const signedAtHuman = new Date(signedAt).toUTCString().replace(' GMT', ' UTC')

  let pdfBuffer: Buffer | null = null
  try {
    pdfBuffer = await generateAgreementPdf({
      kind: 'partner',
      content,
      signerName: row.user_name,
      signerEmail: row.user_email,
      signedAt,
      version,
      termsHash,
      agreementLinkId: row.id,
      ipAddress: row.ip_address,
      partnerType,
    })
  } catch (e) {
    return { id: row.id, ok: false, reason: `pdf-gen: ${(e as Error).message}` }
  }

  const pdfPath = `partner-agreements/signup-${row.id}.pdf`
  const { error: uploadError } = await adminClient.storage
    .from(STORAGE_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: 'application/pdf', upsert: true })
  if (uploadError) {
    return { id: row.id, ok: false, reason: `upload: ${uploadError.message}` }
  }
  await adminClient
    .from('agreement_acceptances')
    .update({ pdf_url: pdfPath })
    .eq('id', row.id)

  const emailRes = await sendPartnerAgreementEmails({
    signerName: row.user_name,
    signerEmail: row.user_email,
    partnerType,
    version,
    signedAtIso: signedAt,
    signedAtHuman,
    ipAddress: row.ip_address,
    termsHash,
    agreementLinkId: row.id,
    adminUrl: `${origin}/dashboard`,
    pdfBuffer,
    pdfFilename: `Refery-Partner-Agreement-${slugifyName(lastName(row.user_name))}.pdf`,
  })

  return {
    id: row.id,
    email: row.user_email,
    ok: emailRes.errors.length === 0,
    signerSent: emailRes.signerSent,
    adminSent: emailRes.adminSent,
    errors: emailRes.errors,
  }
}

export async function GET() {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { data, error } = await gate.adminClient
    .from('agreement_acceptances')
    .select('id, user_email, user_name, agreement_type, agreement_version, ip_address, accepted_at, pdf_url')
    .in('agreement_type', PARTNER_TYPES as unknown as string[])
    .is('pdf_url', null)
    .order('accepted_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pending: data })
}

export async function POST(req: Request) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const body = (await req.json().catch(() => ({}))) as {
    acceptanceId?: string
    all?: boolean
  }
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(req.url).origin

  let rows: PartnerRow[] = []
  if (body.acceptanceId) {
    const { data, error } = await gate.adminClient
      .from('agreement_acceptances')
      .select('id, user_email, user_name, agreement_type, agreement_version, ip_address, accepted_at, pdf_url')
      .eq('id', body.acceptanceId)
      .single()
    if (error || !data) return NextResponse.json({ error: error?.message || 'not found' }, { status: 404 })
    rows = [data as PartnerRow]
  } else if (body.all) {
    const { data, error } = await gate.adminClient
      .from('agreement_acceptances')
      .select('id, user_email, user_name, agreement_type, agreement_version, ip_address, accepted_at, pdf_url')
      .in('agreement_type', PARTNER_TYPES as unknown as string[])
      .is('pdf_url', null)
      .order('accepted_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = (data || []) as PartnerRow[]
  } else {
    return NextResponse.json({ error: 'pass acceptanceId or all:true' }, { status: 400 })
  }

  const results = []
  for (const row of rows) {
    results.push(await processOne(gate.adminClient, row, origin))
  }
  return NextResponse.json({ processed: results.length, results })
}
