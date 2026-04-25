import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { 
  generateAgreementHash, 
  generateSigningToken, 
  getAgreementText, 
  getAgreementVersion,
  AgreementType 
} from '@/lib/agreements'

// GET - List all agreement links (admin only)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!adminData || !['admin', 'super_admin'].includes(adminData.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const searchParams = request.nextUrl.searchParams
  const recruiterId = searchParams.get('recruiter_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('agreement_links')
    .select('*')
    .order('created_at', { ascending: false })

  if (recruiterId) {
    query = query.eq('recruiter_id', recruiterId)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// POST - Create a new agreement link (admin only)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check admin status
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (!adminData || !['admin', 'super_admin'].includes(adminData.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { recruiter_id, agreement_type } = body as { 
    recruiter_id: string
    agreement_type: AgreementType 
  }

  if (!recruiter_id || !agreement_type) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!['scout', 'recruiter'].includes(agreement_type)) {
    return NextResponse.json({ error: 'Invalid agreement type' }, { status: 400 })
  }

  // Get recruiter info
  const { data: recruiter, error: recruiterError } = await supabase
    .from('prospect_recruiters')
    .select('id, name, email')
    .eq('id', recruiter_id)
    .single()

  if (recruiterError || !recruiter) {
    return NextResponse.json({ error: 'Recruiter not found' }, { status: 404 })
  }

  // Generate agreement details
  const agreementContent = getAgreementText(agreement_type)
  const agreementVersion = getAgreementVersion(agreement_type)
  const agreementHash = await generateAgreementHash(agreementContent)
  const token = generateSigningToken()

  // Create the agreement link
  const { data, error } = await supabase
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
      created_by: user.id,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return the signing URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const signingUrl = `${baseUrl}/sign/agreement/${token}`

  return NextResponse.json({
    ...data,
    signing_url: signingUrl,
  })
}
