import { memo } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { Candidate } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { Linkedin, Briefcase, CheckCircle, XCircle, HelpCircle, Clock, UserCircle2 } from 'lucide-react'
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

// Shared pill token so every tag/stage chip has identical height, padding,
// radius, and font size. Color is appended per-chip.
const PILL = 'inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium leading-none'

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

  // Owner display name + initials for avatar
  const ownerName = candidate.owner?.full_name || candidate.owner?.email?.split('@')[0] || null
  const ownerInitials = ownerName
    ? ownerName
        .split(' ')
        .map(p => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null

  return (
    <Link href={`/candidates/${candidate.id}`} className="block h-full">
      {/*
        Card interior is a fixed 7-row grid so every card reserves the same
        slots in the same order regardless of which fields are populated:
        header / subheadline / assignee / meta / tags / variable content / footer.
        The single 1fr track (variable content) absorbs slack, pinning the footer
        to the bottom so timestamps line up across a row.
      */}
      <Card className="grid h-full grid-rows-[auto_auto_auto_auto_auto_1fr_auto] gap-2 overflow-hidden p-4 transition-all hover:border-primary/30 hover:shadow-md">
        {/* Slot 1 — header: name (truncates) + status badge in a reserved gutter.
            Mobile: single column, badge drops to its own row below the name. */}
        <div className="grid grid-cols-1 items-start gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="min-w-0 truncate text-base font-semibold leading-tight">{candidate.name}</h3>
            {candidate.linkedin_url && (
              <span
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  window.open(candidate.linkedin_url!, '_blank')
                }}
                className="shrink-0 cursor-pointer"
              >
                <Linkedin className="h-3.5 w-3.5 text-blue-600 hover:text-blue-800" />
              </span>
            )}
          </div>
          <span className={`${PILL} gap-1 justify-self-start sm:justify-self-end ${availabilityConfig.color}`}>
            {availabilityIcons[availabilityStatus]}
            {availabilityConfig.label}
          </span>
        </div>

        {/* Slot 2 — subheadline: role at company, single line. Role truncates
            first; company is preserved (capped so it can never overflow). */}
        <div className="flex min-h-5 items-baseline">
          {currentRole && (
            <p className="flex min-w-0 items-baseline gap-1 text-sm text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{currentRole.title}</span>
              <span className="max-w-[60%] shrink-0 truncate">
                <span className="text-xs">at</span> {currentRole.company}
              </span>
            </p>
          )}
        </div>

        {/* Slot 3 — assignee chip (always rendered: owner or Unassigned) */}
        <div className="flex min-h-6 items-center">
          {candidate.owner ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 py-0.5 pl-0.5 pr-2 text-[11px] font-medium text-primary"
              title={`Owner: ${candidate.owner.full_name || candidate.owner.email}`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                {ownerInitials}
              </span>
              <span className="max-w-[120px] truncate">{ownerName}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[11px] text-muted-foreground">
              <UserCircle2 className="h-3 w-3" />
              Unassigned
            </span>
          )}
        </div>

        {/* Slot 4 — meta row: location · years · salary (reserved height) */}
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
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

        {/* Slot 5 — tag row: role categories (reserved height when absent) */}
        <div className="flex min-h-6 flex-wrap items-center gap-1.5">
          {roleCategories.map((cat, i) => (
            <span key={i} className={`${PILL} ${cat.color}`}>
              {cat.label}
            </span>
          ))}
        </div>

        {/* Slot 6 — variable content (brief / verdicts / pipeline). Occupies the
            1fr track so the footer is pushed to the bottom of every card. */}
        <div className="min-w-0 space-y-2">
          {candidate.brief && (
            <p className="line-clamp-2 border-l-2 border-primary/30 pl-2 text-xs italic text-muted-foreground">
              {candidate.brief}
            </p>
          )}

          {(candidate.recruiter_verdict || candidate.lily_verdict) && (
            <VerdictDisplay
              recruiterVerdict={candidate.recruiter_verdict}
              lilyVerdict={candidate.lily_verdict}
              size="xs"
            />
          )}

          {candidate.pipeline_jobs && candidate.pipeline_jobs.length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" />
              <div className="flex flex-wrap gap-1.5">
                {candidate.pipeline_jobs.slice(0, 2).map((pj, i) => (
                  <span key={i} className={`${PILL} ${stageColors[pj.stage] || 'bg-muted text-muted-foreground'}`}>
                    {pj.stage}
                  </span>
                ))}
                {candidate.pipeline_jobs.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{candidate.pipeline_jobs.length - 2}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Slot 7 — footer: relative timestamp, pinned to the bottom */}
        <div className="flex items-center gap-1 border-t pt-2 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" />
          {candidate.last_activity
            ? formatRelativeTime(candidate.last_activity)
            : formatRelativeTime(candidate.updated_at)}
        </div>
      </Card>
    </Link>
  )
}

// Memoize to prevent unnecessary re-renders
export const CandidateCard = memo(CandidateCardComponent)
