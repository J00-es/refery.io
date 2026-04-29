'use client'

import { useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
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
import { Search, X, ChevronLeft, ChevronRight, Download, UserPlus, AlertTriangle, Mail, Linkedin } from 'lucide-react'
import {
  PERSONA_CONFIG,
  type OutreachRecipient,
  type OutreachPersona,
  type OutreachSeniority
} from '@/lib/outreach-types'

interface RecipientsListClientProps {
  recipients: (OutreachRecipient & {
    company: { id: string; name: string; stage?: string } | null
  })[]
  totalCount: number
  currentPage: number
  pageSize: number
  initialFilters: {
    search: string
    persona: string[]
    seniority: string[]
    has_replied: string
    do_not_contact: string
  }
}

const ALL_PERSONAS: OutreachPersona[] = [
  'founder_ceo', 'founder_cto', 'head_of_talent', 'hiring_manager', 'recruiter', 'investor', 'advisor', 'other'
]

const ALL_SENIORITIES: OutreachSeniority[] = [
  'c_level', 'vp', 'director', 'manager', 'individual_contributor'
]

const SENIORITY_LABELS: Record<OutreachSeniority, string> = {
  c_level: 'C-Level',
  vp: 'VP',
  director: 'Director',
  manager: 'Manager',
  individual_contributor: 'IC'
}

function RecipientAvatar({ name, persona }: { name: string; persona?: string | null }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
  const personaConfig = persona ? PERSONA_CONFIG[persona as keyof typeof PERSONA_CONFIG] : null
  const bgColor = personaConfig?.bgColor || 'bg-stone-100'
  const textColor = personaConfig?.color || 'text-stone-700'

  return (
    <div className={`flex items-center justify-center w-12 h-12 rounded-full ${bgColor} ${textColor} text-sm font-semibold`}>
      {initials}
    </div>
  )
}

export function RecipientsListClient({
  recipients,
  totalCount,
  currentPage,
  pageSize,
  initialFilters
}: RecipientsListClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = useState(initialFilters.search)
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(initialFilters.persona)
  const [selectedSeniorities, setSelectedSeniorities] = useState<string[]>(initialFilters.seniority)
  const [hasReplied, setHasReplied] = useState(initialFilters.has_replied)
  const [doNotContact, setDoNotContact] = useState(initialFilters.do_not_contact)

  const updateFilters = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString())
    Object.entries(updates).forEach(([key, value]) => {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    })
    params.delete('page')
    router.push(`/outreach/recipients?${params.toString()}`)
  }, [router, searchParams])

  const handleSearch = () => {
    updateFilters({ search })
  }

  const handlePersonaToggle = (persona: string) => {
    const newPersonas = selectedPersonas.includes(persona)
      ? selectedPersonas.filter(p => p !== persona)
      : [...selectedPersonas, persona]
    setSelectedPersonas(newPersonas)
    updateFilters({ persona: newPersonas.join(',') })
  }

  const handleSeniorityToggle = (seniority: string) => {
    const newSeniorities = selectedSeniorities.includes(seniority)
      ? selectedSeniorities.filter(s => s !== seniority)
      : [...selectedSeniorities, seniority]
    setSelectedSeniorities(newSeniorities)
    updateFilters({ seniority: newSeniorities.join(',') })
  }

  const resetFilters = () => {
    setSearch('')
    setSelectedPersonas([])
    setSelectedSeniorities([])
    setHasReplied('')
    setDoNotContact('')
    router.push('/outreach/recipients')
  }

  const hasActiveFilters = search || selectedPersonas.length > 0 || selectedSeniorities.length > 0 ||
    hasReplied || doNotContact

  const totalPages = Math.ceil(totalCount / pageSize)

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', page.toString())
    router.push(`/outreach/recipients?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recipients</h1>
          <p className="text-sm text-muted-foreground">{totalCount} contacts in your network</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Recipient
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
                placeholder="Search name, email, company..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-9 h-9"
              />
            </div>

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

            {/* Seniority Multi-select */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9">
                  Seniority
                  {selectedSeniorities.length > 0 && (
                    <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                      {selectedSeniorities.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {ALL_SENIORITIES.map(seniority => (
                  <DropdownMenuCheckboxItem
                    key={seniority}
                    checked={selectedSeniorities.includes(seniority)}
                    onCheckedChange={() => handleSeniorityToggle(seniority)}
                  >
                    {SENIORITY_LABELS[seniority]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Has Replied */}
            <Select value={hasReplied} onValueChange={(v) => { setHasReplied(v); updateFilters({ has_replied: v }) }}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="Replied" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Has replied</SelectItem>
                <SelectItem value="no">No reply</SelectItem>
              </SelectContent>
            </Select>

            {/* DNC */}
            <Select value={doNotContact} onValueChange={(v) => { setDoNotContact(v); updateFilters({ do_not_contact: v }) }}>
              <SelectTrigger className="w-28 h-9">
                <SelectValue placeholder="DNC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">DNC only</SelectItem>
                <SelectItem value="no">Contactable</SelectItem>
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

      {/* Grid */}
      {recipients.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No recipients found. Try adjusting your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipients.map(recipient => {
            const personaConfig = recipient.persona ? PERSONA_CONFIG[recipient.persona] : null
            const replyRate = recipient.lifetime_touches > 0
              ? Math.round((recipient.lifetime_replies / recipient.lifetime_touches) * 100)
              : 0

            return (
              <Link key={recipient.id} href={`/outreach/recipients/${recipient.id}`}>
                <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <RecipientAvatar name={recipient.name} persona={recipient.persona} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm truncate">{recipient.name}</h3>
                          {recipient.do_not_contact && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {recipient.current_title || 'No title'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {recipient.company?.name || 'No company'}
                        </p>
                      </div>
                    </div>

                    {personaConfig && (
                      <div className="mt-3">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${personaConfig.bgColor} ${personaConfig.color} lowercase`}>
                          {personaConfig.label}
                        </span>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground">
                        {recipient.lifetime_touches} touches · {recipient.lifetime_replies} replies · {replyRate}% reply rate
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {recipient.last_contacted_at
                          ? `Last: ${formatDistanceToNow(new Date(recipient.last_contacted_at), { addSuffix: true })}`
                          : 'Never contacted'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 mt-3">
                      {recipient.email && (
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {recipient.linkedin_url && (
                        <Linkedin className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

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
