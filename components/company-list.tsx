'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building2, Globe, MapPin, Users, Briefcase, Search, LayoutGrid, List, Linkedin } from 'lucide-react'
import type { Company } from '@/lib/types'

interface CompanyFromJobs {
  name: string
  jobCount: number
  isFromDatabase: boolean
  companyData?: Company & { relationship_status?: string }
}

interface CompanyListProps {
  companies: CompanyFromJobs[]
  isAdmin: boolean
}

const relationshipLabels: Record<string, { label: string; color: string; order: number }> = {
  not_contacted: { label: 'Not Contacted', color: 'bg-gray-100 text-gray-600', order: 1 },
  cold_outreached: { label: 'Cold Outreach', color: 'bg-blue-100 text-blue-700', order: 2 },
  warm_lead: { label: 'Warm Lead', color: 'bg-amber-100 text-amber-700', order: 3 },
  in_conversation: { label: 'In Conversation', color: 'bg-purple-100 text-purple-700', order: 4 },
  proposal_sent: { label: 'Proposal Sent', color: 'bg-cyan-100 text-cyan-700', order: 5 },
  contract_signed: { label: 'Contract Signed', color: 'bg-emerald-100 text-emerald-700', order: 6 },
  active_client: { label: 'Active Client', color: 'bg-green-100 text-green-800', order: 7 },
  churned: { label: 'Churned', color: 'bg-red-100 text-red-700', order: 8 },
  lost: { label: 'Lost', color: 'bg-gray-200 text-gray-600', order: 9 },
}

const stageLabels: Record<string, { label: string; color: string }> = {
  seed: { label: 'Seed', color: 'bg-purple-100 text-purple-700' },
  'series-a': { label: 'Series A', color: 'bg-blue-100 text-blue-700' },
  'series-b': { label: 'Series B', color: 'bg-cyan-100 text-cyan-700' },
  'series-c': { label: 'Series C', color: 'bg-green-100 text-green-700' },
  'series-d': { label: 'Series D', color: 'bg-emerald-100 text-emerald-700' },
  public: { label: 'Public', color: 'bg-amber-100 text-amber-700' },
  established: { label: 'Established', color: 'bg-gray-100 text-gray-700' },
}

