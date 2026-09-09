import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveFee, payoutAmount, feeExplanation, type ResolvedFee } from '@/lib/fees'
import { featuredSearches, FUNCTION_LABEL, type FeaturedSearch } from '@/lib/outreach/featured'
import { WhoAreYou } from '@/components/onboarding/who-are-you'

export const dynamic = 'force-dynamic'

/**
 * The page behind a universal invitation link: a mass LinkedIn DM, a cold
 * email, a post, a signature. Whoever carried the link, the page speaks as
 * Lily inviting the reader; the sender is recorded internally only.
 *
 * A general link shows the two searches that need people most right now, one
 * engineering and one GTM, chosen by rule when the page renders and
 * anonymised. A search link shows the one search it was made for. Below
 * either: how it works in three lines, and a who-are-you step.
 *
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
  const general = campaign.kind !== 'search' || !campaign.job_id

  let cards: SearchCard[] = []
  if (general) {
    const f = await featuredSearches(admin)
    cards = [f.engineering, f.gtm].filter((x): x is FeaturedSearch => x !== null).map(cardFromFeatured)
  } else {
    const { data: role } = await admin.from('partner_roles_v').select('*').eq('job_id', campaign.job_id).maybeSingle()
    if (role && role.is_live && role.job_status === 'open') {
      cards = [{ key: role.job_id, tag: null, title: role.headline || role.title, facts: role.location ?? '', summary: campaign.summary as string, hiringNow: role.priority === 'urgent', fee: resolveFee(role) }]
    }
  }

  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]">
      <div className="mx-auto w-full max-w-md px-5 pb-12 pt-10 sm:pt-14">
        <p className="text-[18px] font-semibold">Refery<span className="text-[#1F3A2F]">.</span></p>

        <section className="mt-8">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#1F3A2F]">An invitation from Refery</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-[-0.02em]">Lily invited you to join Refery.</h1>
          <p className="mt-2 text-[14px] text-[#6E6E68]">
            {general
              ? 'Two of the searches we’re working on right now, what you’d do, and how to join. About four minutes.'
              : 'One of the searches we’re working on right now, what you’d do, and how to join. About four minutes.'}
          </p>
        </section>

        {cards.length > 0 ? (
          <div className="mt-5 grid gap-3">
            {cards.map(c => (
              <section key={c.key} className="rounded-[14px] border border-[#E4E3DC] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {c.tag && <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#5E8571]">{c.tag}</p>}
                    <p className="mt-0.5 text-[16px] font-semibold leading-tight">{c.title}</p>
                    {c.facts && <p className="mt-0.5 text-[12.5px] text-[#9C9C95]">{c.facts}</p>}
                  </div>
                  {c.hiringNow && <span className="shrink-0 rounded-full bg-[#FBEDEB] px-2.5 py-0.5 text-[12px] font-semibold text-[#A3423A]">Hiring now</span>}
                </div>
                {c.summary && <p className="mt-3 text-[13px] text-[#2A2A26]">{c.summary}</p>}
                <p className="mt-3 text-[12.5px]">
                  <span className="font-semibold text-[#1F3A2F]">{payoutAmount(c.fee) ? `${payoutAmount(c.fee)} to you on a placement` : `${c.fee.scoutSharePercentage}% of the fee to you`}</span>
                  <span className="text-[#9C9C95]"> · {feeExplanation(c.fee)}</span>
                </p>
              </section>
            ))}
            <p className="px-1 text-[12px] text-[#9C9C95]">
              {general ? 'Company names and full briefs open after the partner terms, along with every other live search. ' : 'The company’s name and the full brief open after the partner terms. '}
              Every client has a confidentiality agreement with us.
            </p>
          </div>
        ) : (
          <section className="mt-5 rounded-[14px] border border-[#E4E3DC] bg-white p-4">
            <p className="text-[14px] font-semibold">{general ? 'The searches move quickly.' : 'That search has filled since the message went out.'}</p>
            <p className="mt-1 text-[13px] text-[#6E6E68]">Tell us who you are below and we&rsquo;ll point you at the closest live search to the people you know.</p>
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
          <WhoAreYou slug={slug} />
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

interface SearchCard {
  key: string
  tag: string | null
  title: string
  facts: string
  summary: string | null
  hiringNow: boolean
  fee: ResolvedFee
}

function cardFromFeatured(f: FeaturedSearch): SearchCard {
  return { key: f.jobId, tag: FUNCTION_LABEL[f.fn], title: f.title, facts: f.facts, summary: f.summary, hiringNow: f.hiringNow, fee: f.fee }
}
