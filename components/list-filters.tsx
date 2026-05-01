'use client'

import { useState, useMemo, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Job, Candidate } from '@/lib/types'

interface JobFiltersProps {
  jobs: Job[]
  onFilterChange: (filtered: Job[]) => void
  showStatusFilter?: boolean
}

export function JobFilters({ jobs, onFilterChange, showStatusFilter = false }: JobFiltersProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [remotePolicyFilter, setRemotePolicyFilter] = useState<string>('all')
  const [departmentFilter, setDepartmentFilter] = useState<string>('all')
  const [companyStageFilter, setCompanyStageFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')

  // Extract unique values for filters
  const departments = useMemo(() => {
    const depts = new Set(jobs.map(j => j.department).filter(Boolean))
    return Array.from(depts) as string[]
  }, [jobs])

  const companyStages = useMemo(() => {
    const stages = new Set(jobs.map(j => j.company_stage).filter(Boolean))
    return Array.from(stages) as string[]
  }, [jobs])

  // Compute filtered jobs
  const filteredJobs = useMemo(() => {
    let filtered = [...jobs]

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(j => 
        j.title.toLowerCase().includes(searchLower) ||
        j.company_name?.toLowerCase().includes(searchLower) ||
        j.department?.toLowerCase().includes(searchLower) ||
        j.location?.toLowerCase().includes(searchLower) ||
        j.skills_required?.some(s => s.toLowerCase().includes(searchLower)) ||
        j.tags?.some(t => t.toLowerCase().includes(searchLower))
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(j => j.status === statusFilter)
    }

    if (remotePolicyFilter !== 'all') {
      filtered = filtered.filter(j => j.remote_policy === remotePolicyFilter)
    }

    if (departmentFilter !== 'all') {
      filtered = filtered.filter(j => j.department === departmentFilter)
    }

    if (companyStageFilter !== 'all') {
      filtered = filtered.filter(j => j.company_stage === companyStageFilter)
    }

    // Apply sorting
    switch (sortBy) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
      case 'oldest':
        filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        break
      case 'title':
        filtered.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'company':
        filtered.sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''))
        break
      case 'salary_high':
        filtered.sort((a, b) => (b.salary_max || 0) - (a.salary_max || 0))
        break
      case 'salary_low':
        filtered.sort((a, b) => (a.salary_min || Infinity) - (b.salary_min || Infinity))
        break
    }

    return filtered
  }, [jobs, search, statusFilter, remotePolicyFilter, departmentFilter, companyStageFilter, sortBy])

  // Notify parent of filter changes
  useEffect(() => {
    onFilterChange(filteredJobs)
  }, [filteredJobs, onFilterChange])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setRemotePolicyFilter('all')
    setDepartmentFilter('all')
    setCompanyStageFilter('all')
    setSortBy('newest')
  }

  const hasActiveFilters = search || statusFilter !== 'all' || remotePolicyFilter !== 'all' || departmentFilter !== 'all' || companyStageFilter !== 'all' || sortBy !== 'newest'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search jobs, companies, skills, tags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        
        {showStatusFilter && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        )}

        <Select value={remotePolicyFilter} onValueChange={setRemotePolicyFilter}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Remote" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="onsite">On-site</SelectItem>
          </SelectContent>
        </Select>

        {departments.length > 0 && (
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Depts</SelectItem>
              {departments.map(dept => (
                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {companyStages.length > 0 && (
          <Select value={companyStageFilter} onValueChange={setCompanyStageFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {companyStages.map(stage => (
                <SelectItem key={stage} value={stage} className="capitalize">{stage.replace('-', ' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="oldest">Oldest First</SelectItem>
            <SelectItem value="title">Title A-Z</SelectItem>
            <SelectItem value="company">Company A-Z</SelectItem>
            <SelectItem value="salary_high">Salary High-Low</SelectItem>
            <SelectItem value="salary_low">Salary Low-High</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}

interface CandidateFiltersProps {
  candidates: Candidate[]
  onFilterChange: (filtered: Candidate[]) => void
}

export function CandidateFilters({ candidates, onFilterChange }: CandidateFiltersProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('all')
  const [remoteFilter, setRemoteFilter] = useState<string>('all')
  const [experienceFilter, setExperienceFilter] = useState<string>('all')

  // Compute filtered candidates
  const filteredCandidates = useMemo(() => {
    let filtered = [...candidates]

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.email?.toLowerCase().includes(searchLower) ||
        c.location?.toLowerCase().includes(searchLower) ||
        c.skills?.some(s => s.toLowerCase().includes(searchLower))
      )
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(c => c.status === statusFilter)
    }

    if (availabilityFilter !== 'all') {
      filtered = filtered.filter(c => (c.availability_status || 'not_yet_talked') === availabilityFilter)
    }

    if (remoteFilter !== 'all') {
      filtered = filtered.filter(c => c.remote_preference === remoteFilter)
    }

    if (experienceFilter !== 'all') {
      filtered = filtered.filter(c => {
        const years = c.experience_years ?? 0
        switch (experienceFilter) {
          case 'junior': return years < 3
          case 'mid': return years >= 3 && years < 6
          case 'senior': return years >= 6 && years < 10
          case 'lead': return years >= 10
          default: return true
        }
      })
    }

    return filtered
  }, [candidates, search, statusFilter, availabilityFilter, remoteFilter, experienceFilter])

  // Notify parent of filter changes
  useEffect(() => {
    onFilterChange(filteredCandidates)
  }, [filteredCandidates, onFilterChange])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setAvailabilityFilter('all')
    setRemoteFilter('all')
    setExperienceFilter('all')
  }

  const hasActiveFilters = search || statusFilter !== 'all' || availabilityFilter !== 'all' || remoteFilter !== 'all' || experienceFilter !== 'all'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Search candidates, skills, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewing">Reviewing</SelectItem>
            <SelectItem value="shortlisted">Shortlisted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="hired">Hired</SelectItem>
          </SelectContent>
        </Select>

        <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Availability" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Availability</SelectItem>
            <SelectItem value="active">Actively Looking</SelectItem>
            <SelectItem value="off_market">Off Market</SelectItem>
            <SelectItem value="not_yet_talked">Not Yet Talked</SelectItem>
            <SelectItem value="not_qualified">Not Qualified</SelectItem>
          </SelectContent>
        </Select>

        <Select value={remoteFilter} onValueChange={setRemoteFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Remote Pref" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Prefs</SelectItem>
            <SelectItem value="remote">Remote</SelectItem>
            <SelectItem value="hybrid">Hybrid</SelectItem>
            <SelectItem value="onsite">On-site</SelectItem>
            <SelectItem value="flexible">Flexible</SelectItem>
          </SelectContent>
        </Select>

        <Select value={experienceFilter} onValueChange={setExperienceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Experience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="junior">Junior (0-2 yrs)</SelectItem>
            <SelectItem value="mid">Mid (3-5 yrs)</SelectItem>
            <SelectItem value="senior">Senior (6-9 yrs)</SelectItem>
            <SelectItem value="lead">Lead (10+ yrs)</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}

interface FilterStatsProps {
  total: number
  filtered: number
  label: string
  extra?: string
}

export function FilterStats({ total, filtered, label, extra }: FilterStatsProps) {
  const extraText = extra ? ` · ${extra}` : ''
  
  if (total === filtered) {
    return (
      <p className="text-sm text-muted-foreground">
        {total} {label}{total !== 1 ? 's' : ''}{extraText}
      </p>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      Showing {filtered} of {total} {label}{total !== 1 ? 's' : ''}{extraText}
    </p>
  )
}
