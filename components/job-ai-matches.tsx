'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { MatchDetailCard } from '@/components/match-detail-card'
import type { JobMatch, Job, Candidate } from '@/lib/types'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { RefreshCw, Filter, Loader2 } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface JobAiMatchesProps {
  job: Job
  matches: (JobMatch & { candidate: Candidate })[]
  userRole?: string
  userId?: string
}

export function JobAiMatches({ job, matches: initialMatches, userRole, userId }: JobAiMatchesProps) {
  const isAdmin = ['super_admin', 'admin'].includes(userRole || '')
  const [matches, setMatches] = useState(initialMatches)
  const [isPending, startTransition] = useTransition()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedAvailabilities, setSelectedAvailabilities] = useState<string[]>([
    'not_yet_talked',
    'active',
    'off_market',
  ])

  const handleRefreshMatches = async () => {
    setIsRefreshing(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}/refresh-matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userRole, userId }),
      })
      if (response.ok) {
        const data = await response.json()
        setMatches(data.matches || [])
      }
    } catch (error) {
      console.error('Failed to refresh matches:', error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const toggleAvailability = (status: string) => {
    setSelectedAvailabilities(prev => 
      prev.includes(status) 
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
  }

  // Filter matches by selected availability statuses
  const filteredMatches = matches.filter(match => {
    const status = match.candidate?.availability_status || 'not_yet_talked'
    return selectedAvailabilities.includes(status)
  })

  // Sort by availability priority (not_yet_talked first, then active, then off_market)
  const sortedMatches = [...filteredMatches].sort((a, b) => {
    const priorityOrder = { not_yet_talked: 1, active: 2, off_market: 3 }
    const statusA = a.candidate?.availability_status || 'not_yet_talked'
    const statusB = b.candidate?.availability_status || 'not_yet_talked'
    const priorityA = priorityOrder[statusA as keyof typeof priorityOrder] || 99
    const priorityB = priorityOrder[statusB as keyof typeof priorityOrder] || 99
    
    // First sort by availability priority, then by overall score
    if (priorityA !== priorityB) return priorityA - priorityB
    return b.overall_score - a.overall_score
  })

  const availabilityStats = {
    not_yet_talked: matches.filter(m => (m.candidate?.availability_status || 'not_yet_talked') === 'not_yet_talked').length,
    active: matches.filter(m => m.candidate?.availability_status === 'active').length,
    off_market: matches.filter(m => m.candidate?.availability_status === 'off_market').length,
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold text-foreground">AI-Matched Candidates</h2>
          <p className="text-sm text-muted-foreground">
            {filteredMatches.length} of {matches.length} candidate{matches.length !== 1 ? 's' : ''} shown
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Availability Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Availability
                {selectedAvailabilities.length < 3 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedAvailabilities.length}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Filter by Availability</h4>
                {Object.entries(AVAILABILITY_STATUSES).map(([key, config]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`avail-${key}`}
                      checked={selectedAvailabilities.includes(key)}
                      onCheckedChange={() => toggleAvailability(key)}
                    />
                    <label
                      htmlFor={`avail-${key}`}
                      className="flex items-center gap-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}>
                        {config.label}
                      </span>
                      <span className="text-muted-foreground">
                        ({availabilityStats[key as keyof typeof availabilityStats] || 0})
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Refresh Button */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefreshMatches}
            disabled={isRefreshing}
            className="gap-2"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {isRefreshing ? 'Refreshing...' : 'Refresh Matches'}
          </Button>
        </div>
      </div>

      {sortedMatches.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            {matches.length === 0 ? (
              <>
                <p className="text-muted-foreground mb-4">No matching candidates found</p>
                <p className="text-sm text-muted-foreground mb-4">
                  Click &quot;Refresh Matches&quot; to find candidates from your pool that match this job
                </p>
                <Button onClick={handleRefreshMatches} disabled={isRefreshing}>
                  {isRefreshing ? 'Finding Matches...' : 'Find Matching Candidates'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-muted-foreground mb-4">No candidates match your filter criteria</p>
                <Button variant="outline" onClick={() => setSelectedAvailabilities(['not_yet_talked', 'active', 'off_market'])}>
                  Clear Filters
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedMatches.map((match) => (
            <MatchDetailCard 
              key={match.id} 
              match={match}
              showCandidate={true}
              showJob={false}
            />
          ))}
        </div>
      )}
    </div>
  )
}
