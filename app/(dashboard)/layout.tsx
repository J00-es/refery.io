import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { DashboardNav } from '@/components/dashboard-nav'
import { Suspense } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { cookies } from 'next/headers'

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

  // Resolves the users_admin row by normalized email, links a dangling
  // user_id, and self-heals a missing row. Super admins bypass the DB status.
  const appUser = await getAppUser()

  if (!appUser?.isActive) {
    redirect('/auth/pending-approval')
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav
        user={user}
        isAdmin={appUser.isAdmin}
        isBeta={appUser.isBeta}
        userRole={appUser.role}
        fullName={appUser.fullName}
      />
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8">
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Spinner className="h-8 w-8" /></div>}>
          {children}
        </Suspense>
      </main>
    </div>
  )
}
