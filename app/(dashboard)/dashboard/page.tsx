import { createAdminClient } from '@/lib/supabase/server'
import { candidateOwnershipFilter, getAppUser } from '@/lib/current-user'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { startOfWeek, subDays } from 'date-fns'
import {
  DISPLAY_STAGES,
  NON_CLOSED_STAGE_VALUES,
  CLOSED_STAGE_VALUES,
  stageDisplayName,
  type DisplayStageKey,
} from '@/lib/pipeline-stages'
import type { PipelineStage } from '@/lib/types'

// Pipeline data is refreshed continuously by the matching automation.
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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWeek = Math.floor(diffDay / 7)
  if (diffWeek < 5) return `${diffWeek}w ago`
  return date.toLocaleDateString()
}

interface JoinedCandidate {
  id: string
  name: string | null
  status: string | null
  resume_blob_pathname: string | null
}

interface PipeRow {
  stage: PipelineStage
  candidate_id: string
  created_at: string
  updated_at: string
  candidates: JoinedCandidate | null
}

export default async function DashboardPage() {
  const adminClient = createAdminClient()

  // ── auth + role (server-side, from the authenticated session only) ──────────
  const appUser = await getAppUser()
  if (!appUser) {
    redirect('/auth/login')
  }

  // Candidate visibility follows canViewAllCandidates (super admin only), not
  // the broader admin-console capability. See lib/current-user.ts.
  const canViewAll = appUser.canViewAllCandidates
  const firstName = appUser.fullName?.split(' ')[0] || 'there'
  const me = appUser.id

  const now = new Date()
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const fourteenDaysAgo = subDays(now, 14)

  // ── ownership scoping (server-side) ─────────────────────────────────────────
  // A candidate is "yours" if you own/uploaded/created it. A pipeline row is
  // "yours" if the row is owned by you OR its candidate is yours. Admins see all.
  let ownedCandidateIds: string[] = []
  let placedCount = 0

  if (!canViewAll) {
    const { data: ownedCands } = await adminClient
      .from('candidates')
      .select('id, status')
      .or(candidateOwnershipFilter(me))
    ownedCandidateIds = (ownedCands || []).map(c => c.id)
    placedCount = (ownedCands || []).filter(c => c.status === 'hired').length
  } else {
    const { count } = await adminClient
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'hired')
    placedCount = count || 0
  }

  // Scoped pipeline fetch: a single query bounded to this user's rows (not the
  // whole table), aggregated server-side below.
  let pipeQuery = adminClient
    .from('job_candidate_pipeline')
    .select(
      'stage, candidate_id, created_at, updated_at, owner_user_id, candidates(id, name, status, resume_blob_pathname)',
    )

  if (!canViewAll) {
    const orParts = [`owner_user_id.eq.${me}`]
    if (ownedCandidateIds.length > 0) {
      orParts.push(`candidate_id.in.(${ownedCandidateIds.join(',')})`)
    }
    pipeQuery = pipeQuery.or(orParts.join(','))
  }

  const { data: pipeDataRaw } = await pipeQuery
  const pipeRows = (pipeDataRaw || []) as unknown as PipeRow[]

  // ── aggregate into display-stage buckets (distinct candidates per bucket) ────
  const bucketSets: Record<DisplayStageKey, Set<string>> = {
    in_review: new Set(),
    matched: new Set(),
    in_play: new Set(),
    placed: new Set(),
  }
  const newThisWeek = new Set<string>()
  const staleCandidates = new Set<string>()
  const missingResume = new Set<string>()
  const closedCandidates = new Set<string>()
  const nonClosedSet = new Set<PipelineStage>(NON_CLOSED_STAGE_VALUES)
  const closedSet = new Set<PipelineStage>(CLOSED_STAGE_VALUES)

  for (const p of pipeRows) {
    if (closedSet.has(p.stage)) {
      closedCandidates.add(p.candidate_id)
      continue
    }
    const ds = DISPLAY_STAGES.find(d => d.stages.includes(p.stage))
    if (ds) bucketSets[ds.key].add(p.candidate_id)

    if (nonClosedSet.has(p.stage)) {
      if (new Date(p.created_at) >= weekStart) newThisWeek.add(p.candidate_id)
      if (new Date(p.updated_at) < fourteenDaysAgo) staleCandidates.add(p.candidate_id)
      if (!p.candidates?.resume_blob_pathname) missingResume.add(p.candidate_id)
    }
  }

  const counts: Record<DisplayStageKey, number> = {
    in_review: bucketSets.in_review.size,
    matched: bucketSets.matched.size,
    in_play: bucketSets.in_play.size,
    placed: placedCount,
  }

  const yourCandidates = new Set<string>([
    ...bucketSets.in_review,
    ...bucketSets.matched,
    ...bucketSets.in_play,
  ]).size + placedCount

  const journeyTotal = counts.in_review + counts.matched + counts.in_play + counts.placed
  const closedCount = closedCandidates.size

  // ── recent activity: last 10 stage transitions on this user's candidates ────
  let activity: {
    id: string
    previous_stage: string | null
    new_stage: string
    changed_at: string
    candidate_name: string
  }[] = []

  const runActivity = canViewAll || ownedCandidateIds.length > 0
  if (runActivity) {
    let histQuery = adminClient
      .from('pipeline_stage_history')
      .select('id, previous_stage, new_stage, changed_at, candidate_id, candidates(name)')
      .order('changed_at', { ascending: false })
      .limit(10)
    if (!canViewAll) histQuery = histQuery.in('candidate_id', ownedCandidateIds)
    const { data: hist } = await histQuery
    activity = (hist || []).map(h => {
      const candRaw = h.candidates as unknown
      const cand = (Array.isArray(candRaw) ? candRaw[0] : candRaw) as { name: string | null } | null
      return {
        id: h.id as string,
        previous_stage: h.previous_stage as string | null,
        new_stage: h.new_stage as string,
        changed_at: h.changed_at as string,
        candidate_name: cand?.name || 'A candidate',
      }
    })
  }

  // ── "Next up" tasks (only real, actionable ones) ────────────────────────────
  const tasks: { key: string; count: number; tone: 'g' | 'a'; title: string; body: string; href: string; cta: string }[] = []
  if (counts.matched > 0) {
    tasks.push({
      key: 'review',
      count: counts.matched,
      tone: 'g',
      title: 'Review your new matches',
      body: `${counts.matched} ${counts.matched === 1 ? 'candidate is' : 'candidates are'} matched to open roles. A quick look from you keeps them moving toward an intro.`,
      href: '/dashboard/pipeline/job_matched',
      cta: 'Review',
    })
  }
  if (missingResume.size > 0) {
    const n = missingResume.size
    tasks.push({
      key: 'resume',
      count: n,
      tone: 'a',
      title: n === 1 ? 'One candidate is missing a resume' : `${n} candidates are missing a resume`,
      body: "We can't match them to roles without one. Nudge them or upload it yourself.",
      href: '/candidates',
      cta: 'Fix',
    })
  }
  if (staleCandidates.size > 0) {
    const n = staleCandidates.size
    tasks.push({
      key: 'stale',
      count: n,
      tone: 'a',
      title: n === 1 ? 'One candidate has been quiet for two weeks' : `${n} candidates have been quiet for two weeks`,
      body: 'No movement in 14 days or more. A nudge can restart the conversation.',
      href: '/candidates',
      cta: 'Open',
    })
  }

  // Greeting summary sentence
  const summary =
    yourCandidates === 0
      ? canViewAll
        ? 'No candidates in the pipeline yet.'
        : "You have no candidates in your pipeline yet. Refer someone to get started."
      : `${newThisWeek.size > 0 ? `${newThisWeek.size} ${newThisWeek.size === 1 ? 'candidate' : 'candidates'} joined your pipeline this week. ` : ''}${counts.matched} ${counts.matched === 1 ? 'is' : 'are'} matched to open roles.`

  const cardCls = 'bg-white border border-[#ECECE6] rounded-[18px]'
  const focusCls = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F4D3A]/40'

  return (
    <div className="max-w-[1060px] mx-auto px-4 sm:px-6 pb-16">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5 mb-10 sm:mb-11">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif font-normal text-[30px] sm:text-[38px] tracking-[-0.02em] leading-[1.15] text-[#161613]">
              {timeGreeting(now)}, {firstName}
            </h1>
            {canViewAll && (
              <span className="shrink-0 rounded-full bg-[#E9F0EC] text-[#1F4D3A] text-[11px] font-semibold px-2.5 py-1">
                Viewing all candidates
              </span>
            )}
          </div>
          <p className="text-[15px] sm:text-base text-[#6E6E68] mt-2.5">{summary}</p>
        </div>
        <div className="flex gap-2.5 shrink-0">
          <Link
            href="/jobs/new"
            className={`rounded-full border border-[#D8D8D0] text-[#161613] text-sm font-semibold px-5 py-2.5 motion-safe:transition-colors hover:border-[#9C9C95] ${focusCls}`}
          >
            Add a role
          </Link>
          <Link
            href="/candidates/new"
            className={`rounded-full bg-[#1F4D3A] text-white text-sm font-semibold px-5 py-2.5 motion-safe:transition-colors hover:bg-[#173D2E] ${focusCls}`}
          >
            Refer a candidate
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-14 sm:mb-16">
        <div className={`${cardCls} px-6 py-6`}>
          <div className="text-[13px] text-[#6E6E68] mb-3.5">Your candidates</div>
          <div className="font-serif text-[40px] leading-none tracking-[-0.02em] text-[#161613]">{yourCandidates}</div>
          <div className={`mt-3 text-[13px] ${newThisWeek.size > 0 ? 'text-[#1F4D3A] font-semibold' : 'text-[#9C9C95]'}`}>
            {newThisWeek.size > 0 ? `+${newThisWeek.size} this week` : 'No new candidates this week'}
          </div>
        </div>
        <div className={`${cardCls} px-6 py-6`}>
          <div className="text-[13px] text-[#6E6E68] mb-3.5">Matched to open roles</div>
          <div className="font-serif text-[40px] leading-none tracking-[-0.02em] text-[#161613]">{counts.matched}</div>
          <div className="mt-3 text-[13px]">
            {counts.matched > 0 ? (
              <Link href="/dashboard/pipeline/job_matched" className={`text-[#6E6E68] border-b border-[#D8D8D0] pb-px hover:border-[#161613] hover:text-[#161613] ${focusCls}`}>
                Review matches
              </Link>
            ) : (
              <span className="text-[#9C9C95]">Nothing to review yet</span>
            )}
          </div>
        </div>
        <div className={`${cardCls} px-6 py-6`}>
          <div className="text-[13px] text-[#6E6E68] mb-3.5">Placed</div>
          <div className="font-serif text-[40px] leading-none tracking-[-0.02em] text-[#161613]">{counts.placed}</div>
          <div className="mt-3 text-[13px] text-[#9C9C95]">
            {counts.placed > 0 ? (counts.placed === 1 ? 'Candidate hired' : 'Candidates hired') : 'No placements yet'}
          </div>
        </div>
      </div>

      {/* Journey */}
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-serif text-[22px] tracking-[-0.01em] text-[#161613]">Where your candidates are</h2>
        {yourCandidates > 0 && (
          <Link href="/candidates" className={`text-[13.5px] text-[#6E6E68] hover:text-[#161613] ${focusCls}`}>
            See all {yourCandidates}
          </Link>
        )}
      </div>
      <div className={`${cardCls} p-6 sm:p-[30px] mb-14 sm:mb-16`}>
        <div className="flex h-3.5 rounded-full overflow-hidden bg-[#F0F0EA] mb-6" role="img" aria-label={`${counts.in_review} in review, ${counts.matched} matched to roles, ${counts.in_play} in play, ${counts.placed} placed`}>
          {DISPLAY_STAGES.map(ds =>
            counts[ds.key] > 0 && journeyTotal > 0 ? (
              <div key={ds.key} style={{ width: `${(counts[ds.key] / journeyTotal) * 100}%`, backgroundColor: ds.dotColor }} className="h-full" />
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {DISPLAY_STAGES.map(ds => {
            const dim = counts[ds.key] === 0
            return (
              <div key={ds.key} className="px-4 py-3.5 rounded-xl motion-safe:transition-colors hover:bg-[#FAFAF6]">
                <div className="text-sm font-semibold flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: dim ? '#E4E4DC' : ds.dotColor }} />
                  <span className={dim ? 'text-[#9C9C95]' : 'text-[#161613]'}>{ds.name}</span>
                </div>
                <div className={`font-serif text-[26px] tracking-[-0.01em] my-1.5 ${dim ? 'text-[#9C9C95]' : 'text-[#161613]'}`}>{counts[ds.key]}</div>
                <div className="text-[12.5px] text-[#6E6E68] leading-[1.45]">{ds.description}</div>
              </div>
            )
          })}
        </div>
        <div className="mt-5 pt-4 border-t border-[#ECECE6] flex justify-between text-[13px] text-[#9C9C95]">
          <span>Updated just now</span>
          {closedCount > 0 && (
            <Link href="/dashboard/pipeline/rejected" className={`border-b border-[#E0E0D8] pb-px hover:text-[#6E6E68] hover:border-[#6E6E68] ${focusCls}`}>
              {closedCount} closed {closedCount === 1 ? 'referral' : 'referrals'} in your archive
            </Link>
          )}
        </div>
      </div>

      {/* Next up */}
      {tasks.length > 0 && (
        <div className="mb-14 sm:mb-16">
          <h2 className="font-serif text-[22px] tracking-[-0.01em] text-[#161613] mb-5">Next up</h2>
          <div className="space-y-3">
            {tasks.map(t => (
              <Link
                key={t.key}
                href={t.href}
                className={`${cardCls} px-6 py-5 flex items-center justify-between gap-5 motion-safe:transition-colors hover:border-[#D8D8D0] ${focusCls}`}
              >
                <div className="flex gap-4 items-start min-w-0">
                  <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-serif text-[17px] ${t.tone === 'g' ? 'bg-[#E9F0EC] text-[#1F4D3A]' : 'bg-[#F5EEDD] text-[#8A6A1F]'}`}>
                    {t.count}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold text-[#161613] mb-0.5">{t.title}</h3>
                    <p className="text-[13.5px] text-[#6E6E68] max-w-[520px]">{t.body}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-[#1F4D3A] whitespace-nowrap shrink-0">{t.cta} →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="font-serif text-[22px] tracking-[-0.01em] text-[#161613]">Recent activity</h2>
        {activity.length > 0 && (
          <Link href="/candidates" className={`text-[13.5px] text-[#6E6E68] hover:text-[#161613] ${focusCls}`}>
            View all
          </Link>
        )}
      </div>
      {activity.length > 0 ? (
        <div className={`${cardCls} overflow-hidden`}>
          {activity.map(a => {
            const isNew = a.previous_stage === null
            return (
              <div key={a.id} className="flex items-center gap-4 px-6 py-4 border-b border-[#ECECE6] last:border-b-0 motion-safe:transition-colors hover:bg-[#FAFAF6]">
                <div className="shrink-0 w-9 h-9 rounded-full bg-[#EFEFE9] text-[#6E6E68] flex items-center justify-center text-[12.5px] font-semibold">
                  {initials(a.candidate_name)}
                </div>
                <div className="flex-1 text-sm text-[#161613] min-w-0">
                  <span className="font-semibold">{a.candidate_name}</span>{' '}
                  {isNew ? (
                    <>joined your pipeline and is <span className="font-semibold">in review</span></>
                  ) : (
                    <>moved to <span className="text-[#1F4D3A] font-semibold">{stageDisplayName(a.new_stage)}</span></>
                  )}
                </div>
                <div className="text-[12.5px] text-[#9C9C95] whitespace-nowrap shrink-0">{formatRelativeTime(a.changed_at)}</div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={`${cardCls} px-6 py-10 text-center`}>
          <p className="text-sm text-[#6E6E68] mb-4">
            {yourCandidates > 0
              ? 'No stage changes yet. Activity shows up here as your candidates move through the pipeline.'
              : 'Refer your first candidate and their progress will show up here.'}
          </p>
          <Link href="/candidates/new" className={`inline-block rounded-full bg-[#1F4D3A] text-white text-sm font-semibold px-5 py-2.5 hover:bg-[#173D2E] ${focusCls}`}>
            Refer a candidate
          </Link>
        </div>
      )}
    </div>
  )
}
