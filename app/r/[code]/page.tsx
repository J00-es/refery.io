import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveCode } from '@/lib/share-codes'
import { ApplyForm } from '@/components/apply/apply-form'

/**
 * A partner's own door: /r/<code>. The same three steps as /apply, with the
 * partner named, the consent line saying they see the profile, and the row
 * created as theirs. A revoked or unknown code shows the plain door instead,
 * never an error that says which.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Share your CV · Refery',
  description: 'Tell us once. Hear from us only when something fits. Nothing is shared with a company until you say yes.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function ReferralPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const admin = createAdminClient()
  const resolved = await resolveCode(admin, code)
  let referrer: { code: string; firstName: string; fullName: string } | null = null
  if (resolved) {
    const { data: u } = await admin.from('users_admin').select('full_name, status').eq('user_id', resolved.userId).maybeSingle()
    const full = ((u?.full_name as string | null) ?? '').trim()
    if (u?.status === 'active' && full) referrer = { code: resolved.code, firstName: full.split(/\s+/)[0], fullName: full }
  }
  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]" style={{ colorScheme: 'light' }}>
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-10 sm:pt-14">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></p>
          <span className="text-[12px] text-[#9C9C95]">Private · free for you</span>
        </div>
        {!referrer && (
          <p className="mb-4 rounded-[14px] border border-[#E4D9B8] bg-[#FFF8EC] px-4 py-3 text-[13px] text-[#2A2A26]">This link is no longer active, but the door is the same: share your CV below and it reaches Lily directly.</p>
        )}
        <ApplyForm from={null} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} referrer={referrer} />
      </div>
    </div>
  )
}
