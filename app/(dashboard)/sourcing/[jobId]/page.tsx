import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { BTN_QUIET, CARD, CHIP, CHIP_BAD, CHIP_VALUE, CHIP_WARN, H1, H2, H3, LEDE, META } from '@/lib/desk-ui'
import { effectiveSpec } from '@/lib/sourcing/brief'
import { loadMailboxes } from '@/lib/sourcing/mailboxes'
import { pickAddress } from '@/lib/sourcing/people'
import { mergeFields, renderDrafts, seatFacts } from '@/lib/sourcing/sequence'
import { loadBatches, loadBriefs, loadPool, loadRuns, loadSeat, loadSequenceFor, requireSourcingUser, type PoolWithPerson } from '@/lib/sourcing/page-data'
import { isReady, notReadyBecause, type BriefRow, type MailboxRow, type SequenceRow } from '@/lib/sourcing/types'
import { ActionButton, AddPersonForm, PoolRowActions, RunActions } from '@/components/sourcing/actions'
import { EmployerOverride, ListOverride, ProseOverride, RequirementToggle } from '@/components/sourcing/brief-editor'
import { SequenceEditor } from '@/components/sourcing/sequence-editor'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ jobId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '')
const when = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

function Src({ s }: { s: { label: string; date: string | null } }) {
  return <span className="inline-flex items-center rounded border border-[#E4E3DC] bg-[#F2F1EB] px-1.5 py-0.5 text-[11px] font-medium text-[#6E6E68]">{s.label}</span>
}

function Grade({ g }: { g: string | null }) {
  const cls = g === 'A' ? 'bg-[#E7EDE9] text-[#1F3A2F]' : g === 'B' ? 'bg-[#EAE9E1] text-[#6E6E68]' : g === 'C' ? 'bg-[#F9EBE9] text-[#9C3F37]' : 'bg-[#F2F1EB] text-[#9C9C95]'
  return <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg text-[13px] font-bold ${cls}`}>{g ?? '·'}</span>
}

export default async function SourcingSeatPage({ params, searchParams }: PageProps) {
  await requireSourcingUser()
  const { jobId } = await params
  const sp = await searchParams
  const tab = one(sp.tab) || 'profile'
  const filter = one(sp.f) || 'fit'
  const admin = createAdminClient()
  const seat = await loadSeat(admin, jobId)
  if (!seat) notFound()

  const [briefs, pool, seq, runs, batches, mailboxes] = await Promise.all([loadBriefs(admin, jobId), loadPool(admin, jobId), loadSequenceFor(admin, jobId), loadRuns(admin, jobId), loadBatches(admin, jobId), loadMailboxes(admin)])
  const sym = seat.currency === 'EUR' ? '€' : seat.currency === 'GBP' ? '£' : '$'
  const band = seat.salaryMin && seat.salaryMax ? `${sym}${Math.round(seat.salaryMin / 1000)}k to ${Math.round(seat.salaryMax / 1000)}k` : null
  const counts = {
    found: pool.length,
    fit: pool.filter(p => p.fit_status === 'fit').length,
    ready: pool.filter(p => p.decision === 'ready').length,
    replied: runs.filter(r => r.state === 'replied').length,
  }
  const tabs = [
    ['profile', 'Profile'],
    ['pool', `Pool ${counts.found}`],
    ['sequence', 'Sequence'],
    ['board', `Board ${runs.length}`],
  ] as const

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <div className={`flex items-center gap-1.5 ${META}`}>
        <Link href="/sourcing" className="hover:text-[#161613]">
          Sourcing
        </Link>
        <span>/</span>
        <span className="text-[#161613]">{seat.companyName}</span>
      </div>
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className={H1}>{seat.title}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className={CHIP}>{seat.companyName}</span>
            {seat.location && <span className={CHIP}>{[seat.location, seat.remotePolicy?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</span>}
            {band && <span className={CHIP_VALUE}>{band}</span>}
          </div>
        </div>
      </header>
      <nav className="flex gap-1 border-b border-[#E4E3DC]">
        {tabs.map(([key, label]) => (
          <Link key={key} href={`/sourcing/${jobId}?tab=${key}`} className={`-mb-px inline-flex h-10 items-center border-b-2 px-3 text-[14px] font-semibold ${tab === key ? 'border-[#1F3A2F] text-[#161613]' : 'border-transparent text-[#9C9C95] hover:text-[#161613]'}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === 'profile' && <ProfileTab jobId={jobId} briefs={briefs} />}
      {tab === 'pool' && <PoolTab jobId={jobId} pool={pool} filter={filter} approved={briefs.approved} seq={seq} mailboxes={mailboxes} batches={batches} />}
      {tab === 'sequence' && <SequenceTab jobId={jobId} seq={seq} mailboxes={mailboxes} pool={pool} />}
      {tab === 'board' && <BoardTab runs={runs} seq={seq} />}
    </div>
  )
}

