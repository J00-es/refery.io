'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow, differenceInDays } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Search, X, ArrowUpDown, ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Download, Send } from 'lucide-react'
import { 
  PERSONA_CONFIG, 
  STATUS_CONFIG, 
  PATTERN_CONFIG,
  type OutreachThread, 
  type OutreachRecipient,
  type OutreachPersona,
  type ThreadStatus,
  type OutreachPattern
} from '@/lib/outreach-types'

interface ThreadsListClientProps {
  threads: (OutreachThread & {
    recipient: (OutreachRecipient & {
      company: { id: string; name: string; stage?: string } | null
    }) | null
  })[]
  totalCount: number
  currentPage: number
  pageSize: number
  initialFilters: {
    search: string
    status: string[]
    pattern: string[]
    persona: string[]
    channel: string
    range: string
    has_reply: string
  }
}

const ALL_STATUSES: ThreadStatus[] = [
  'active', 'awaiting_reply', 'replied_positive', 'replied_neutral', 'replied_negative',
  'meeting_booked', 'no_response_following_up', 'no_response_dead', 'declined', 'dnr'
]

const ALL_PATTERNS: OutreachPattern[] = [
  'a_candidate_led', 'b_bench_drop', 'c_partnership', 'd_intro_request',
  'e_job_board_follow', 'f_event_followup', 'g_content_reply', 'h_warm_intro', 'other'
]

const ALL_PERSONAS: OutreachPersona[] = [
  'founder_ceo', 'founder_cto', 'head_of_talent', 'hiring_manager', 'recruiter', 'investor', 'advisor', 'other'
]

