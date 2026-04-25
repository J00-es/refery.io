import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { type, verdict } = await request.json()

    // Validate verdict type
    if (!['recruiter', 'lily'].includes(type)) {
      return NextResponse.json({ error: 'Invalid verdict type' }, { status: 400 })
    }

    // Validate verdict value
    const validVerdicts = ['very_strong', 'strong', 'moderate', 'weak', 'pass', null]
    if (!validVerdicts.includes(verdict)) {
      return NextResponse.json({ error: 'Invalid verdict value' }, { status: 400 })
    }

    // Check permissions - lily verdict can only be set by super admin
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (type === 'lily' && !isSuperAdmin) {
      return NextResponse.json({ 
        error: 'Only super admin can set Lily verdict' 
      }, { status: 403 })
    }

    // For recruiter verdict, check if user has permission (admin, recruiter, scout)
    if (type === 'recruiter' && !isSuperAdmin) {
      const { data: adminData } = await supabase
        .from('users_admin')
        .select('role')
        .eq('email', user.email)
        .single()

      const userRole = adminData?.role || 'viewer'
      const canSetRecruiterVerdict = ['admin', 'recruiter', 'scout'].includes(userRole)

      if (!canSetRecruiterVerdict) {
        return NextResponse.json({ 
          error: 'You do not have permission to set recruiter verdict' 
        }, { status: 403 })
      }
    }

    // Update the appropriate verdict field
    const updateField = type === 'lily' ? 'lily_verdict' : 'recruiter_verdict'
    
    const { data, error } = await supabase
      .from('candidates')
      .update({ 
        [updateField]: verdict,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error updating verdict:', error)
    return NextResponse.json({ error: 'Failed to update verdict' }, { status: 500 })
  }
}