export function CompanyList({ companies, isAdmin }: CompanyListProps) {
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState<string>('all')
  const [relationshipFilter, setRelationshipFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('name')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Get unique stages and relationships for filters
  const availableStages = useMemo(() => {
    const stages = new Set<string>()
    companies.forEach(c => {
      if (c.companyData?.stage) stages.add(c.companyData.stage)
    })
    return Array.from(stages)
  }, [companies])

  const availableRelationships = useMemo(() => {
    const relationships = new Set<string>()
    companies.forEach(c => {
      if (c.companyData?.relationship_status) relationships.add(c.companyData.relationship_status)
    })
    return Array.from(relationships)
  }, [companies])

  // Filter and sort companies
  const filteredCompanies = useMemo(() => {
    let filtered = [...companies]

    // Search
    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchLower) ||
        c.companyData?.industry?.toLowerCase().includes(searchLower) ||
        c.companyData?.location?.toLowerCase().includes(searchLower) ||
        c.companyData?.description?.toLowerCase().includes(searchLower)
      )
    }

    // Stage filter
    if (stageFilter !== 'all') {
      filtered = filtered.filter(c => c.companyData?.stage === stageFilter)
    }

    // Relationship filter
    if (relationshipFilter !== 'all') {
      filtered = filtered.filter(c => c.companyData?.relationship_status === relationshipFilter)
    }

    // Sorting
    switch (sortBy) {
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name_desc':
        filtered.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'jobs':
        filtered.sort((a, b) => b.jobCount - a.jobCount)
        break
      case 'relationship':
        filtered.sort((a, b) => {
          const orderA = relationshipLabels[a.companyData?.relationship_status || 'not_contacted']?.order || 99
          const orderB = relationshipLabels[b.companyData?.relationship_status || 'not_contacted']?.order || 99
          return orderA - orderB
        })
        break
      case 'newest':
        filtered.sort((a, b) => {
          const dateA = a.companyData?.created_at ? new Date(a.companyData.created_at).getTime() : 0
          const dateB = b.companyData?.created_at ? new Date(b.companyData.created_at).getTime() : 0
          return dateB - dateA
        })
        break
    }

    return filtered
  }, [companies, search, stageFilter, relationshipFilter, sortBy])

  const clearFilters = () => {
    setSearch('')
    setStageFilter('all')
    setRelationshipFilter('all')
    setSortBy('name')
  }

  const hasActiveFilters = search || stageFilter !== 'all' || relationshipFilter !== 'all' || sortBy !== 'name'

  if (companies.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No companies yet</p>
          <Link href="/companies/new"><Button>Add Your First Company</Button></Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search companies, industry, location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {availableStages.length > 0 && (
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {availableStages.map(stage => (
                <SelectItem key={stage} value={stage} className="capitalize">
                  {stageLabels[stage]?.label || stage}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {isAdmin && availableRelationships.length > 0 && (
          <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Relationship" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Relationships</SelectItem>
              {availableRelationships.map(rel => (
                <SelectItem key={rel} value={rel}>
                  {relationshipLabels[rel]?.label || rel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name A-Z</SelectItem>
            <SelectItem value="name_desc">Name Z-A</SelectItem>
            <SelectItem value="jobs">Most Jobs</SelectItem>
            <SelectItem value="relationship">Relationship Stage</SelectItem>
            <SelectItem value="newest">Newest First</SelectItem>
          </SelectContent>
        </Select>

        {/* View toggle */}
        <div className="flex border rounded-lg overflow-hidden">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="icon"
            className="rounded-none h-9 w-9"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="rounded-none h-9 w-9"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Stats */}
      <p className="text-sm text-muted-foreground">
        {filteredCompanies.length === companies.length
          ? `${companies.length} companies`
          : `Showing ${filteredCompanies.length} of ${companies.length} companies`}
      </p>

      {filteredCompanies.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">No companies match your filters</p>
            <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCompanies.map((company) => {
            const companyData = company.companyData
            const linkHref = companyData ? `/companies/${companyData.id}` : `/companies/view/${encodeURIComponent(company.name)}`
            const relationshipStatus = companyData?.relationship_status || 'not_contacted'
            const relationshipInfo = relationshipLabels[relationshipStatus]
            
            return (
              <Link key={company.name} href={linkHref}>
                <Card className="hover:border-primary/50 transition-colors h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {companyData?.logo_url ? (
                          <img 
                            src={companyData.logo_url} 
                            alt={company.name}
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : (
                          <div className={`h-10 w-10 rounded-md flex items-center justify-center ${company.isFromDatabase ? 'bg-primary/10' : 'bg-amber-100'}`}>
                            <Building2 className={`h-5 w-5 ${company.isFromDatabase ? 'text-primary' : 'text-amber-600'}`} />
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-lg">{company.name}</CardTitle>
                          {companyData?.industry && <CardDescription>{companyData.industry}</CardDescription>}
                          {!company.isFromDatabase && <CardDescription className="text-amber-600">From jobs</CardDescription>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {companyData?.stage && stageLabels[companyData.stage] && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${stageLabels[companyData.stage].color}`}>
                            {stageLabels[companyData.stage].label}
                          </span>
                        )}
                        {isAdmin && company.isFromDatabase && relationshipInfo && (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${relationshipInfo.color}`}>
                            {relationshipInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {companyData?.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{companyData.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                      {companyData?.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{companyData.location}</span>}
                      {companyData?.employee_count && <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{companyData.employee_count}</span>}
                      {companyData?.website && <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />Website</span>}
                      {companyData?.linkedin_url && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            window.open(companyData.linkedin_url!, '_blank', 'noopener,noreferrer')
                          }}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Linkedin className="h-3.5 w-3.5" />LinkedIn
                        </button>
                      )}
                    </div>
                    <div className="pt-2 border-t flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-muted-foreground" />
                      <span className={`text-sm font-medium ${company.jobCount > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {company.jobCount} open position{company.jobCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      ) : (
        /* List/Row view */
        <div className="border rounded-lg divide-y">
          {filteredCompanies.map((company) => {
            const companyData = company.companyData
            const linkHref = companyData ? `/companies/${companyData.id}` : `/companies/view/${encodeURIComponent(company.name)}`
            const relationshipStatus = companyData?.relationship_status || 'not_contacted'
            const relationshipInfo = relationshipLabels[relationshipStatus]
            
            return (
              <Link key={company.name} href={linkHref} className="block hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4 p-4">
                  {companyData?.logo_url ? (
                    <img 
                      src={companyData.logo_url} 
                      alt={company.name}
                      className="h-10 w-10 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div className={`h-10 w-10 rounded-md flex items-center justify-center shrink-0 ${company.isFromDatabase ? 'bg-primary/10' : 'bg-amber-100'}`}>
                      <Building2 className={`h-5 w-5 ${company.isFromDatabase ? 'text-primary' : 'text-amber-600'}`} />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium truncate">{company.name}</h3>
                      {!company.isFromDatabase && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">From jobs</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                      {companyData?.industry && <span>{companyData.industry}</span>}
                      {companyData?.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {companyData.location}
                        </span>
                      )}
                      {companyData?.employee_count && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {companyData.employee_count}
                        </span>
                      )}
                      {companyData?.linkedin_url && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            window.open(companyData.linkedin_url!, '_blank', 'noopener,noreferrer')
                          }}
                          className="flex items-center gap-1 text-blue-600 hover:underline"
                        >
                          <Linkedin className="h-3 w-3" />
                          LinkedIn
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {companyData?.stage && stageLabels[companyData.stage] && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${stageLabels[companyData.stage].color}`}>
                        {stageLabels[companyData.stage].label}
                      </span>
                    )}
                    {isAdmin && company.isFromDatabase && relationshipInfo && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${relationshipInfo.color}`}>
                        {relationshipInfo.label}
                      </span>
                    )}
                    <span className={`text-sm font-medium ${company.jobCount > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                      {company.jobCount} job{company.jobCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
