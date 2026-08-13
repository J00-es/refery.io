import { notFound, redirect } from 'next/navigation'
import { BRIEFS_SUPER_ADMIN_ONLY, getAppUser } from '@/lib/current-user'
import { BriefReview } from '@/components/briefs/brief-review'

export const dynamic = 'force-dynamic'

export default async function BriefsPage() {
  const appUser = await getAppUser()
  if (!appUser) redirect('/auth/login')
  // Super-admin-only for now — see BRIEFS_SUPER_ADMIN_ONLY.
  if (BRIEFS_SUPER_ADMIN_ONLY && !appUser.isSuperAdmin) notFound()

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header>
        <h1 className="font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[36px]">
          Candidate briefs
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-[#6E6E68] sm:text-[15px]">
          The nightly run drafts a branded brief for each newly graded candidate. Nothing is sent
          until you press Send here.
        </p>
      </header>

      <BriefReview />
    </div>
  )
}
