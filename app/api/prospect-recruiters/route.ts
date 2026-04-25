import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

// Allowed columns for prospect_recruiters insert/update
const ALLOWED_FIELDS = [
  'name',
  'email',
  'linkedin_url',
  'company',
  'title',
  'location',
  'outreach_status',
  'assessment',
  'notes',
  'source',
  'last_contacted_at',
  'recruiter_type',
  'overview',
  'why_good_fit',
] as const

function sanitizePayload(body: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      clean[key] = body[key]
    }
  }
  return clean
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin access
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    if (!isSuperAdmin) {
      const { data: adminData } = await adminClient
        .from('users_admin')
        .select('role, status')
        .eq('email', user.email)
        .single()

      if (!adminData || adminData.status !== 'active' || !['super_admin', 'admin'].includes(adminData.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const payload = sanitizePayload(body)

    // Default outreach_status to 'prospect' if missing
    if (!payload.outreach_status) {
      payload.outreach_status = 'prospect'
    }

    // Insert the new recruiter using admin client to bypass RLS
    const { data: newRecruiter, error } = await adminClient
      .from('prospect_recruiters')
      .insert({
        ...payload,
        created_by: user.id,
      })
      .select()
      .single()

    if (error) {
      console.error('[v0] Error creating recruiter:', error)
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    // Log initial stage in history (from_status: null, to_status: outreach_status)
    if (newRecruiter) {
      const { error: historyError } = await adminClient
        .from('prospect_recruiter_stage_history')
        .insert({
          recruiter_id: newRecruiter.id,
          from_status: null,
          to_status: payload.outreach_status,
          changed_by: user.id,
        })
      if (historyError) {
        console.error('[v0] Error logging stage history:', historyError)
      }
    }

    return NextResponse.json({ recruiter: newRecruiter })
  } catch (error) {
    console.error('[v0] Error in POST /api/prospect-recruiters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
