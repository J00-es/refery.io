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
  Clock, User, CheckCircle, Phone, MessageSquare, FileText, Plus,
  Users, TrendingUp, BarChart3, Edit, Trash2
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
  ProspectRecruiter, ProspectRecruiterNote, ProspectStageHistory, UserAdmin,
  PROSPECT_OUTREACH_STATUSES, PROSPECT_ASSESSMENTS, RECRUITER_TYPES
} from '@/lib/types'
import { RecruiterAgreementSection } from '@/components/recruiter-agreement-section'
import { formatDistanceToNow, format } from 'date-fns'

interface CandidateStats {
  totalCandidates: number
  inPipeline: number
  byStage: Record<string, number>
  stageDetails?: Record<string, { count: number; dates: string[] }>
  hiredCount?: number
  interviewCount?: number
  offerCount?: number
  screeningCount?: number
}

interface RecentActivity {
  type: string
  stage?: string
  candidateName?: string
  jobTitle?: string
  date: string
}

interface RecruiterDetailViewProps {
  recruiter: ProspectRecruiter & { matched_user?: UserAdmin | null }
  notes: ProspectRecruiterNote[]
  stageHistory: ProspectStageHistory[]
  candidateStats: CandidateStats | null
  recentActivities?: RecentActivity[]
}

