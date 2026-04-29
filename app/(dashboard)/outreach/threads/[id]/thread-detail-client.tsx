'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  ArrowRight,
  Mail,
  Linkedin,
  Phone,
  MessageSquare,
  Copy,
  ExternalLink,
  CheckCircle2,
  Clock,
  Send,
  Plus,
  Calendar,
  FileText,
  Users,
  History,
  MoreHorizontal,
  ChevronDown,
  MapPin,
  Building2,
  AlertTriangle,
  Check,
  X
} from 'lucide-react'
import {
  PERSONA_CONFIG,
  STATUS_CONFIG,
  PATTERN_CONFIG,
  CHANNEL_CONFIG,
  type OutreachThread,
  type OutreachMessage,
  type OutreachRecipient,
  type OutreachFollowup,
  type OutreachNote,
  type ThreadStatus,
  type FollowupStatus
} from '@/lib/outreach-types'

interface ThreadDetailClientProps {
  thread: OutreachThread & {
    recipient: (OutreachRecipient & {
      company: { id: string; name: string; stage?: string; website?: string; linkedin_url?: string } | null
    }) | null
  }
  messages: OutreachMessage[]
  followups: OutreachFollowup[]
  notes: OutreachNote[]
  referencedCandidates: {
    id: string
    name: string
    roleLabel: string | null
    pipeline: { id: string; stage: string; job: { id: string; title: string } | null } | null
  }[]
  currentUserId: string
}

function getChannelIcon(channel: string, size = 'h-4 w-4') {
  switch (channel) {
    case 'email': return <Mail className={size} />
    case 'linkedin_connection':
    case 'linkedin_dm': return <Linkedin className={size} />
    case 'phone': return <Phone className={size} />
    default: return <MessageSquare className={size} />
  }
}

function RecipientAvatar({ name, persona }: { name: string; persona?: string | null }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const personaConfig = persona ? PERSONA_CONFIG[persona as keyof typeof PERSONA_CONFIG] : null
  const bgColor = personaConfig?.bgColor || 'bg-stone-100'
  const textColor = personaConfig?.color || 'text-stone-700'

  return (
    <div className={`flex items-center justify-center w-16 h-16 rounded-full ${bgColor} ${textColor} text-xl font-semibold`}>
      {initials}
    </div>
  )
}

