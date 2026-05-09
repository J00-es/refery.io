'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CandidateCard } from '@/components/candidate-card'
import { CandidateFilters, FilterStats } from '@/components/list-filters'
import type { Candidate } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { LayoutGrid, List, MapPin, Briefcase, CheckCircle, XCircle, HelpCircle, ArrowUpDown, User } from 'lucide-react'
import { VerdictDisplay } from '@/components/candidate-verdict'

interface EnrichedCandidate extends Candidate {
  pipeline_jobs?: { job_title: string; stage: string; company: string }[]
  owner?: { email: string; full_name: string | null } | null
  last_activity?: string
  latest_note_date?: string | null
}

interface CandidateListProps {
  candidates: EnrichedCandidate[]
}

// Priority order for availability status (lower = higher priority)
const AVAILABILITY_PRIORITY: Record<string, number> = {
  not_yet_talked: 1,
  active: 2,
  off_market: 3,
  not_qualified: 4,
}

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-amber-100 text-amber-700',
  shortlisted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  hired: 'bg-purple-100 text-purple-700',
}

const availabilityIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle className="h-3 w-3" />,
  off_market: <XCircle className="h-3 w-3" />,
  not_yet_talked: <HelpCircle className="h-3 w-3" />,
  not_qualified: <XCircle className="h-3 w-3" />,
}

// Format date as relative time (e.g., "2 days ago", "3 hours ago")
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

