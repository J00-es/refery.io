import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { AGREEMENT_VERSIONS } from '@/lib/agreements'
import { firmsEnabled, getMembership } from '@/lib/firms'
import { CreateFirmForm } from '@/components/firms/create-firm-form'

/**
 * Turning an account into a firm.
 *
 * Deliberately a step after sign-up rather than a fork inside it. The signer
 * already has an account by the time they do this, which is what lets their
 * acceptance be recorded against a real person, and it keeps the sign-up flow
 * that 80 solo partners use completely untouched.
 */

export const dynamic = 'force-dynamic'

export default async function NewFirmPage() {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  if (!firmsEnabled(appUser)) notFound()

  const admin = createAdminClient()
  const membership = await getMembership(admin, appUser.id)
  if (membership) redirect('/firm/members')

  return (
    <div className="mx-auto max-w-[640px] space-y-6 px-1 pb-16 sm:px-0">
      <header>
        <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-[#161613] sm:text-[34px]">
          Work as a firm
        </h1>
        <p className="mt-2 text-[14px] text-[#6E6E68] sm:text-[15px]">
          One person accepts for the company, colleagues join without negotiating anything, and the
          firm holds the submissions and gets paid.
        </p>
      </header>

      <CreateFirmForm
        versions={{
          partner: AGREEMENT_VERSIONS.partner,
          submission: AGREEMENT_VERSIONS.partnerSubmission,
          addendum: AGREEMENT_VERSIONS.firmAddendum,
        }}
      />
    </div>
  )
}
