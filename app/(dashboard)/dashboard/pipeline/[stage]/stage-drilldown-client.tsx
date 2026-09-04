'use client'

import { useState, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Search, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CandidateGroupCard } from '@/components/pipeline/candidate-group-card'

interface PipelineJob {
  id: string
  job_id: string
  title: string
  company_name: string
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

interface OwnerInfo {
  user_id: string
  email: string
  full_name: string | null
}

interface StageDrilldownClientProps {
  data: CandidateGroupData[]
  bucketKey: string
  currentSort: string
  showStaleOnly: boolean
  searchQuery: string
  ownerFilter: string
  owners: OwnerInfo[]
  stageAccentColor: string
  isTerminalStage: boolean
}

export function StageDrilldownClient({
  data,
  bucketKey,
  currentSort,
  showStaleOnly,
  searchQuery,
  ownerFilter,
  owners,
  stageAccentColor,
  isTerminalStage,
}: StageDrilldownClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const [localSearch, setLocalSearch] = useState(searchQuery)

  function updateSearchParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  // Filter and sort data
  const processedData = useMemo(() => {
    let result = [...data]

    // Apply stale filter
    if (showStaleOnly) {
      result = result.filter(item => item.maxDaysInStage > 7)
    }

    // Apply owner filter
    if (ownerFilter) {
      result = result.filter(item => item.owner?.user_id === ownerFilter)
    }

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(item =>
        item.candidate_name.toLowerCase().includes(query) ||
        item.jobs.some(job => job.title.toLowerCase().includes(query) || job.company_name.toLowerCase().includes(query))
      )
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (currentSort) {
        case 'days_asc':
          return a.maxDaysInStage - b.maxDaysInStage
        case 'days_desc':
          return b.maxDaysInStage - a.maxDaysInStage
        case 'activity':
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
        case 'name':
          return a.candidate_name.localeCompare(b.candidate_name)
        default:
          // For terminal stages, sort by last activity by default
          if (isTerminalStage) {
            return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
          }
          return b.maxDaysInStage - a.maxDaysInStage
      }
    })

    return result
  }, [data, showStaleOnly, ownerFilter, searchQuery, currentSort, isTerminalStage])

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateSearchParams({ search: localSearch })
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Filter bar */}
      <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-2.5 flex-wrap">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="w-full sm:flex-1 sm:min-w-[200px] sm:max-w-[320px] relative">
          <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[rgba(16,15,15,0.40)]" />
          <input
            type="text"
            placeholder="Search..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-7 sm:pl-8 pr-3 py-1.5 sm:py-2 border border-[rgba(16,15,15,0.10)] rounded-md bg-[#F8F8F3] text-[12px] sm:text-[13px] text-[#100F0F] placeholder:text-[rgba(16,15,15,0.40)] outline-none focus:border-[rgba(16,15,15,0.20)]"
          />
        </form>

        {/* Owner dropdown */}
        <div className="relative flex-1 sm:flex-none">
          <select
            value={ownerFilter}
            onChange={(e) => updateSearchParams({ owner: e.target.value || null })}
            className="appearance-none w-full px-2.5 sm:px-3 py-1.5 sm:py-2 pr-6 sm:pr-7 border border-[rgba(16,15,15,0.10)] rounded-md bg-white text-[12px] sm:text-[13px] text-[rgba(16,15,15,0.64)] cursor-pointer outline-none"
          >
            <option value="">All owners</option>
            {owners.map((owner) => (
              <option key={owner.user_id} value={owner.user_id}>
                {owner.full_name || owner.email.split('@')[0]}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[rgba(16,15,15,0.40)] pointer-events-none" />
        </div>

        {/* Sort dropdown */}
        <div className="relative flex-1 sm:flex-none">
          <select
            value={currentSort}
            onChange={(e) => updateSearchParams({ sort: e.target.value })}
            className="appearance-none w-full px-2.5 sm:px-3 py-1.5 sm:py-2 pr-6 sm:pr-7 border border-[rgba(16,15,15,0.10)] rounded-md bg-white text-[12px] sm:text-[13px] text-[rgba(16,15,15,0.64)] cursor-pointer outline-none"
          >
            <option value="days_desc">Days ↓</option>
            <option value="days_asc">Days ↑</option>
            <option value="activity">Activity</option>
            <option value="name">Name A–Z</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[rgba(16,15,15,0.40)] pointer-events-none" />
        </div>

        {/* Stale toggle */}
        <button
          onClick={() => updateSearchParams({ stale: showStaleOnly ? null : 'true' })}
          className={cn(
            'inline-flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 border rounded-md text-[11px] sm:text-[13px] cursor-pointer transition-colors whitespace-nowrap',
            showStaleOnly
              ? 'bg-[#FBF3E1] border-[#B7791F] text-[#B7791F] font-medium'
              : 'bg-white border-[rgba(16,15,15,0.10)] text-[rgba(16,15,15,0.64)]'
          )}
        >
          <span
            className={cn(
              'w-5 sm:w-6 h-3 sm:h-3.5 rounded-full relative transition-colors',
              showStaleOnly ? 'bg-[#B7791F]' : 'bg-[rgba(16,15,15,0.20)]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 w-2 sm:w-2.5 h-2 sm:h-2.5 bg-white rounded-full transition-transform',
                showStaleOnly ? 'translate-x-2.5 sm:translate-x-3' : 'translate-x-0.5'
              )}
            />
          </span>
          <span className="hidden sm:inline">Show stale only</span>
          <span className="sm:hidden">Stale</span>
        </button>

        {/* Counter */}
        <div className="hidden sm:block ml-auto text-xs text-[rgba(16,15,15,0.40)]">
          {processedData.length} of {data.length}
        </div>
      </div>

      {/* Candidate groups */}
      {processedData.length === 0 ? (
        <div className="bg-white border border-[rgba(16,15,15,0.10)] rounded-[10px] py-16 text-center">
          <p className="font-semibold text-[rgba(16,15,15,0.40)] italic text-lg">
            {showStaleOnly
              ? 'No stale candidates found. Try removing the filter.'
              : searchQuery
                ? 'No candidates match your search.'
                : 'No candidates in this stage yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {processedData.map((group) => (
            <CandidateGroupCard
              key={group.candidate_id}
              data={group}
              stageAccentColor={stageAccentColor}
            />
          ))}
        </div>
      )}
    </div>
  )
}
