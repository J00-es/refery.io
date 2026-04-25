'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  ArrowLeft, Linkedin, Mail, MapPin, Building2, Briefcase, Calendar, 
  Clock, Phone, MessageSquare, FileText, Plus, X, ExternalLink, Edit, Trash2
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { 
  ProspectTalent, ProspectTalentNote, ProspectStageHistory, Job,
  PROSPECT_OUTREACH_STATUSES, PROSPECT_ASSESSMENTS, TALENT_TYPES
} from '@/lib/types'
import { formatDistanceToNow, format } from 'date-fns'

interface TalentDetailViewProps {
  talent: ProspectTalent
  notes: ProspectTalentNote[]
  stageHistory: ProspectStageHistory[]
  potentialJobs: (Job & { added_at: string; link_id: string })[]
  allJobs: { id: string; title: string; company_name: string | null; location: string | null }[]
}

export function TalentDetailView({ talent, notes: initialNotes, stageHistory, potentialJobs: initialJobs, allJobs }: TalentDetailViewProps) {
  const router = useRouter()
  const supabase = createClient()
  const [notes, setNotes] = useState(initialNotes)
  const [potentialJobs, setPotentialJobs] = useState(initialJobs)
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState<'call_notes' | 'feedback' | 'general' | 'email_messages'>('general')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(talent.outreach_status)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [selectedJobId, setSelectedJobId] = useState('')
  const [isAddingJob, setIsAddingJob] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    const { error } = await supabase
      .from('prospect_talents')
      .delete()
      .eq('id', talent.id)

    if (!error) {
      router.push('/talents')
    } else {
      setIsDeleting(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setIsAddingNote(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    
    const { data, error } = await supabase
      .from('prospect_talent_notes')
      .insert({
        talent_id: talent.id,
        note_type: noteType,
        content: newNote.trim(),
        created_by: user?.id
      })
      .select()
      .single()

    if (!error && data) {
      setNotes([data, ...notes])
      setNewNote('')
    }
    setIsAddingNote(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true)
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error: updateError } = await supabase
      .from('prospect_talents')
      .update({ 
        outreach_status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', talent.id)

    if (!updateError) {
      await supabase
        .from('prospect_talent_stage_history')
        .insert({
          talent_id: talent.id,
          from_status: currentStatus,
          to_status: newStatus,
          changed_by: user?.id
        })
      
      setCurrentStatus(newStatus as typeof currentStatus)
      router.refresh()
    }
    setIsUpdatingStatus(false)
  }

  const handleAddPotentialJob = async () => {
    if (!selectedJobId) return
    setIsAddingJob(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    
    const { error } = await supabase
      .from('prospect_talent_potential_jobs')
      .insert({
        talent_id: talent.id,
        job_id: selectedJobId,
        added_by: user?.id
      })

    if (!error) {
      router.refresh()
      setSelectedJobId('')
    }
    setIsAddingJob(false)
  }

  const handleRemovePotentialJob = async (linkId: string) => {
    const { error } = await supabase
      .from('prospect_talent_potential_jobs')
      .delete()
      .eq('id', linkId)

    if (!error) {
      setPotentialJobs(potentialJobs.filter(j => j.link_id !== linkId))
    }
  }

  const noteTypeLabels = {
    call_notes: { label: 'Call Notes', icon: Phone, color: 'bg-blue-100 text-blue-700' },
    feedback: { label: 'Feedback', icon: MessageSquare, color: 'bg-purple-100 text-purple-700' },
    general: { label: 'General', icon: FileText, color: 'bg-gray-100 text-gray-700' },
    email_messages: { label: 'Email/Messages', icon: Mail, color: 'bg-green-100 text-green-700' }
  }

  const availableJobs = allJobs.filter(job => !potentialJobs.some(pj => pj.id === job.id))

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/talents">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{talent.name}</h1>
            {talent.talent_type && (
              <Badge className={TALENT_TYPES[talent.talent_type]?.color}>
                {TALENT_TYPES[talent.talent_type]?.label}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            {talent.current_title && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {talent.current_title}
              </span>
            )}
            {talent.current_company && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {talent.current_company}
              </span>
            )}
            {talent.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {talent.location}
              </span>
            )}
          </div>
          {talent.skills && talent.skills.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {talent.skills.slice(0, 5).map((skill, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
              {talent.skills.length > 5 && (
                <Badge variant="secondary" className="text-xs">
                  +{talent.skills.length - 5} more
                </Badge>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {talent.email && (
              <a href={`mailto:${talent.email}`}>
                <Button variant="outline" size="sm">
                  <Mail className="h-4 w-4 mr-1.5" />
                  Email
                </Button>
              </a>
            )}
            {talent.linkedin_url && (
              <a href={talent.linkedin_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <Linkedin className="h-4 w-4 mr-1.5" />
                  LinkedIn
                </Button>
              </a>
            )}
            <Link href={`/talents/${talent.id}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4 mr-1.5" />
                Edit
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Talent</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {talent.name}? This action cannot be undone and will remove all associated notes and stage history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {talent.overview ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{talent.overview}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No overview added yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Potential Jobs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Briefcase className="h-4 w-4" />
                Potential Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Job */}
              <div className="flex gap-2">
                <Select value={selectedJobId} onValueChange={setSelectedJobId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a job to add..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableJobs.map(job => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title} {job.company_name && `@ ${job.company_name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleAddPotentialJob}
                  disabled={!selectedJobId || isAddingJob}
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Jobs List */}
              {potentialJobs.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">No potential jobs added yet.</p>
              ) : (
                <div className="space-y-2">
                  {potentialJobs.map((job) => (
                    <div key={job.link_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="min-w-0 flex-1">
                        <Link href={`/jobs/${job.id}`} className="font-medium hover:underline flex items-center gap-1">
                          {job.title}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {job.company_name && `${job.company_name} • `}
                          {job.location || 'Remote'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Added {formatDistanceToNow(new Date(job.added_at), { addSuffix: true })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemovePotentialJob(job.link_id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add Note Form */}
              <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                <div className="flex gap-2">
                  <Select value={noteType} onValueChange={(v) => setNoteType(v as typeof noteType)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call_notes">Call Notes</SelectItem>
                      <SelectItem value="feedback">Feedback</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="email_messages">Email/Messages</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  placeholder="Add a note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                />
                <Button 
                  onClick={handleAddNote} 
                  disabled={!newNote.trim() || isAddingNote}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Note
                </Button>
              </div>

              {/* Notes List */}
              <div className="space-y-3">
                {notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-4">No notes yet.</p>
                ) : (
                  notes.map((note) => {
                    const typeConfig = noteTypeLabels[note.note_type]
                    const Icon = typeConfig.icon
                    return (
                      <div key={note.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="secondary" className={typeConfig.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {typeConfig.label}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(note.created_at), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select 
                value={currentStatus} 
                onValueChange={handleStatusChange}
                disabled={isUpdatingStatus}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROSPECT_OUTREACH_STATUSES).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {talent.assessment && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assessment</p>
                  <Badge className={PROSPECT_ASSESSMENTS[talent.assessment]?.color}>
                    {PROSPECT_ASSESSMENTS[talent.assessment]?.label}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Added</span>
                <span>{format(new Date(talent.created_at), 'MMM d, yyyy')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{formatDistanceToNow(new Date(talent.updated_at), { addSuffix: true })}</span>
              </div>
              {talent.last_contacted_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last Contacted</span>
                  <span>{formatDistanceToNow(new Date(talent.last_contacted_at), { addSuffix: true })}</span>
                </div>
              )}
              {talent.source && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span>{talent.source}</span>
                </div>
              )}
              {talent.email && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="truncate ml-2">{talent.email}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stage History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Stage History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stageHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No stage changes yet.</p>
              ) : (
                <div className="space-y-3">
                  {stageHistory.map((history) => (
                    <div key={history.id} className="flex items-start gap-2 text-sm">
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <p>
                          {history.from_status ? (
                            <>
                              <span className="text-muted-foreground">{PROSPECT_OUTREACH_STATUSES[history.from_status as keyof typeof PROSPECT_OUTREACH_STATUSES]?.label || history.from_status}</span>
                              <span className="mx-1">→</span>
                            </>
                          ) : null}
                          <span className="font-medium">{PROSPECT_OUTREACH_STATUSES[history.to_status as keyof typeof PROSPECT_OUTREACH_STATUSES]?.label || history.to_status}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(history.changed_at), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
