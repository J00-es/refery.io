import { createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter, getAppUser } from '@/lib/current-user'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  JOURNEY_BUCKETS,
  journeyBucket,
  nextActionFor,
  type JourneyBucket,
  type JourneyStage,
  type NextAction,
  type PanelGrade,
} from '@/lib/journey'

// Candidate state is changed by the nightly automation as well as by people.
export const dynamic = 'force-dynamic'

// ── helpers ──────────────────────────────────────────────────────────────────
function timeGreeting(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}

function initials(name: string): string {
  return (
    name
      .split(' ')
      .map(p => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

/** How long somebody has been waiting. Reads as a gentle prod, not a metric. */
function waitingSince(dateStr: string | null): string {
  if (!dateStr) return 'Waiting'
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000)
  if (days < 1) return 'Since today'
  if (days === 1) return 'Waiting a day'
  if (days < 7) return `Waiting ${days} days`
  if (days < 14) return 'Waiting a week'
  if (days < 60) return `Waiting ${Math.floor(days / 7)} weeks`
  return `Waiting ${Math.floor(days / 30)} months`
}

function relativeTime(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  return new Date(dateStr).toLocaleDateString()
}

interface ScopedCandidate {
  id: string
  name: string | null
  journey_stage: JourneyStage
  journey_stage_at: string | null
  availability_status: string | null
  intake_source: string | null
  panel_grade: PanelGrade | null
  resume_blob_pathname: string | null
  owner_user_id: string | null
}

/**
 * Activity worth reading. `pipeline_stage_history` was the old source and it is
 * 89% "moved to Job Matched" — 1,715 events in thirty days, almost all of them
 * the matcher noticing a fit. Ten rows of that is ten rows of nothing. These are
 * the types a person would recognise as something having happened.
 */
const MEANINGFUL_ACTIVITY = [
  'journey_stage_changed',
  'call_transcript',
  'contact_made',
  'email_sent',
  'note_added',
  'interview_scheduled',
  'offer_made',
  'hired',
]

const AUTOMATED_SOURCES = new Set([
  'rule',
  'automation',
  'gmail',
  'calendar',
  'granola',
  'panel',
  'backfill',
])

export default async function DashboardPage() {
  const adminClient = createAdminClient()

  const appUser = await getAppUser()
  if (!appUser) {
    redirect('/auth/login')
  }
  // Super admin only while the dashboard is being redone (Lily, 6 Sep 2026).
  // Everyone else lands on their candidates, which is also where the logo and
  // the post-login redirect send them.
  if (!appUser.isSuperAdmin) {
    redirect('/candidates')
  }

  // Candidate visibility follows canViewAllCandidates (super admin only), not
  // the broader admin-console capability. See lib/current-user.ts.
  const canViewAll = appUser.canViewAllCandidates
  const isAdmin = appUser.isAdmin
  const isSuperAdmin = appUser.isSuperAdmin
  const firstName = appUser.fullName?.split(' ')[0] || 'there'
  const me = appUser.id
  const now = new Date()

  // ── one scoped read, and everything on the page comes off it ────────────────
  // The dashboard used to aggregate job_candidate_pipeline, which for a single
  // recruiter is thousands of rows and 96% of them machine matches nothing
  // happened to. The journey lives on the candidate, so this is both the honest
  // source and much the cheaper one.
  let candQuery = adminClient
    .from('candidates')
    .select(
      'id, name, journey_stage, journey_stage_at, availability_status, intake_source, panel_grade, resume_blob_pathname, owner_user_id',
    )
  if (!canViewAll) candQuery = candQuery.or(candidateOwnershipFilter(me))

  const { data: candData } = await candQuery
  const candidates = (candData || []) as ScopedCandidate[]

  // ── buckets ────────────────────────────────────────────────────────────────
  const counts = Object.fromEntries(JOURNEY_BUCKETS.map(b => [b.key, 0])) as Record<
    JourneyBucket,
    number
  >
  for (const c of candidates) counts[journeyBucket(c)]++

  // Benchmarks are not people we are placing, so they are not part of the roster.
  const rosterTotal = candidates.length - counts.benchmark
  // Everything except the closed outcomes, for the proportional bar.
  const liveBuckets = JOURNEY_BUCKETS.filter(b => b.key !== 'benchmark')
  const liveTotal = liveBuckets.reduce((n, b) => n + counts[b.key], 0)

  // ── needs you ──────────────────────────────────────────────────────────────
  const needsYou = candidates
    .map(c => ({ ...c, action: nextActionFor(c) }))
    .filter((c): c is ScopedCandidate & { action: NextAction } => c.action !== null)
    .sort(
      (a, b) =>
        new Date(a.journey_stage_at ?? 0).getTime() - new Date(b.journey_stage_at ?? 0).getTime(),
    )
  const NEEDS_SHOWN = 5

  // ── one real housekeeping task ─────────────────────────────────────────────
  // A candidate with no résumé cannot be graded or matched, which makes it the
  // only piece of data hygiene that actually blocks the pipeline.
  const missingResume = candidates.filter(
    c => !c.resume_blob_pathname && journeyBucket(c) !== 'benchmark',
  ).length

  // ── activity ───────────────────────────────────────────────────────────────
  const nameById = new Map(candidates.map(c => [c.id, c.name || 'A candidate']))
  let activity: {
    id: string
    description: string | null
    to_state: string | null
    source: string | null
    created_at: string
    candidate_id: string
  }[] = []

  if (candidates.length > 0) {
    // `backfill` is excluded deliberately. Those rows record a schema migration
    // touching many candidates at once, not anything that happened to a person
    // — 45 of them landed in a single afternoon and would be the entire feed.
    // They stay in the candidate's own history, which is where an audit trail
    // belongs.
    let actQuery = adminClient
      .from('candidate_activity_log')
      .select('id, description, to_state, source, created_at, candidate_id')
      .in('activity_type', MEANINGFUL_ACTIVITY)
      .or('source.is.null,source.neq.backfill')
      .order('created_at', { ascending: false })
      .limit(8)
    if (!canViewAll) actQuery = actQuery.in('candidate_id', candidates.map(c => c.id))
    const { data } = await actQuery
    activity = data || []
  }

  // ── team backlog (super admin only) ────────────────────────────────────────
  // Where the unmade introductions are sitting, and with whom. Nothing else in
  // the product answers that, and it is the one number that says who needs help.
  let teamBacklog: { name: string; waiting: number; warm: number }[] = []
  if (canViewAll) {
    const { data: owners } = await adminClient.from('users_admin').select('user_id, full_name, email')
    const ownerName = new Map(
      (owners || []).map(o => [o.user_id as string, (o.full_name as string) || (o.email as string)]),
    )
    const byOwner = new Map<string, { waiting: number; warm: number }>()
    for (const c of candidates) {
      if (!c.owner_user_id) continue
      const bucket = journeyBucket(c)
      if (bucket !== 'needs_you' && bucket !== 'warm') continue
      const row = byOwner.get(c.owner_user_id) ?? { waiting: 0, warm: 0 }
      if (bucket === 'needs_you') row.waiting++
      else row.warm++
      byOwner.set(c.owner_user_id, row)
    }
    teamBacklog = [...byOwner.entries()]
      .map(([id, v]) => ({ name: ownerName.get(id) || 'Unassigned', ...v }))
      .filter(r => r.waiting > 0)
      .sort((a, b) => b.waiting - a.waiting)
      .slice(0, 6)
  }

  // Leads with what is owed rather than what exists: a count of candidates is
  // weather, a count of people waiting on you is a to-do list.
  const summary =
    rosterTotal === 0
      ? canViewAll
        ? 'No candidates yet.'
        : 'No candidates yet. Refer someone to get started.'
      : needsYou.length > 0
        ? `${needsYou.length} ${needsYou.length === 1 ? 'candidate is' : 'candidates are'} waiting on you.`
        : "Nothing needs you right now — we'll keep things moving."

  const cardCls = 'bg-white border border-[#E4E3DC] rounded-[18px]'
  const focusCls = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F3A2F]/40'

  return (
    <div className="mx-auto max-w-[1060px] px-4 pb-16 sm:px-6">
      {/* ── greeting ───────────────────────────────────────────────────────── */}
      <div className="mb-10 flex flex-col gap-5 sm:mb-11 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[38px]">
              {timeGreeting(now)}, {firstName}
            </h1>
            {canViewAll && (
              <span className="shrink-0 rounded-full bg-[#E7EDE9] px-2.5 py-1 text-[11px] font-semibold text-[#1F3A2F]">
                Everyone&apos;s candidates
              </span>
            )}
          </div>
          <p className="mt-2.5 text-[15px] text-[#6E6E68] sm:text-base">{summary}</p>
        </div>
        {/* Only "Refer a candidate" for everyone but the super admin: the whole
            /jobs surface is hidden while JOBS_SUPER_ADMIN_ONLY is set, so a
            button that leads to a page they cannot open is a dead end. */}
        <div className="flex shrink-0 gap-2.5">
          {isSuperAdmin && (
            <Link
              href="/jobs/new"
              className={`rounded-full border border-[#D2D1C7] px-5 py-2.5 text-sm font-semibold text-[#161613] motion-safe:transition-colors hover:border-[#9C9C95] ${focusCls}`}
            >
              Add a role
            </Link>
          )}
          <Link
            href="/candidates/new"
            className={`rounded-full bg-[#1F3A2F] px-5 py-2.5 text-sm font-semibold text-white motion-safe:transition-colors hover:bg-[#142E24] ${focusCls}`}
          >
            Refer a candidate
          </Link>
        </div>
      </div>

      {/* ── needs you ──────────────────────────────────────────────────────── */}
      {needsYou.length > 0 && (
        <div className="mb-14 sm:mb-16">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold text-[22px] tracking-[-0.01em] text-[#161613]">Needs you</h2>
            {needsYou.length > NEEDS_SHOWN && (
              <Link
                href="/candidates?filter=needs_you"
                className={`text-[13.5px] text-[#6E6E68] hover:text-[#161613] ${focusCls}`}
              >
                See all {needsYou.length}
              </Link>
            )}
          </div>
          <div className={`${cardCls} overflow-hidden`}>
            {needsYou.slice(0, NEEDS_SHOWN).map(c => (
              <Link
                key={c.id}
                href={`/candidates/${c.id}`}
                className={`flex items-center gap-4 border-b border-[#E4E3DC] px-4 py-4 last:border-b-0 motion-safe:transition-colors hover:bg-[#FAF9F5] sm:px-6 ${focusCls}`}
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EFEFE9] text-[12.5px] font-semibold text-[#6E6E68]">
                  {initials(c.name || '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-[#161613]">
                      {c.name || 'Unnamed candidate'}
                    </span>
                    {c.panel_grade && (
                      <span className="shrink-0 rounded-md bg-[#E7EDE9] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#1F3A2F]">
                        {c.panel_grade === 'A-' ? 'A−' : c.panel_grade}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-[#9C9C95]">
                    {waitingSince(c.journey_stage_at)}
                  </div>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap text-sm font-semibold ${
                    c.action.tone === 'do' ? 'text-[#1F3A2F]' : 'text-[#8A6A1F]'
                  }`}
                >
                  {c.action.label} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── where everyone is ──────────────────────────────────────────────── */}
      {rosterTotal > 0 && (
        <div className="mb-14 sm:mb-16">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold text-[22px] tracking-[-0.01em] text-[#161613]">
              Where your candidates are
            </h2>
            <Link
              href="/candidates"
              className={`text-[13.5px] text-[#6E6E68] hover:text-[#161613] ${focusCls}`}
            >
              See all {rosterTotal}
            </Link>
          </div>
          <div className={`${cardCls} p-5 sm:p-[26px]`}>
            <div
              className="mb-6 flex h-3.5 overflow-hidden rounded-full bg-[#EAE9E1]"
              role="img"
              aria-label={liveBuckets
                .filter(b => counts[b.key] > 0)
                .map(b => `${counts[b.key]} ${b.label.toLowerCase()}`)
                .join(', ')}
            >
              {liveBuckets.map(b =>
                counts[b.key] > 0 && liveTotal > 0 ? (
                  <div
                    key={b.key}
                    style={{
                      width: `${(counts[b.key] / liveTotal) * 100}%`,
                      backgroundColor: b.dot,
                    }}
                    className="h-full"
                  />
                ) : null,
              )}
            </div>
            {/* Only the buckets that hold somebody. A row of zeroes is a list of
                things that have not happened, which is not a status report. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {liveBuckets
                .filter(b => counts[b.key] > 0)
                .map(b => (
                  <Link
                    key={b.key}
                    href={`/candidates?filter=${b.key}`}
                    className={`rounded-xl px-3 py-3 motion-safe:transition-colors hover:bg-[#FAF9F5] ${focusCls}`}
                  >
                    <div className="flex items-center text-[13px] font-semibold text-[#161613]">
                      <span
                        className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: b.dot }}
                      />
                      {b.label}
                    </div>
                    <div className="font-semibold my-1 text-[24px] tracking-[-0.01em] text-[#161613]">
                      {counts[b.key]}
                    </div>
                    <div className="text-[12px] leading-[1.4] text-[#6E6E68]">{b.blurb}</div>
                  </Link>
                ))}
            </div>
            {counts.benchmark > 0 && (
              <div className="mt-5 border-t border-[#E4E3DC] pt-4 text-[13px] text-[#9C9C95]">
                <Link
                  href="/candidates?filter=benchmark"
                  className={`border-b border-[#E0E0D8] pb-px hover:border-[#6E6E68] hover:text-[#6E6E68] ${focusCls}`}
                >
                  {counts.benchmark} benchmark {counts.benchmark === 1 ? 'profile' : 'profiles'}, kept
                  out of the count
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── team backlog, super admin only ─────────────────────────────────── */}
      {canViewAll && teamBacklog.length > 0 && (
        <div className="mb-14 sm:mb-16">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 className="font-semibold text-[22px] tracking-[-0.01em] text-[#161613]">
              Who the work is sitting with
            </h2>
          </div>
          <div className={`${cardCls} overflow-hidden`}>
            {teamBacklog.map(r => (
              <div
                key={r.name}
                className="flex items-center gap-4 border-b border-[#E4E3DC] px-4 py-3.5 last:border-b-0 sm:px-6"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EFEFE9] text-[11.5px] font-semibold text-[#6E6E68]">
                  {initials(r.name)}
                </div>
                <span className="min-w-0 flex-1 truncate text-sm text-[#161613]">{r.name}</span>
                <span className="shrink-0 text-[12.5px] text-[#9C9C95]">{r.warm} warm</span>
                <span className="w-[104px] shrink-0 text-right text-sm font-semibold tabular-nums text-[#1F3A2F]">
                  {r.waiting} waiting
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── one thing to fix ───────────────────────────────────────────────── */}
      {missingResume > 0 && (
        <div className="mb-14 sm:mb-16">
          <Link
            href="/candidates"
            className={`${cardCls} flex items-center justify-between gap-5 px-4 py-5 motion-safe:transition-colors hover:border-[#D2D1C7] sm:px-6 ${focusCls}`}
          >
            <div className="flex min-w-0 items-start gap-4">
              <div className="font-semibold grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#F5EEDD] text-[17px] text-[#8A6A1F]">
                {missingResume}
              </div>
              <div className="min-w-0">
                <h3 className="mb-0.5 text-[15px] font-semibold text-[#161613]">
                  {missingResume === 1
                    ? 'One candidate has no résumé'
                    : `${missingResume} candidates have no résumé`}
                </h3>
                <p className="max-w-[520px] text-[13.5px] text-[#6E6E68]">
                  We can&apos;t grade or match them without one.
                </p>
              </div>
            </div>
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#1F3A2F]">
              Fix →
            </span>
          </Link>
        </div>
      )}

      {/* ── what's happened ────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-baseline justify-between">
        <h2 className="font-semibold text-[22px] tracking-[-0.01em] text-[#161613]">
          What&apos;s happened lately
        </h2>
      </div>
      {activity.length > 0 ? (
        <div className={`${cardCls} overflow-hidden`}>
          {activity.map(a => {
            const automated = AUTOMATED_SOURCES.has(a.source ?? '')
            return (
              <div
                key={a.id}
                className="flex items-start gap-4 border-b border-[#E4E3DC] px-4 py-4 last:border-b-0 sm:px-6"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EFEFE9] text-[12.5px] font-semibold text-[#6E6E68]">
                  {initials(nameById.get(a.candidate_id) || '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link
                      href={`/candidates/${a.candidate_id}`}
                      className={`text-sm font-semibold text-[#161613] hover:underline ${focusCls}`}
                    >
                      {nameById.get(a.candidate_id) || 'A candidate'}
                    </Link>
                    {a.to_state && (
                      <span className="text-[13px] text-[#6E6E68]">
                        moved to{' '}
                        <span className="font-medium text-[#1F3A2F]">
                          {a.to_state.replace(/_/g, ' ')}
                        </span>
                      </span>
                    )}
                    <span className="text-[12px] text-[#9C9C95]">{relativeTime(a.created_at)}</span>
                    {automated && (
                      <span className="rounded bg-[#EAE9E1] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[#9C9C95]">
                        auto
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[#6E6E68]">
                      {a.description}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={`${cardCls} px-6 py-10 text-center`}>
          <p className="mb-4 text-sm text-[#6E6E68]">
            {rosterTotal > 0
              ? 'Nothing yet. Calls, notes and stage changes show up here.'
              : 'Refer your first candidate and their progress will show up here.'}
          </p>
          <Link
            href="/candidates/new"
            className={`inline-block rounded-full bg-[#1F3A2F] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#142E24] ${focusCls}`}
          >
            Refer a candidate
          </Link>
        </div>
      )}
    </div>
  )
}
