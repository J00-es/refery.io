import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProspectList } from '@/components/prospect-list'

export const metadata = {
  title: 'Recruiters | Refery',
  description: 'Manage prospect recruiters',
}

export default async function RecruitersPage() {
  const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']
  
  const supabase = await createClient()
  const adminClient = createAdminClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Check if user is admin - super admins have full access
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
  
  if (!isSuperAdmin) {
    // Query by email (more reliable - user_id may not be synced yet)
    const { data: adminData } = await adminClient
      .from('users_admin')
      .select('role, status')
      .eq('email', user.email)
      .single()

    if (!adminData || adminData.status !== 'active') {
      redirect('/auth/pending-approval')
    }

    // Only super_admin and admin can access this page
    if (!['super_admin', 'admin'].includes(adminData.role)) {
      redirect('/dashboard')
    }
  }

  // Use admin client for super admins to bypass RLS, regular client for others
  const dbClient = isSuperAdmin ? adminClient : supabase

  // Fetch prospect recruiters
  let recruiters: any[] = []
  try {
    const { data, error } = await dbClient
      .from('prospect_recruiters')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) {
      console.error('Error fetching recruiters:', error)
    } else {
      recruiters = data || []
    }
  } catch (e) {
    console.error('Exception fetching recruiters:', e)
  }

  // Fetch all users to check for matches
  const { data: allUsers } = await dbClient
    .from('users_admin')
    .select('*')
  
  const matchedUsers: Record<string, any> = {}
  if (allUsers) {
    allUsers.forEach(u => {
      if (u.email) matchedUsers[u.email] = u
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recruiters</h1>
        <p className="text-muted-foreground">
          Track and manage prospect recruiters who are not yet part of Refery
        </p>
      </div>

      <ProspectList 
        type="recruiter" 
        data={recruiters}
        matchedUsers={matchedUsers}
      />
    </div>
  )
}
