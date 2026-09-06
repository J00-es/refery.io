'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, MapPin, Plus, Sparkles } from 'lucide-react'
import { CARD, CHIP, FOCUS } from '@/lib/candidate-ui'
import { stageLabel, stageTint } from '@/lib/company-ui'
import { REMOTE_LABELS, formatSalary } from '@/lib/job-ui'

interface Suggestion {
  job_id: string
  title: string
  company_name: string | null
  company_stage: string | null
  location: string | null
  remote_policy: string | null
  department: string | null
  salary_min: number | null
  salary_max: number | null
  similarity: number
  /** Composite score: similarity + function affinity + seniority fit. */
  match_score: number | null
  job_function: string | null
}

/** Plain-language read of the composite score, so a number is never shown bare. */
function fitLabel(score: number): { label: string; className: string } {
  if (score >= 0.7) return { label: 'Strong fit', className: 'bg-[#1F3A2F] text-white' }
  if (score >= 0.6) return { label: 'Good fit', className: 'bg-[#E7EDE9] text-[#1F3A2F]' }
  if (score >= 0.5) return { label: 'Possible fit', className: 'bg-[#F3F1E6] text-[#6E6A2E]' }
  return { label: 'Loose fit', className: 'bg-[#EAE9E1] text-[#6E6E68]' }
}

/**
 * Open roles ranked against this candidate's embedding. Exists because 60% of
 * referred candidates have never been matched to anything — the nightly
 * automation reports zero matches created and matching is otherwise a manual
 * per-candidate step. Suggestions are advisory: nothing enters the pipeline
 * until someone adds it here.
 */
export function SuggestedJobs({ candidateId }: { candidateId: string }) {
  const router = useRouter()
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [error, setError] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    fetch(`/api/candidates/${candidateId}/suggested-jobs?limit=6`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => !cancelled && setSuggestions(d.suggestions ?? []))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [candidateId])

  async function addToPipeline(jobId: string) {
    setAdding(jobId)
    try {
      const res = await fetch(`/api/jobs/${jobId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate_id: candidateId, stage: 'job_matched' }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setAdded(prev => new Set(prev).add(jobId))
      router.refresh()
    } catch {
      setError(true)
    } finally {
      setAdding(null)
    }
  }

  if (error || (suggestions && suggestions.length === 0)) return null

  return (
    <section className={`${CARD} p-4 sm:p-5`}>
      <header className="mb-4 flex items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-[#1F3A2F]" />
        <h2 className="font-semibold text-[18px] tracking-[-0.01em] text-[#161613]">Suggested roles<span className="ml-2 inline-block rounded-full border border-[#E4E3DC] px-1.5 py-px align-middle text-[10.5px] font-medium tracking-wide text-[#9C9C95]" title="Only super admins see this section.">you only</span></h2>
      </header>

      {!suggestions ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-[12px] bg-[#EAE9E1]" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {suggestions.map(s => {
            const salary = formatSalary(s.salary_min, s.salary_max)
            const remote = s.remote_policy ? REMOTE_LABELS[s.remote_policy] : null
            const stage = stageLabel(s.company_stage)
            const isAdded = added.has(s.job_id)

            return (
              <li
                key={s.job_id}
                className="flex min-w-0 items-start gap-3 rounded-[12px] border border-[#E4E3DC] bg-[#FAF9F5] p-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/jobs/${s.job_id}`}
                    className={`block truncate text-[14px] font-semibold text-[#161613] hover:underline ${FOCUS}`}
                    title={s.title}
                  >
                    {s.title}
                  </Link>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] text-[#6E6E68]">
                    <span className="truncate">{s.company_name || 'Unknown company'}</span>
                    {stage && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${stageTint(s.company_stage)}`}
                      >
                        {stage}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[#9C9C95]">
                    {s.location && <MapPin className="h-3 w-3 shrink-0" />}
                    <span className="truncate">
                      {[s.location, remote, salary].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {(() => {
                    const score = s.match_score ?? s.similarity
                    const fit = fitLabel(score)
                    return (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${fit.className}`}
                        title={`Score ${score.toFixed(2)} — similarity ${s.similarity.toFixed(2)}${
                          s.job_function ? `, ${s.job_function} role` : ''
                        }`}
                      >
                        {fit.label}
                      </span>
                    )
                  })()}
                  {isAdded ? (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-[#1F3A2F]">
                      <Check className="h-3.5 w-3.5" />
                      Added
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={adding === s.job_id}
                      onClick={() => addToPipeline(s.job_id)}
                      className={`flex items-center gap-1 rounded-full border border-[#D2D1C7] bg-white px-2.5 py-1 text-[12px] font-medium text-[#161613] transition-colors hover:border-[#9C9C95] disabled:opacity-50 ${FOCUS}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {adding === s.job_id ? 'Adding…' : 'Add'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-3 text-[11.5px] leading-[1.5] text-[#9C9C95]">
        Ranked on role similarity, function fit and seniority — the same scoring the nightly
        matcher uses. Adding one puts the candidate in that job&apos;s pipeline at{' '}
        <span className="font-medium">Job Matched</span> — nothing is sent to the candidate.
      </p>
    </section>
  )
}
