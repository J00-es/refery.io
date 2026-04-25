import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { TalentDetailView } from '@/components/talent-detail-view'

export default async function TalentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Check admin access
  const { data: adminData } = await supabase
    .from('users_admin')
    .select('role, status')
    .eq('user_id', user.id)
    .single()

  const isAdmin = adminData?.role === 'super_admin' || adminData?.role === 'admin'
  if (!isAdmin || adminData?.status !== 'active') {
    redirect('/dashboard')
  }

  // Fetch talent
  const { data: talent, error } = await supabase
    .from('prospect_talents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !talent) {
    notFound()
  }

  // Fetch notes
  const { data: notes } = await supabase
    .from('prospect_talent_notes')
    .select('*')
    .eq('talent_id', id)
    .order('created_at', { ascending: false })

  // Fetch stage history
  const { data: stageHistory } = await supabase
    .from('prospect_talent_stage_history')
    .select('*')
    .eq('talent_id', id)
    .order('changed_at', { ascending: false })

  // Fetch potential jobs
  const { data: potentialJobLinks } = await supabase
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
  const { data: allJobs } = await supabase
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
