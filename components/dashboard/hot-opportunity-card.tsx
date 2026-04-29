'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CompanyLogo } from '@/components/pipeline/company-logo'
import { LinkedInBadge } from '@/components/pipeline/linkedin-badge'

interface OpportunityItem {
  id: string
  title: string
  subtitle: string
  link?: string
  matchPct?: number
  candidateLinkedin?: string
}

interface HotOpportunityCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  items: OpportunityItem[]
  emptyText?: string
}

export function HotOpportunityCard({ icon, title, subtitle, items, emptyText = 'Nothing new here yet' }: HotOpportunityCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const hasItems = items.length > 0

  if (!hasItems) {
    return (
      <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] overflow-hidden opacity-60">
        <div className="p-5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center mb-3 bg-[#EBF4EF] text-[#2A6B45]">
            {icon}
          </div>
          <h3 className="text-sm font-semibold text-[#100F0F] mb-1">{title}</h3>
          <p className="text-[12.5px] text-[rgba(16,15,15,0.64)] leading-relaxed">{subtitle}</p>
          <p className="text-xs text-[rgba(16,15,15,0.40)] font-serif italic mt-3">{emptyText}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] overflow-hidden cursor-pointer transition-all hover:border-[rgba(16,15,15,0.20)]',
        isOpen && 'col-span-3 cursor-default'
      )}
      onClick={() => !isOpen && setIsOpen(true)}
    >
      <div className="p-5">
        <div className="w-8 h-8 rounded-md flex items-center justify-center mb-3 bg-[#EBF4EF] text-[#2A6B45] font-serif text-lg">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-[#100F0F] mb-1">{title}</h3>
        <p className="text-[12.5px] text-[rgba(16,15,15,0.64)] leading-relaxed">{subtitle}</p>
        {!isOpen && (
          <div className="inline-flex items-center gap-1.5 text-xs text-[#2A6B45] font-medium mt-3">
            View {items.length} item{items.length !== 1 ? 's' : ''}
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-dashed border-[rgba(16,15,15,0.06)] p-5 bg-[#F8F8F3]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[rgba(16,15,15,0.40)]">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </h4>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOpen(false)
              }}
              className="text-xs text-[rgba(16,15,15,0.40)] hover:text-[#100F0F]"
            >
              Collapse
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-[rgba(16,15,15,0.06)] rounded-md p-3 flex items-center gap-3"
              >
                <CompanyLogo companyName={item.title.split(' at ')[1] || item.title} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.link ? (
                      <Link
                        href={item.link}
                        className="text-[13px] font-medium text-[#100F0F] hover:underline truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="text-[13px] font-medium text-[#100F0F] truncate">
                        {item.title}
                      </span>
                    )}
                    {item.candidateLinkedin && (
                      <LinkedInBadge url={item.candidateLinkedin} size="sm" />
                    )}
                  </div>
                  <p className="text-[11.5px] text-[rgba(16,15,15,0.40)] mt-0.5 truncate">
                    {item.subtitle}
                  </p>
                </div>
                {item.matchPct && (
                  <span className="text-[11px] font-semibold text-[#2A6B45] bg-[#EBF4EF] px-2 py-1 rounded-full shrink-0">
                    {item.matchPct}% match
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
