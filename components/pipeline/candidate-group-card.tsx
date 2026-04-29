'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Mail, FileText, UserCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LinkedInBadge } from './linkedin-badge'
import { DaysInStageBadge } from './days-badge'
import { CompanyLogo } from './company-logo'
import { formatDistanceToNow } from 'date-fns'

interface PipelineJob {
  id: string
  job_id: string
  title: string
  company_name: string
  company_logo_url?: string | null
  location: string | null
  salary_min: number | null
  salary_max: number | null
  created_at: string
  daysInStage: number
}

interface CandidateGroupData {
  candidate_id: string
  candidate_name: string
  candidate_email: string | null
  candidate_linkedin: string | null
  candidate_location: string | null
  candidate_current_title: string | null
  candidate_experience_years: number | null
  resume_url: string | null
  source_type: string | null
  source_name: string | null
  notes: string | null
  owner: { user_id: string; email: string; full_name: string | null } | null
  lastActivity: string
  maxDaysInStage: number
  jobs: PipelineJob[]
  activities: { timestamp: string; description: string }[]
}

interface CandidateGroupCardProps {
  data: CandidateGroupData
  stageAccentColor?: string
}

export function CandidateGroupCard({ data, stageAccentColor }: CandidateGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const isCritical = data.maxDaysInStage > 14
  const isStale = data.maxDaysInStage > 7
  const initials = data.candidate_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const borderColorClass = isCritical
    ? 'border-l-[3px] border-l-[#B23B3B]'
    : isStale
      ? 'border-l-[3px] border-l-[#B7791F]'
      : ''

  return (
    <div
      className={cn(
        'bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] overflow-hidden transition-all cursor-pointer hover:border-[rgba(16,15,15,0.20)]',
        borderColorClass,
        isExpanded && 'bg-white'
      )}
    >
      {/* Header row - Desktop */}
      <div
        className="hidden sm:grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center p-4 px-5"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Candidate info */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-[38px] h-[38px] rounded-full flex items-center justify-center text-sm font-medium shrink-0',
              isCritical && 'bg-[#FDECEC] text-[#B23B3B]',
              isStale && !isCritical && 'bg-[#FBF3E1] text-[#B7791F]',
              !isStale && 'bg-[#F0F0EA] text-[rgba(16,15,15,0.64)]'
            )}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                href={`/candidates/${data.candidate_id}`}
                className="text-[14.5px] font-semibold text-[#100F0F] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {data.candidate_name}
              </Link>
              {data.candidate_linkedin && (
                <LinkedInBadge url={data.candidate_linkedin} size="sm" />
              )}
            </div>
            <p className="text-xs text-[rgba(16,15,15,0.40)] truncate mt-0.5">
              {[
                data.candidate_location,
                data.candidate_current_title,
                data.candidate_experience_years ? `${data.candidate_experience_years} yrs` : null,
                `${data.jobs.length} role${data.jobs.length !== 1 ? 's' : ''} in this stage`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {/* Days badge */}
        <DaysInStageBadge days={data.maxDaysInStage} />

        {/* Owner */}
        <div className="flex items-center gap-2 text-[13px] text-[rgba(16,15,15,0.64)] whitespace-nowrap">
          <span
            className={cn(
              'w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-semibold',
              data.owner
                ? 'bg-[#EBF4EF] text-[#2A6B45]'
                : 'bg-[#F0F0EA] text-[rgba(16,15,15,0.40)]'
            )}
          >
            {data.owner
              ? (data.owner.full_name || data.owner.email)?.charAt(0).toUpperCase()
              : '?'}
          </span>
          <span className={cn(!data.owner && 'italic text-[rgba(16,15,15,0.40)]')}>
            {data.owner?.full_name || data.owner?.email?.split('@')[0] || 'Unassigned'}
          </span>
        </div>

        {/* Last activity */}
        <p className="text-xs text-[rgba(16,15,15,0.40)] whitespace-nowrap">
          {formatDistanceToNow(new Date(data.lastActivity), { addSuffix: false })} ago
        </p>

        {/* Chevron */}
        <ChevronDown
          className={cn(
            'h-5 w-5 text-[rgba(16,15,15,0.40)] transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Header row - Mobile */}
      <div
        className="sm:hidden p-3 px-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
                isCritical && 'bg-[#FDECEC] text-[#B23B3B]',
                isStale && !isCritical && 'bg-[#FBF3E1] text-[#B7791F]',
                !isStale && 'bg-[#F0F0EA] text-[rgba(16,15,15,0.64)]'
              )}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/candidates/${data.candidate_id}`}
                  className="text-[13px] font-semibold text-[#100F0F] hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {data.candidate_name}
                </Link>
                {data.candidate_linkedin && (
                  <LinkedInBadge url={data.candidate_linkedin} size="sm" />
                )}
              </div>
              <p className="text-[11px] text-[rgba(16,15,15,0.40)] truncate">
                {data.jobs.length} role{data.jobs.length !== 1 ? 's' : ''} · {data.maxDaysInStage}d in stage
              </p>
            </div>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-[rgba(16,15,15,0.40)] transition-transform shrink-0 mt-1',
              isExpanded && 'rotate-180'
            )}
          />
        </div>
      </div>

      {/* Job rows - always visible */}
      <div className="bg-[#F8F8F3] border-t border-[rgba(16,15,15,0.06)] px-3 sm:px-5">
        {data.jobs.map((job, idx) => (
          <div
            key={job.id}
            className={cn(
              'flex items-center gap-2.5 sm:gap-3 py-2.5 sm:py-3',
              idx > 0 && 'border-t border-[rgba(16,15,15,0.06)]'
            )}
          >
            <CompanyLogo companyName={job.company_name} logoUrl={job.company_logo_url} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] sm:text-[13px]">
                <Link
                  href={`/jobs/${job.job_id}`}
                  className="font-medium text-[#100F0F] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.title}
                </Link>
                <span className="text-[rgba(16,15,15,0.40)]"> · {job.company_name}</span>
              </div>
              <div className="text-[10px] sm:text-[11.5px] text-[rgba(16,15,15,0.40)] mt-0.5">
                {job.location || 'Remote'}
                {job.salary_min && job.salary_max && (
                  <span className="hidden sm:inline"> · ${Math.round(job.salary_min / 1000)}k–${Math.round(job.salary_max / 1000)}k</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expanded detail panel */}
      {isExpanded && (
        <div className="p-3 sm:p-5 bg-[#F8F8F3] border-t border-dashed border-[rgba(16,15,15,0.06)]">
          <div className="flex flex-col sm:grid sm:grid-cols-[220px_1fr] gap-4 sm:gap-6 items-start">
            {/* Contact block */}
            <div className="bg-white border border-[rgba(16,15,15,0.06)] rounded-md p-3 sm:p-3.5 w-full sm:w-auto">
              {data.candidate_linkedin && (
                <div className="flex items-center gap-2 py-1.5 text-[11px] sm:text-[12.5px]">
                  <span className="text-[rgba(16,15,15,0.40)] w-[50px] sm:w-[60px] shrink-0 text-[10px] sm:text-[11.5px]">
                    LinkedIn
                  </span>
                  <a
                    href={data.candidate_linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2A6B45] hover:underline truncate"
                  >
                    {data.candidate_linkedin.replace('https://www.linkedin.com/in/', '').replace('https://linkedin.com/in/', '')}
                  </a>
                </div>
              )}
              {data.candidate_email && (
                <div className="flex items-center gap-2 py-1.5 text-[11px] sm:text-[12.5px] border-t border-[rgba(16,15,15,0.06)]">
                  <span className="text-[rgba(16,15,15,0.40)] w-[50px] sm:w-[60px] shrink-0 text-[10px] sm:text-[11.5px]">
                    Email
                  </span>
                  <a
                    href={`mailto:${data.candidate_email}`}
                    className="text-[#2A6B45] hover:underline truncate"
                  >
                    {data.candidate_email}
                  </a>
                </div>
              )}
              {data.resume_url && (
                <div className="flex items-center gap-2 py-1.5 text-[11px] sm:text-[12.5px] border-t border-[rgba(16,15,15,0.06)]">
                  <span className="text-[rgba(16,15,15,0.40)] w-[50px] sm:w-[60px] shrink-0 text-[10px] sm:text-[11.5px]">
                    Resume
                  </span>
                  <a
                    href={data.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2A6B45] hover:underline"
                  >
                    View resume &rarr;
                  </a>
                </div>
              )}
              {data.source_type && (
                <div className="flex items-center gap-2 py-1.5 text-[11px] sm:text-[12.5px] border-t border-[rgba(16,15,15,0.06)]">
                  <span className="text-[rgba(16,15,15,0.40)] w-[50px] sm:w-[60px] shrink-0 text-[10px] sm:text-[11.5px]">
                    Source
                  </span>
                  <span className="text-[#100F0F]">
                    {data.source_type}
                    {data.source_name && ` · ${data.source_name}`}
                  </span>
                </div>
              )}
            </div>

            {/* Summary and timeline */}
            <div className="text-[12px] sm:text-[13px] text-[rgba(16,15,15,0.64)] leading-relaxed w-full">
              {data.notes && (
                <>
                  <h4 className="text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase text-[rgba(16,15,15,0.40)] mb-2">
                    Candidate summary
                  </h4>
                  <p className="mb-4">{data.notes}</p>
                </>
              )}

              {data.activities.length > 0 && (
                <div className="mt-3 sm:mt-3.5 pt-3 sm:pt-3.5 border-t border-[rgba(16,15,15,0.06)]">
                  <h4 className="text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase text-[rgba(16,15,15,0.40)] mb-2">
                    Activity timeline
                  </h4>
                  <div className="space-y-1.5">
                    {data.activities.slice(0, 5).map((activity, idx) => (
                      <div key={idx} className="flex gap-2 sm:gap-2.5 py-1 sm:py-1.5 text-[11px] sm:text-[12.5px]">
                        <span className="text-[rgba(16,15,15,0.40)] shrink-0 min-w-[60px] sm:min-w-[80px]">
                          {formatDistanceToNow(new Date(activity.timestamp))} ago
                        </span>
                        <span className="text-[rgba(16,15,15,0.64)]">{activity.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
