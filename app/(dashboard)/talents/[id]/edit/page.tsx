import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { EditTalentForm } from '@/components/edit-talent-form'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function EditTalentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Check authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Check authorization
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  
  if (!isSuperAdmin) {
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

  // Fetch talent data using admin client (bypasses RLS)
  const { data: talent, error } = await adminClient
    .from('prospect_talents')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !talent) {
    notFound()
  }

  return <EditTalentForm talent={talent} />
}
