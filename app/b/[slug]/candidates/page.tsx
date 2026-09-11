/**
 * The founder's candidates, behind the same private link as their brief.
 *
 * Every candidate Lily has sent to this client, newest waiting first, with
 * the two decisions on each. No login: the slug is the credential, as on the
 * brief. Anything a partner or Lily wrote for the founder is here; anything
 * the founder decides lands with Lily and the partner within the minute.
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { findPublishedBrief } from '@/lib/hm-brief'
import { clockDate, currentRoleOf, cvUrl, placementClock, workAuthLabel, REASON_CODES } from '@/lib/client-delivery'
import { money, salaryCurrency } from '@/lib/fees'
import { BTN_QUIET, CARD, CHIP, CHIP_VALUE, CHIP_WARN, H1, META } from '@/lib/desk-ui'
import { CandidateDecision } from '@/components/hm/candidate-decisions'
import { OfferAccepted } from '@/components/hm/offer-accepted'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const brief = await findPublishedBrief(slug)
  const robots = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }
  if (!brief) return { title: 'Refery', robots }
  return { title: `${brief.companyName} · Candidates · Refery`, robots }
}

type Tab = 'waiting' | 'interviewing' | 'passed' | 'all'

function daysAgo(iso: string | null): string | null {
  if (!iso) return null
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? '1 day' : `${d} days`
}

export default async function CandidatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = await searchParams
  const brief = await findPublishedBrief(slug)
  if (!brief) notFound()
  if (brief.slug !== slug) redirect(`/b/${brief.slug}/candidates`)

  const db = createAdminClient()
  const { data: briefRow } = await db.from('hm_briefs').select('company_id').eq('id', brief.id).single()
  const companyId = briefRow?.company_id as string
  const { data: client } = await db.from('client_companies').select('booking_url, contact_name').eq('company_id', companyId).maybeSingle()

  const { data: rows } = await db
    .from('role_submissions')
    .select('id, job_id, candidate_id, status, pitch, highlights, work_authorization, target_base, client_delivered_at, client_decision, client_decision_at, client_decision_by, client_reason_code, client_reason, start_date, base_salary, placed_by')
    .eq('company_id', companyId)
    .not('client_delivered_at', 'is', null)
    .order('client_delivered_at', { ascending: false })
    .limit(200)

  const subs = rows ?? []
  const candidateIds = [...new Set(subs.map(s => s.candidate_id as string))]
  const jobIds = [...new Set(subs.map(s => s.job_id as string))]
  const [{ data: cands }, { data: roles }] = await Promise.all([
    candidateIds.length ? db.from('candidates').select('id, name, parsed_data, location, experience_years, linkedin_url, resume_blob_pathname').in('id', candidateIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    jobIds.length ? db.from('partner_roles_v').select('job_id, headline, title, salary_currency').in('job_id', jobIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const candById = new Map((cands ?? []).map(c => [c.id as string, c as Record<string, unknown>]))
  const roleById = new Map((roles ?? []).map(r => [r.job_id as string, r as Record<string, unknown>]))

  const items = subs.map(s => {
    const c = candById.get(s.candidate_id as string) ?? {}
    const r = roleById.get(s.job_id as string) ?? {}
    const state: Tab =
      s.status === 'sent_to_client' && !s.client_decision ? 'waiting'
      : s.status === 'sent_to_client' && s.client_decision === 'later' ? 'waiting'
      : ['client_interview', 'offer', 'placed'].includes(s.status as string) ? 'interviewing'
      : 'passed'
    return {
      id: s.id as string,
      state,
      status: s.status as string,
      name: (c.name as string) || 'Candidate',
      role: currentRoleOf(c),
      location: (c.location as string | null) ?? null,
      years: typeof c.experience_years === 'number' ? (c.experience_years as number) : null,
      why: (s.pitch as string | null)?.split(/\n+/).map(l => l.trim()).filter(Boolean).slice(0, 5) ?? ((s.highlights as string[] | null) ?? []).slice(0, 5),
      workAuth: workAuthLabel((s.work_authorization as string | null) ?? null),
      asks: s.target_base ? money(Number(s.target_base), salaryCurrency(r.salary_currency)) : null,
      linkedin: (c.linkedin_url as string | null) ?? null,
      hasCv: Boolean(c.resume_blob_pathname),
      search: ((r.headline as string | null) || (r.title as string | null)) ?? 'Search',
      deliveredAt: s.client_delivered_at as string | null,
      decision: s.client_decision as string | null,
      decisionAt: s.client_decision_at as string | null,
      decisionBy: s.client_decision_by as string | null,
      reason: [s.client_reason_code ? REASON_CODES[s.client_reason_code as string] : null, s.client_reason as string | null].filter(Boolean).join(': '),
      later: s.client_decision === 'later',
      startDate: (s.start_date as string | null) ?? null,
      placedBy: (s.placed_by as string | null) ?? null,
      currencySymbol: salaryCurrency(r.salary_currency) === 'EUR' ? '€' : salaryCurrency(r.salary_currency) === 'GBP' ? '£' : '$',
    }
  })

  const counts = {
    waiting: items.filter(i => i.state === 'waiting').length,
    interviewing: items.filter(i => i.state === 'interviewing').length,
    passed: items.filter(i => i.state === 'passed').length,
    all: items.length,
  }
  const requested = (Array.isArray(sp.tab) ? sp.tab[0] : sp.tab) as Tab | undefined
  const tab: Tab = requested && requested in counts ? requested : counts.waiting > 0 ? 'waiting' : 'all'
  const shown = items.filter(i => tab === 'all' || i.state === tab)
  const focus = (Array.isArray(sp.c) ? sp.c[0] : sp.c) ?? null
  const decide = ((Array.isArray(sp.decide) ? sp.decide[0] : sp.decide) ?? null) as 'interview' | 'not_a_fit' | null
  const firstName = brief.recipientName?.split(/[\s&,]+/)[0] ?? client?.contact_name?.split(/\s+/)[0] ?? null

  const tabs: { key: Tab; label: string }[] = [
    { key: 'waiting', label: `Waiting on you · ${counts.waiting}` },
    { key: 'interviewing', label: `Interviewing · ${counts.interviewing}` },
    { key: 'passed', label: `Passed · ${counts.passed}` },
    { key: 'all', label: `All · ${counts.all}` },
  ]

  return (
    <div className="min-h-screen bg-[#F2F1EB] text-[#161613]">
      <div className="border-b border-[#E4E3DC] bg-white">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-[19px] font-semibold tracking-[-0.02em]">Refery.</span>
          <span className={`truncate ${META}`}>Private page for {brief.companyName} · please don’t forward</span>
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-4 pb-24 pt-6 sm:px-6 sm:pt-9">
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className={CHIP_VALUE}>Private · {brief.companyName}</span>
            {counts.waiting > 0 && <span className={CHIP_WARN}>{counts.waiting} waiting on you</span>}
          </div>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className={H1}>Your candidates</h1>
              <p className={`mt-2 ${META}`}>
                {[firstName ? `For ${firstName}` : null, `${counts.all} sent so far`, client?.booking_url ? 'booking link on file' : 'no booking link yet'].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href={`/b/${slug}`} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                Read the brief
              </Link>
              <a href={`/b/${slug}#comments`} className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
                Message Lily
              </a>
            </div>
          </div>
          <nav className="mt-5 flex gap-2 overflow-x-auto border-b border-[#E4E3DC]" aria-label="Candidates">
            {tabs.map(t => (
              <Link
                key={t.key}
                href={`/b/${slug}/candidates?tab=${t.key}`}
                className={`shrink-0 px-2 py-2.5 text-[14px] ${tab === t.key ? 'border-b-2 border-[#1F3A2F] font-semibold text-[#161613]' : 'font-medium text-[#6E6E68]'}`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        </header>

        {shown.length === 0 && (
          <p className={`mt-8 ${META}`}>
            {counts.all === 0 ? 'Nothing here yet. The first candidates land here, and in the channel you chose, as soon as Lily clears them.' : 'Nothing in this tab.'}
          </p>
        )}

        <div className="mt-6 space-y-4">
          {shown.map(i => {
            const isFocus = focus === i.id
            const waiting = i.state === 'waiting'
            return (
              <section key={i.id} id={i.id} className={`scroll-mt-6 p-5 ${CARD} ${isFocus || waiting ? 'border-[#1F3A2F]' : ''}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      {waiting && <span className={CHIP_WARN}>{i.later ? 'Parked' : 'New'}{i.deliveredAt ? ` · ${daysAgo(i.deliveredAt)}` : ''}</span>}
                      {i.state === 'interviewing' && <span className={CHIP_VALUE}>{i.status === 'offer' ? 'Offer out' : i.status === 'placed' ? 'Hired' : 'Interviewing'}</span>}
                      {i.state === 'passed' && <span className={CHIP}>{i.status === 'withdrawn' ? 'Withdrawn' : 'Passed'}</span>}
                      <span className={CHIP}>{i.search}</span>
                    </div>
                    <p className="mt-2 text-[17px] font-semibold leading-snug">{i.name}</p>
                    <p className={`mt-0.5 text-[13px] text-[#6E6E68]`}>{[i.role, i.years ? `${i.years} years` : null, i.location].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                {i.why.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {i.why.map((l, n) => (
                      <li key={n} className="relative pl-4 text-[14.5px] leading-relaxed text-[#2A2A26]">
                        <span aria-hidden className="absolute left-0 top-[9px] h-1.5 w-1.5 rounded-full bg-[#1F3A2F]" />
                        {l}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {i.asks && <span className={CHIP}>Asks {i.asks}</span>}
                  {i.workAuth && <span className={CHIP}>{i.workAuth}</span>}
                  <span className={`ml-auto text-[13px]`}>
                    {i.linkedin && (
                      <a href={i.linkedin} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F3A2F]">
                        LinkedIn
                      </a>
                    )}
                    {i.linkedin && i.hasCv && ' · '}
                    {i.hasCv && (
                      <a href={cvUrl(slug, i.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#1F3A2F]">
                        CV
                      </a>
                    )}
                  </span>
                </div>

                {waiting ? (
                  <CandidateDecision slug={slug} submissionId={i.id} candidateFirstName={i.name.split(' ')[0]} preset={isFocus ? decide : null} hasBookingLink={Boolean(client?.booking_url)} />
                ) : (
                  <p className={`mt-3 ${META}`}>
                    {i.status === 'placed' && i.startDate && `Hired${i.placedBy ? `, confirmed by ${i.placedBy}` : ''}. Starts ${clockDate(placementClock(i.startDate).startDate, true)}; invoice due ${clockDate(placementClock(i.startDate).invoiceDue)}; free replacement if they leave before ${clockDate(placementClock(i.startDate).guaranteeEnds)}.`}
                    {i.status === 'placed' && !i.startDate && 'Hired.'}
                    {i.status !== 'placed' && i.decision === 'interview' && `Interview requested${i.decisionBy ? ` by ${i.decisionBy}` : ''}${i.decisionAt ? `, ${daysAgo(i.decisionAt)} ago` : ''}. Lily arranges the first call.`}
                    {i.decision === 'not_a_fit' && `Passed${i.decisionBy ? ` by ${i.decisionBy}` : ''}${i.reason ? `: ${i.reason}` : ''}.`}
                    {!i.decision && i.state === 'passed' && 'Closed by Refery.'}
                    {!i.decision && i.state === 'interviewing' && i.status !== 'placed' && 'In process.'}
                  </p>
                )}
                {['client_interview', 'offer'].includes(i.status) && <OfferAccepted slug={slug} submissionId={i.id} candidateFirstName={i.name.split(' ')[0]} currencySymbol={i.currencySymbol} />}
              </section>
            )
          })}
        </div>

        <p className={`mt-10 ${META}`} id="ask">
          Interview tells Lily today and the candidate hears the company name. Not a fit keeps them anonymous and teaches the next batch. Anything else: <Link href={`/b/${slug}#comments`} className="font-semibold text-[#1F3A2F]">write to Lily on the brief</Link>.
        </p>
      </div>
    </div>
  )
}
