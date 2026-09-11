import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { CARD, CHIP, CHIP_BAD, CHIP_VALUE, CHIP_WARN, H1, LEDE, META } from '@/lib/desk-ui'
import { loadReplies, requireSourcingUser } from '@/lib/sourcing/page-data'
import { ActionButton, ReasonButton } from '@/components/sourcing/actions'

export const dynamic = 'force-dynamic'

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RepliesPage({ searchParams }: PageProps) {
  await requireSourcingUser()
  const sp = await searchParams
  const f = (Array.isArray(sp.f) ? sp.f[0] : sp.f) ?? 'needs'
  const admin = createAdminClient()
  const all = await loadReplies(admin, 200)
  const needs = (r: (typeof all)[number]) => r.kind === 'reply' && ['interested', 'question', 'other'].includes(r.classification ?? '')
  const filters: [string, string, (r: (typeof all)[number]) => boolean][] = [
    ['needs', 'Needs you', needs],
    ['interested', 'Interested', r => r.classification === 'interested'],
    ['notnow', 'Not now', r => r.classification === 'not_now' || r.kind === 'revisit'],
    ['no', 'No', r => r.classification === 'not_interested' || r.classification === 'do_not_contact' || r.classification === 'wrong_person'],
    ['auto', 'Bounces and out of office', r => r.kind === 'bounce' || r.kind === 'ooo'],
    ['all', 'All', () => true],
  ]
  const active = filters.find(x => x[0] === f) ?? filters[0]
  const rows = all.filter(active[2])
  const chip = (r: (typeof all)[number]) => {
    if (r.kind === 'bounce') return <span className={CHIP_BAD}>bounced</span>
    if (r.kind === 'ooo') return <span className={CHIP}>out of office</span>
    if (r.kind === 'revisit') return <span className={CHIP_WARN}>come back later</span>
    const c = r.classification ?? 'reply'
    return <span className={c === 'interested' || c === 'question' ? CHIP_VALUE : c === 'do_not_contact' || c === 'wrong_person' ? CHIP_BAD : CHIP}>{c.replace(/_/g, ' ')}</span>
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <div className={`flex items-center gap-1.5 ${META}`}>
        <Link href="/sourcing" className="hover:text-[#161613]">
          Sourcing
        </Link>
        <span>/</span>
        <span className="text-[#161613]">Replies</span>
      </div>
      <header>
        <h1 className={H1}>Replies</h1>
        <p className={`mt-2 max-w-2xl ${LEDE}`}>Every answer across every search, read once and sorted by what it needs from you. A &ldquo;no&rdquo; or &ldquo;do not contact&rdquo; has already stopped everything; nothing is sent back. Answer the rest from Gmail: the sequence is already off for anyone who wrote.</p>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {filters.map(([key, label, fn]) => (
          <Link key={key} href={`/sourcing/replies?f=${key}`} className={f === key ? CHIP_VALUE : CHIP}>
            {label} {all.filter(fn).length}
          </Link>
        ))}
      </div>
      <div className="space-y-2.5">
        {rows.map(r => (
          <div key={r.id} className={`${CARD} p-5`}>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-[#161613]">{r.run?.person.full_name ?? 'Unknown'}</span>
                  {chip(r)}
                  <span className={META}>
                    {r.seat} · {when(r.created_at)}
                  </span>
                </div>
                {r.summary && <p className="mt-1.5 text-[13.5px] text-[#2A2A26]">{r.summary}</p>}
                {typeof r.payload.text === 'string' && r.payload.text && (
                  <blockquote className="mt-2 border-l-2 border-[#E4E3DC] pl-3 text-[13.5px] leading-relaxed text-[#2A2A26]">
                    <pre className="whitespace-pre-wrap font-sans">{String(r.payload.text).slice(0, 1200)}</pre>
                  </blockquote>
                )}
              </div>
              <div className="space-y-2 text-[12.5px] text-[#6E6E68]">
                {r.run && (
                  <>
                    <div>
                      {r.run.address} · from {r.run.mailbox}
                    </div>
                    {r.run.gmail_thread_id && (
                      <a href={`https://mail.google.com/mail/u/0/#all/${r.run.gmail_thread_id}`} target="_blank" rel="noreferrer" className="inline-flex min-h-[34px] items-center rounded-full bg-[#1F3A2F] px-3 text-[13px] font-semibold text-white">
                        Reply in Gmail
                      </a>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {r.run.pool_id && r.classification === 'interested' && (
                        <Link href={`/sourcing/${r.run.job_id}?tab=board`} className="inline-flex min-h-[34px] items-center rounded-full border border-[#D2D1C7] bg-white px-3 text-[13px] font-semibold text-[#161613]">
                          Board
                        </Link>
                      )}
                      {r.classification !== 'do_not_contact' && <ReasonButton op="suppress" payload={{ email: r.run.address }} label="Never write again" placeholder="Why" />}
                      {['queued', 'active', 'ooo', 'paused'].includes(r.run.state) && (
                        <ActionButton op="run.stop" payload={{ runId: r.run.id, reason: 'stopped from replies' }} kind="small">
                          Stop the sequence
                        </ActionButton>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {!rows.length && <p className={`${CARD} p-8 text-center ${LEDE}`}>Nothing here.</p>}
      </div>
    </div>
  )
}