// ── Profile ────────────────────────────────────────────────────────────────

function ProfileTab({ jobId, briefs }: { jobId: string; briefs: Awaited<ReturnType<typeof loadBriefs>> }) {
  const b = briefs.latest
  if (!b) {
    return (
      <section className={`${CARD} p-8`}>
        <h2 className={H2}>No profile yet</h2>
        <p className={`mt-2 max-w-xl ${LEDE}`}>Building one reads the job row, the hiring-manager brief and its answers, the search questions, any recorded call with the client, and every person you have already passed on for this seat with a reason. One model call, about ten cents.</p>
        <div className="mt-5">
          <ActionButton op="brief.build" payload={{ jobId }} kind="primary" describe="Drafted v{version}">
            Build the profile
          </ActionButton>
        </div>
      </section>
    )
  }
  const spec = effectiveSpec(b)
  const approvedIsLatest = b.status === 'approved'
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="space-y-7">
        <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            {approvedIsLatest ? <span className={CHIP_VALUE}>v{b.version} approved {day(b.approved_at)}</span> : <span className={CHIP_WARN}>v{b.version} draft</span>}
            {briefs.approved && !approvedIsLatest && <span className={META}>replaces v{briefs.approved.version}, approved {day(briefs.approved.approved_at)}</span>}
            {b.overrides.length > 0 && <span className={CHIP}>{b.overrides.length} edit{b.overrides.length === 1 ? '' : 's'} by hand</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton op="brief.build" payload={{ jobId }} kind="small" describe="Drafted v{version} with {changes} change(s) from the approved version">
              Rebuild from sources
            </ActionButton>
            {!approvedIsLatest && (
              <ActionButton op="brief.approve" payload={{ briefId: b.id }} kind="small-primary" describe="v{version} approved">
                Approve v{b.version}
              </ActionButton>
            )}
          </div>
        </div>

        {b.changes && b.changes.length > 0 && !approvedIsLatest && (
          <section className={`${CARD} p-5`}>
            <h3 className={H3}>What changed from the approved version</h3>
            <ul className="mt-3 space-y-2 text-[13.5px]">
              {b.changes.map((c, i) => (
                <li key={i} className="grid gap-1 sm:grid-cols-[160px_1fr]">
                  <span className="font-medium text-[#161613]">{c.field}</span>
                  <span>
                    {c.before && <span className="text-[#9C3F37] line-through decoration-[#9C3F37]/40">{c.before}</span>}
                    {c.before && c.after && ' → '}
                    {c.after && <span className="text-[#1F3A2F]">{c.after}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className={H2}>Who they are actually looking for</h2>
          <p className="mt-2.5 max-w-[680px] text-[15px] leading-relaxed text-[#2A2A26]">{spec.who}</p>
          <div className="mt-2">
            <ProseOverride briefId={b.id} path="who" value={spec.who} label="this" />
          </div>
        </section>

        <section>
          <h3 className={H3}>Requirements</h3>
          <ul className="mt-2 divide-y divide-[#EEEDE6]">
            {spec.requirements.map(r => (
              <li key={r.key} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-[#2A2A26]">
                    <span className={`mr-2 ${r.mandatory ? CHIP_VALUE : CHIP}`}>{r.mandatory ? 'must' : 'prefer'}</span>
                    {r.label}
                  </div>
                  {r.detail && <div className={`mt-0.5 ${META}`}>Evidence: {r.detail}</div>}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.sources.map((s, i) => (
                      <Src key={i} s={s} />
                    ))}
                  </div>
                </div>
                <RequirementToggle briefId={b.id} reqKey={r.key} mandatory={r.mandatory} />
              </li>
            ))}
          </ul>
        </section>

        {spec.signals.length > 0 && (
          <section>
            <h3 className={H3}>Strong signals</h3>
            <ul className="mt-2 divide-y divide-[#EEEDE6]">
              {spec.signals.map((s, i) => (
                <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-[14px] text-[#2A2A26]">
                  <span>{s.text}</span>
                  <span className="flex gap-1">
                    {s.sources.map((x, j) => (
                      <Src key={j} s={x} />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className={H3}>Not for</h3>
          <ul className="mt-2 divide-y divide-[#EEEDE6]">
            {spec.not_for.map((s, i) => (
              <li key={i} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-[14px] text-[#2A2A26]">
                <span>{s.text}</span>
                <span className="flex gap-1">
                  {s.sources.map((x, j) => (
                    <Src key={j} s={x} />
                  ))}
                </span>
              </li>
            ))}
            {!spec.not_for.length && <li className={`py-2 ${META}`}>Nothing stated.</li>}
          </ul>
          <div className="mt-2">
            <ListOverride briefId={b.id} path="not_for" values={spec.not_for.map(n => n.text)} label="not-for (one per line, replaces the list)" />
          </div>
        </section>

        <section>
          <h3 className={H3}>How to open the email</h3>
          <p className="mt-2 max-w-[680px] text-[14px] leading-relaxed text-[#2A2A26]">{spec.open_with}</p>
          <div className="mt-2">
            <ProseOverride briefId={b.id} path="open_with" value={spec.open_with} label="this" />
          </div>
        </section>

        <section>
          <h3 className={H3}>Where we will look</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className={`${CARD} p-4`}>
              <div className="text-[13px] font-semibold text-[#161613]">Lookalike employers</div>
              <ul className="mt-2 space-y-1 text-[13px] text-[#2A2A26]">
                {spec.employers.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium">{e.name}</span>
                    {e.domain && <span className={` ${META}`}> {e.domain}</span>}
                    <span className={` ${META}`}> · {e.why}</span>
                  </li>
                ))}
                {!spec.employers.length && <li className={META}>None named. Add some; Apollo searches on them.</li>}
              </ul>
              <div className="mt-2">
                <EmployerOverride briefId={b.id} values={spec.employers} />
              </div>
            </div>
            <div className={`${CARD} p-4`}>
              <div className="text-[13px] font-semibold text-[#161613]">Titles</div>
              <p className="mt-1 text-[13px] text-[#2A2A26]">{spec.titles.join(', ') || 'none'}</p>
              <div className="mt-2">
                <ListOverride briefId={b.id} path="titles" values={spec.titles} label="titles" />
              </div>
              <div className="mt-4 text-[13px] font-semibold text-[#161613]">Keywords</div>
              <p className="mt-1 text-[13px] text-[#2A2A26]">{spec.keywords.join(', ') || 'none'}</p>
              <div className="mt-2">
                <ListOverride briefId={b.id} path="keywords" values={spec.keywords} label="keywords" />
              </div>
              <div className="mt-4 text-[13px] font-semibold text-[#161613]">Location and years</div>
              <p className="mt-1 text-[13px] text-[#2A2A26]">
                {spec.locations.join(', ') || 'anywhere'} · {spec.onsite} · {spec.years.min ?? '?'} to {spec.years.max ?? '?'} years
              </p>
              <div className="mt-2">
                <ListOverride briefId={b.id} path="locations" values={spec.locations} label="locations" />
              </div>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-4">
        <div className={`${CARD} p-5`}>
          <div className="text-[13px] font-semibold text-[#161613]">Read to build v{b.version}</div>
          <ul className="mt-2.5 space-y-1.5 text-[13px] text-[#2A2A26]">
            {b.sources.map((s, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{s.label}</span>
                <span className={META}>{s.at ? day(s.at) : ''}</span>
              </li>
            ))}
          </ul>
          <p className={`mt-3 ${META}`}>Rebuild when any of these changes; your edits stay on top.</p>
        </div>
        {spec.questions.length > 0 && (
          <div className={`${CARD} p-5`}>
            <div className="text-[13px] font-semibold text-[#161613]">Ask the client</div>
            <p className={`mt-1.5 ${META}`}>The sources do not settle these. Ask them in #refery-search-questions or on the brief page.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[13px] text-[#2A2A26]">
              {spec.questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {b.overrides.length > 0 && (
          <div className={`${CARD} p-5`}>
            <div className="text-[13px] font-semibold text-[#161613]">Edits by hand</div>
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-[#6E6E68]">
              {b.overrides.map((o, i) => (
                <li key={i}>
                  <span className="text-[#161613]">{o.path}</span> · {o.by.replace(/@.*/, '')} · {day(o.at)}
                  {o.reason ? ` · ${o.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        {briefs.history.length > 1 && (
          <div className={`${CARD} p-5`}>
            <div className="text-[13px] font-semibold text-[#161613]">Versions</div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-[#6E6E68]">
              {briefs.history.map(h => (
                <li key={h.id}>
                  v{h.version} · {h.status} · {day(h.approved_at ?? h.created_at)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  )
}

// ── Pool ───────────────────────────────────────────────────────────────────

function Verdicts({ p, approved }: { p: PoolWithPerson; approved: BriefRow | null }) {
  const spec = approved ? effectiveSpec(approved) : null
  if (!spec || !p.requirements.length) return null
  return (
    <ul className="mt-2 space-y-1">
      {spec.requirements.map(r => {
        const v = p.requirements.find(x => x.key === r.key)
        const verdict = v?.verdict ?? 'unknown'
        const cls = verdict === 'supported' ? 'text-[#1F3A2F]' : verdict === 'contradicted' ? 'text-[#9C3F37]' : 'text-[#9C9C95]'
        return (
          <li key={r.key} className="grid gap-x-3 text-[12.5px] sm:grid-cols-[110px_minmax(0,1fr)]">
            <span className={`${cls} font-semibold`}>
              {verdict}
              {r.mandatory ? ' · must' : ''}
            </span>
            <span className="text-[#2A2A26]">
              {r.label}
              {v?.evidence && <span className={META}> · &ldquo;{v.evidence}&rdquo;</span>}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

async function PoolTab({ jobId, pool, filter, approved, seq, mailboxes, batches }: { jobId: string; pool: PoolWithPerson[]; filter: string; approved: BriefRow | null; seq: SequenceRow; mailboxes: MailboxRow[]; batches: Awaited<ReturnType<typeof loadBatches>> }) {
  const facts = await seatFacts(createAdminClient(), jobId)
  const readyRows = pool.filter(p => p.decision === 'ready')
  const readyNow = readyRows.filter(isReady)
  const filters: [string, string, (p: PoolWithPerson) => boolean][] = [
    ['fit', 'Fit', p => p.fit_status === 'fit' && p.decision !== 'not_fit'],
    ['near', 'Near miss', p => p.fit_status === 'near_miss' && p.decision !== 'not_fit'],
    ['ready', 'Ready', p => p.decision === 'ready'],
    ['held', 'Held', p => p.decision === 'held'],
    ['unread', 'Not read yet', p => p.screen === 'promising' && !p.graded_at],
    ['out', 'Screened out or not a fit', p => p.screen === 'screened_out' || p.decision === 'not_fit' || (p.fit_status === 'not_fit' && p.graded_at !== null)],
    ['all', 'All', () => true],
  ]
  const active = filters.find(f => f[0] === filter) ?? filters[0]
  const rows = pool.filter(active[2]).sort((a, b) => (a.grade ?? 'Z').localeCompare(b.grade ?? 'Z') || a.person.full_name.localeCompare(b.person.full_name))
  const stats = {
    found: pool.length,
    promising: pool.filter(p => p.screen === 'promising').length,
    read: pool.filter(p => p.graded_at).length,
    fit: pool.filter(p => p.fit_status === 'fit').length,
    ready: readyRows.length,
    unread: pool.filter(p => p.screen === 'promising' && !p.graded_at && !p.person.last_enriched_at).length,
  }
  const proposed = batches.filter(b => b.status === 'proposed')
  const firstMailbox = mailboxes.find(m => seq.mailbox_ids.includes(m.id)) ?? mailboxes[0]

  return (
    <div className="space-y-6">
      {!approved && (
        <p className={`${CARD} p-5 ${LEDE}`}>
          Approve the profile first. Discovery searches on its employers, titles and locations; grading reads people against its requirements.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton op="discover" payload={{ jobId }} kind="quiet" describe="Found {added} new (bench {bench}, Apollo {apollo} of {apolloTotal}); {screenedOut} screened out.">
            Find people
          </ActionButton>
          <ActionButton op="enrich" payload={{ jobId, limit: 30 }} kind="quiet" confirm={`Read up to 30 promising people in full. Each one Apollo can find costs one credit (${stats.unread} waiting). Continue?`} describe="Read {enriched} ({credits} credits), graded {graded}, {fit} fit.">
            Read the pool ({stats.unread} unread)
          </ActionButton>
          <ActionButton op="grade" payload={{ jobId }} kind="text" describe="Graded {graded}, {fit} fit.">
            Grade again
          </ActionButton>
        </div>
        <ActionButton
          op="batch.propose"
          payload={{ jobId }}
          kind="primary"
          className={readyNow.length ? '' : 'opacity-50'}
          describe="Batch of {n} proposed; approve it below or with :+1: on the card."
        >
          Write to {readyNow.length} ready
        </ActionButton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          [stats.found, 'found'],
          [stats.promising, 'worth reading'],
          [stats.read, 'read in full'],
          [stats.fit, 'fit'],
          [stats.ready, 'marked ready'],
          [readyNow.length, 'ready and clear'],
        ].map(([n, l]) => (
          <div key={String(l)} className={`${CARD} p-3.5`}>
            <div className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-[#161613]">{n}</div>
            <div className={`mt-1 ${META}`}>{l}</div>
          </div>
        ))}
      </div>

      {proposed.length > 0 && (
        <section className="space-y-3">
          <h3 className={H3}>Waiting for your approval</h3>
          {proposed.map(b => (
            <div key={b.id} className={`${CARD} p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold text-[#161613]">
                    {b.items.length} {b.items.length === 1 ? 'person' : 'people'} · proposed {when(b.created_at)} · profile v{b.brief_version ?? '?'} · sequence v{b.sequence_version ?? '?'}
                  </div>
                  <div className={META}>Approving here and :+1: on the Slack card are the same decision; whichever comes first counts.</div>
                </div>
                <div className="flex gap-2">
                  <ActionButton op="batch.cancel" payload={{ batchId: b.id }} kind="small">
                    Cancel
                  </ActionButton>
                  <ActionButton op="batch.approve" payload={{ batchId: b.id }} kind="small-primary" describe="Queued {runs}.">
                    Approve and queue
                  </ActionButton>
                </div>
              </div>
              <ul className="mt-3 divide-y divide-[#EEEDE6]">
                {b.items.map(it => (
                  <li key={it.pool_id} className="py-2">
                    <details>
                      <summary className="cursor-pointer text-[13.5px] text-[#2A2A26]">
                        <span className="font-semibold text-[#161613]">{it.name}</span> · {it.address} · from {mailboxes.find(m => m.id === it.mailbox_id)?.address ?? '?'}
                      </summary>
                      {it.drafts.map(d => (
                        <div key={d.n} className="mt-2 rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-3 text-[13px] leading-relaxed text-[#2A2A26]">
                          <div className={META}>
                            Step {d.n}
                            {d.n > 1 ? ` · day ${d.day}, same thread` : ` · subject: ${d.subject}`}
                          </div>
                          <pre className="mt-1 whitespace-pre-wrap font-sans">{d.body}</pre>
                        </div>
                      ))}
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <div className={`${CARD} p-4`}>
        <AddPersonForm jobId={jobId} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map(([key, label, fn]) => (
          <Link key={key} href={`/sourcing/${jobId}?tab=pool&f=${key}`} className={filter === key ? CHIP_VALUE : CHIP}>
            {label} {pool.filter(fn).length}
          </Link>
        ))}
      </div>

      <div className="space-y-2.5">
        {rows.map(p => {
          const addr = pickAddress(p.person.emails, seq.address_preference)
          const ready = isReady(p)
          const blockers = notReadyBecause(p)
          const drafts = firstMailbox && approved ? renderDrafts(seq.steps, mergeFields(p.person, p, facts, firstMailbox)) : []
          return (
            <div key={p.id} className={`${CARD} p-4`}>
              <div className="grid gap-3 lg:grid-cols-[36px_260px_minmax(0,1fr)_150px]">
                <Grade g={p.grade} />
                <div className="min-w-0">
                  <div className="text-[14.5px] font-semibold text-[#161613]">{p.person.full_name}</div>
                  <div className={`${META} text-[#6E6E68]`}>
                    {[p.person.current_title, p.person.current_employer].filter(Boolean).join(' at ')}
                  </div>
                  <div className={META}>
                    {p.person.location ?? 'location unknown'}
                    {p.person.relocation !== 'unknown' ? ` · relocation ${p.person.relocation}` : ''}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className={CHIP}>{p.source}</span>
                    {p.contact_status === 'verified' ? <span className={CHIP_VALUE}>email verified</span> : p.contact_status === 'found' ? <span className={CHIP_VALUE}>email found</span> : p.contact_status === 'guessed' ? <span className={CHIP_WARN}>email guessed</span> : <span className={CHIP}>no email</span>}
                    {p.relationship_status === 'clear' ? null : p.relationship_status === 'unchecked' ? <span className={CHIP}>unchecked</span> : <span className={CHIP_WARN}>{p.relationship_status.replace(/_/g, ' ')}</span>}
                    {p.decision === 'ready' && ready && <span className={CHIP_VALUE}>ready</span>}
                    {p.decision === 'ready' && !ready && <span className={CHIP_WARN}>ready, but {blockers.filter(b => b !== 'no decision').join(', ')}</span>}
                    {p.decision === 'held' && <span className={CHIP_WARN}>held</span>}
                    {p.decision === 'not_fit' && <span className={CHIP_BAD}>not a fit</span>}
                  </div>
                </div>
                <div className="min-w-0 text-[13.5px] leading-relaxed text-[#2A2A26]">
                  {p.screen === 'screened_out' && <div className={META}>Screened out: {p.screen_reason}</div>}
                  {p.screen === 'pending' && <div className={META}>Not screened yet.</div>}
                  {p.screen === 'promising' && !p.graded_at && <div className={META}>{p.person.last_enriched_at ? 'Read in full; grading on the next pass.' : `Worth a credit: ${p.screen_reason ?? 'full record'}. "Read the pool" fetches the record.`}</div>}
                  {p.why.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-4">
                      {p.why.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  )}
                  {p.watch_for && <div className="mt-1 text-[12.5px] text-[#8A6A1F]">Watch for: {p.watch_for}</div>}
                  {p.decision_reason && <div className={`mt-1 ${META}`}>Decision: {p.decision_reason}</div>}
                  {p.relationship_note && p.relationship_status !== 'clear' && <div className={`mt-1 ${META}`}>{p.relationship_note}</div>}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12.5px] font-semibold text-[#1F3A2F]">Record, verdicts and the email as it would send</summary>
                    <Verdicts p={p} approved={approved} />
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div>
                        <div className="text-[12.5px] font-semibold text-[#161613]">Career</div>
                        <ul className="mt-1 space-y-1 text-[12.5px] text-[#2A2A26]">
                          {p.person.history.map((h, i) => (
                            <li key={i}>
                              <span className={META}>
                                {h.start ?? '?'} to {h.current ? 'now' : h.end ?? '?'}
                              </span>{' '}
                              {h.title ?? '?'} at {h.employer ?? '?'}
                              {h.description && <div className={META}>{h.description.slice(0, 240)}</div>}
                            </li>
                          ))}
                          {!p.person.history.length && <li className={META}>No history on record yet.</li>}
                        </ul>
                        <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                          {p.person.links.linkedin && (
                            <a href={p.person.links.linkedin} target="_blank" rel="noreferrer" className="font-semibold text-[#1F3A2F]">
                              LinkedIn
                            </a>
                          )}
                          {p.person.links.github && (
                            <a href={p.person.links.github} target="_blank" rel="noreferrer" className="font-semibold text-[#1F3A2F]">
                              GitHub
                            </a>
                          )}
                          {p.person.emails.map(e => (
                            <span key={e.address} className={META}>
                              {e.address} · {e.kind} · {e.status} ({e.source})
                            </span>
                          ))}
                        </div>
                        {p.hook_ok ? (
                          <div className={`mt-2 ${META}`}>
                            Hook rests on: &ldquo;{p.hook_evidence}&rdquo;
                          </div>
                        ) : (
                          p.graded_at && <div className={`mt-2 ${META}`}>No specific hook in the record; the email opens plainly.</div>
                        )}
                      </div>
                      <div>
                        <div className="text-[12.5px] font-semibold text-[#161613]">First email, as it would send{addr ? ` to ${addr.address}` : ''}</div>
                        {drafts[0] ? (
                          <div className="mt-1 rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-3 text-[13px] leading-relaxed text-[#2A2A26]">
                            <div className={META}>Subject: {drafts[0].subject}</div>
                            <pre className="mt-1 whitespace-pre-wrap font-sans">{drafts[0].body}</pre>
                          </div>
                        ) : (
                          <div className={`mt-1 ${META}`}>Approve the profile and set a mailbox to see it.</div>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
                <div>
                  <PoolRowActions poolId={p.id} jobId={jobId} decision={p.decision} relocation={p.person.relocation} />
                </div>
              </div>
            </div>
          )
        })}
        {!rows.length && <p className={`${CARD} p-8 text-center ${LEDE}`}>Nobody here yet.</p>}
      </div>
    </div>
  )
}

// ── Sequence ───────────────────────────────────────────────────────────────

async function SequenceTab({ jobId, seq, mailboxes, pool }: { jobId: string; seq: SequenceRow; mailboxes: MailboxRow[]; pool: PoolWithPerson[] }) {
  const admin = createAdminClient()
  const seat = await seatFacts(admin, jobId)
  const sample = pool.find(p => p.decision === 'ready') ?? pool.find(p => p.fit_status === 'fit') ?? pool[0]
  const mailbox = mailboxes.find(m => seq.mailbox_ids.includes(m.id)) ?? mailboxes[0]
  const preview = sample && mailbox ? renderDrafts(seq.steps, mergeFields(sample.person, sample, seat, mailbox)) : []
  return (
    <div className="space-y-6">
      <p className={LEDE}>
        Version {seq.version}. Two steps by default: the first email and one follow-up in the same thread. Every reply, bounce or &ldquo;no thanks&rdquo; stops the rest. Plain text, no tracking, and an opt-out line in the first email.
      </p>
      <SequenceEditor jobId={jobId} seq={seq} mailboxes={mailboxes} />
      {preview.length > 0 && sample && (
        <section className={`${CARD} p-5`}>
          <h3 className={H3}>Preview as {sample.person.full_name}</h3>
          <p className={`mt-1 ${META}`}>Rendered from the saved version, with {sample.hook_ok ? 'the checked hook' : 'a plain opener (no checked hook on this record)'}.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {preview.map(d => (
              <div key={d.n} className="rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-3 text-[13px] leading-relaxed text-[#2A2A26]">
                <div className={META}>
                  Step {d.n}
                  {d.n > 1 ? ` · day ${d.day}, same thread` : ` · subject: ${d.subject}`}
                </div>
                <pre className="mt-1 whitespace-pre-wrap font-sans">{d.body}</pre>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

// ── Board ──────────────────────────────────────────────────────────────────

function BoardTab({ runs, seq }: { runs: Awaited<ReturnType<typeof loadRuns>>; seq: SequenceRow }) {
  const stages: [string, (r: (typeof runs)[number]) => boolean, 'good' | 'bad' | 'plain'][] = [
    ['To send', r => r.state === 'queued', 'plain'],
    ['In sequence', r => r.state === 'active', 'plain'],
    ['Out of office', r => r.state === 'ooo', 'plain'],
    ['Replied', r => r.state === 'replied', 'good'],
    ['Interested', r => r.reply_kind === 'interested', 'good'],
    ['Not now', r => r.reply_kind === 'not_now', 'plain'],
    ['Quiet', r => r.state === 'done', 'plain'],
    ['Bounced', r => r.state === 'bounced', 'bad'],
    ['Paused or error', r => r.state === 'paused' || r.state === 'error', 'bad'],
  ]
  const stateChip = (r: (typeof runs)[number]) => {
    const label = r.state === 'active' ? `step ${r.step} of ${r.drafts.length} sent` : r.state === 'queued' ? 'to send' : r.state === 'replied' ? (r.reply_kind ?? 'replied').replace(/_/g, ' ') : r.state === 'done' ? 'quiet' : r.state
    const cls = r.reply_kind === 'interested' || r.reply_kind === 'question' ? CHIP_VALUE : r.state === 'bounced' || r.state === 'error' ? CHIP_BAD : r.state === 'paused' || r.state === 'ooo' ? CHIP_WARN : CHIP
    return <span className={cls}>{label}</span>
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={META}>{seq.sending ? 'Sending is on for this search.' : 'Sending is off for this search; nothing goes out until it is turned on in Sequence.'}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-9">
        {stages.map(([label, fn, tone]) => (
          <div key={label} className={`rounded-[12px] border p-3 ${tone === 'good' ? 'border-transparent bg-[#E7EDE9]' : tone === 'bad' ? 'border-transparent bg-[#F9EBE9]' : 'border-[#E4E3DC] bg-white'}`}>
            <div className={`text-[20px] font-semibold leading-none tracking-[-0.02em] ${tone === 'good' ? 'text-[#1F3A2F]' : tone === 'bad' ? 'text-[#9C3F37]' : 'text-[#161613]'}`}>{runs.filter(fn).length}</div>
            <div className={`mt-1 text-[12px] ${tone === 'good' ? 'text-[#1F3A2F]' : tone === 'bad' ? 'text-[#9C3F37]' : 'text-[#6E6E68]'}`}>{label}</div>
          </div>
        ))}
      </div>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-[#E4E3DC] text-left text-[12.5px] font-medium text-[#9C9C95]">
              <th className="px-4 py-2.5">Person</th>
              <th className="px-3 py-2.5">Stage</th>
              <th className="px-3 py-2.5">From</th>
              <th className="px-3 py-2.5">Last</th>
              <th className="px-3 py-2.5">Next</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => (
              <tr key={r.id} className="border-b border-[#EEEDE6] align-top last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[#161613]">{r.person.full_name}</div>
                  <div className={META}>{r.address}</div>
                </td>
                <td className="px-3 py-3">{stateChip(r)}</td>
                <td className={`px-3 py-3 ${META}`}>{r.mailbox}</td>
                <td className="px-3 py-3 text-[#2A2A26]">
                  {r.reply_summary ? <span>&ldquo;{r.reply_summary}&rdquo;</span> : r.last_sent_at ? `Step ${r.step} sent ${when(r.last_sent_at)}` : 'Nothing sent yet'}
                  {r.stopped_reason && r.state !== 'replied' && <div className={META}>{r.stopped_reason}</div>}
                  {r.last_error && <div className="text-[12px] text-[#9C3F37]">{r.last_error.slice(0, 160)}</div>}
                </td>
                <td className={`px-3 py-3 ${META}`}>
                  {['queued', 'active', 'ooo'].includes(r.state) && r.next_at ? `Step ${r.step + 1} from ${when(r.next_at)}` : ''}
                  {r.gmail_thread_id && (
                    <div>
                      <a href={`https://mail.google.com/mail/u/0/#all/${r.gmail_thread_id}`} target="_blank" rel="noreferrer" className="font-semibold text-[#1F3A2F]">
                        Open in Gmail
                      </a>
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <RunActions runId={r.id} state={r.state} />
                </td>
              </tr>
            ))}
            {!runs.length && (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center ${LEDE}`}>
                  Nobody has been written to for this search yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={META}>
        Every row is a real thread in that mailbox. <Link href="/sourcing/mailboxes" className={`${BTN_QUIET} ml-2 min-h-[32px] px-3 text-[12.5px]`}>Mailboxes</Link>
      </p>
    </div>
  )
}
