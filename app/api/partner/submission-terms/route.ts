import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import {
  AGREEMENT_VERSIONS,
  PARTNER_SUBMISSION_TERMS_TEXT,
  generateAgreementHash,
} from '@/lib/agreements'
import { SUBMISSION_TERMS_TYPE, getSubmissionTermsStatus } from '@/lib/submission-terms'

export const dynamic = 'force-dynamic'

/** GET: does this partner still owe the Submission Terms, and what do they say. */
export async function GET() {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = await getSubmissionTermsStatus(createAdminClient(), appUser)

  return NextResponse.json({
    ...status,
    version: AGREEMENT_VERSIONS.partnerSubmission,
    content: PARTNER_SUBMISSION_TERMS_TEXT,
  })
}

/** POST: record acceptance. */
export async function POST(request: NextRequest) {
  const appUser = await getAppUser()
  if (!appUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!body?.accepted) {
    return NextResponse.json({ error: 'accepted=true is required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const status = await getSubmissionTermsStatus(admin, appUser)
  if (status.accepted) {
    return NextResponse.json({ ok: true, alreadyAccepted: true })
  }

  const forwardedFor = request.headers.get('x-forwarded-for')
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : request.headers.get('x-real-ip')

  const { error } = await admin.from('agreement_acceptances').insert({
    user_id: appUser.id,
    user_email: appUser.email,
    user_name: appUser.fullName,
    agreement_type: SUBMISSION_TERMS_TYPE,
    agreement_version: AGREEMENT_VERSIONS.partnerSubmission,
    agreement_hash: await generateAgreementHash(PARTNER_SUBMISSION_TERMS_TEXT),
    acceptance_method: 'clickwrap_checkbox_and_button',
    accepted_at: new Date().toISOString(),
    ip_address: ip,
    user_agent: request.headers.get('user-agent'),
  })

  if (error) {
    console.error('[submission-terms] insert failed:', error)
    return NextResponse.json({ error: 'Could not record your acceptance' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
