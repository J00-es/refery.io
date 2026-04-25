import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { DashboardNav } from '@/components/dashboard-nav'
import { Suspense } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cookies } from 'next/headers'

// Hardcoded super admins (static - no recreation)
const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Access cookies to ensure dynamic rendering
  await cookies()
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Check if super admin email FIRST - bypass all DB checks
  const isSuperAdminEmail = SUPER_ADMIN_EMAILS.includes(user.email || '')
  
  // Use admin client to bypass RLS for auth checks
  const adminClient = createAdminClient()
  
  // Get user's role and status from database (using admin client to bypass RLS)
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('id, role, full_name, user_id, status')
    .eq('email', user.email)
    .single()
  
  // Check if account is active - redirect to pending approval if not
  // Super admin emails ALWAYS have access regardless of DB status
  if (!isSuperAdminEmail) {
    const accountStatus = adminData?.status || 'pending'
    if (accountStatus !== 'active') {
      redirect('/auth/pending-approval')
    }
  }
  
  // Sync user_id if not set (for users added manually by admin)
  if (adminData && !adminData.user_id) {
    await adminClient
      .from('users_admin')
      .update({ user_id: user.id })
      .eq('id', adminData.id)
  }
  
  const userRole = isSuperAdminEmail 
    ? 'super_admin' 
    : adminData?.role || 'viewer'
  
  const isAdmin = ['super_admin', 'admin'].includes(userRole)
  const fullName = adminData?.full_name || null

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav user={user} isAdmin={!!isAdmin} userRole={userRole} fullName={fullName} />
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Spinner className="h-8 w-8" /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  )
}
