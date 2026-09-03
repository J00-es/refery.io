import { notFound, redirect } from 'next/navigation'
import { JOBS_SUPER_ADMIN_ONLY, getAppUser } from '@/lib/current-user'

/**
 * Gate for every /jobs route: the board, a role, the new-role form, the edit form.
 *
 * It lives in the layout rather than in each page because two of the four job
 * pages are client components and cannot run a server-side role check of their
 * own. 404 rather than 403, so the reply does not confirm the board is there.
 *
 * The API half is jobsAccessDenied() in lib/admin-auth.ts. Both read
 * JOBS_SUPER_ADMIN_ONLY; flip that one flag to open the surface back up.
 */
export default async function JobsLayout({ children }: { children: React.ReactNode }) {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  if (JOBS_SUPER_ADMIN_ONLY && !appUser.isSuperAdmin) notFound()

  return <>{children}</>
}
