import { memo } from 'react'
import Link from 'next/link'
import type { Candidate } from '@/lib/types'
import { Linkedin, MapPin } from 'lucide-react'
import {
  CARD,
  CHIP,
  FOCUS,
  availabilityOf,
  avatarTint,
  formatSalary,
  initialsOf,
  ownerName,
  relativeTime,
  stageDot,
  stageLabel,
  GRADE_BADGE,
  UNGRADED,
  VERDICT_GRADES,
} from '@/lib/candidate-ui'

export interface EnrichedCandidate extends Candidate {
  pipeline_jobs?: { job_title: string; stage: string; company: string }[]
  owner?: { email: string; full_name: string | null } | null
  last_activity?: string
  latest_note_date?: string | null
}

interface CandidateCardProps {
  candidate: EnrichedCandidate
  /**
   * Super admin. Gates the two things that only mean something across
   * partners: the owner line, and Lily's (admin-only) verdict.
   */
  canViewAll?: boolean
}

function CandidateCardComponent({ candidate, canViewAll = false }: CandidateCardProps) {
  const availability = availabilityOf(candidate.availability_status)
  const salary = formatSalary(candidate.salary_expectation_min, candidate.salary_expectation_max)
  const currentRole = candidate.parsed_data?.work_history?.[0]
  const owner = ownerName(candidate.owner)

  // Meta line: only the facts that exist, joined by middots. An empty line is
  // better than a line of placeholder dashes.
  const meta = [
    candidate.location,
    candidate.experience_years ? `${candidate.experience_years} yrs` : null,
    salary,
  ].filter(Boolean) as string[]

  const skills = (candidate.skills ?? []).slice(0, 3)
  const stages = candidate.pipeline_jobs ?? []

  // One grade per card. Lily's assessment is the calibrated one so it wins when
  // present, but it is admin-only on the detail page — so partners only ever
  // see the recruiter grade here, and the two surfaces agree.
  const gradedBy = canViewAll && candidate.lily_verdict ? 'lily' : 'recruiter'
  const verdict = gradedBy === 'lily' ? candidate.lily_verdict : candidate.recruiter_verdict
  const grade = (verdict && VERDICT_GRADES[verdict]) || UNGRADED
  const gradeTitle = verdict
    ? `${gradedBy === 'lily' ? 'Lily' : 'Recruiter'} verdict: ${grade.label}`
    : UNGRADED.label

  return (
    <Link
      href={`/candidates/${candidate.id}`}
      className={`group block h-full rounded-[18px] ${FOCUS}`}
      aria-label={`${candidate.name}${currentRole ? `, ${currentRole.title}` : ''}`}
    >
      {/*
        Three tracks: identity block / flexible body / footer. Only the body
        flexes, which pins the footer to the bottom so timestamps line up
        across a row without every optional field reserving empty height.
      */}
      <article
        className={`${CARD} grid h-full grid-rows-[auto_1fr_auto] gap-3.5 p-4 transition-[border-color,box-shadow] duration-150 group-hover:border-[#D8D8D0] group-hover:shadow-[0_2px_12px_rgba(22,22,19,0.06)] sm:p-5`}
      >
        {/* ── identity ───────────────────────────────────────────────────── */}
        <header className="flex items-start gap-3">
          <span
            aria-hidden
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-[14px] font-semibold ${avatarTint(candidate.name)}`}
          >
            {initialsOf(candidate.name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="min-w-0 truncate text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[#161613]">
                {candidate.name}
              </h3>
              {candidate.linkedin_url && (
                <span
                  role="link"
                  tabIndex={0}
                  aria-label={`${candidate.name} on LinkedIn`}
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    window.open(candidate.linkedin_url!, '_blank', 'noopener,noreferrer')
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      window.open(candidate.linkedin_url!, '_blank', 'noopener,noreferrer')
                    }
                  }}
                  className={`shrink-0 cursor-pointer rounded p-0.5 text-[#9C9C95] transition-colors hover:text-[#0A66C2] ${FOCUS}`}
                >
                  <Linkedin className="h-[15px] w-[15px]" />
                </span>
              )}
            </div>

            {currentRole ? (
              <p className="mt-1 truncate text-[13.5px] leading-snug text-[#6E6E68]">
                {currentRole.title}
                {currentRole.company && (
                  <span className="text-[#9C9C95]"> · {currentRole.company}</span>
                )}
              </p>
            ) : (
              <p className="mt-1 truncate text-[13.5px] leading-snug text-[#9C9C95]">
                No role on file
              </p>
            )}

            {/* Availability reads as a dot + words, not a filled pill — it is a
                state, not a call to action. */}
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#6E6E68]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${availability.dot}`} />
              {availability.label}
            </p>
          </div>

          {/* Grade sits in a fixed top-right slot on every card, so it forms a
              readable column down the grid instead of moving with the content. */}
          <span
            className={`${GRADE_BADGE} ${grade.className} shrink-0`}
            title={gradeTitle}
            aria-label={gradeTitle}
          >
            {grade.grade}
          </span>
        </header>

        {/* ── body ───────────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-3">
          {meta.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#6E6E68]">
              {candidate.location && <MapPin className="h-3.5 w-3.5 shrink-0 text-[#9C9C95]" />}
              {meta.map((m, i) => (
                <span key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[#D8D8D0]">·</span>}
                  <span className={i === meta.length - 1 && salary ? 'font-medium text-[#161613]' : ''}>
                    {m}
                  </span>
                </span>
              ))}
            </p>
          )}

          {candidate.brief && (
            <p className="line-clamp-2 text-[13px] leading-[1.5] text-[#6E6E68]">
              {candidate.brief}
            </p>
          )}

          {skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s, i) => (
                <span key={i} className={CHIP}>
                  {s}
                </span>
              ))}
              {(candidate.skills?.length ?? 0) > 3 && (
                <span className="self-center text-[11.5px] text-[#9C9C95]">
                  +{(candidate.skills?.length ?? 0) - 3}
                </span>
              )}
            </div>
          )}

          {/* Stages only — the verdict now lives in the grade badge. Capped at
              two so this row never wraps and pads the whole grid row. */}
          {stages.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {stages.slice(0, 2).map((pj, i) => (
                <span key={i} className={CHIP} title={pj.job_title || pj.company}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${stageDot(pj.stage)}`} />
                  {stageLabel(pj.stage)}
                </span>
              ))}
              {stages.length > 2 && (
                <span className="self-center text-[11.5px] text-[#9C9C95]">
                  +{stages.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── footer: ownership + recency, the two metadata facts ────────── */}
        <footer className="flex items-center justify-between gap-3 border-t border-[#ECECE6] pt-3 text-[12px]">
          {canViewAll ? (
            owner ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[#6E6E68]">
                <span
                  aria-hidden
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold ${avatarTint(owner)}`}
                >
                  {initialsOf(owner)}
                </span>
                <span className="truncate">{owner}</span>
              </span>
            ) : (
              <span className="text-[#9C9C95]">Unassigned</span>
            )
          ) : (
            <span />
          )}
          <span className="shrink-0 text-[#9C9C95]">
            {relativeTime(candidate.last_activity ?? candidate.updated_at)}
          </span>
        </footer>
      </article>
    </Link>
  )
}

export const CandidateCard = memo(CandidateCardComponent)
