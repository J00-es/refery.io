'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDistanceToNow } from 'date-fns'
import { 
  Activity, Eye, Briefcase, Send, UserCheck, FileText, Mail, 
  Calendar, Gift, CheckCircle, XCircle, LogOut, Upload, Phone, Plus
} from 'lucide-react'

interface ActivityLog {
  id: string
  candidate_id: string
  activity_type: string
  description: string
  metadata: Record<string, unknown>
  performed_by: string | null
  created_at: string
}

interface CandidateActivityLogProps {
  candidateId: string
}

const ACTIVITY_TYPES = {
  profile_viewed: { label: 'Profile Viewed', icon: Eye, color: 'bg-gray-100 text-gray-700' },
  job_matched: { label: 'Job Matched', icon: Briefcase, color: 'bg-blue-100 text-blue-700' },
  opportunity_sent: { label: 'Opportunity Sent', icon: Send, color: 'bg-indigo-100 text-indigo-700' },
  status_changed: { label: 'Status Changed', icon: UserCheck, color: 'bg-purple-100 text-purple-700' },
  note_added: { label: 'Note Added', icon: FileText, color: 'bg-slate-100 text-slate-700' },
  stage_changed: { label: 'Stage Changed', icon: Activity, color: 'bg-cyan-100 text-cyan-700' },
  email_sent: { label: 'Email Sent', icon: Mail, color: 'bg-sky-100 text-sky-700' },
  interview_scheduled: { label: 'Interview Scheduled', icon: Calendar, color: 'bg-amber-100 text-amber-700' },
  offer_made: { label: 'Offer Made', icon: Gift, color: 'bg-orange-100 text-orange-700' },
  hired: { label: 'Hired', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-700' },
  withdrawn: { label: 'Withdrawn', icon: LogOut, color: 'bg-gray-100 text-gray-500' },
  document_uploaded: { label: 'Document Uploaded', icon: Upload, color: 'bg-teal-100 text-teal-700' },
  contact_made: { label: 'Contact Made', icon: Phone, color: 'bg-green-100 text-green-700' },
}

export function CandidateActivityLog({ candidateId }: CandidateActivityLogProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newActivityType, setNewActivityType] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetchActivities()
  }, [candidateId])

  async function fetchActivities() {
    setLoading(true)
    const { data } = await supabase
      .from('candidate_activity_log')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false })
      .limit(50)

    setActivities(data || [])
    setLoading(false)
  }

  async function addActivity() {
    if (!newActivityType || !newDescription.trim()) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('candidate_activity_log').insert({
      candidate_id: candidateId,
      activity_type: newActivityType,
      description: newDescription.trim(),
      performed_by: user?.id,
    })

    setNewActivityType('')
    setNewDescription('')
    setShowAddForm(false)
    setSubmitting(false)
    fetchActivities()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Activity Log
        </CardTitle>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Log Activity
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Activity Form */}
        {showAddForm && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-3 border">
            <Select value={newActivityType} onValueChange={setNewActivityType}>
              <SelectTrigger>
                <SelectValue placeholder="Select activity type..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTIVITY_TYPES).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Describe the activity..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="min-h-[80px]"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={addActivity}
                disabled={!newActivityType || !newDescription.trim() || submitting}
              >
                {submitting ? 'Adding...' : 'Add Activity'}
              </Button>
            </div>
          </div>
        )}

        {/* Activity List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading activities...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No activity logged yet</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-2 bottom-2 w-px bg-border" />
            
            <div className="space-y-4">
              {activities.map((activity) => {
                const typeConfig = ACTIVITY_TYPES[activity.activity_type as keyof typeof ACTIVITY_TYPES] || {
                  label: activity.activity_type,
                  icon: Activity,
                  color: 'bg-gray-100 text-gray-700'
                }
                const Icon = typeConfig.icon

                return (
                  <div key={activity.id} className="flex items-start gap-3 relative pl-2">
                    <div className={`h-8 w-8 rounded-full ${typeConfig.color} flex items-center justify-center z-10 shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={`text-xs ${typeConfig.color}`}>
                          {typeConfig.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm mt-1 text-foreground">{activity.description}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
