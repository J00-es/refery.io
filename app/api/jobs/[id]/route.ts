import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jobsAccessDenied } from '@/lib/admin-auth'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

// Helper to check if user can edit a job
async function canEditJob(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, userEmail: string, jobId: string): Promise<boolean> {
  // Check if super admin
  if (SUPER_ADMIN_EMAILS.includes(userEmail)) {
    return true
  }

  // Get user role
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role')
    .eq('email', userEmail)
    .single()

  const userRole = adminData?.role || 'viewer'

  // Admins can edit all jobs
  if (userRole === 'admin') {
    return true
  }

  // Get job to check ownership
  const { data: job } = await supabase
    .from('jobs')
    .select('owner_user_id, created_by_user_id')
    .eq('id', jobId)
    .single()

  if (!job) return false

  // Owner or creator can edit
  return job.owner_user_id === userId || job.created_by_user_id === userId
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await jobsAccessDenied()
  if (denied) return denied
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw error
    }

    // Check if user can edit this job
    const canEdit = await canEditJob(supabase, user.id, user.email || '', id)

    return NextResponse.json({ job, canEdit })
  } catch (error) {
    console.error('Error fetching job:', error)
    return NextResponse.json({ error: 'Failed to fetch job' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await jobsAccessDenied()
  if (denied) return denied
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permission
    const canEdit = await canEditJob(supabase, user.id, user.email || '', id)
    if (!canEdit) {
      return NextResponse.json({ error: 'You do not have permission to edit this job. Only admins, super admins, or the job owner can edit.' }, { status: 403 })
    }

    const body = await request.json()

    const { data: job, error } = await supabase
      .from('jobs')
      .update({
        ...body,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ job })
  } catch (error) {
    console.error('Error updating job:', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await jobsAccessDenied()
  if (denied) return denied
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check permission
    const canEdit = await canEditJob(supabase, user.id, user.email || '', id)
    if (!canEdit) {
      return NextResponse.json({ error: 'You do not have permission to delete this job. Only admins, super admins, or the job owner can delete.' }, { status: 403 })
    }

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting job:', error)
    return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
  }
}
