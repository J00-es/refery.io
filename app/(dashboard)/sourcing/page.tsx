import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { BTN_QUIET, CARD, CHIP, CHIP_BAD, CHIP_VALUE, CHIP_WARN, FIGURE, H1, H2, LABEL, LEDE, META } from '@/lib/desk-ui'
import { ensureDeskMailbox } from '@/lib/sourcing/mailboxes'
import { loadCapacity, loadSeatSummaries, loadSpend, requireSourcingUser } from '@/lib/sourcing/page-data'

export const dynamic = 'force-dynamic'

/**
 * Sourcing: every live search, what has been found for it, and what happens
 * next. Super admin only. The page reads; the verbs live on the seat pages.
 */
export default async function SourcingPage() {
  await requireSourcingUser()
  const admin = createAdminClient()
  await ensureDeskMailbox(admin)
  const [seats, spend, capacity] = await Promise.all([loadSeatSummaries(admin), loadSpend(admin), loadCapacity(admin)])
  const active = capacity.health.filter(h => h.mailbox.status === 'active')
  const blocked = capacity.health.filter(h => h.blocked && h.mailbox.status === 'active')

  const order = (s: (typeof seats)[number]) => (s.proposed ? 0 : s.hasDraft && !s.brief?.approvedAt ? 1 : s.pool.ready ? 2 : s.brief?.status === 'approved' ? 3 : 4)
  const sorted = [...seats].sort((a, b) => order(a) - order(b) || a.companyName.localeCompare(b.companyName))

  return (
    <div className="mx-auto max-w-[1120px] space-y-7 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className={H1}>Sourcing</h1>
          <p className={`mt-2 ${LEDE}`}>Every live search, the people found for it, and where each conversation is. Nothing sends without a profile you approved and a batch you approved, and every reply stops its sequence.</p>
          <p className={`mt-2.5 ${META}`}>
            {seats.length} live searches · {seats.filter(s => s.brief?.status === 'approved').length} with an approved profile · {active.length} mailbox{active.length === 1 ? '' : 'es'} ·{' '}
            {capacity.forecast.peoplePerMonth} people a month at two steps
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <Link href="/sourcing/replies" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
            Replies
          </Link>
          <Link href="/sourcing/mailboxes" className={`${BTN_QUIET} min-h-[40px] px-4 text-[13.5px]`}>
            Mailboxes
          </Link>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${CARD} p-5`}>
          <div className={FIGURE}>{spend.sentThisMonth}</div>
          <div className={`mt-1.5 ${LABEL}`}>emails sent this month · {spend.repliesThisMonth} replies</div>
        </div>
        <div className={`${CARD} p-5`}>
          <div className={FIGURE}>{spend.apolloCredits}</div>
          <div className={`mt-1.5 ${LABEL}`}>Apollo credits this month · {spend.found} of {spend.lookups} lookups found someone</div>
        </div>
        <div className={`${CARD} p-5`}>
          <div className={FIGURE}>${spend.modelUsd.toFixed(2)}</div>
          <div className={`mt-1.5 ${LABEL}`}>models this month · {spend.modelCalls} calls</div>
        </div>
        <div className={`${CARD} p-5`}>
          <div className={FIGURE}>{active.reduce((s, h) => s + h.room, 0)}</div>
          <div className={`mt-1.5 ${LABEL}`}>sends left today across {active.length} mailbox{active.length === 1 ? '' : 'es'}</div>
          {blocked.length > 0 && <div className="mt-2 text-[12.5px] text-[#8A6A1F]">{blocked.map(h => `${h.mailbox.address}: ${h.blocked}`).join(' · ')}</div>}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={H2}>Searches</h2>
          <p className={META}>Sorted by what needs you: a proposed batch, a profile to approve, people ready to write to.</p>
        </div>
        <div className="space-y-2.5">
          {sorted.map(s => {
            const next = s.proposed
              ? `${s.proposed} batch${s.proposed === 1 ? '' : 'es'} waiting for approval`
              : !s.brief
                ? 'No profile yet. Build one from the brief, the call and the questions.'
                : s.brief.status !== 'approved'
                  ? `Profile v${s.brief.version} drafted; read and approve it`
                  : s.hasDraft
                    ? `A newer profile draft (v${s.brief.version + 1}) is waiting; the sources changed`
                    : s.pool.ready
                      ? `${s.pool.ready} ready to write to`
                      : s.pool.promising > s.pool.graded
                        ? `${s.pool.promising - s.pool.graded} found, not read yet`
                        : s.pool.found === 0
                          ? 'Profile approved; find people'
                          : s.runs.active + s.runs.queued
                            ? `${s.runs.queued + s.runs.active} in sequence · waiting on replies`
                            : 'Read the fit ones and mark who is ready'
            return (
              <Link key={s.jobId} href={`/sourcing/${s.jobId}`} className={`${CARD} block p-5 transition-[border-color,box-shadow] hover:border-[#D2D1C7] hover:shadow-[0_2px_12px_rgba(22,22,19,0.04)]`}>
                <div className="grid gap-4 lg:grid-cols-[280px_140px_minmax(0,1fr)_250px] lg:items-center">
                  <div className="min-w-0">
                    <div className={META}>{s.companyName}</div>
                    <div className="mt-0.5 text-[15.5px] font-semibold leading-snug text-[#161613]">{s.title}</div>
                    <div className={`mt-0.5 ${META}`}>
                      {[s.location, s.remotePolicy?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div>
                    {s.brief?.status === 'approved' ? <span className={CHIP_VALUE}>Profile v{s.brief.version}</span> : s.brief ? <span className={CHIP_WARN}>Draft v{s.brief.version}</span> : <span className={CHIP}>No profile</span>}
                    {s.sequence && !s.sequence.sending && <div className="mt-1.5 text-[12px] text-[#8A6A1F]">sending off</div>}
                  </div>
                  <div className="min-w-0 text-[12.5px] text-[#6E6E68]">
                    {s.pool.found ? (
                      <>
                        <span className="text-[#161613]">{s.pool.found}</span> found · <span className="text-[#161613]">{s.pool.graded}</span> read · <span className="text-[#161613]">{s.pool.fit}</span> fit ·{' '}
                        <span className="text-[#161613]">{s.pool.ready}</span> ready · <span className="text-[#161613]">{s.runs.queued + s.runs.active + s.runs.replied + s.runs.done + s.runs.bounced}</span> written to ·{' '}
                        <span className="text-[#161613]">{s.runs.replied}</span> replied · <span className="text-[#1F3A2F]">{s.runs.interested}</span> interested
                        {s.runs.bounced > 0 && (
                          <>
                            {' '}
                            · <span className={CHIP_BAD}>{s.runs.bounced} bounced</span>
                          </>
                        )}
                      </>
                    ) : (
                      'Nobody found yet.'
                    )}
                  </div>
                  <div className={`text-[12.5px] leading-snug ${s.proposed || (s.hasDraft && s.brief?.status === 'approved') ? 'text-[#8A6A1F]' : 'text-[#6E6E68]'}`}>{next}</div>
                </div>
              </Link>
            )
          })}
          {!sorted.length && <p className={`${CARD} p-8 text-center ${LEDE}`}>No live searches on the desk.</p>}
        </div>
      </section>
    </div>
  )
}
