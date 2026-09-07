import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { firmsEnabled, getMembership } from '@/lib/firms'

/**
 * One address for "my firm", whether or not you have one yet.
 *
 * The nav needs a single href, but the right destination depends on state the
 * nav cannot see without a query on every page load. So the link is dumb and
 * this page does the deciding: set one up, or go and run the one you have.
 */

export const dynamic = 'force-dynamic'

export default async function FirmIndexPage() {
  const appUser = await getAppUser()
  // Somebody arriving from the guide with no account wants to sign up, not to
  // log in to one they do not have.
  if (!appUser) redirect('/auth/sign-up')
  if (!firmsEnabled(appUser)) notFound()

  const membership = await getMembership(createAdminClient(), appUser.id)
  redirect(membership ? '/firm/members' : '/firm/new')
}
