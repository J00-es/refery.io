'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  ArrowLeft,
  Send,
  Mail,
  Linkedin,
  Phone,
  Calendar,
  Plus,
  X,
  Check,
  ChevronsUpDown,
  UserPlus,
  Clock,
  Users,
  AlertTriangle
} from 'lucide-react'
import {
  PERSONA_CONFIG,
  PATTERN_CONFIG,
  CHANNEL_CONFIG,
  type OutreachRecipient,
  type OutreachThread,
  type OutreachChannel,
  type OutreachPattern,
  type HookType,
  type PersonalizationLevel,
  type CTAType
} from '@/lib/outreach-types'

interface ComposeClientProps {
  preselectedRecipient: (OutreachRecipient & { company: { id: string; name: string } | null }) | null
  existingThread: (OutreachThread & { recipient: OutreachRecipient & { company: { id: string; name: string } | null } }) | null
  recentRecipients: (OutreachRecipient & { company: { id: string; name: string } | null })[]
  candidates: { id: string; name: string; experience_years?: number; location?: string }[]
  currentUserId: string
}

const CHANNELS: OutreachChannel[] = ['email', 'linkedin_dm', 'linkedin_connection', 'phone', 'text', 'whatsapp', 'other']
const PATTERNS: OutreachPattern[] = ['a_candidate_led', 'b_bench_drop', 'c_partnership', 'd_intro_request', 'e_job_board_follow', 'f_event_followup', 'g_content_reply', 'h_warm_intro', 'other']
const HOOKS: HookType[] = ['funding_round', 'recent_hire', 'recent_post', 'mutual_connection', 'company_news', 'job_posting', 'event_mention', 'portfolio_connection', 'other']
const PERSONALIZATION_LEVELS: PersonalizationLevel[] = ['heavy', 'medium', 'light', 'boilerplate']
const CTA_TYPES: CTAType[] = ['ask_for_meeting', 'ask_for_referral', 'ask_for_feedback', 'share_candidate', 'share_info', 'soft_close', 'none']

