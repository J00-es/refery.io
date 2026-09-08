import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveFee, payoutAmount, feeExplanation } from '@/lib/fees'
import { WhoAreYou } from '@/components/onboarding/who-are-you'

export const dynamic = 'force-dynamic'

/**
 * The campaign page behind a universal link in a mass LinkedIn DM.
 *
 * One anonymised search, how it works in three lines, and a who-are-you step.
 * Anyone can open the link, so the page decides nothing by itself: a person
 * on the campaign's audience list goes straight to account setup, already
 * approved; anyone else becomes a normal application for Lily to read.
 */
export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const admin = createAdminClient()
  const { data: campaign } = await admin.from('outbound_campaigns').select('*').eq('slug', slug).maybeSingle()
  if (!campaign) notFound()

  const closed = campaign.active_to && new Date(campaign.active_to as string).getTime() < Date.now()
  const { data: role } = await admin.from('partner_roles_v').select('*').eq('job_id', campaign.job_id).maybeSingle()
  const live = role && role.is_live && role.job_status === 'open'
  const fee = role ? resolveFee(role) : null

  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]">
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-10 sm:pt-14">
        <p className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></p>

        <section className="mt-8">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.02em]">{campaign.sender_name} sent you here.</h1>
          <p className="mt-2 text-[14px] text-[#6E6E68]">One of the searches we&rsquo;re working on right now, what you&rsquo;d do, and how to join. About four minutes.</p>
        </section>

        {live && role ? (
          <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[16px] font-semibold leading-tight">{role.headline || role.title}</p>
                {role.location && <p className="mt-0.5 text-[12.5px] text-[#9C9C95]">{role.location}</p>}
              </div>
              {role.priority === 'urgent' && <span className="shrink-0 rounded-full bg-[#FBEDEB] px-2.5 py-0.5 text-[12px] font-semibold text-[#A3423A]">Hiring now</span>}
            </div>
            <p className="mt-3 text-[13px] text-[#2A2A26]">{campaign.summary}</p>
            {fee && (
              <p className="mt-3 text-[12.5px]">
                <span className="font-semibold text-[#1F3A2F]">{payoutAmount(fee) ? `${payoutAmount(fee)} to you on a placement` : `${fee.scoutSharePercentage}% of the fee to you`}</span>
                <span className="text-[#9C9C95]"> · {feeExplanation(fee)}</span>
              </p>
            )}
            <p className="mt-3 text-[12px] text-[#9C9C95]">The company&rsquo;s name and the full brief open after the partner terms. Every client has a confidentiality agreement with us.</p>
          </section>
        ) : (
          <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
            <p className="text-[14px] font-semibold">That search has filled since the message went out.</p>
            <p className="mt-1 text-[13px] text-[#6E6E68]">There are usually others in the same cities and functions. Tell us who you are below and we&rsquo;ll point you at the closest one.</p>
          </section>
        )}

        <section className="mt-4 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
          <p className="text-[13px] font-semibold">How it works</p>
          <dl className="mt-2 grid gap-1.5 text-[12.5px] text-[#2A2A26]">
            <div className="flex gap-3"><dt className="w-11 shrink-0 font-semibold">You</dt><dd>Ask a person you&rsquo;d vouch for, then send their CV as a PDF with a few lines on why.</dd></div>
            <div className="flex gap-3"><dt className="w-11 shrink-0 font-semibold">Refery</dt><dd>Reads them within two working days, talks to them, runs the process with the startup.</dd></div>
            <div className="flex gap-3"><dt className="w-11 shrink-0 font-semibold">Paid</dt><dd>70% of the fee once they&rsquo;ve passed 90 days and the client has paid. Nothing upfront on either side.</dd></div>
          </dl>
          <p className="mt-2 text-[12.5px] text-[#6E6E68]">No minimum volume, no hours, no exclusivity. <Link href="/partner-terms" className="font-semibold text-[#1F3A2F] underline underline-offset-2">The full terms</Link></p>
        </section>

        {closed ? (
          <p className="mt-5 rounded-[14px] border border-[#E4D9B8] bg-[#FFF8EC] px-4 py-3 text-[13px]">This link has closed. If you&rsquo;d still like to join, apply at <a href="https://refery.io/join-as-scout" className="font-semibold underline underline-offset-2">refery.io/join-as-scout</a>.</p>
        ) : (
          <WhoAreYou slug={slug} senderName={campaign.sender_name as string} />
        )}

        <section className="mt-6 flex items-center justify-between gap-3 rounded-[14px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
          <div>
            <p className="text-[13px] font-semibold">Prefer to talk it through first?</p>
            <p className="text-[12.5px] text-[#6E6E68]">Lily, Refery&rsquo;s founder, does 15-minute calls. Optional.</p>
          </div>
          <a href="https://cal.com/refery-lily/15" target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-[#D2D1C7] px-3 py-2 text-[12.5px] font-semibold">Book</a>
        </section>
      </div>
    </div>
  )
}
