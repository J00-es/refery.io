'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Plus, ChevronDown, ChevronRight, MessageSquare, User, Clock, Send, Trash2, 
  ExternalLink, Search, Filter, Users, CheckCircle2, XCircle, ArrowRight,
  Sparkles, Mail, Phone, MapPin, Linkedin, FileText, Star, TrendingUp
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { JobCandidatePipeline, JobCandidateNote, Candidate } from '@/lib/types'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

const STAGES = [
  { value: 'job_matched', label: 'Job Matched', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Search },
  { value: 'job_shared', label: 'Job Shared', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: FileText },
  { value: 'interest_confirmed', label: 'Interest Confirmed', color: 'bg-cyan-100 text-cyan-700 border-cyan-200', icon: CheckCircle2 },
  { value: 'shared_to_hiring_manager', label: 'Shared to HM', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Send },
  { value: 'interview', label: 'Interview', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Users },
  { value: 'offer', label: 'Offer', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Star },
  { value: 'hired', label: 'Hired', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  { value: 'rejected', label: 'Rejected', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  { value: 'withdrawn', label: 'Withdrawn', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: ArrowRight },
]

const QUICK_NOTES = [
  'Initial call scheduled',
  'Positive first impression',
  'Technical screen passed',
  'Moving to next round',
  'Hiring manager approved',
  'Offer sent',
  'Negotiating terms',
  'Background check in progress',
  'Start date confirmed',
  'On hold - candidate request',
  'Waiting for feedback',
  'Need to follow up',
]

interface JobCandidatePipelineProps {
  jobId: string
  userRole?: string
  userId?: string
  companyId?: string
  hasAgreement?: boolean
}

export function JobCandidatePipeline({ jobId, userRole, userId, companyId, hasAgreement = true }: JobCandidatePipelineProps) {
  const [pipeline, setPipeline] = useState<JobCandidatePipeline[]>([])
  const [allCandidates, setAllCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [addingCandidate, setAddingCandidate] = useState(false)
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([])
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState<Record<string, JobCandidateNote[]>>({})
  const [newNote, setNewNote] = useState<Record<string, string>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [whyGoodFit, setWhyGoodFit] = useState<Record<string, string>>({})
  const supabase = createClient()

  useEffect(() => {
    fetchPipeline()
    fetchAllCandidates()
  }, [jobId])

  async function fetchPipeline() {
    const res = await fetch(`/api/jobs/${jobId}/pipeline`)
    if (res.ok) {
      const data = await res.json()
      setPipeline(data)
    }
    setLoading(false)
  }

  async function fetchAllCandidates() {
    const isAdmin = ['super_admin', 'admin'].includes(userRole || '')
    
    let query = supabase
      .from('candidates')
      .select('id, name, email, linkedin_url, skills, location, phone, experience_years, owner_user_id, uploaded_by_user_id, user_id')
      .order('name')
    
    // If not admin, only fetch candidates the user owns, uploaded, or created
    if (!isAdmin && userId) {
      query = query.or(`owner_user_id.eq.${userId},uploaded_by_user_id.eq.${userId},user_id.eq.${userId}`)
    }
    
    const { data } = await query
    if (data) setAllCandidates(data)
  }

  async function fetchNotes(pipelineId: string) {
    const res = await fetch(`/api/jobs/${jobId}/pipeline/${pipelineId}/notes`)
    if (res.ok) {
      const data = await res.json()
      setNotes(prev => ({ ...prev, [pipelineId]: data }))
    }
  }

  async function addCandidates() {
    if (selectedCandidates.length === 0) return
    setAddingCandidate(true)

    // Add each selected candidate with their "why good fit" comment
    for (const candidateId of selectedCandidates) {
      const comment = whyGoodFit[candidateId]?.trim()
      await fetch(`/api/jobs/${jobId}/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          candidate_id: candidateId,
          why_good_fit: comment || null
        }),
      })
    }

    setSelectedCandidates([])
    setSearchTerm('')
    setWhyGoodFit({})
    setAddDialogOpen(false)
    fetchPipeline()
    setAddingCandidate(false)
  }

  async function updateStage(pipelineId: string, stage: string) {
    await fetch(`/api/jobs/${jobId}/pipeline`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipeline_id: pipelineId, stage }),
    })
    fetchPipeline()
  }

  async function removeCandidate(pipelineId: string) {
    if (!confirm('Remove this candidate from the pipeline?')) return
    await fetch(`/api/jobs/${jobId}/pipeline?pipeline_id=${pipelineId}`, {
      method: 'DELETE',
    })
    fetchPipeline()
  }

  async function addNote(pipelineId: string, content?: string) {
    const noteContent = content || newNote[pipelineId]?.trim()
    if (!noteContent) return

    await fetch(`/api/jobs/${jobId}/pipeline/${pipelineId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteContent }),
    })

    setNewNote(prev => ({ ...prev, [pipelineId]: '' }))
    fetchNotes(pipelineId)
  }

  function toggleExpand(pipelineId: string) {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(pipelineId)) {
      newExpanded.delete(pipelineId)
    } else {
      newExpanded.add(pipelineId)
      if (!notes[pipelineId]) {
        fetchNotes(pipelineId)
      }
    }
    setExpandedItems(newExpanded)
  }

  function toggleCandidateSelection(candidateId: string) {
    setSelectedCandidates(prev => 
      prev.includes(candidateId) 
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    )
  }

  const getStageInfo = (stage: string) => STAGES.find(s => s.value === stage) || STAGES[0]

  // Filter candidates not already in pipeline
  const availableCandidates = useMemo(() => {
    return allCandidates.filter(
      c => !pipeline.some(p => p.candidate_id === c.id) &&
      (searchTerm === '' || 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.skills?.some(s => s.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    )
  }, [allCandidates, pipeline, searchTerm])

  // Group pipeline by stage for kanban view
  const pipelineByStage = useMemo(() => {
    return STAGES.filter(s => !['rejected', 'withdrawn'].includes(s.value)).map(stage => ({
      ...stage,
      candidates: pipeline.filter(p => p.stage === stage.value),
    }))
  }, [pipeline])

  // Stats
  const stats = useMemo(() => ({
    total: pipeline.length,
    active: pipeline.filter(p => !['rejected', 'withdrawn', 'hired'].includes(p.stage)).length,
    hired: pipeline.filter(p => p.stage === 'hired').length,
    rejected: pipeline.filter(p => p.stage === 'rejected').length,
  }), [pipeline])

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading pipeline...
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Candidate Pipeline
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Track candidates through your hiring process
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'kanban' | 'list')}>
              <TabsList className="h-8">
                <TabsTrigger value="kanban" className="text-xs px-2">Kanban</TabsTrigger>
                <TabsTrigger value="list" className="text-xs px-2">List</TabsTrigger>
              </TabsList>
            </Tabs>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" disabled={!hasAgreement}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Candidates
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>Add Candidates to Pipeline</DialogTitle>
                  <DialogDescription>
                    Select candidates from your database to add to this job&apos;s pipeline
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, email, or skills..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  
                  {selectedCandidates.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">{selectedCandidates.length} selected</Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedCandidates([])}
                      >
                        Clear
                      </Button>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto border rounded-lg">
                    {availableCandidates.length === 0 ? (
                      <div className="p-8 text-center text-muted-foreground">
                        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No candidates available</p>
                        <p className="text-xs mt-1">All candidates may already be in the pipeline</p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {availableCandidates.slice(0, 50).map(candidate => (
                          <div 
                            key={candidate.id}
                            className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                              selectedCandidates.includes(candidate.id) ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                            }`}
                            onClick={() => toggleCandidateSelection(candidate.id)}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`w-5 h-5 rounded border flex items-center justify-center mt-0.5 ${
                                selectedCandidates.includes(candidate.id) 
                                  ? 'bg-primary border-primary text-primary-foreground' 
                                  : 'border-muted-foreground/30'
                              }`}>
                                {selectedCandidates.includes(candidate.id) && (
                                  <CheckCircle2 className="h-3 w-3" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{candidate.name}</span>
                                  {candidate.linkedin_url && (
                                    <Linkedin className="h-3 w-3 text-blue-600" />
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  {candidate.email && (
                                    <span className="flex items-center gap-1">
                                      <Mail className="h-3 w-3" />
                                      {candidate.email}
                                    </span>
                                  )}
                                  {candidate.location && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {candidate.location}
                                    </span>
                                  )}
                                  {candidate.experience_years && (
                                    <span>{candidate.experience_years}+ yrs</span>
                                  )}
                                </div>
                                {candidate.skills && candidate.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {candidate.skills.slice(0, 5).map((skill, i) => (
                                      <Badge key={i} variant="secondary" className="text-xs py-0">
                                        {skill}
                                      </Badge>
                                    ))}
                                    {candidate.skills.length > 5 && (
                                      <Badge variant="secondary" className="text-xs py-0">
                                        +{candidate.skills.length - 5}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                                
                                {/* Why Good Fit Comment */}
                                {selectedCandidates.includes(candidate.id) && (
                                  <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                                    <label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5">
                                      <Sparkles className="h-3 w-3" />
                                      Why is this candidate a good fit?
                                    </label>
                                    <Textarea
                                      placeholder="Add a brief comment explaining why this candidate is a good match for this role..."
                                      className="text-xs min-h-[60px]"
                                      value={whyGoodFit[candidate.id] || ''}
                                      onChange={(e) => setWhyGoodFit(prev => ({ ...prev, [candidate.id]: e.target.value }))}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <Button 
                    onClick={addCandidates} 
                    disabled={selectedCandidates.length === 0 || addingCandidate}
                    className="w-full"
                  >
                    {addingCandidate 
                      ? 'Adding...' 
                      : `Add ${selectedCandidates.length} Candidate${selectedCandidates.length !== 1 ? 's' : ''} to Pipeline`
                    }
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Stats Bar */}
        {pipeline.length > 0 && (
          <div className="flex gap-4 mt-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              <span className="text-sm text-muted-foreground">Active: <span className="font-medium text-foreground">{stats.active}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span className="text-sm text-muted-foreground">Hired: <span className="font-medium text-foreground">{stats.hired}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <span className="text-sm text-muted-foreground">Rejected: <span className="font-medium text-foreground">{stats.rejected}</span></span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {pipeline.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed rounded-lg">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg mb-2">No candidates in pipeline</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {hasAgreement 
                ? 'Start by adding candidates from your database to track their progress'
                : 'Please accept the Recruitment Services Agreement before adding candidates'
              }
            </p>
            <Button onClick={() => setAddDialogOpen(true)} disabled={!hasAgreement}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Candidate
            </Button>
          </div>
        ) : viewMode === 'kanban' ? (
          /* Kanban View */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {pipelineByStage.map(stage => {
              const StageIcon = stage.icon
              return (
                <div key={stage.value} className="flex-shrink-0 w-72">
                  <div className={`rounded-t-lg px-3 py-2 border ${stage.color}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StageIcon className="h-4 w-4" />
                        <span className="font-medium text-sm">{stage.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {stage.candidates.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="border border-t-0 rounded-b-lg bg-muted/30 min-h-[200px] p-2 space-y-2">
                    {stage.candidates.map(item => (
                      <div 
                        key={item.id}
                        className="bg-background border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <Link 
                            href={`/candidates/${item.candidate_id}`}
                            className="font-medium text-sm hover:underline truncate"
                          >
                            {item.candidate?.name || 'Unknown'}
                          </Link>
                          {item.candidate?.linkedin_url && (
                            <a 
                              href={item.candidate.linkedin_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-shrink-0"
                            >
                              <Linkedin className="h-4 w-4 text-blue-600 hover:text-blue-800" />
                            </a>
                          )}
                        </div>
                        
                        {item.candidate?.location && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {item.candidate.location}
                          </p>
                        )}

                        {/* Why Good Fit indicator */}
                        {(item as typeof item & { why_good_fit?: string }).why_good_fit && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-100 rounded text-xs">
                            <div className="flex items-center gap-1 text-amber-700 font-medium mb-1">
                              <Sparkles className="h-3 w-3" />
                              Why good fit
                            </div>
                            <p className="text-amber-900 line-clamp-2">
                              {(item as typeof item & { why_good_fit?: string }).why_good_fit}
                            </p>
                          </div>
                        )}

                        {/* Time in pipeline indicator */}
                        {(() => {
                          const daysInPipeline = Math.floor((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24))
                          const isStale = daysInPipeline > 14
                          const isWarning = daysInPipeline > 7 && daysInPipeline <= 14
                          return (
                            <div className={`flex items-center gap-1 text-xs mt-1 ${isStale ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              <Clock className="h-3 w-3" />
                              {daysInPipeline === 0 ? 'Today' : daysInPipeline === 1 ? '1 day' : `${daysInPipeline} days`}
                              {isStale && <span className="ml-1 font-medium">- Needs action</span>}
                            </div>
                          )
                        })()}

                        <div className="flex items-center justify-between mt-2">
                          <Select 
                            value={item.stage} 
                            onValueChange={(v) => updateStage(item.id, v)}
                          >
                            <SelectTrigger className="w-24 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map(s => (
                                <SelectItem key={s.value} value={s.value} className="text-xs">
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => toggleExpand(item.id)}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-red-600"
                              onClick={() => removeCandidate(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Notes Panel */}
                        {expandedItems.has(item.id) && (
                          <div className="mt-3 pt-3 border-t space-y-2">
                            {/* Quick Notes */}
                            <div className="flex flex-wrap gap-1">
                              {QUICK_NOTES.slice(0, 4).map((note, i) => (
                                <Button
                                  key={i}
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-xs px-2"
                                  onClick={() => addNote(item.id, note)}
                                >
                                  {note}
                                </Button>
                              ))}
                            </div>
                            
                            {/* Recent Notes */}
                            {(notes[item.id] || []).slice(0, 3).map(note => (
                              <div key={note.id} className="bg-muted/50 rounded p-2 text-xs">
                                <p>{note.content}</p>
                                <p className="text-muted-foreground mt-1">
                                  {formatDistanceToNow(new Date(note.created_at))} ago
                                </p>
                              </div>
                            ))}

                            {/* Add Note */}
                            <div className="flex gap-1">
                              <Input
                                placeholder="Add note..."
                                value={newNote[item.id] || ''}
                                onChange={(e) => setNewNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                                className="h-7 text-xs"
                                onKeyDown={(e) => e.key === 'Enter' && addNote(item.id)}
                              />
                              <Button 
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => addNote(item.id)}
                                disabled={!newNote[item.id]?.trim()}
                              >
                                <Send className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}

                        </div>
                    ))}
                    {stage.candidates.length === 0 && (
                      <div className="text-center py-8 text-xs text-muted-foreground">
                        No candidates
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* List View */
          <div className="space-y-2">
            {pipeline.map(item => {
              const stageInfo = getStageInfo(item.stage)
              return (
                <div 
                  key={item.id}
                  className="border rounded-lg p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Link 
                        href={`/candidates/${item.candidate_id}`}
                        className="font-medium hover:underline"
                      >
                        {item.candidate?.name || 'Unknown'}
                      </Link>
                      <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                      {item.candidate?.linkedin_url && (
                        <a 
                          href={item.candidate.linkedin_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <Linkedin className="h-4 w-4 text-blue-600" />
                        </a>
                      )}
                      {/* Time indicator */}
                      {(() => {
                        const daysInPipeline = Math.floor((Date.now() - new Date(item.created_at).getTime()) / (1000 * 60 * 60 * 24))
                        const isStale = daysInPipeline > 14
                        const isWarning = daysInPipeline > 7 && daysInPipeline <= 14
                        return (
                          <span className={`text-xs flex items-center gap-1 ${isStale ? 'text-red-600 font-medium' : isWarning ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            <Clock className="h-3 w-3" />
                            {daysInPipeline}d
                            {isStale && ' - Action needed'}
                          </span>
                        )
                      })()}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={item.stage} 
                        onValueChange={(v) => updateStage(item.id, v)}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              {s.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => toggleExpand(item.id)}
                      >
                        {expandedItems.has(item.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-600"
                        onClick={() => removeCandidate(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Why Good Fit in List View */}
                  {(item as typeof item & { why_good_fit?: string }).why_good_fit && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg text-sm">
                      <div className="flex items-center gap-1 text-amber-700 font-medium mb-1">
                        <Sparkles className="h-3.5 w-3.5" />
                        Why good fit
                      </div>
                      <p className="text-amber-900">
                        {(item as typeof item & { why_good_fit?: string }).why_good_fit}
                      </p>
                    </div>
                  )}

                  {expandedItems.has(item.id) && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      {/* Quick Notes */}
                      <div className="flex flex-wrap gap-2">
                        {QUICK_NOTES.map((note, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => addNote(item.id, note)}
                          >
                            <Sparkles className="h-3 w-3 mr-1" />
                            {note}
                          </Button>
                        ))}
                      </div>

                      {/* Notes List */}
                      <div className="space-y-2">
                        {(notes[item.id] || []).map(note => (
                          <div key={note.id} className="bg-muted/50 rounded-lg p-3">
                            <p className="text-sm">{note.content}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {note.user?.full_name || note.user?.email || 'Unknown'} · {formatDistanceToNow(new Date(note.created_at))} ago
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Add Note */}
                      <div className="flex gap-2">
                        <Textarea
                          placeholder="Add a detailed note about this candidate..."
                          value={newNote[item.id] || ''}
                          onChange={(e) => setNewNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                          className="min-h-[60px] text-sm"
                        />
                        <Button 
                          size="icon"
                          onClick={() => addNote(item.id)}
                          disabled={!newNote[item.id]?.trim()}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
