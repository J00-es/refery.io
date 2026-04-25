import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

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
    
    // Insert the new recruiter using admin client to bypass RLS
    const { data: newRecruiter, error } = await adminClient
      .from('prospect_recruiters')
      .insert({
        name: body.name,
        email: body.email,
        company: body.company,
        linkedin_url: body.linkedin_url,
        stage: body.stage || 'new',
        source: body.source,
        notes: body.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating recruiter:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Log initial stage in history
    if (newRecruiter) {
      await adminClient
        .from('prospect_recruiter_stage_history')
        .insert({
          recruiter_id: newRecruiter.id,
          from_stage: null,
          to_stage: body.stage || 'new',
          changed_by: user.id,
          changed_at: new Date().toISOString(),
        })
    }

    return NextResponse.json({ recruiter: newRecruiter })
  } catch (error) {
    console.error('Error in POST /api/prospect-recruiters:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
