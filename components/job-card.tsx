import { memo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Job } from '@/lib/types'
import { INTERNAL_DEAL_TYPES } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Calendar } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface JobCardProps {
  job: Job & {
    company_tagline?: string
    company_logo_url?: string | null
  }
  compact?: boolean
  isAdmin?: boolean
}

function JobCardComponent({ job, compact = false, isAdmin = false }: JobCardProps) {
  const statusColors = {
    open: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30',
    closed: 'bg-muted text-muted-foreground border-muted',
    draft: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  }

  const remotePolicyLabels = {
    remote: 'Remote',
    hybrid: 'Hybrid',
    onsite: 'On-site',
  }

  const formatSalary = (min?: number | null, max?: number | null) => {
    if (!min && !max) return null
    if (min && max) return `$${(min / 1000).toFixed(0)}k - $${(max / 1000).toFixed(0)}k`
    if (min) return `$${(min / 1000).toFixed(0)}k+`
    if (max) return `Up to $${(max / 1000).toFixed(0)}k`
    return null
  }

  const salary = formatSalary(job.salary_min, job.salary_max)

  return (
    <Link href={`/jobs/${job.id}`}>
      <Card className="h-full transition-all hover:shadow-md hover:border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3">
              {job.company_logo_url ? (
                <img 
                  src={job.company_logo_url} 
                  alt={job.company_name || 'Company'} 
                  className="h-10 w-10 rounded-md object-cover shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary font-semibold text-sm">
                    {(job.company_name || 'J').charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <CardTitle className="text-lg leading-tight">{job.title}</CardTitle>
                {job.company_name && (
                  <p className="text-sm font-medium text-foreground">{job.company_name}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium capitalize', statusColors[job.status])}>
                {job.status}
              </span>
              {/* Internal deal type - Admin only */}
              {isAdmin && job.internal_deal_type && INTERNAL_DEAL_TYPES[job.internal_deal_type] && (
                <span className={cn('shrink-0 rounded-md px-2 py-0.5 text-xs font-medium', INTERNAL_DEAL_TYPES[job.internal_deal_type].color)}>
                  {INTERNAL_DEAL_TYPES[job.internal_deal_type].label}
                </span>
              )}
            </div>
          </div>
          {/* Company tagline */}
          {job.company_tagline && (
            <p className="text-xs text-muted-foreground line-clamp-1">{job.company_tagline}</p>
          )}
          {job.department && (
            <CardDescription>{job.department}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2.5">
          {/* Location and Remote Policy - clean single line */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {job.location && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.location}
              </span>
            )}
            {job.remote_policy && (
              <span className="px-1.5 py-0.5 rounded bg-muted text-xs">
                {remotePolicyLabels[job.remote_policy]}
              </span>
            )}
          </div>

          {/* Key info row - salary and experience */}
          <div className="flex items-center justify-between">
            {salary && (
              <span className="text-sm font-medium text-foreground">{salary}</span>
            )}
            <span className="text-xs text-muted-foreground">
              {job.experience_years_min}-{job.experience_years_max ?? '+'} yrs
            </span>
          </div>

          {/* Footer - posted date and bonus */}
          <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
            {job.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
              </span>
            )}
            {job.referral_bonus ? (
              <span className="font-medium text-emerald-600">
                {job.referral_bonus_type === 'percent'
                  ? `${job.referral_bonus}% of first year base salary`
                  : `$${job.referral_bonus.toLocaleString()} bonus`}
              </span>
            ) : (
              <span className="font-medium text-muted-foreground">
                In Pipeline
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export const JobCard = memo(JobCardComponent)
