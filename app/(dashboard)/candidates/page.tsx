import { createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Candidate } from '@/lib/types'
import { CandidateList } from '@/components/candidate-list'
import { CandidatesIntroNote } from '@/components/candidates/candidates-intro-note'
import { UNASSIGNED, type OwnerOption } from '@/components/candidates/owner-filter'
import { candidateScopeFilter, getAppUser } from '@/lib/current-user'
import { scopeUserIds } from '@/lib/firms'
import { FOCUS, ownerName } from '@/lib/candidate-ui'
import { cookies } from 'next/headers'
import { JOURNEY_BUCKETS, type JourneyBucket } from '@/lib/journey'

/** Every bucket on the dashboard links here, so any of them is a valid entry. */
function isJourneyBucket(v: string | undefined): v is JourneyBucket {
  return !!v && JOURNEY_BUCKETS.some(b => b.key === v)
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  await cookies()
  // Read on the server and handed down as a prop rather than pulled from
  // useSearchParams in the list: the list is a client component, and reading the
  // URL there would drag it behind a Suspense boundary for no benefit.
  const { filter } = await searchParams
  const adminClient = createAdminClient()

  const appUser = await getAppUser()

  if (!appUser) {
    return <div>Please log in to view candidates.</div>
  }

  // Only the super admin sees other people's candidates. Every other role —
  // recruiter, scout, and `admin` alike — is scoped to what is assigned to
  // them. Enforced again by RLS via public.can_view_all_candidates().
  const canViewAll = appUser.canViewAllCandidates

  let candidatesQuery = adminClient
    .from('candidates')
    .select('*')
    .order('created_at', { ascending: false })

  if (!canViewAll) {
    candidatesQuery = candidatesQuery.or(
      candidateScopeFilter(await scopeUserIds(adminClient, { id: appUser.id })),
    )
  }

  const candidatesResult = await candidatesQuery
  const candidates = candidatesResult.data ?? []
  const visibleIds = candidates.map(c => c.id)

  // Pipeline rows and notes only decorate the candidates scoped above, so
  // restrict them to that set — an unscoped fetch here would leak other
  // partners' activity and read the whole table to do it.
  let pipelineQuery = adminClient
    .from('job_candidate_pipeline')
    .select('candidate_id, stage, job:jobs(title, company_name)')

  let notesQuery = adminClient
    .from('recruiter_notes')
    .select('candidate_id, created_at')
    .order('created_at', { ascending: false })

  if (!canViewAll) {
    pipelineQuery = pipelineQuery.in('candidate_id', visibleIds)
    notesQuery = notesQuery.in('candidate_id', visibleIds)
  }

  const [pipelineResult, notesResult] = visibleIds.length
    ? await Promise.all([pipelineQuery, notesQuery])
    : [null, null]

  const recruiterNotes = notesResult?.data
  const pipelineData = pipelineResult?.data

  // Build map of candidate_id -> latest note date
  const latestNoteByCandidate: Record<string, string> = {}
  if (recruiterNotes) {
    for (const note of recruiterNotes) {
      if (!latestNoteByCandidate[note.candidate_id]) {
        latestNoteByCandidate[note.candidate_id] = note.created_at
      }
    }
  }

  // Get unique owner IDs that exist
  const ownerIds = [...new Set(candidates.filter(c => c.owner_user_id).map(c => c.owner_user_id))]

  // adminClient rather than the RLS-scoped client: users_admin only exposes the
  // viewer's own row, so a candidate owned by a teammate fell through to
  // ownerMap[id] = undefined and rendered as "Unassigned". The ids come from
  // candidates already scoped to this viewer, so this reveals no one they
  // can't already see.
  let ownerMap: Record<string, { email: string; full_name: string | null }> = {}
  if (ownerIds.length > 0) {
    const { data: owners } = await adminClient
      .from('users_admin')
      .select('user_id, email, full_name')
      .in('user_id', ownerIds)

    if (owners) {
      ownerMap = Object.fromEntries(
        owners.map(o => [o.user_id, { email: o.email, full_name: o.full_name }]),
      )
    }
  }

  // Group pipeline data by candidate
  const pipelineByCandidate: Record<string, { job_title: string; stage: string; company: string }[]> = {}
  if (pipelineData) {
    for (const p of pipelineData) {
      if (!pipelineByCandidate[p.candidate_id]) {
        pipelineByCandidate[p.candidate_id] = []
      }
      if (p.job) {
        const job = p.job as unknown as { title: string; company_name: string }
        pipelineByCandidate[p.candidate_id].push({
          job_title: job.title,
          stage: p.stage,
          company: job.company_name || '',
        })
      }
    }
  }

  // Enrich candidates with last_activity (max of updated_at, created_at, and latest recruiter note)
  const enrichedCandidates = candidates.map(candidate => {
    const latestNoteDate = latestNoteByCandidate[candidate.id]
    const candidateUpdated = new Date(candidate.updated_at).getTime()
    const candidateCreated = new Date(candidate.created_at).getTime()
    const noteDate = latestNoteDate ? new Date(latestNoteDate).getTime() : 0

    const lastActivityTimestamp = Math.max(candidateUpdated, candidateCreated, noteDate)

    return {
      ...candidate,
      pipeline_jobs: pipelineByCandidate[candidate.id] || [],
      owner: candidate.owner_user_id ? ownerMap[candidate.owner_user_id] || null : null,
      last_activity: new Date(lastActivityTimestamp).toISOString(),
      latest_note_date: latestNoteDate || null,
    }
  }) as (Candidate & {
    pipeline_jobs: { job_title: string; stage: string; company: string }[]
    owner: { email: string; full_name: string | null } | null
    last_activity: string
    latest_note_date: string | null
  })[]

  // Owner facet options, counted off the visible set so each row shows how many
  // candidates it resolves to before you apply it. Super admin only — for
  // anyone else every candidate is their own and the filter would be a no-op.
  let ownerOptions: OwnerOption[] = []
  if (canViewAll) {
    const counts = new Map<string, number>()
    for (const c of enrichedCandidates) {
      const id = c.owner_user_id ?? UNASSIGNED
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }

    ownerOptions = [...counts.entries()]
      .map(([id, count]) => {
        if (id === UNASSIGNED) {
          return { id, name: 'Unassigned', email: null, count }
        }
        const o = ownerMap[id]
        return { id, name: ownerName(o) ?? 'Unknown', email: o?.email ?? null, count }
      })
      .sort((a, b) => {
        // Unassigned last; otherwise the biggest books of business first.
        if (a.id === UNASSIGNED) return 1
        if (b.id === UNASSIGNED) return -1
        return b.count - a.count || a.name.localeCompare(b.name)
      })
  }

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 px-1 pb-16 sm:px-0">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#161613] sm:text-[36px]">
            Candidates
          </h1>
          <p className="mt-2 text-[14px] text-[#6E6E68] sm:text-[15px]">
            {canViewAll
              ? 'Every partner’s candidates. Filter by owner to focus on one book.'
              : 'Everyone you’ve referred or been assigned.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2.5">
          <Link
            href="/candidates/bulk"
            className={`flex h-11 items-center rounded-full border border-[#D2D1C7] px-5 text-[14px] font-semibold text-[#161613] transition-colors hover:border-[#9C9C95] ${FOCUS}`}
          >
            Bulk upload
          </Link>
          <Link
            href="/candidates/new"
            className={`flex h-11 items-center rounded-full bg-[#1F3A2F] px-5 text-[14px] font-semibold text-white transition-colors hover:bg-[#142E24] ${FOCUS}`}
          >
            Add candidate
          </Link>
        </div>
      </header>

      <CandidatesIntroNote />

      <CandidateList
        candidates={enrichedCandidates}
        owners={ownerOptions}
        canViewAll={canViewAll}
        initialTab={isJourneyBucket(filter) ? filter : 'all'}
      />
    </div>
  )
}
