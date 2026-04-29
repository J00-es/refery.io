'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CompanyLogo } from '@/components/pipeline/company-logo'
import { LinkedInBadge } from '@/components/pipeline/linkedin-badge'
import { formatDistanceToNow } from 'date-fns'

interface ActionItem {
  id: string
  candidateId: string
  candidateName: string
  candidateLinkedin: string | null
  jobId: string
  jobTitle: string
  companyName: string
  daysInStage: number
  lastActivity: string
  stage: string
}

interface ActionQueueRowProps {
  urgency: 'red' | 'amber' | 'blue'
  title: string
  meta: string
  items: ActionItem[]
  defaultOpen?: boolean
}

export function ActionQueueRow({ urgency, title, meta, items, defaultOpen = false }: ActionQueueRowProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const dotColors = {
    red: 'bg-[#B23B3B]',
    amber: 'bg-[#B7791F]',
    blue: 'bg-[#2A5BA8]',
  }

  const badgeColors = {
    red: 'bg-[#FDECEC] text-[#B23B3B]',
    amber: 'bg-[#FBF3E1] text-[#B7791F]',
    blue: 'bg-[#EAF1FB] text-[#2A5BA8]',
  }

  return (
    <div
      className={cn(
        'border-t border-[rgba(16,15,15,0.06)] first:border-t-0 cursor-pointer transition-colors',
        isOpen ? 'bg-[#F8F8F3]' : 'hover:bg-[#F0F0EA]'
      )}
    >
      <div
        className="flex items-center gap-3.5 px-[22px] py-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={cn('w-2 h-2 rounded-full shrink-0', dotColors[urgency])} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#100F0F] leading-snug">{title}</p>
          <p className="text-xs text-[rgba(16,15,15,0.40)] mt-0.5">{meta}</p>
        </div>
        <ChevronDown
          className={cn(
            'h-5 w-5 text-[rgba(16,15,15,0.40)] transition-transform shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </div>

      {isOpen && items.length > 0 && (
        <div className="px-[22px] pb-[18px] border-t border-dashed border-[rgba(16,15,15,0.06)]">
          <ul className="mt-3.5 space-y-2.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-3.5 py-2.5 bg-white border border-[rgba(16,15,15,0.06)] rounded-md"
              >
                <CompanyLogo companyName={item.companyName} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-[13px]">
                    <Link
                      href={`/candidates/${item.candidateId}`}
                      className="font-medium text-[#100F0F] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.candidateName}
                    </Link>
                    {item.candidateLinkedin && (
                      <LinkedInBadge url={item.candidateLinkedin} size="sm" />
                    )}
                  </div>
                  <p className="text-[11.5px] text-[rgba(16,15,15,0.40)] mt-0.5">
                    {item.jobTitle} · {item.companyName} · last activity {formatDistanceToNow(new Date(item.lastActivity))} ago
                  </p>
                </div>
                <span className={cn('text-[11.5px] font-semibold px-2 py-0.5 rounded-full', badgeColors[urgency])}>
                  {item.daysInStage}d in stage
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

interface ActionQueueCardProps {
  rows: ActionQueueRowProps[]
}

export function ActionQueueCard({ rows }: ActionQueueCardProps) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] px-[22px] py-12 text-center">
        <p className="text-[rgba(16,15,15,0.40)] font-serif italic text-lg">
          All clear — nothing needs you right now.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] px-0 py-1">
      {rows.map((row, idx) => (
        <ActionQueueRow key={idx} {...row} />
      ))}
    </div>
  )
}
