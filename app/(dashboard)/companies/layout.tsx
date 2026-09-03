import { notFound, redirect } from 'next/navigation'
import { COMPANIES_SUPER_ADMIN_ONLY, getAppUser } from '@/lib/current-user'

/**
 * Gate for every /companies route: the directory, a company, the new-company
 * form, the edit form and the by-name view.
 *
 * Same shape as the jobs gate next door, and for the same reason: two of these
 * pages are client components and cannot check a role themselves. 404 rather
 * than 403, so the reply does not confirm the directory is there.
 *
 * The API half is companiesAccessDenied() in lib/admin-auth.ts. Both read
 * COMPANIES_SUPER_ADMIN_ONLY; flip that one flag to open the surface back up.
 */
export default async function CompaniesLayout({ children }: { children: React.ReactNode }) {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  if (COMPANIES_SUPER_ADMIN_ONLY && !appUser.isSuperAdmin) notFound()

  return <>{children}</>
}
