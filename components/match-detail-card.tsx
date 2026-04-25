'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { JobMatch, Job, Candidate } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'

interface MatchDetailCardProps {
  match: JobMatch & { job?: Job; candidate?: Candidate }
  showCandidate?: boolean
  showJob?: boolean
}

export function MatchDetailCard({ match, showCandidate = true, showJob = false }: MatchDetailCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const scoreCategories = [
    { key: 'skills_score', label: 'Skills Match', weight: 30, icon: '🎯', description: 'Technical and soft skills alignment' },
    { key: 'experience_score', label: 'Experience', weight: 25, icon: '📈', description: 'Years of experience fit' },
    { key: 'keywords_score', label: 'Keywords', weight: 20, icon: '🔑', description: 'Resume keywords and certifications' },
    { key: 'location_score', label: 'Location', weight: 15, icon: '📍', description: 'Geographic and remote compatibility' },
    { key: 'salary_score', label: 'Salary', weight: 10, icon: '💰', description: 'Compensation range alignment' },
  ] as const

  const getScoreColor = (score: number | null | undefined) => {
    if (score == null) return { bg: 'bg-muted', text: 'text-muted-foreground', stroke: 'stroke-muted' }
    if (score >= 80) return { bg: 'bg-emerald-500', text: 'text-emerald-600', stroke: 'stroke-emerald-500' }
    if (score >= 60) return { bg: 'bg-amber-500', text: 'text-amber-600', stroke: 'stroke-amber-500' }
    return { bg: 'bg-red-500', text: 'text-red-600', stroke: 'stroke-red-500' }
  }

  const overallColors = getScoreColor(match.overall_score)

  // Calculate circumference for circular progress
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (match.overall_score / 100) * circumference

  const entity = showCandidate ? match.candidate : match.job
  const entityLink = showCandidate ? `/candidates/${match.candidate_id}` : `/jobs/${match.job_id}`

  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex">
          {/* Score circle */}
          <div className="flex flex-col items-center justify-center p-6 bg-muted/30 border-r border-border">
            <div className="relative w-24 h-24">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle
                  className="stroke-muted"
                  strokeWidth="8"
                  fill="none"
                  r={radius}
                  cx="50"
                  cy="50"
                />
                <circle
                  className={cn('transition-all duration-500', overallColors.stroke)}
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                  r={radius}
                  cx="50"
                  cy="50"
                  style={{
                    strokeDasharray: circumference,
                    strokeDashoffset,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn('text-2xl font-bold', overallColors.text)}>
                  {Math.round(match.overall_score)}
                </span>
                <span className="text-xs text-muted-foreground">/ 100</span>
              </div>
            </div>
            <p className={cn('text-sm font-medium mt-2', overallColors.text)}>
              {match.overall_score >= 80 ? 'Excellent' : match.overall_score >= 60 ? 'Good' : 'Low'} Match
            </p>
          </div>

          {/* Main content */}
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                {showCandidate && match.candidate && (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={entityLink}>
                        <h3 className="font-semibold text-lg text-foreground hover:text-primary transition-colors">
                          {match.candidate.name}
                        </h3>
                      </Link>
                      {/* Availability Status Badge */}
                      {(() => {
                        const status = match.candidate.availability_status || 'not_yet_talked'
                        const config = AVAILABILITY_STATUSES[status as keyof typeof AVAILABILITY_STATUSES]
                        return config ? (
                          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', config.color)}>
                            {config.label}
                          </span>
                        ) : null
                      })()}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {match.candidate.experience_years ? `${match.candidate.experience_years} years` : 'Experience unknown'} 
                      {match.candidate.location && ` • ${match.candidate.location}`}
                    </p>
                    {match.candidate.skills && match.candidate.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {match.candidate.skills.slice(0, 5).map((skill) => (
                          <span key={skill} className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                            {skill}
                          </span>
                        ))}
                        {match.candidate.skills.length > 5 && (
                          <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                            +{match.candidate.skills.length - 5}
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
                {showJob && match.job && (
                  <>
                    <Link href={entityLink}>
                      <h3 className="font-semibold text-lg text-foreground hover:text-primary transition-colors">
                        {match.job.title}
                      </h3>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {match.job.department && `${match.job.department} • `}
                      {match.job.location ?? 'Location flexible'}
                    </p>
                  </>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
                {isExpanded ? 'Hide Details' : 'Show Details'}
              </Button>
            </div>

            {/* Mini score bars */}
            <div className="grid grid-cols-5 gap-2 mt-4">
              {scoreCategories.map((cat) => {
                const score = match[cat.key as keyof typeof match] as number | null
                const colors = getScoreColor(score)
                return (
                  <div key={cat.key} className="text-center">
                    <div className="h-1.5 w-full rounded-full bg-muted mb-1">
                      <div
                        className={cn('h-1.5 rounded-full transition-all', colors.bg)}
                        style={{ width: `${score ?? 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{cat.label.split(' ')[0]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && (
          <div className="border-t border-border p-4 bg-muted/20">
            <div className="grid gap-4 sm:grid-cols-5">
              {scoreCategories.map((cat) => {
                const score = match[cat.key as keyof typeof match] as number | null
                const colors = getScoreColor(score)
                return (
                  <div key={cat.key} className="text-center p-3 rounded-lg bg-background border border-border">
                    <p className="text-2xl mb-1">{cat.icon}</p>
                    <p className={cn('text-xl font-bold', colors.text)}>
                      {score != null ? Math.round(score) : '-'}
                    </p>
                    <p className="text-sm font-medium text-foreground">{cat.label}</p>
                    <p className="text-xs text-muted-foreground">{cat.weight}% weight</p>
                  </div>
                )
              })}
            </div>
            
            {match.ai_reasoning && (
              <div className="mt-4">
                <h4 className="font-medium text-sm text-foreground mb-2">AI Analysis</h4>
                <p className="text-sm text-muted-foreground bg-background rounded-lg p-3 border border-border">
                  {match.ai_reasoning}
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Link href={entityLink}>
                <Button size="sm">
                  View {showCandidate ? 'Candidate' : 'Job'} Profile
                </Button>
              </Link>
              {showCandidate && match.candidate && (
                <a 
                  href={`/api/file?pathname=${encodeURIComponent(match.candidate.resume_blob_pathname)}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <Button size="sm" variant="outline">View Resume</Button>
                </a>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface SkillsComparisonProps {
  jobSkills: string[]
  candidateSkills: string[]
}

export function SkillsComparison({ jobSkills, candidateSkills }: SkillsComparisonProps) {
  const normalizedJobSkills = jobSkills.map(s => s.toLowerCase().trim())
  const normalizedCandidateSkills = candidateSkills.map(s => s.toLowerCase().trim())
  
  const matchedSkills = jobSkills.filter(s => 
    normalizedCandidateSkills.includes(s.toLowerCase().trim())
  )
  const missingSkills = jobSkills.filter(s => 
    !normalizedCandidateSkills.includes(s.toLowerCase().trim())
  )
  const extraSkills = candidateSkills.filter(s => 
    !normalizedJobSkills.includes(s.toLowerCase().trim())
  )

  const matchPercentage = jobSkills.length > 0 
    ? Math.round((matchedSkills.length / jobSkills.length) * 100)
    : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          Skills Analysis
          <span className={cn(
            'text-sm font-normal rounded-full px-2 py-0.5',
            matchPercentage >= 80 && 'bg-emerald-500/10 text-emerald-600',
            matchPercentage >= 50 && matchPercentage < 80 && 'bg-amber-500/10 text-amber-600',
            matchPercentage < 50 && 'bg-red-500/10 text-red-600'
          )}>
            {matchPercentage}% match
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {matchedSkills.length > 0 && (
          <div>
            <p className="text-sm font-medium text-emerald-600 mb-2">Matching Skills ({matchedSkills.length})</p>
            <div className="flex flex-wrap gap-1">
              {matchedSkills.map(skill => (
                <span key={skill} className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700 border border-emerald-500/30">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {missingSkills.length > 0 && (
          <div>
            <p className="text-sm font-medium text-red-600 mb-2">Missing Skills ({missingSkills.length})</p>
            <div className="flex flex-wrap gap-1">
              {missingSkills.map(skill => (
                <span key={skill} className="rounded bg-red-500/10 px-2 py-0.5 text-xs text-red-700 border border-red-500/30">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {extraSkills.length > 0 && (
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Additional Skills ({extraSkills.length})</p>
            <div className="flex flex-wrap gap-1">
              {extraSkills.slice(0, 10).map(skill => (
                <span key={skill} className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  {skill}
                </span>
              ))}
              {extraSkills.length > 10 && (
                <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  +{extraSkills.length - 10} more
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