export function ComposeClient({
  preselectedRecipient,
  existingThread,
  recentRecipients,
  candidates,
  currentUserId
}: ComposeClientProps) {
  const router = useRouter()

  // Form state
  const [recipient, setRecipient] = useState<(OutreachRecipient & { company: { id: string; name: string } | null }) | null>(preselectedRecipient)
  const [recipientOpen, setRecipientOpen] = useState(false)
  const [recipientSearch, setRecipientSearch] = useState('')

  const [channel, setChannel] = useState<OutreachChannel>('email')
  const [pattern, setPattern] = useState<OutreachPattern>('a_candidate_led')
  const [subject, setSubject] = useState(existingThread?.subject || '')
  const [body, setBody] = useState('')

  // Message metadata
  const [hookUsed, setHookUsed] = useState<HookType | ''>('')
  const [hookDetail, setHookDetail] = useState('')
  const [personalization, setPersonalization] = useState<PersonalizationLevel>('medium')
  const [ctaType, setCtaType] = useState<CTAType>('ask_for_meeting')
  const [variantLabel, setVariantLabel] = useState('')
  const [includeCalendar, setIncludeCalendar] = useState(false)

  // Candidates referenced
  const [selectedCandidates, setSelectedCandidates] = useState<{ id: string; name: string; roleLabel: string }[]>([])
  const [candidateOpen, setCandidateOpen] = useState(false)
  const [candidateSearch, setCandidateSearch] = useState('')
  const [tempRoleLabel, setTempRoleLabel] = useState('')

  // Followup scheduling
  const [scheduleFollowup, setScheduleFollowup] = useState(false)
  const [followupDays, setFollowupDays] = useState(3)

  const [isSending, setIsSending] = useState(false)

  const filteredRecipients = recentRecipients.filter(r =>
    r.name.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    r.email?.toLowerCase().includes(recipientSearch.toLowerCase()) ||
    r.company?.name?.toLowerCase().includes(recipientSearch.toLowerCase())
  )

  const filteredCandidates = candidates.filter(c =>
    c.name.toLowerCase().includes(candidateSearch.toLowerCase())
  )

  const handleAddCandidate = (candidate: { id: string; name: string }) => {
    setSelectedCandidates([...selectedCandidates, { ...candidate, roleLabel: tempRoleLabel || candidate.name }])
    setTempRoleLabel('')
    setCandidateOpen(false)
    setCandidateSearch('')
  }

  const handleRemoveCandidate = (id: string) => {
    setSelectedCandidates(selectedCandidates.filter(c => c.id !== id))
  }

  const handleSend = async () => {
    if (!recipient || !body.trim()) return

    setIsSending(true)

    try {
      // API call would go here to:
      // 1. Create thread if new (or use existing)
      // 2. Create message
      // 3. Create message_candidates links
      // 4. Create followup if scheduled
      // 5. Update recipient stats

      // For now, simulate success
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Navigate to thread
      if (existingThread) {
        router.push(`/outreach/threads/${existingThread.id}`)
      } else {
        router.push('/outreach/threads')
      }
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-2xl font-semibold mt-2">
          {existingThread ? 'Add Follow-up' : 'Compose Message'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {existingThread 
            ? `Following up on: ${existingThread.subject || 'No subject'}`
            : 'Start a new outreach thread'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recipient Selection */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recipient</CardTitle>
            </CardHeader>
            <CardContent>
              {recipient ? (
                <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${PERSONA_CONFIG[recipient.persona || 'other']?.bgColor || 'bg-stone-100'} ${PERSONA_CONFIG[recipient.persona || 'other']?.color || 'text-stone-600'} text-sm font-semibold`}>
                      {recipient.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{recipient.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {recipient.current_title || 'No title'} at {recipient.company?.name || 'No company'}
                      </p>
                    </div>
                  </div>
                  {!existingThread && (
                    <Button variant="ghost" size="sm" onClick={() => setRecipient(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <Popover open={recipientOpen} onOpenChange={setRecipientOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      Select recipient...
                      <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput 
                        placeholder="Search recipients..." 
                        value={recipientSearch}
                        onValueChange={setRecipientSearch}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="py-6 text-center">
                            <p className="text-sm text-muted-foreground mb-2">No recipient found.</p>
                            <Button size="sm" variant="outline">
                              <UserPlus className="h-4 w-4 mr-2" />
                              Add new recipient
                            </Button>
                          </div>
                        </CommandEmpty>
                        <CommandGroup heading="Recent">
                          {filteredRecipients.map((r) => (
                            <CommandItem
                              key={r.id}
                              onSelect={() => {
                                setRecipient(r)
                                setRecipientOpen(false)
                              }}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${PERSONA_CONFIG[r.persona || 'other']?.bgColor || 'bg-stone-100'} ${PERSONA_CONFIG[r.persona || 'other']?.color || 'text-stone-600'} text-xs font-semibold`}>
                                  {r.name[0].toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm truncate">{r.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{r.company?.name || 'No company'}</p>
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}

              {recipient?.do_not_contact && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">This recipient is marked as Do Not Contact</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Message Content */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Message</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Channel and Pattern */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select value={channel} onValueChange={(v) => setChannel(v as OutreachChannel)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNELS.map(ch => (
                        <SelectItem key={ch} value={ch}>
                          {CHANNEL_CONFIG[ch].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Pattern</Label>
                  <Select value={pattern} onValueChange={(v) => setPattern(v as OutreachPattern)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PATTERNS.map(p => (
                        <SelectItem key={p} value={p}>
                          {PATTERN_CONFIG[p].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Subject */}
              {channel === 'email' && (
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Your email subject line..."
                  />
                </div>
              )}

              {/* Body */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Message</Label>
                  <span className="text-xs text-muted-foreground font-mono">{wordCount} words</span>
                </div>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your message..."
                  className="min-h-[200px]"
                />
              </div>
            </CardContent>
          </Card>

          {/* Candidates Referenced */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Candidates Mentioned
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedCandidates.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedCandidates.map(c => (
                    <Badge key={c.id} variant="secondary" className="text-sm py-1 pl-3 pr-1">
                      {c.name}
                      {c.roleLabel !== c.name && (
                        <span className="text-muted-foreground ml-1">({c.roleLabel})</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-1 hover:bg-transparent"
                        onClick={() => handleRemoveCandidate(c.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}

              <Popover open={candidateOpen} onOpenChange={setCandidateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Candidate
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[350px] p-0" align="start">
                  <Command>
                    <CommandInput 
                      placeholder="Search candidates..." 
                      value={candidateSearch}
                      onValueChange={setCandidateSearch}
                    />
                    <CommandList>
                      <CommandEmpty>No candidates found.</CommandEmpty>
                      <CommandGroup>
                        {filteredCandidates.slice(0, 10).map((c) => (
                          <CommandItem
                            key={c.id}
                            onSelect={() => handleAddCandidate(c)}
                          >
                            <div className="flex-1">
                              <p className="text-sm">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {c.experience_years ? `${c.experience_years} yrs` : ''} {c.location || ''}
                              </p>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Metadata */}
        <div className="space-y-6">
          {/* Message Metadata */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Message Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Hook Used</Label>
                <Select value={hookUsed} onValueChange={(v) => setHookUsed(v as HookType | '')}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select hook..." />
                  </SelectTrigger>
                  <SelectContent>
                    {HOOKS.map(h => (
                      <SelectItem key={h} value={h}>
                        {h.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hookUsed && (
                <div className="space-y-2">
                  <Label className="text-xs">Hook Detail</Label>
                  <Input
                    value={hookDetail}
                    onChange={(e) => setHookDetail(e.target.value)}
                    placeholder="e.g., Series B, saw your post..."
                    className="h-9"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Personalization Level</Label>
                <Select value={personalization} onValueChange={(v) => setPersonalization(v as PersonalizationLevel)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONALIZATION_LEVELS.map(p => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">CTA Type</Label>
                <Select value={ctaType} onValueChange={(v) => setCtaType(v as CTAType)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CTA_TYPES.map(c => (
                      <SelectItem key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Variant Label (A/B testing)</Label>
                <Input
                  value={variantLabel}
                  onChange={(e) => setVariantLabel(e.target.value)}
                  placeholder="e.g., A, B, short..."
                  className="h-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="calendar"
                  checked={includeCalendar}
                  onChange={(e) => setIncludeCalendar(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="calendar" className="text-xs font-normal">
                  Includes calendar link
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Followup Scheduling */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Follow-up
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="followup"
                  checked={scheduleFollowup}
                  onChange={(e) => setScheduleFollowup(e.target.checked)}
                  className="rounded border-input"
                />
                <Label htmlFor="followup" className="text-xs font-normal">
                  Schedule follow-up reminder
                </Label>
              </div>

              {scheduleFollowup && (
                <div className="space-y-2">
                  <Label className="text-xs">Follow up in</Label>
                  <Select value={followupDays.toString()} onValueChange={(v) => setFollowupDays(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 days</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="5">5 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send Button */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleSend}
            disabled={!recipient || !body.trim() || isSending || recipient?.do_not_contact}
          >
            {isSending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {existingThread ? 'Send Follow-up' : 'Send Message'}
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Message will be logged to the thread timeline
          </p>
        </div>
      </div>
    </div>
  )
}
