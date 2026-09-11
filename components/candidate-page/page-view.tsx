import type { PublicCandidatePage } from '@/lib/candidate-pages'
import { InterestedForm } from '@/components/candidate-page/interested-form'
import { ViewBeacon } from '@/components/candidate-page/view-beacon'

/**
 * The page itself. Server-rendered, phone first, the same cream and forest
 * as every other public page. Colours are literal so the page looks the same
 * whatever the viewer's system theme.
 */
const CHIP = 'inline-flex items-center rounded-full bg-[#EAE9E1] px-2.5 py-1 text-[12px] font-medium leading-none text-[#6E6E68]'

function Bullets({ items, gold = false }: { items: string[]; gold?: boolean }) {
  return (
    <ul className="mt-3 grid gap-2">
      {items.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-[14.5px] leading-[1.55] text-[#2A2A26]">
          <span aria-hidden className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${gold ? 'bg-[#C8A24B]' : 'bg-[#1F3A2F]'}`} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

export function CandidatePageView({ data, slug, via, siteKey }: { data: PublicCandidatePage; slug: string; via: string | null; siteKey: string | null }) {
  const { page, role, referrer } = data
  const who = referrer?.firstName ?? 'Refery'
  const chips = [role.location, role.remoteLabel, role.seniority, role.salary ? `${role.salary} base` : null, role.hasEquity ? 'Equity' : null, role.visa].filter((c): c is string => !!c)
  // The draft arrives as light markdown; the markers are dropped, the shape is kept.
  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`/g, '').trim()
  const paragraphs = (page.jd_text ?? '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    // A heading that is the page's own title again says nothing.
    .filter(p => !(/^#+\s*/.test(p) && clean(p.replace(/^#+\s*/, '')).toLowerCase() === (page.headline ?? '').toLowerCase()))
  const shareHref = referrer ? `/r/${referrer.code}` : '/apply'

  return (
    <div className="min-h-svh bg-[#F2F1EB] text-[#161613]" style={{ colorScheme: 'light' }}>
      <ViewBeacon slug={slug} via={via} />
      <header className="border-b border-[#E4E3DC] bg-white">
        <div className="mx-auto flex max-w-[760px] items-center justify-between px-5 py-3.5 sm:px-6">
          <span className="text-[19px] font-semibold tracking-[-0.02em]">Refery.</span>
          <span className="text-[12px] text-[#9C9C95]">{referrer ? `Shared by ${referrer.firstName}` : 'Shared through Refery'}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-7 sm:px-6 sm:pt-10">
        {referrer && (
          <div className="flex items-center gap-3 rounded-[14px] border border-[#E4E3DC] bg-[#FAF9F5] px-4 py-3">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E7EDE9] text-[12px] font-semibold text-[#1F3A2F]">{referrer.fullName.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
            <p className="text-[13.5px] leading-[1.5] text-[#2A2A26]"><b>{referrer.fullName}</b> shared this with you through Refery. {referrer.firstName} works with the company&rsquo;s hiring team and can put you forward.</p>
          </div>
        )}

        {!role.isOpen ? (
          <section className={referrer ? 'mt-6' : ''}>
            <h1 className="text-[29px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[34px]">This search has closed.</h1>
            <p className="mt-3 text-[14.5px] leading-[1.6] text-[#6E6E68]">The seat was filled or the company paused hiring. {referrer ? `${referrer.firstName} can still put you forward for others, and ` : ''}Refery keeps you in mind for what fits.</p>
            <div className="mt-5 rounded-[16px] border border-[#E4E3DC] bg-white p-5">
              <p className="text-[17px] font-semibold">Open to the right thing?</p>
              <p className="mt-1 text-[13.5px] leading-[1.6] text-[#6E6E68]">Share your CV once. You hear from us only when something fits, and nothing goes to a company until you say yes.</p>
              <a href={shareHref} className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white">Share my CV{referrer ? ` with ${referrer.firstName}` : ''}</a>
            </div>
          </section>
        ) : (
          <>
            <section className={referrer ? 'mt-6' : ''}>
              {role.priority === 'urgent' && <span className="inline-flex items-center rounded-full bg-[#E7EDE9] px-2.5 py-1 text-[12px] font-semibold leading-none text-[#1F3A2F]">Hiring now</span>}
              <h1 className="mt-3 text-[29px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[34px]">{page.headline}</h1>
              {page.company_line && <p className="mt-2.5 text-[15.5px] leading-[1.5] text-[#2A2A26]">{page.company_line}</p>}
              {page.company_blurb && <p className="mt-2 text-[13.5px] leading-[1.6] text-[#6E6E68]">{page.company_blurb}</p>}
              {chips.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {chips.map(c => <span key={c} className={CHIP}>{c}</span>)}
                </div>
              )}
            </section>

            <section className="mt-5 flex flex-col gap-3 rounded-[16px] border border-[#E4E3DC] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-[17px] font-semibold leading-snug">Sound like you?</p>
                <p className="mt-0.5 text-[13.5px] leading-[1.6] text-[#6E6E68]">Two minutes. {who} hears the same minute. Nothing goes to the company until you say so.</p>
              </div>
              <a href="#interested" className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white">I&rsquo;m interested</a>
            </section>

            {paragraphs.length > 0 && (
              <section className="mt-9">
                <h2 className="text-[21px] font-semibold leading-tight">The role</h2>
                <div className="mt-3 grid gap-3">
                  {paragraphs.map((p, i) => {
                    const lines = p.split('\n')
                    const isList = lines.length >= 1 && lines.every(l => /^\s*[-•*]\s+/.test(l))
                    if (isList) return <Bullets key={i} items={lines.map(l => clean(l.replace(/^\s*[-•*]\s*/, '')))} />
                    const md = /^#{1,4}\s+/.test(p)
                    const text = clean(p.replace(/^#{1,4}\s+/, ''))
                    const heading = md || (lines.length === 1 && text.length < 60 && !/[.!?]$/.test(text))
                    return heading ? <p key={i} className="mt-2 text-[15px] font-semibold">{text}</p> : <p key={i} className="whitespace-pre-line text-[14.5px] leading-[1.6] text-[#2A2A26]">{text}</p>
                  })}
                </div>
              </section>
            )}

            {page.requirements.length > 0 && (
              <section className="mt-9">
                <h2 className="text-[21px] font-semibold leading-tight">What they are looking for</h2>
                <Bullets items={page.requirements} />
              </section>
            )}

            {page.good_to_know.length > 0 && (
              <section className="mt-9">
                <h2 className="text-[21px] font-semibold leading-tight">Good to know</h2>
                <p className="mt-1 text-[13.5px] text-[#6E6E68]">Things the hiring team told us that are not in the posting.</p>
                <Bullets items={page.good_to_know} gold />
              </section>
            )}

            {page.interview_steps.length > 0 && (
              <section className="mt-9">
                <h2 className="text-[21px] font-semibold leading-tight">How they interview</h2>
                <ol className={`mt-3 grid gap-4 rounded-[16px] border border-[#E4E3DC] bg-white p-4 sm:p-5 ${page.interview_steps.length >= 3 ? 'sm:grid-cols-3' : page.interview_steps.length === 2 ? 'sm:grid-cols-2' : ''}`}>
                  {page.interview_steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E7EDE9] text-[12px] font-bold text-[#1F3A2F]">{i + 1}</span>
                      <span>
                        <span className="block text-[14px] font-semibold">{s.title}</span>
                        {s.detail && <span className="mt-0.5 block text-[12.5px] text-[#9C9C95]">{s.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
                {role.decisionDays && <p className="mt-2 text-[12.5px] text-[#9C9C95]">Decision typically inside {role.decisionDays} days of the first call. Refery relays the read after each step.</p>}
              </section>
            )}

            <section id="interested" className="mt-10 scroll-mt-6">
              <InterestedForm slug={slug} via={via} referrerFirst={referrer?.firstName ?? null} headline={page.headline ?? 'this search'} siteKey={siteKey} shareHref={shareHref} />
            </section>
          </>
        )}

        <p className="mt-8 text-[12px] leading-[1.6] text-[#9C9C95]">
          Refery introduces people to companies through people who already know them. This page is not indexed or listed; the company&rsquo;s name comes with the first conversation. Questions: lily@refery.io.
        </p>
      </main>
    </div>
  )
}
