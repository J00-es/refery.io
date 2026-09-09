import type { Metadata } from 'next'
import { ApplyForm } from '@/components/apply/apply-form'

/**
 * The candidate door. Public, no login, phone first. Reached from
 * refery.io/candidates ("Get matched"), from the quiet second card on an
 * invitation link (?from=<slug>), or directly.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Share your CV · Refery',
  description: 'Tell us once. Hear from us only when something fits. Nothing is shared with a company until you say yes.',
}

export default async function ApplyPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams
  const slug = (from ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 80) || null
  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]">
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-10 sm:pt-14">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></p>
          <span className="text-[12px] text-[#9C9C95]">Private · free for you</span>
        </div>
        <ApplyForm from={slug} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} />
      </div>
    </div>
  )
}