export function ThreadsListClient({ 
  threads, 
  totalCount, 
  currentPage, 
  pageSize,
  initialFilters 
}: ThreadsListClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [search, setSearch] = useState(initialFilters.search)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(initialFilters.status)
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>(initialFilters.pattern)
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(initialFilters.persona)
  const [channel, setChannel] = useState(initialFilters.channel)
  const [range, setRange] = useState(initialFilters.range)
  const [hasReply, setHasReply] = useState(initialFilters.has_reply)
  const [sortField, setSortField] = useState<string>('last_touch')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const updateFilters = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })
    params.delete('page') // Reset to page 1 on filter change
    router.push(`/outreach/threads?${params.toString()}`)
  }, [router, searchParams])

  const handleSearch = () => {
    updateFilters({ search })
  }

  const handleStatusToggle = (status: string) => {
    const newStatuses = selectedStatuses.includes(status)
      ? selectedStatuses.filter(s => s !== status)
      : [...selectedStatuses, status]
    setSelectedStatuses(newStatuses)
    updateFilters({ status: newStatuses.join(',') })
  }

  const handlePatternToggle = (pattern: string) => {
    const newPatterns = selectedPatterns.includes(pattern)
      ? selectedPatterns.filter(p => p !== pattern)
      : [...selectedPatterns, pattern]
    setSelectedPatterns(newPatterns)
    updateFilters({ pattern: newPatterns.join(',') })
  }

  const handlePersonaToggle = (persona: string) => {
    const newPersonas = selectedPersonas.includes(persona)
      ? selectedPersonas.filter(p => p !== persona)
      : [...selectedPersonas, persona]
    setSelectedPersonas(newPersonas)
    updateFilters({ persona: newPersonas.join(',') })
  }

  const resetFilters = () => {
    setSearch('')
    setSelectedStatuses([])
    setSelectedPatterns([])
    setSelectedPersonas([])
    setChannel('')
    setRange('all')
    setHasReply('')
    router.push('/outreach/threads')
  }

  const hasActiveFilters = search || selectedStatuses.length > 0 || selectedPatterns.length > 0 || 
    selectedPersonas.length > 0 || channel || range !== 'all' || hasReply

  const totalPages = Math.ceil(totalCount / pageSize)

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', page.toString())
    router.push(`/outreach/threads?${params.toString()}`)
  }

  // Sort threads client-side (could be moved to server)
  const sortedThreads = [...threads].sort((a, b) => {
    let aVal: number, bVal: number
    switch (sortField) {
      case 'last_touch':
        aVal = new Date(a.last_touch_at || a.created_at).getTime()
        bVal = new Date(b.last_touch_at || b.created_at).getTime()
        break
      case 'days_since':
        aVal = a.last_touch_at ? differenceInDays(new Date(), new Date(a.last_touch_at)) : 999
        bVal = b.last_touch_at ? differenceInDays(new Date(), new Date(b.last_touch_at)) : 999
        break
      case 'touches':
        aVal = a.total_touches
        bVal = b.total_touches
        break
      default:
        return 0
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Threads</h1>
          <p className="text-sm text-muted-foreground">{totalCount} total conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button size="sm" asChild>
            <Link href="/outreach/compose">
              <Send className="h-4 w-4 mr-2" />
              New Thread
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, subject..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-9"
              />
            </div>

            {/* Status Multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Status
                  {selectedStatuses.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      {selectedStatuses.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {ALL_STATUSES.map(status => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={selectedStatuses.includes(status)}
                    onCheckedChange={() => handleStatusToggle(status)}
                  >
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_CONFIG[status].bgColor} ${STATUS_CONFIG[status].color}`}>
                      {STATUS_CONFIG[status].label}
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Pattern Multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Pattern
                  {selectedPatterns.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      {selectedPatterns.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {ALL_PATTERNS.map(pattern => (
                  <DropdownMenuCheckboxItem
                    key={pattern}
                    checked={selectedPatterns.includes(pattern)}
                    onCheckedChange={() => handlePatternToggle(pattern)}
                  >
                    {PATTERN_CONFIG[pattern].label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Persona Multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Persona
                  {selectedPersonas.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      {selectedPersonas.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {ALL_PERSONAS.map(persona => (
                  <DropdownMenuCheckboxItem
                    key={persona}
                    checked={selectedPersonas.includes(persona)}
                    onCheckedChange={() => handlePersonaToggle(persona)}
                  >
                    {PERSONA_CONFIG[persona].label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Channel */}
            <Select value={channel} onValueChange={(v) => { setChannel(v); updateFilters({ channel: v }) }}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="linkedin_dm">LinkedIn DM</SelectItem>
                <SelectItem value="linkedin_connection">LinkedIn Connect</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>

            {/* Date Range */}
            <Select value={range} onValueChange={(v) => { setRange(v); updateFilters({ range: v }) }}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7d</SelectItem>
                <SelectItem value="30d">Last 30d</SelectItem>
                <SelectItem value="90d">Last 90d</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>

            {/* Has Reply */}
            <Select value={hasReply} onValueChange={(v) => { setHasReply(v); updateFilters({ has_reply: v }) }}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="Reply" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Replied</SelectItem>
                <SelectItem value="no">No reply</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9">
                <X className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Recipient</TableHead>
              <TableHead className="w-[160px]">Company</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-[90px]">Pattern</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[90px] text-center">Touches</TableHead>
              <TableHead className="w-[100px]">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto p-0 font-medium hover:bg-transparent"
                  onClick={() => toggleSort('last_touch')}
                >
                  Last touch
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead className="w-[80px]">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-auto p-0 font-medium hover:bg-transparent"
                  onClick={() => toggleSort('days_since')}
                >
                  Days
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedThreads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No threads found. Try adjusting your filters.
                </TableCell>
              </TableRow>
            ) : (
              sortedThreads.map((thread) => {
                const daysSince = thread.last_touch_at 
                  ? differenceInDays(new Date(), new Date(thread.last_touch_at))
                  : null
                const persona = thread.recipient?.persona
                const personaConfig = persona ? PERSONA_CONFIG[persona] : null
                const statusConfig = STATUS_CONFIG[thread.status]
                const patternConfig = thread.outreach_pattern ? PATTERN_CONFIG[thread.outreach_pattern] : null
                const noReply = !thread.first_reply_at

                return (
                  <TableRow key={thread.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/outreach/threads/${thread.id}`)}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm truncate">
                          {thread.recipient?.name || 'Unknown'}
                        </div>
                        {personaConfig && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${personaConfig.bgColor} ${personaConfig.color} lowercase`}>
                            {personaConfig.label}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm truncate">
                        {thread.recipient?.company?.name || 'No company'}
                      </div>
                      {thread.recipient?.company?.stage && (
                        <span className="text-[10px] text-muted-foreground">
                          {thread.recipient.company.stage}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm truncate block max-w-[200px]">
                        {thread.subject || 'No subject'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {patternConfig && (
                        <span className="text-[10px] text-muted-foreground lowercase">
                          {patternConfig.shortLabel}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full lowercase ${statusConfig.bgColor} ${statusConfig.color}`}>
                        {statusConfig.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 text-xs font-mono text-muted-foreground">
                        <span>{thread.outbound_count}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>{thread.inbound_count}</span>
                        <ArrowLeft className="h-3 w-3" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {thread.last_touch_at 
                          ? formatDistanceToNow(new Date(thread.last_touch_at), { addSuffix: false })
                          : '-'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs font-mono ${noReply && daysSince && daysSince > 5 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {daysSince ?? '-'}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