export function RecruiterDetailView({ recruiter, notes: initialNotes, stageHistory, candidateStats, recentActivities }: RecruiterDetailViewProps) {
  const router = useRouter()
  const supabase = createClient()
  const [notes, setNotes] = useState(initialNotes)
  const [newNote, setNewNote] = useState('')
  const [noteType, setNoteType] = useState<'call_notes' | 'feedback' | 'general'>('general')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [currentStatus, setCurrentStatus] = useState(recruiter.outreach_status)
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    const { error } = await supabase
      .from('prospect_recruiters')
      .delete()
      .eq('id', recruiter.id)

    if (!error) {
      router.push('/recruiters')
    } else {
      setIsDeleting(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setIsAddingNote(true)
    
    const { data: { user } } = await supabase.auth.getUser()
    
    const { data, error } = await supabase
      .from('prospect_recruiter_notes')
      .insert({
        recruiter_id: recruiter.id,
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
    
    // Update status
    const { error: updateError } = await supabase
      .from('prospect_recruiters')
      .update({ 
        outreach_status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', recruiter.id)

    if (!updateError) {
      // Log stage history
      await supabase
        .from('prospect_recruiter_stage_history')
        .insert({
          recruiter_id: recruiter.id,
          from_status: currentStatus,
          to_status: newStatus,
          changed_by: user?.id
        })
      
      setCurrentStatus(newStatus as typeof currentStatus)
      router.refresh()
    }
    setIsUpdatingStatus(false)
  }

  const noteTypeLabels = {
    call_notes: { label: 'Call Notes', icon: Phone, color: 'bg-blue-100 text-blue-700' },
    feedback: { label: 'Feedback', icon: MessageSquare, color: 'bg-purple-100 text-purple-700' },
    general: { label: 'General', icon: FileText, color: 'bg-gray-100 text-gray-700' }
  }

  const stageLabels: Record<string, string> = {
    sourced: 'Sourced',
    screening: 'Screening',
    interview: 'Interview',
    offer: 'Offer',
    hired: 'Hired',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn'
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/recruiters">
          <Button variant="ghost" size="icon" className="h-8 w-8 mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{recruiter.name}</h1>
            {recruiter.matched_user && (
              <Badge className="bg-green-100 text-green-700">
                <CheckCircle className="h-3 w-3 mr-1" />
                Onboarded User
              </Badge>
            )}
            {recruiter.recruiter_type && (
              <Badge className={RECRUITER_TYPES[recruiter.recruiter_type]?.color}>
                {RECRUITER_TYPES[recruiter.recruiter_type]?.label}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
            {recruiter.title && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3.5 w-3.5" />
                {recruiter.title}
              </span>
            )}
            {recruiter.company && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {recruiter.company}
              </span>
            )}
            {recruiter.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {recruiter.location}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {recruiter.email && (
              <a href={`mailto:${recruiter.email}`}>
                <Button variant="outline" size="sm">
                  <Mail className="h-4 w-4 mr-1.5" />
                  Email
                </Button>
              </a>
            )}
            {recruiter.linkedin_url && (
              <a href={recruiter.linkedin_url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  <Linkedin className="h-4 w-4 mr-1.5" />
                  LinkedIn
                </Button>
              </a>
            )}
            <Link href={`/recruiters/${recruiter.id}/edit`}>
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
                  <AlertDialogTitle>Delete Recruiter</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {recruiter.name}? This action cannot be undone and will remove all associated notes and stage history.
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
              {recruiter.overview ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{recruiter.overview}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No overview added yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Why Good Fit */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Why a Good Fit for Refery</CardTitle>
            </CardHeader>
            <CardContent>
              {recruiter.why_good_fit ? (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{recruiter.why_good_fit}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No information added yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Candidate Stats (if onboarded) */}
          {recruiter.matched_user && candidateStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Candidate Statistics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-3xl font-bold text-foreground">{candidateStats.totalCandidates}</div>
                    <div className="text-xs text-muted-foreground">Total Candidates</div>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="text-3xl font-bold text-foreground">{candidateStats.inPipeline}</div>
                    <div className="text-xs text-muted-foreground">In Pipeline</div>
                  </div>
                  <div className="text-center p-4 bg-emerald-50 rounded-lg">
                    <div className="text-3xl font-bold text-emerald-600">{candidateStats.hiredCount || 0}</div>
                    <div className="text-xs text-emerald-700">Hired</div>
                  </div>
                  <div className="text-center p-4 bg-amber-50 rounded-lg">
                    <div className="text-3xl font-bold text-amber-600">{candidateStats.offerCount || 0}</div>
                    <div className="text-xs text-amber-700">In Offer Stage</div>
                  </div>
                </div>

                {/* Pipeline Breakdown */}
                <div>
                  <h4 className="text-sm font-medium mb-3 text-foreground">Pipeline Breakdown</h4>
                  <div className="space-y-2">
                    {Object.entries(candidateStats.byStage).map(([stage, count]) => {
                      const total = candidateStats.inPipeline || 1
                      const percentage = Math.round((count / total) * 100)
                      const stageColors: Record<string, string> = {
                        sourced: 'bg-gray-500',
                        screening: 'bg-blue-500',
                        interview: 'bg-purple-500',
                        offer: 'bg-amber-500',
                        hired: 'bg-emerald-500',
                        rejected: 'bg-red-400',
                        withdrawn: 'bg-gray-400',
                      }
                      return (
                        <div key={stage} className="flex items-center gap-3">
                          <div className="w-24 text-xs text-muted-foreground">{stageLabels[stage] || stage}</div>
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${stageColors[stage] || 'bg-primary'} rounded-full transition-all`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <div className="w-8 text-xs font-medium text-right">{count}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Activities Timeline */}
          {recruiter.matched_user && recentActivities && recentActivities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
                  
                  <div className="space-y-4">
                    {recentActivities.map((activity, idx) => {
                      const stageColors: Record<string, string> = {
                        sourced: 'bg-gray-400',
                        screening: 'bg-blue-500',
                        interview: 'bg-purple-500',
                        offer: 'bg-amber-500',
                        hired: 'bg-emerald-500',
                        rejected: 'bg-red-400',
                        withdrawn: 'bg-gray-400',
                      }
                      const dotColor = activity.type === 'candidate_added' 
                        ? 'bg-primary' 
                        : stageColors[activity.stage || ''] || 'bg-muted-foreground'
                      
                      return (
                        <div key={idx} className="flex items-start gap-3 relative">
                          <div className={`h-2.5 w-2.5 rounded-full ${dotColor} mt-1.5 z-10 ring-2 ring-background`} />
                          <div className="flex-1 min-w-0">
                            {activity.type === 'candidate_added' ? (
                              <p className="text-sm text-foreground">
                                <span className="font-medium">{activity.candidateName}</span> added as candidate
                              </p>
                            ) : (
                              <p className="text-sm text-foreground">
                                <span className="font-medium">{activity.candidateName}</span> moved to{' '}
                                <span className="font-medium capitalize">{activity.stage}</span>
                                {activity.jobTitle && (
                                  <span className="text-muted-foreground"> for {activity.jobTitle}</span>
                                )}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(activity.date), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call_notes">Call Notes</SelectItem>
                      <SelectItem value="feedback">Feedback</SelectItem>
                      <SelectItem value="general">General</SelectItem>
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

              {recruiter.assessment && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assessment</p>
                  <Badge className={PROSPECT_ASSESSMENTS[recruiter.assessment]?.color}>
                    {PROSPECT_ASSESSMENTS[recruiter.assessment]?.label}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agreement Section */}
          <RecruiterAgreementSection
            recruiterId={recruiter.id}
            recruiterName={recruiter.name}
            recruiterEmail={recruiter.email || ''}
          />

          {/* Details Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Added</span>
                <span>{format(new Date(recruiter.created_at), 'MMM d, yyyy')}</span>
              </div>
              {recruiter.last_contacted_at && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Last Contacted</span>
                  <span>{formatDistanceToNow(new Date(recruiter.last_contacted_at), { addSuffix: true })}</span>
                </div>
              )}
              {recruiter.source && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span>{recruiter.source}</span>
                </div>
              )}
              {recruiter.email && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <span className="truncate ml-2">{recruiter.email}</span>
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
