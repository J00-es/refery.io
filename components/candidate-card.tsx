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
  VERDICT_DOTS,
  VERDICT_LABELS,
} from '@/lib/candidate-ui'

export interface EnrichedCandidate extends Candidate {
  pipeline_jobs?: { job_title: string; stage: string; company: string }[]
  owner?: { email: string; full_name: string | null } | null
  last_activity?: string
  latest_note_date?: string | null
}

interface CandidateCardProps {
  candidate: EnrichedCandidate
  /** Owner is meaningful only when you can see other people's candidates. */
  showOwner?: boolean
}

function CandidateCardComponent({ candidate, showOwner = false }: CandidateCardProps) {
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

  // Pipeline stages and human verdicts are both "where does this person
  // stand" signals, so they share one row. Verdicts lead — an assessment is
  // scarcer and more decision-relevant than a stage.
  const signals: { label: string; dot: string; title: string }[] = [
    ...(candidate.recruiter_verdict
      ? [
          {
            label: VERDICT_LABELS[candidate.recruiter_verdict] ?? candidate.recruiter_verdict,
            dot: VERDICT_DOTS[candidate.recruiter_verdict] ?? 'bg-[#B8B8B0]',
            title: 'Recruiter verdict',
          },
        ]
      : []),
    ...(candidate.lily_verdict
      ? [
          {
            label: VERDICT_LABELS[candidate.lily_verdict] ?? candidate.lily_verdict,
            dot: VERDICT_DOTS[candidate.lily_verdict] ?? 'bg-[#B8B8B0]',
            title: 'Lily verdict',
          },
        ]
      : []),
    ...(candidate.pipeline_jobs ?? []).map(pj => ({
      label: stageLabel(pj.stage),
      dot: stageDot(pj.stage),
      title: pj.job_title || pj.company,
    })),
  ]

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

          {/*
            Stages and verdicts share one capped row. Given as separate rows
            they were the main driver of height variance, and in an
            equal-height grid the tallest card pads every other card in its
            row with dead space.
          */}
          {signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {signals.slice(0, 2).map((s, i) => (
                <span key={i} className={CHIP} title={s.title}>
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              ))}
              {signals.length > 2 && (
                <span className="self-center text-[11.5px] text-[#9C9C95]">
                  +{signals.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── footer: ownership + recency, the two metadata facts ────────── */}
        <footer className="flex items-center justify-between gap-3 border-t border-[#ECECE6] pt-3 text-[12px]">
          {showOwner ? (
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
