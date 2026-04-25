import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

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
    if (key in body) clean[key] = body[key]
  }
  return clean
}

type SupabaseClient = ReturnType<typeof createAdminClient>

async function verifyAdmin(supabase: Awaited<ReturnType<typeof createClient>>, adminClient: SupabaseClient) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, allowed: false }

  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  if (isSuperAdmin) return { user, allowed: true }

  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role, status')
    .eq('email', user.email)
    .single()

  const allowed = !!adminData && adminData.status === 'active' && ['super_admin', 'admin'].includes(adminData.role)
  return { user, allowed }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { user, allowed } = await verifyAdmin(supabase, adminClient)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const payload = sanitizePayload(body)

    const { data: existing } = await adminClient
      .from('prospect_recruiters')
      .select('outreach_status')
      .eq('id', id)
      .single()

    const { data: updated, error } = await adminClient
      .from('prospect_recruiters')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[v0] Error updating recruiter:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (payload.outreach_status && existing && existing.outreach_status !== payload.outreach_status) {
      await adminClient.from('prospect_recruiter_stage_history').insert({
        recruiter_id: id,
        from_status: existing.outreach_status,
        to_status: payload.outreach_status,
        changed_by: user.id,
      })
    }

    return NextResponse.json({ recruiter: updated })
  } catch (error) {
    console.error('[v0] Error in PATCH /api/prospect-recruiters/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const adminClient = createAdminClient()

    const { user, allowed } = await verifyAdmin(supabase, adminClient)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await adminClient.from('prospect_recruiters').delete().eq('id', id)
    if (error) {
      console.error('[v0] Error deleting recruiter:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[v0] Error in DELETE /api/prospect-recruiters/[id]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
