import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateAgreementHash,
  generateSigningToken,
  getAgreementText,
  getAgreementVersion,
  AgreementType,
} from '@/lib/agreements'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

async function checkAdminAccess() {
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      adminClient,
      userId: null,
    }
  }

  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

  if (!isSuperAdmin) {
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role')
      .eq('email', user.email)
      .single()

    if (!adminData || !['admin', 'super_admin'].includes(adminData.role)) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        adminClient,
        userId: user.id,
      }
    }
  }

  return {
    ok: true,
    response: null,
    adminClient,
    userId: user.id,
  }
}

// GET - List all agreement links (admin only)
export async function GET(request: NextRequest) {
  const auth = await checkAdminAccess()
  if (!auth.ok) {
    return auth.response
  }

  const searchParams = request.nextUrl.searchParams
  const recruiterId = searchParams.get('recruiter_id')
  const status = searchParams.get('status')

  let query = auth.adminClient
    .from('agreement_links')
    .select('*')
    .order('created_at', { ascending: false })

  if (recruiterId) query = query.eq('recruiter_id', recruiterId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    console.error('[agreements/links GET] query failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Create a new agreement link (admin only)
export async function POST(request: NextRequest) {
  const auth = await checkAdminAccess()
  if (!auth.ok) {
    return auth.response
  }

  let body: { recruiter_id?: string; agreement_type?: AgreementType }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { recruiter_id, agreement_type } = body

  if (!recruiter_id || !agreement_type) {
    return NextResponse.json(
      { error: 'recruiter_id and agreement_type are required' },
      { status: 400 },
    )
  }

  if (!['scout', 'recruiter'].includes(agreement_type)) {
    return NextResponse.json(
      { error: 'agreement_type must be "scout" or "recruiter"' },
      { status: 400 },
    )
  }

  // Get recruiter info using admin client
  const { data: recruiter, error: recruiterError } = await auth.adminClient
    .from('prospect_recruiters')
    .select('id, name, email')
    .eq('id', recruiter_id)
    .maybeSingle()

  if (recruiterError) {
    console.error('[agreements/links POST] recruiter lookup failed:', recruiterError)
    return NextResponse.json({ error: recruiterError.message }, { status: 500 })
  }

  if (!recruiter) {
    return NextResponse.json({ error: 'Recruiter not found' }, { status: 404 })
  }

  // Generate agreement details
  const agreementContent = getAgreementText(agreement_type)
  const agreementVersion = getAgreementVersion(agreement_type)
  const agreementHash = await generateAgreementHash(agreementContent)
  const token = generateSigningToken()

  // Default link expiry: 30 days from now
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // Create the agreement link
  const { data, error } = await auth.adminClient
    .from('agreement_links')
    .insert({
      token,
      recruiter_id,
      recruiter_name: recruiter.name,
      recruiter_email: recruiter.email,
      agreement_type,
      agreement_version: agreementVersion,
      agreement_hash: agreementHash,
      agreement_content: agreementContent,
      status: 'sent',
      expires_at: expiresAt,
      created_by: auth.userId,
    })
    .select()
    .single()

  if (error) {
    console.error('[agreements/links POST] insert failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Build the signing URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const signingUrl = `${baseUrl}/sign/agreement/${token}`

  return NextResponse.json({
    ...data,
    signing_url: signingUrl,
  })
}