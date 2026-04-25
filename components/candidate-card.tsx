import { memo, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Candidate } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { Linkedin, User, Briefcase, CheckCircle, XCircle, HelpCircle, Clock } from 'lucide-react'
import { VerdictDisplay } from '@/components/candidate-verdict'

// Format date as relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffWeek < 4) return `${diffWeek}w ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return date.toLocaleDateString()
}

interface CandidateCardProps {
  candidate: Candidate & {
    pipeline_jobs?: { job_title: string; stage: string; company: string }[]
    owner?: { email: string; full_name: string | null } | null
    last_activity?: string
    latest_note_date?: string | null
  }
}

// Category definitions (static - no recreation on each render)
const CATEGORIES = {
  engineering: { label: 'Engineering', color: 'bg-blue-100 text-blue-700', skills: ['javascript', 'typescript', 'python', 'java', 'react', 'node', 'aws', 'golang', 'rust', 'c++', 'sql', 'kubernetes', 'docker'], nameMatch: 'engineer' },
  gtm: { label: 'GTM', color: 'bg-green-100 text-green-700', skills: ['sales', 'business development', 'account executive', 'customer success', 'salesforce', 'hubspot'], nameMatch: 'sales' },
  product: { label: 'Product', color: 'bg-purple-100 text-purple-700', skills: ['product management', 'product strategy', 'agile', 'roadmap', 'user research'], nameMatch: 'product' },
  design: { label: 'Design', color: 'bg-pink-100 text-pink-700', skills: ['ui/ux', 'ux', 'ui design', 'figma', 'sketch', 'design system'], nameMatch: 'design' },
  marketing: { label: 'Marketing', color: 'bg-orange-100 text-orange-700', skills: ['marketing', 'seo', 'content', 'social media', 'paid media'], nameMatch: 'market' },
  data: { label: 'Data', color: 'bg-cyan-100 text-cyan-700', skills: ['data science', 'machine learning', 'ml', 'ai', 'analytics'], nameMatch: 'data' },
  operations: { label: 'Operations', color: 'bg-amber-100 text-amber-700', skills: ['operations', 'project management', 'logistics'], nameMatch: 'operation' },
  finance: { label: 'Finance', color: 'bg-emerald-100 text-emerald-700', skills: ['finance', 'accounting', 'fp&a', 'investment'], nameMatch: 'financ' },
}

function detectRoleCategories(skills: string[] | null, name?: string): { label: string; color: string }[] {
  const skillsStr = (skills || []).join(' ').toLowerCase()
  const nameLower = (name || '').toLowerCase()
  const categories: { label: string; color: string }[] = []
  
  for (const cat of Object.values(CATEGORIES)) {
    if (cat.skills.some(s => skillsStr.includes(s)) || nameLower.includes(cat.nameMatch)) {
      categories.push({ label: cat.label, color: cat.color })
      if (categories.length >= 2) break
    }
  }
  return categories
}

const stageColors: Record<string, string> = {
  sourced: 'bg-slate-100 text-slate-600',
  screening: 'bg-blue-100 text-blue-600',
  interview: 'bg-purple-100 text-purple-600',
  offer: 'bg-amber-100 text-amber-600',
  hired: 'bg-emerald-100 text-emerald-600',
  rejected: 'bg-red-100 text-red-600',
  withdrawn: 'bg-gray-100 text-gray-500',
}

const availabilityIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle className="h-3 w-3" />,
  off_market: <XCircle className="h-3 w-3" />,
  not_yet_talked: <HelpCircle className="h-3 w-3" />,
  not_qualified: <XCircle className="h-3 w-3" />,
}

function CandidateCardComponent({ candidate }: CandidateCardProps) {
  const formatSalary = (min?: number | null, max?: number | null) => {
    if (!min && !max) return null
    if (min && max) return `$${(min / 1000).toFixed(0)}k - $${(max / 1000).toFixed(0)}k`
    if (min) return `$${(min / 1000).toFixed(0)}k+`
    if (max) return `Up to $${(max / 1000).toFixed(0)}k`
    return null
  }

  const salary = formatSalary(candidate.salary_expectation_min, candidate.salary_expectation_max)
  const roleCategories = detectRoleCategories(candidate.skills, candidate.name)
  const availabilityStatus = candidate.availability_status || 'not_yet_talked'
  const availabilityConfig = AVAILABILITY_STATUSES[availabilityStatus]
  
  // Get current role from work history
  const currentRole = candidate.parsed_data?.work_history?.[0]

  return (
    <Link href={`/candidates/${candidate.id}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/30">
        <CardHeader className="pb-2">
          {/* Name and LinkedIn */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base leading-tight truncate">{candidate.name}</CardTitle>
                {candidate.linkedin_url && (
                  <span 
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.open(candidate.linkedin_url!, '_blank')
                    }}
                    className="flex-shrink-0 cursor-pointer"
                  >
                    <Linkedin className="h-3.5 w-3.5 text-blue-600 hover:text-blue-800" />
                  </span>
                )}
              </div>
              {/* Current Role */}
              {currentRole && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {currentRole.title} <span className="text-xs">at</span> {currentRole.company}
                </p>
              )}
            </div>
            {/* Availability Badge */}
            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${availabilityConfig.color}`}>
              {availabilityIcons[availabilityStatus]}
              <span className="hidden sm:inline">{availabilityConfig.label}</span>
            </span>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-2.5 pt-0">
          {/* Key Info Row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {candidate.location && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {candidate.location}
              </span>
            )}
            {candidate.experience_years && (
              <span>{candidate.experience_years} yrs</span>
            )}
            {salary && (
              <span className="font-medium text-foreground">{salary}</span>
            )}
          </div>

          {/* Brief - most important info about candidate */}
          {candidate.brief && (
            <p className="text-xs text-muted-foreground italic line-clamp-2 border-l-2 border-primary/30 pl-2">
              {candidate.brief}
            </p>
          )}

          {/* Role Categories */}
          {roleCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {roleCategories.map((cat, i) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${cat.color}`}>
                  {cat.label}
                </span>
              ))}
            </div>
          )}

          {/* Verdicts - compact display */}
          {(candidate.recruiter_verdict || candidate.lily_verdict) && (
            <VerdictDisplay
              recruiterVerdict={candidate.recruiter_verdict}
              lilyVerdict={candidate.lily_verdict}
              size="xs"
            />
          )}

          {/* Pipeline Status - compact */}
          {candidate.pipeline_jobs && candidate.pipeline_jobs.length > 0 && (
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 text-xs">
                <Briefcase className="h-3 w-3 text-muted-foreground shrink-0" />
                <div className="flex flex-wrap gap-1">
                  {candidate.pipeline_jobs.slice(0, 2).map((pj, i) => (
                    <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${stageColors[pj.stage] || 'bg-muted text-muted-foreground'}`}>
                      {pj.stage}
                    </span>
                  ))}
                  {candidate.pipeline_jobs.length > 2 && (
                    <span className="text-muted-foreground">+{candidate.pipeline_jobs.length - 2}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer - Owner and Updated */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {candidate.last_activity 
                ? formatRelativeTime(candidate.last_activity)
                : formatRelativeTime(candidate.updated_at)}
            </div>
            {candidate.owner && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span className="truncate max-w-[80px]">
                  {candidate.owner.full_name?.split(' ')[0] || candidate.owner.email.split('@')[0]}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

// Memoize to prevent unnecessary re-renders
export const CandidateCard = memo(CandidateCardComponent)