export function CandidateList({ candidates }: CandidateListProps) {
  const [filteredCandidates, setFilteredCandidates] = useState<EnrichedCandidate[]>(candidates)
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card')
  const [sortBy, setSortBy] = useState<string>('availability') // Default to availability

  const handleFilterChange = useCallback((filtered: EnrichedCandidate[]) => {
    setFilteredCandidates(filtered)
  }, [])

  // Sort candidates based on selected sort option
  const sortedCandidates = useMemo(() => {
    const sorted = [...filteredCandidates]
    switch (sortBy) {
      case 'availability':
        // Sort by availability: not_yet_talked first, then active, then off_market
        sorted.sort((a, b) => {
          const priorityA = AVAILABILITY_PRIORITY[a.availability_status || 'not_yet_talked'] || 99
          const priorityB = AVAILABILITY_PRIORITY[b.availability_status || 'not_yet_talked'] || 99
          return priorityA - priorityB
        })
        break
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'experience_desc':
        sorted.sort((a, b) => (b.experience_years || 0) - (a.experience_years || 0))
        break
      case 'experience_asc':
        sorted.sort((a, b) => (a.experience_years || 0) - (b.experience_years || 0))
        break
      case 'newest':
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'oldest':
        sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
      case 'last_updated':
        sorted.sort((a, b) => {
          const aDate = a.last_activity ? new Date(a.last_activity).getTime() : new Date(a.updated_at).getTime()
          const bDate = b.last_activity ? new Date(b.last_activity).getTime() : new Date(b.updated_at).getTime()
          return bDate - aDate
        })
        break
    }
    return sorted
  }, [filteredCandidates, sortBy])

  const newCandidates = sortedCandidates.filter(c => c.status === 'new')
  const reviewingCandidates = sortedCandidates.filter(c => c.status === 'reviewing')
  const shortlistedCandidates = sortedCandidates.filter(c => c.status === 'shortlisted')
  const otherCandidates = sortedCandidates.filter(c => c.status === 'rejected' || c.status === 'hired')

  if (candidates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="rounded-full bg-muted p-4 mb-4">
            <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No candidates yet</h3>
          <p className="text-muted-foreground text-center mb-4 max-w-sm">
            Upload your first resume to get AI-powered analysis and job matching.
          </p>
          <Link href="/candidates/new">
            <Button>Upload Your First Resume</Button>
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex-1 min-w-0">
          <CandidateFilters candidates={candidates} onFilterChange={handleFilterChange} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] sm:w-[180px] h-8 sm:h-9 text-xs sm:text-sm shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="last_updated">Last Updated</SelectItem>
              <SelectItem value="availability">Availability</SelectItem>
              <SelectItem value="name_asc">Name A-Z</SelectItem>
              <SelectItem value="name_desc">Name Z-A</SelectItem>
              <SelectItem value="experience_desc">Exp (High-Low)</SelectItem>
              <SelectItem value="experience_asc">Exp (Low-High)</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center border rounded-md shrink-0">
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-r-none h-8 w-8 p-0 sm:h-9 sm:w-9"
              onClick={() => setViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-l-none h-8 w-8 p-0 sm:h-9 sm:w-9"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      <FilterStats total={candidates.length} filtered={filteredCandidates.length} label="candidate" />

      {filteredCandidates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No candidates match your filters</p>
            <p className="text-sm text-muted-foreground">Try adjusting your search criteria</p>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        /* List View */
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[150px]">Name</TableHead>
                <TableHead className="hidden sm:table-cell min-w-[150px]">Current Role</TableHead>
                <TableHead className="hidden lg:table-cell">Location</TableHead>
                <TableHead className="hidden md:table-cell">Owner</TableHead>
                <TableHead className="hidden lg:table-cell">Pipeline</TableHead>
                <TableHead>Verdicts</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedCandidates.map((candidate) => {
                const availabilityStatus = candidate.availability_status || 'not_yet_talked'
                const availabilityConfig = AVAILABILITY_STATUSES[availabilityStatus]
                
                return (
                  <TableRow key={candidate.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/candidates/${candidate.id}`} className="font-medium hover:underline text-sm">
                        {candidate.name}
                      </Link>
                      {candidate.brief ? (
                        <p className="text-xs text-muted-foreground line-clamp-1 max-w-[180px]">
                          {candidate.brief}
                        </p>
                      ) : candidate.experience_years ? (
                        <p className="text-xs text-muted-foreground">
                          {candidate.experience_years}+ yrs exp
                        </p>
                      ) : null}
                      {/* Show role on mobile under name */}
                      <div className="sm:hidden text-xs text-muted-foreground mt-0.5">
                        {candidate.parsed_data?.work_history?.[0]?.title && (
                          <span>{candidate.parsed_data.work_history[0].title}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] hidden sm:table-cell">
                      {candidate.parsed_data?.work_history?.[0] ? (
                        <div className="truncate">
                          <span className="font-medium">{candidate.parsed_data.work_history[0].title}</span>
                          <span className="text-muted-foreground text-xs block truncate">
                            {candidate.parsed_data.work_history[0].company}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm hidden lg:table-cell">{candidate.location || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {candidate.owner ? (
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-3 w-3 text-primary" />
                          </div>
                          <span className="text-xs truncate max-w-[80px]">
                            {candidate.owner.full_name?.split(' ')[0] || candidate.owner.email?.split('@')[0]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {candidate.pipeline_jobs && candidate.pipeline_jobs.length > 0 ? (
                        <div className="space-y-0.5">
                          {candidate.pipeline_jobs.slice(0, 2).map((pj, idx) => (
                            <div key={idx} className="flex items-center gap-1">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                                pj.stage === 'hired' ? 'bg-emerald-500' :
                                pj.stage === 'offer' ? 'bg-amber-500' :
                                pj.stage === 'interview' ? 'bg-purple-500' :
                                pj.stage === 'screening' ? 'bg-blue-500' :
                                pj.stage === 'rejected' || pj.stage === 'withdrawn' ? 'bg-red-500' :
                                'bg-slate-400'
                              }`} />
                              <span className="text-[10px] truncate max-w-[100px]">
                                {pj.job_title || pj.company}
                              </span>
                            </div>
                          ))}
                          {candidate.pipeline_jobs.length > 2 && (
                            <span className="text-[10px] text-muted-foreground">
                              +{candidate.pipeline_jobs.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <VerdictDisplay
                        recruiterVerdict={candidate.recruiter_verdict}
                        lilyVerdict={candidate.lily_verdict}
                        size="xs"
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`${availabilityConfig.color} border-0 text-[10px] flex items-center gap-0.5 w-fit px-1.5`}>
                        {availabilityIcons[availabilityStatus]}
                        <span className="hidden sm:inline">{availabilityConfig.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                      {candidate.last_activity ? formatRelativeTime(candidate.last_activity) : formatRelativeTime(candidate.updated_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Card View */
        <div className="space-y-8">
          {reviewingCandidates.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Reviewing ({reviewingCandidates.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {reviewingCandidates.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </div>
            </section>
          )}

          {newCandidates.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                New ({newCandidates.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {newCandidates.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </div>
            </section>
          )}

          {shortlistedCandidates.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Shortlisted ({shortlistedCandidates.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {shortlistedCandidates.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </div>
            </section>
          )}

          {otherCandidates.length > 0 && (
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                Archived ({otherCandidates.length})
              </h2>
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {otherCandidates.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
