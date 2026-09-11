import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { StopButton } from '@/components/candidates/stop-button'

export const metadata: Metadata = { title: 'Stop email from Refery', robots: { index: false, follow: false } }

/**
 * The footer link under every partner message. A GET only shows the page;
 * the button posts, so a mail scanner that prefetches links cannot opt
 * someone out by accident.
 */
export default async function StopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const valid = /^[a-f0-9]{32}$/.test(token)
  const { data: state } = valid ? await admin.from('candidate_contact_state').select('candidate_id, opted_out_at').eq('opt_out_token', token).maybeSingle() : { data: null }

  return (
    <main className="mx-auto max-w-[520px] px-5 py-16 text-[#161613]">
      <p className="text-[18px] font-semibold">
        Refery<span className="text-[#1F3A2F]">.</span>
      </p>
      {!state ? (
        <>
          <h1 className="mt-6 text-[24px] font-semibold leading-tight">This link is not valid</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#6E6E68]">Write to lily@refery.io and we will sort it by hand.</p>
        </>
      ) : state.opted_out_at ? (
        <>
          <h1 className="mt-6 text-[24px] font-semibold leading-tight">Done. No more email from Refery.</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#6E6E68]">Nobody on Refery can write to you through the platform any more, and your profile is not matched to any search. Change your mind: lily@refery.io.</p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-[24px] font-semibold leading-tight">Stop email from Refery?</h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-[#6E6E68]">
            One tap and nobody can write to you through Refery again, and your profile is taken out of every search. The person who wrote to you can still reach you from their own inbox; that is between the two of you.
          </p>
          <StopButton token={token} />
        </>
      )}
    </main>
  )
}