export function ThreadDetailClient({
  thread,
  messages,
  followups,
  notes,
  referencedCandidates,
  currentUserId
}: ThreadDetailClientProps) {
  const router = useRouter()
  const recipient = thread.recipient
  const [recipientNotes, setRecipientNotes] = useState(recipient?.notes || '')
  const [newNote, setNewNote] = useState('')
  const [selectedStatus, setSelectedStatus] = useState(thread.status)
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set())

  const personaConfig = recipient?.persona ? PERSONA_CONFIG[recipient.persona] : null
  const statusConfig = STATUS_CONFIG[thread.status]
  const patternConfig = thread.outreach_pattern ? PATTERN_CONFIG[thread.outreach_pattern] : null

  const toggleMessageExpand = (id: string) => {
    const newSet = new Set(expandedMessages)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setExpandedMessages(newSet)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const handleStatusChange = async (newStatus: ThreadStatus) => {
    setSelectedStatus(newStatus)
    // TODO: API call to update status
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      {/* Back button */}
      <div className="mb-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to threads
        </Button>
      </div>

      {/* Three-column layout */}
      <div className="flex gap-6 h-full">
        {/* LEFT COLUMN - Recipient Sidebar */}
        <div className="w-[300px] shrink-0">
          <Card className="h-full overflow-auto">
            <CardContent className="pt-6">
              {/* Avatar and basic info */}
              <div className="flex flex-col items-center text-center mb-6">
                <RecipientAvatar name={recipient?.name || 'Unknown'} persona={recipient?.persona} />
                <h2 className="text-lg font-semibold mt-3">{recipient?.name || 'Unknown'}</h2>
                <p className="text-sm text-muted-foreground">
                  {recipient?.current_title || 'No title'}
                </p>
                {recipient?.company && (
                  <Link
                    href={`/companies/${recipient.company.id}`}
                    className="text-sm text-primary hover:underline mt-1"
                  >
                    {recipient.company.name}
                  </Link>
                )}
              </div>

              {/* Persona and seniority */}
              <div className="flex items-center justify-center gap-2 mb-4">
                {personaConfig && (
                  <span className={`text-xs px-2 py-1 rounded-full ${personaConfig.bgColor} ${personaConfig.color}`}>
                    {personaConfig.label}
                  </span>
                )}
                {recipient?.seniority && (
                  <span className="text-xs px-2 py-1 rounded-full bg-stone-100 text-stone-600">
                    {recipient.seniority.replace('_', ' ')}
                  </span>
                )}
              </div>

              <Separator className="my-4" />

              {/* Contact info */}
              <div className="space-y-3">
                {recipient?.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{recipient.location}</span>
                  </div>
                )}

                {recipient?.email && (
                  <div className="flex items-center gap-2 text-sm group">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate flex-1">{recipient.email}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => copyToClipboard(recipient.email!)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                {recipient?.linkedin_url && (
                  <div className="flex items-center gap-2 text-sm group">
                    <Linkedin className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={recipient.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate flex-1 text-primary hover:underline"
                    >
                      LinkedIn Profile
                    </a>
                    <ExternalLink className="h-3 w-3 text-muted-foreground" />
                  </div>
                )}
              </div>

              <Separator className="my-4" />

              {/* Inbound source */}
              {recipient?.inbound_source && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-1">Source</p>
                  <p className="text-sm">
                    {recipient.inbound_source}
                    {recipient.mutual_connection_name && (
                      <span className="text-muted-foreground"> via {recipient.mutual_connection_name}</span>
                    )}
                  </p>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Lifetime Touches</p>
                  <p className="text-lg font-mono font-semibold">{recipient?.lifetime_touches || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Replies</p>
                  <p className="text-lg font-mono font-semibold">{recipient?.lifetime_replies || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Reply Rate</p>
                  <p className="text-lg font-mono font-semibold">
                    {recipient?.lifetime_touches ? Math.round((recipient.lifetime_replies / recipient.lifetime_touches) * 100) : 0}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Contact</p>
                  <p className="text-sm">
                    {recipient?.last_contacted_at
                      ? formatDistanceToNow(new Date(recipient.last_contacted_at), { addSuffix: true })
                      : 'Never'}
                  </p>
                </div>
              </div>

              {/* Tags */}
              {recipient?.tags && recipient.tags.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1">
                    {recipient.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <Separator className="my-4" />

              {/* Notes */}
              <div>
                <p className="text-xs text-muted-foreground mb-2">Notes</p>
                <Textarea
                  value={recipientNotes}
                  onChange={(e) => setRecipientNotes(e.target.value)}
                  placeholder="Add notes about this recipient..."
                  className="text-sm min-h-[100px] resize-none"
                />
              </div>

              {/* DNC toggle */}
              {recipient?.do_not_contact && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Do Not Contact</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* CENTER COLUMN - Conversation Timeline */}
        <div className="flex-1 min-w-0 flex flex-col">
          <Card className="flex-1 flex flex-col overflow-hidden">
            {/* Thread header */}
            <CardHeader className="pb-3 border-b shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg font-semibold truncate">{thread.subject || 'No subject'}</h1>
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {/* Status dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-7">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusConfig.bgColor} ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                          <ChevronDown className="h-3 w-3 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                          <DropdownMenuItem
                            key={key}
                            onClick={() => handleStatusChange(key as ThreadStatus)}
                          >
                            <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color}`}>
                              {config.label}
                            </span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {patternConfig && (
                      <span className="text-xs text-muted-foreground">
                        {patternConfig.label}
                      </span>
                    )}

                    {/* Channels used */}
                    <div className="flex items-center gap-1">
                      {thread.channels_used?.map(ch => (
                        <span key={ch} className="text-muted-foreground">
                          {getChannelIcon(ch, 'h-3.5 w-3.5')}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Response
                  </Button>
                </div>
              </div>

              {/* Referenced candidates */}
              {referencedCandidates.length > 0 && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex flex-wrap gap-1">
                    {referencedCandidates.map(c => (
                      <Link
                        key={c.id}
                        href={`/candidates/${c.id}`}
                        className="text-xs px-2 py-1 bg-secondary rounded-full hover:bg-secondary/80 transition-colors"
                      >
                        {c.name}
                        {c.roleLabel && <span className="text-muted-foreground"> ({c.roleLabel})</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>

            {/* Messages timeline */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No messages in this thread yet.</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isInbound = message.direction === 'inbound'
                    const isExpanded = expandedMessages.has(message.id)
                    const bodyLines = message.body?.split('\n') || []
                    const shouldTruncate = bodyLines.length > 6 && !isExpanded

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isInbound ? 'justify-start' : 'justify-end'}`}
                      >
                        <div className={`max-w-[85%] ${isInbound ? 'mr-auto' : 'ml-auto'}`}>
                          <Card className={`${isInbound ? 'bg-card' : 'bg-secondary/50'}`}>
                            <CardContent className="pt-3 pb-3">
                              {/* Header */}
                              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                                {getChannelIcon(message.channel, 'h-3 w-3')}
                                <span>{CHANNEL_CONFIG[message.channel]?.label || message.channel}</span>
                                <span>·</span>
                                <span>
                                  {message.sent_at
                                    ? format(new Date(message.sent_at), 'MMM d, yyyy h:mm a')
                                    : 'No date'}
                                </span>
                              </div>

                              {/* Subject */}
                              {message.subject && (
                                <p className="text-sm font-medium mb-2">{message.subject}</p>
                              )}

                              {/* Body */}
                              <div className="text-sm whitespace-pre-wrap">
                                {shouldTruncate
                                  ? bodyLines.slice(0, 6).join('\n') + '...'
                                  : message.body}
                              </div>

                              {bodyLines.length > 6 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-6 text-xs"
                                  onClick={() => toggleMessageExpand(message.id)}
                                >
                                  {isExpanded ? 'Show less' : 'Show more'}
                                </Button>
                              )}

                              {/* Metadata */}
                              {!isInbound && (
                                <div className="flex items-center gap-3 mt-3 pt-2 border-t text-xs text-muted-foreground">
                                  {message.hook_used && (
                                    <span>{message.hook_used.replace('_', ' ')}</span>
                                  )}
                                  {message.personalization_level && (
                                    <span>{message.personalization_level}</span>
                                  )}
                                  {message.variant_label && (
                                    <span className="font-mono">{message.variant_label}</span>
                                  )}
                                  {message.cta_type && (
                                    <span>{message.cta_type.replace('_', ' ')}</span>
                                  )}
                                  {message.body_word_count && (
                                    <span>{message.body_word_count} words</span>
                                  )}
                                </div>
                              )}

                              {/* Engagement signals */}
                              {!isInbound && (
                                <div className="flex items-center gap-3 mt-2 text-xs">
                                  <span className="flex items-center gap-1 text-muted-foreground">
                                    <Check className="h-3 w-3" />
                                    sent
                                  </span>
                                  {message.opened_at && (
                                    <span className="flex items-center gap-1 text-emerald-600">
                                      <Check className="h-3 w-3" />
                                      opened
                                    </span>
                                  )}
                                  {message.replied_at && (
                                    <span className="flex items-center gap-1 text-emerald-600">
                                      <Check className="h-3 w-3" />
                                      replied
                                    </span>
                                  )}
                                  {message.bounced_at && (
                                    <span className="flex items-center gap-1 text-red-600">
                                      <X className="h-3 w-3" />
                                      bounced
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Inbound sentiment */}
                              {isInbound && message.sentiment && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge
                                    variant="secondary"
                                    className={`text-xs ${
                                      message.sentiment === 'positive' ? 'bg-emerald-100 text-emerald-700' :
                                      message.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                                      'bg-stone-100 text-stone-700'
                                    }`}
                                  >
                                    {message.sentiment}
                                  </Badge>
                                  {message.response_category && (
                                    <Badge variant="secondary" className="text-xs">
                                      {message.response_category.replace('_', ' ')}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            {/* Bottom action bar */}
            <div className="p-4 border-t shrink-0 bg-card">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Send className="h-4 w-4 mr-2" />
                  Add Response
                </Button>
                <Button variant="outline" size="sm">
                  <FileText className="h-4 w-4 mr-2" />
                  Add Note
                </Button>
                <Button variant="outline" size="sm">
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Followup
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN - Actions & History */}
        <div className="w-[320px] shrink-0">
          <Card className="h-full overflow-hidden flex flex-col">
            <Tabs defaultValue="followups" className="flex flex-col h-full">
              <TabsList className="mx-4 mt-4 grid grid-cols-4">
                <TabsTrigger value="followups" className="text-xs">Followups</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
                <TabsTrigger value="candidates" className="text-xs">Candidates</TabsTrigger>
                <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
              </TabsList>

              <TabsContent value="followups" className="flex-1 overflow-auto m-0 p-4">
                <div className="space-y-3">
                  {followups.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No followups scheduled</p>
                  ) : (
                    followups.map(f => (
                      <div key={f.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            f.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            f.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            'bg-stone-100 text-stone-600'
                          }`}>
                            {f.status}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(f.due_at), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-sm">{f.action_type.replace('_', ' ')}</p>
                        {f.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{f.notes}</p>
                        )}
                        {f.status === 'pending' && (
                          <div className="flex items-center gap-2 mt-2">
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Done
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              Snooze
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                  <Button variant="outline" size="sm" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Followup
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="notes" className="flex-1 overflow-auto m-0 p-4">
                <div className="space-y-3">
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No notes yet</p>
                  ) : (
                    notes.map(n => (
                      <div key={n.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <Badge variant="secondary" className="text-xs">
                            {n.note_type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{n.body}</p>
                      </div>
                    ))
                  )}
                  <div className="space-y-2">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Add a note..."
                      className="text-sm min-h-[80px]"
                    />
                    <Button size="sm" className="w-full" disabled={!newNote.trim()}>
                      Add Note
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="candidates" className="flex-1 overflow-auto m-0 p-4">
                <div className="space-y-3">
                  {referencedCandidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No candidates referenced</p>
                  ) : (
                    referencedCandidates.map(c => (
                      <Link
                        key={c.id}
                        href={`/candidates/${c.id}`}
                        className="block p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <p className="font-medium text-sm">{c.name}</p>
                        {c.roleLabel && (
                          <p className="text-xs text-muted-foreground">Role: {c.roleLabel}</p>
                        )}
                        {c.pipeline?.job && (
                          <div className="mt-2">
                            <Badge variant="secondary" className="text-xs">
                              {c.pipeline.stage} - {c.pipeline.job.title}
                            </Badge>
                          </div>
                        )}
                      </Link>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="history" className="flex-1 overflow-auto m-0 p-4">
                <div className="space-y-3">
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
                    </div>
                    <p className="text-sm mt-1">Thread created</p>
                  </div>
                  {thread.first_touch_at && (
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Send className="h-3 w-3" />
                        {formatDistanceToNow(new Date(thread.first_touch_at), { addSuffix: true })}
                      </div>
                      <p className="text-sm mt-1">First message sent</p>
                    </div>
                  )}
                  {thread.first_reply_at && (
                    <div className="p-3 border rounded-lg">
                      <div className="flex items-center gap-2 text-xs text-emerald-600">
                        <MessageSquare className="h-3 w-3" />
                        {formatDistanceToNow(new Date(thread.first_reply_at), { addSuffix: true })}
                      </div>
                      <p className="text-sm mt-1">First reply received</p>
                      {thread.time_to_first_reply_hours && (
                        <p className="text-xs text-muted-foreground">
                          Response time: {Math.round(thread.time_to_first_reply_hours)}h
                        </p>
                      )}
                    </div>
                  )}
                  {thread.meeting_booked_at && (
                    <div className="p-3 border rounded-lg bg-emerald-50">
                      <div className="flex items-center gap-2 text-xs text-emerald-600">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(thread.meeting_booked_at), { addSuffix: true })}
                      </div>
                      <p className="text-sm mt-1 text-emerald-700">Meeting booked</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </div>
    </div>
  )
}
