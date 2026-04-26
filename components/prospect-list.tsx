'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Linkedin, Mail, Search, Building, MapPin, Clock, User, LayoutGrid, List, ArrowUpDown, CheckCircle, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ProspectRecruiter, 
  ProspectTalent, 
  PROSPECT_OUTREACH_STATUSES, 
  PROSPECT_ASSESSMENTS,
  RECRUITER_TYPES,
  TALENT_TYPES,
  ProspectOutreachStatus,
  ProspectAssessment,
  RecruiterType,
  TalentType,
  UserAdmin
} from '@/lib/types'
import { formatDistanceToNow, format } from 'date-fns'

interface ProspectListProps {
  type: 'recruiter' | 'talent'
  data: (ProspectRecruiter | ProspectTalent)[]
  matchedUsers?: Record<string, UserAdmin>
}

type SortField = 'name' | 'created_at' | 'last_contacted_at' | 'outreach_status' | 'assessment'
type SortOrder = 'asc' | 'desc'

export function ProspectList({ type, data, matchedUsers = {} }: ProspectListProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assessmentFilter, setAssessmentFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'cards' | 'rows'>('cards')
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ProspectRecruiter | ProspectTalent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const tableName = type === 'recruiter' ? 'prospect_recruiters' : 'prospect_talents'
  const typeField = type === 'recruiter' ? 'recruiter_type' : 'talent_type'
  const typesConfig = type === 'recruiter' ? RECRUITER_TYPES : TALENT_TYPES

  const filteredData = data
    .filter(item => {
      const matchesSearch = 
        item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.email?.toLowerCase().includes(search.toLowerCase()) ||
        ('company' in item && item.company?.toLowerCase().includes(search.toLowerCase())) ||
        ('current_company' in item && item.current_company?.toLowerCase().includes(search.toLowerCase())) ||
        ('overview' in item && item.overview?.toLowerCase().includes(search.toLowerCase()))
      
      const matchesStatus = statusFilter === 'all' || item.outreach_status === statusFilter
      const matchesAssessment = assessmentFilter === 'all' || item.assessment === assessmentFilter
      
      const itemType = type === 'recruiter' 
        ? (item as ProspectRecruiter).recruiter_type 
        : (item as ProspectTalent).talent_type
      const matchesType = typeFilter === 'all' || itemType === typeFilter

      return matchesSearch && matchesStatus && matchesAssessment && matchesType
    })
    .sort((a, b) => {
      let aVal: any = a[sortField as keyof typeof a]
      let bVal: any = b[sortField as keyof typeof b]
      
      if (sortField === 'name') {
        aVal = aVal?.toLowerCase() || ''
        bVal = bVal?.toLowerCase() || ''
      } else if (sortField.includes('_at')) {
        aVal = aVal ? new Date(aVal).getTime() : 0
        bVal = bVal ? new Date(bVal).getTime() : 0
      }
      
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
      return 0
    })

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('desc')
    }
  }

  const handleSave = async (formData: FormData) => {
    setIsLoading(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    
    const baseData = {
      name: formData.get('name') as string,
      email: formData.get('email') as string || null,
      linkedin_url: formData.get('linkedin_url') as string || null,
      location: formData.get('location') as string || null,
      outreach_status: formData.get('outreach_status') as ProspectOutreachStatus,
      assessment: formData.get('assessment') as ProspectAssessment || null,
      notes: formData.get('notes') as string || null,
      source: formData.get('source') as string || null,
    }

    const specificData = type === 'recruiter' 
      ? {
          company: formData.get('company') as string || null,
          title: formData.get('title') as string || null,
          recruiter_type: formData.get('recruiter_type') as RecruiterType || null,
          overview: formData.get('overview') as string || null,
          why_good_fit: formData.get('why_good_fit') as string || null,
        }
      : {
          current_company: formData.get('current_company') as string || null,
          current_title: formData.get('current_title') as string || null,
          skills: (formData.get('skills') as string)?.split(',').map(s => s.trim()).filter(Boolean) || null,
          talent_type: formData.get('talent_type') as TalentType || null,
          overview: formData.get('overview') as string || null,
        }

    const insertData = { ...baseData, ...specificData }

    if (editingItem) {
      // Use API route for updates to bypass RLS
      const apiRoute = type === 'recruiter' ? '/api/prospect-recruiters' : '/api/prospect-talents'
      const res = await fetch(`${apiRoute}/${editingItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insertData),
      })
      if (!res.ok) {
        const err = await res.json()
        console.error('Error updating:', err)
      }
    } else {
      // Use API route for inserts to bypass RLS
      const apiRoute = type === 'recruiter' ? '/api/prospect-recruiters' : '/api/prospect-talents'
      const res = await fetch(apiRoute, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(insertData),
      })
      if (!res.ok) {
        const err = await res.json()
        console.error('Error inserting:', err)
      }
    }

    setIsLoading(false)
    setIsAddDialogOpen(false)
    setEditingItem(null)
    router.refresh()
  }

  const handleStatusChange = async (item: ProspectRecruiter | ProspectTalent, newStatus: ProspectOutreachStatus) => {
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase
      .from(tableName)
      .update({ outreach_status: newStatus, last_contacted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', item.id)
    
    if (!error) {
      // Log stage change
      const historyTable = type === 'recruiter' ? 'prospect_recruiter_stage_history' : 'prospect_talent_stage_history'
      const idField = type === 'recruiter' ? 'recruiter_id' : 'talent_id'
      await supabase.from(historyTable).insert({
        [idField]: item.id,
        from_status: item.outreach_status,
        to_status: newStatus,
        changed_by: user?.id
      })
      router.refresh()
    }
  }

  const isOnboarded = (item: ProspectRecruiter | ProspectTalent) => {
    return item.email && matchedUsers[item.email]
  }

  const formatRelativeTime = (date: string) => {
    const now = new Date()
    const then = new Date(date)
    const diffInDays = Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24))
    if (diffInDays === 0) return 'Today'
    if (diffInDays === 1) return 'Yesterday'
    if (diffInDays < 7) return `${diffInDays}d ago`
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`
    return `${Math.floor(diffInDays / 30)}mo ago`
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${type}s...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {Object.entries(PROSPECT_OUTREACH_STATUSES).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assessmentFilter} onValueChange={setAssessmentFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Assessment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assessments</SelectItem>
              {Object.entries(PROSPECT_ASSESSMENTS).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {Object.entries(typesConfig).map(([key, config]) => (
                <SelectItem key={key} value={key}>{config.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'cards' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'rows' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('rows')}
            >
              <List className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground ml-2">
              {filteredData.length} {type}{filteredData.length !== 1 ? 's' : ''}
            </span>
          </div>

          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open)
            if (!open) setEditingItem(null)
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Add {type === 'recruiter' ? 'Recruiter' : 'Talent'}</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit' : 'Add'} {type === 'recruiter' ? 'Recruiter' : 'Talent'}
                </DialogTitle>
              </DialogHeader>
              <form action={handleSave} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" name="name" required defaultValue={editingItem?.name || ''} />
                  </div>
                  
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" defaultValue={editingItem?.email || ''} />
                  </div>
                  
                  <div>
                    <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                    <Input id="linkedin_url" name="linkedin_url" defaultValue={editingItem?.linkedin_url || ''} />
                  </div>

                  {type === 'recruiter' ? (
                    <>
                      <div>
                        <Label htmlFor="company">Company</Label>
                        <Input id="company" name="company" defaultValue={(editingItem as ProspectRecruiter)?.company || ''} />
                      </div>
                      <div>
                        <Label htmlFor="title">Title</Label>
                        <Input id="title" name="title" defaultValue={(editingItem as ProspectRecruiter)?.title || ''} />
                      </div>
                      <div>
                        <Label htmlFor="recruiter_type">Recruiter Type</Label>
                        <Select name="recruiter_type" defaultValue={(editingItem as ProspectRecruiter)?.recruiter_type || ''}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(RECRUITER_TYPES).map(([key, config]) => (
                              <SelectItem key={key} value={key}>{config.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="current_company">Current Company</Label>
                        <Input id="current_company" name="current_company" defaultValue={(editingItem as ProspectTalent)?.current_company || ''} />
                      </div>
                      <div>
                        <Label htmlFor="current_title">Current Title</Label>
                        <Input id="current_title" name="current_title" defaultValue={(editingItem as ProspectTalent)?.current_title || ''} />
                      </div>
                      <div>
                        <Label htmlFor="talent_type">Talent Type</Label>
                        <Select name="talent_type" defaultValue={(editingItem as ProspectTalent)?.talent_type || ''}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TALENT_TYPES).map(([key, config]) => (
                              <SelectItem key={key} value={key}>{config.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Label htmlFor="skills">Skills (comma-separated)</Label>
                        <Input id="skills" name="skills" placeholder="e.g., Sales, GTM, Enterprise" defaultValue={(editingItem as ProspectTalent)?.skills?.join(', ') || ''} />
                      </div>
                    </>
                  )}

                  <div>
                    <Label htmlFor="location">Location</Label>
                    <Input id="location" name="location" defaultValue={editingItem?.location || ''} />
                  </div>

                  <div>
                    <Label htmlFor="source">Source</Label>
                    <Input id="source" name="source" placeholder="e.g., LinkedIn, Referral" defaultValue={editingItem?.source || ''} />
                  </div>

                  <div>
                    <Label htmlFor="outreach_status">Outreach Status</Label>
                    <Select name="outreach_status" defaultValue={editingItem?.outreach_status || 'prospect'}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROSPECT_OUTREACH_STATUSES).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="assessment">Assessment</Label>
                    <Select name="assessment" defaultValue={editingItem?.assessment || ''}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROSPECT_ASSESSMENTS).map(([key, config]) => (
                          <SelectItem key={key} value={key}>{config.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label htmlFor="overview">Overview</Label>
                    <Textarea id="overview" name="overview" rows={3} placeholder="Brief overview of this person..." defaultValue={(editingItem as any)?.overview || ''} />
                  </div>

                  {type === 'recruiter' && (
                    <div className="col-span-2">
                      <Label htmlFor="why_good_fit">Why a Good Fit for Refery</Label>
                      <Textarea id="why_good_fit" name="why_good_fit" rows={2} defaultValue={(editingItem as ProspectRecruiter)?.why_good_fit || ''} />
                    </div>
                  )}

                  <div className="col-span-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea id="notes" name="notes" rows={2} defaultValue={editingItem?.notes || ''} />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); setEditingItem(null) }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Saving...' : editingItem ? 'Update' : 'Add'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {Object.entries(PROSPECT_OUTREACH_STATUSES).map(([key, config]) => {
          const count = data.filter(d => d.outreach_status === key).length
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
              className={`p-2 rounded-lg border text-left transition-colors ${
                statusFilter === key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
              }`}
            >
              <p className="text-xs text-muted-foreground truncate">{config.label.split(' ')[0]}</p>
              <p className="text-lg font-semibold">{count}</p>
            </button>
          )
        })}
      </div>

      {/* Row View */}
      {viewMode === 'rows' && (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    Name
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead>{type === 'recruiter' ? 'Company' : 'Current Role'}</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('outreach_status')}>
                  <div className="flex items-center gap-1">
                    Status
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('assessment')}>
                  <div className="flex items-center gap-1">
                    Assessment
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('last_contacted_at')}>
                  <div className="flex items-center gap-1">
                    Last Contact
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort('created_at')}>
                  <div className="flex items-center gap-1">
                    Added
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.map((item) => {
                const statusConfig = PROSPECT_OUTREACH_STATUSES[item.outreach_status]
                const assessmentConfig = item.assessment ? PROSPECT_ASSESSMENTS[item.assessment] : null
                const itemType = type === 'recruiter' 
                  ? (item as ProspectRecruiter).recruiter_type 
                  : (item as ProspectTalent).talent_type
                const typeConfig = itemType ? typesConfig[itemType as keyof typeof typesConfig] : null
                const company = type === 'recruiter' 
                  ? (item as ProspectRecruiter).company 
                  : (item as ProspectTalent).current_company
                const title = type === 'recruiter' 
                  ? (item as ProspectRecruiter).title 
                  : (item as ProspectTalent).current_title
                const onboarded = isOnboarded(item)

                return (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/${type}s/${item.id}`} className="flex items-center gap-2">
                          <span className="font-medium">{item.name}</span>
                          {onboarded && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              User
                            </Badge>
                          )}
                        </Link>
                        {item.linkedin_url && (
                          <a 
                            href={item.linkedin_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:opacity-70 transition-opacity"
                          >
                            <Linkedin className="h-3.5 w-3.5 text-blue-600" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {title && <span className="text-muted-foreground">{title}</span>}
                        {company && <span>{title ? ' @ ' : ''}{company}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {typeConfig && (
                        <Badge variant="secondary" className={typeConfig.color}>
                          {typeConfig.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={item.outreach_status} 
                        onValueChange={(value) => handleStatusChange(item, value as ProspectOutreachStatus)}
                      >
                        <SelectTrigger className={`h-7 text-xs w-auto ${statusConfig.color} border-0`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PROSPECT_OUTREACH_STATUSES).map(([key, config]) => (
                            <SelectItem key={key} value={key}>{config.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {assessmentConfig && (
                        <Badge className={`${assessmentConfig.color} border-0`}>
                          {assessmentConfig.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.last_contacted_at ? formatRelativeTime(item.last_contacted_at) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(item.created_at), 'MMM d')}
                    </TableCell>
                    <TableCell>
                      <Link href={`/${type}s/${item.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Card View */}
      {viewMode === 'cards' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredData.map((item) => {
            const statusConfig = PROSPECT_OUTREACH_STATUSES[item.outreach_status]
            const assessmentConfig = item.assessment ? PROSPECT_ASSESSMENTS[item.assessment] : null
            const itemType = type === 'recruiter' 
              ? (item as ProspectRecruiter).recruiter_type 
              : (item as ProspectTalent).talent_type
            const typeConfig = itemType ? typesConfig[itemType as keyof typeof typesConfig] : null
            const company = type === 'recruiter' 
              ? (item as ProspectRecruiter).company 
              : (item as ProspectTalent).current_company
            const title = type === 'recruiter' 
              ? (item as ProspectRecruiter).title 
              : (item as ProspectTalent).current_title
            const overview = (item as any).overview
            const onboarded = isOnboarded(item)

            return (
              <Link key={item.id} href={`/${type}s/${item.id}`}>
                <Card className="cursor-pointer hover:border-primary/30 transition-colors h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base truncate flex items-center gap-2">
                          {item.name}
                          {onboarded && (
                            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                          )}
                          {item.linkedin_url && (
                            <a 
                              href={item.linkedin_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:opacity-70 transition-opacity"
                            >
                              <Linkedin className="h-4 w-4 text-blue-600 shrink-0" />
                            </a>
                          )}
                        </CardTitle>
                        {title && (
                          <p className="text-sm text-muted-foreground truncate">{title}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 items-end shrink-0">
                        {assessmentConfig && (
                          <Badge className={`${assessmentConfig.color} border-0 text-xs`}>
                            {assessmentConfig.label}
                          </Badge>
                        )}
                        {typeConfig && (
                          <Badge variant="secondary" className={`${typeConfig.color} text-xs`}>
                            {typeConfig.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {company && (
                        <span className="flex items-center gap-1">
                          <Building className="h-3.5 w-3.5" />
                          {company}
                        </span>
                      )}
                      {item.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {item.location}
                        </span>
                      )}
                    </div>

                    {overview && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {overview}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <Badge className={`${statusConfig.color} border-0 text-xs`}>
                        {statusConfig.label}
                      </Badge>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {item.last_contacted_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(item.last_contacted_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {filteredData.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No {type}s found</p>
          <p className="text-sm">Add your first {type} to get started</p>
        </div>
      )}
    </div>
  )
}
