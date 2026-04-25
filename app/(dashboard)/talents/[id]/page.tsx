import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TalentDetailView } from '@/components/talent-detail-view'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function TalentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // SUPER ADMINS BYPASS ALL CHECKS - check email first
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

  if (!isSuperAdmin) {
    // For non-super admins, check role by EMAIL (not user_id!)
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role, status')
      .eq('email', user.email)
      .single()

    if (!adminData || adminData.status !== 'active') {
      redirect('/auth/pending-approval')
    }

    if (!['super_admin', 'admin'].includes(adminData.role)) {
      redirect('/dashboard')
    }
  }

  // Use admin client for ALL data fetches to bypass RLS
  const { data: talent, error } = await adminClient
    .from('prospect_talents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !talent) {
    notFound()
  }

  // Fetch notes
  const { data: notes } = await adminClient
    .from('prospect_talent_notes')
    .select('*')
    .eq('talent_id', id)
    .order('created_at', { ascending: false })

  // Fetch stage history
  const { data: stageHistory } = await adminClient
    .from('prospect_talent_stage_history')
    .select('*')
    .eq('talent_id', id)
    .order('changed_at', { ascending: false })

  // Fetch potential jobs
  const { data: potentialJobLinks } = await adminClient
    .from('prospect_talent_potential_jobs')
    .select('*, jobs(*)')
    .eq('talent_id', id)
    .order('added_at', { ascending: false })

  const potentialJobs = potentialJobLinks?.map(link => ({
    ...link.jobs,
    added_at: link.added_at,
    link_id: link.id
  })) || []

  // Fetch all open jobs for adding
  const { data: allJobs } = await adminClient
    .from('jobs')
    .select('id, title, company_name, location')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  return (
    <TalentDetailView 
      talent={talent}
      notes={notes || []}
      stageHistory={stageHistory || []}
      potentialJobs={potentialJobs}
      allJobs={allJobs || []}
    />
  )
}
