'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import Link from 'next/link'
import { 
  Linkedin, Clock, AlertTriangle, User, Building2, 
  MessageSquare, ExternalLink, ArrowUpDown, Filter, Send
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { PIPELINE_STAGES } from '@/lib/pipeline-stages'

interface PipelineItem {
  id: string
  stage: string
  updated_at: string
  created_at: string
  job_id: string
  candidate_id: string
  owner_user_id: string | null
  daysInStage: number
  isStale: boolean
  isVeryStale: boolean
  stageLabel: string
  stageColor: string
  stageDotColor: string
  jobs: { id: string; title: string; company_name: string | null } | null
  candidates: { 
    id: string
    name: string
    email: string | null
    linkedin_url: string | null
    location: string | null
  } | null
  owner: { user_id: string; email: string; full_name: string | null } | null
}

interface StageDrillDownClientProps {
  data: PipelineItem[]
  bucketKey: string
  currentSort: string
  showStaleOnly: boolean
  isAdmin: boolean
}

export function StageDrillDownClient({ 
  data, 
  bucketKey, 
  currentSort, 
  showStaleOnly,
  isAdmin,
}: StageDrillDownClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  
  const [selectedItem, setSelectedItem] = useState<PipelineItem | null>(null)
  const [noteContent, setNoteContent] = useState('')
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [isChangingStage, setIsChangingStage] = useState(false)

  function updateSearchParams(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  async function handleStageChange(pipelineId: string, jobId: string, newStage: string) {
    setIsChangingStage(true)
    try {
      await fetch(`/api/jobs/${jobId}/pipeline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_id: pipelineId, stage: newStage }),
      })
      router.refresh()
    } catch (error) {
      console.error('Failed to update stage:', error)
    } finally {
      setIsChangingStage(false)
    }
  }

  async function handleAddNote() {
    if (!selectedItem || !noteContent.trim()) return
    setIsAddingNote(true)
    try {
      await fetch(`/api/jobs/${selectedItem.job_id}/pipeline/${selectedItem.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteContent }),
      })
      setNoteContent('')
      setSelectedItem(null)
    } catch (error) {
      console.error('Failed to add note:', error)
    } finally {
      setIsAddingNote(false)
    }
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No candidates in this stage</p>
            <p className="text-sm mt-1">
              {showStaleOnly 
                ? 'No stale candidates found. Try removing the filter.'
                : 'Candidates will appear here when added to this pipeline stage.'
              }
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        
        <div className="flex items-center gap-2">
          <Label htmlFor="stale-filter" className="text-sm">Show only stale ({'>'}7 days)</Label>
          <Switch
            id="stale-filter"
            checked={showStaleOnly}
            onCheckedChange={(checked) => updateSearchParams('stale', checked ? 'true' : null)}
          />
        </div>

        <div className="flex items-center gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          <Select 
            value={currentSort} 
            onValueChange={(value) => updateSearchParams('sort', value)}
          >
            <SelectTrigger className="w-48 h-8">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days_desc">Days in stage (oldest first)</SelectItem>
              <SelectItem value="days_asc">Days in stage (newest first)</SelectItem>
              <SelectItem value="activity">Last activity</SelectItem>
              <SelectItem value="name">Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Candidate</TableHead>
                  <TableHead>Job</TableHead>
                  <TableHead className="w-[120px]">Days in Stage</TableHead>
                  <TableHead className="w-[150px]">Owner</TableHead>
                  <TableHead className="w-[120px]">Last Activity</TableHead>
                  <TableHead className="w-[180px]">Stage</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => {
                  const candidate = item.candidates
                  const job = item.jobs
                  
                  return (
                    <TableRow 
                      key={item.id}
                      className={
                        item.isVeryStale 
                          ? 'bg-red-50 hover:bg-red-100' 
                          : item.isStale 
                            ? 'bg-amber-50 hover:bg-amber-100'
                            : ''
                      }
                    >
                      {/* Candidate */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link 
                            href={`/candidates/${candidate?.id}`}
                            className="font-medium hover:underline"
                          >
                            {candidate?.name || 'Unknown'}
                          </Link>
                          {candidate?.linkedin_url && (
                            <a 
                              href={candidate.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:opacity-70"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Linkedin className="h-4 w-4 text-blue-600" />
                            </a>
                          )}
                        </div>
                        {candidate?.location && (
                          <p className="text-xs text-muted-foreground">{candidate.location}</p>
                        )}
                      </TableCell>

                      {/* Job */}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <div className="min-w-0">
                            <Link 
                              href={`/jobs/${job?.id}`}
                              className="font-medium hover:underline truncate block"
                            >
                              {job?.title || 'Unknown'}
                            </Link>
                            <p className="text-xs text-muted-foreground truncate">
                              {job?.company_name}
                            </p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Days in Stage */}
                      <TableCell>
                        <div className={`flex items-center gap-1.5 ${
                          item.isVeryStale ? 'text-red-700 font-semibold' : 
                          item.isStale ? 'text-amber-700 font-medium' : 'text-muted-foreground'
                        }`}>
                          <Clock className="h-3.5 w-3.5" />
                          <span>{item.daysInStage}d</span>
                          {item.isVeryStale && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-red-300 text-red-700 bg-red-100">
                              <AlertTriangle className="h-3 w-3 mr-0.5" />
                              Critical
                            </Badge>
                          )}
                          {item.isStale && !item.isVeryStale && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px] border-amber-300 text-amber-700 bg-amber-100">
                              <AlertTriangle className="h-3 w-3 mr-0.5" />
                              Stale
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      {/* Owner */}
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="truncate max-w-[100px]">
                            {item.owner?.full_name || item.owner?.email?.split('@')[0] || 'Unassigned'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Last Activity */}
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
                        </span>
                      </TableCell>

                      {/* Stage Selector */}
                      <TableCell>
                        <Select
                          value={item.stage}
                          onValueChange={(value) => handleStageChange(item.id, item.job_id, value)}
                          disabled={isChangingStage}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.map(stage => (
                              <SelectItem key={stage.value} value={stage.value} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${stage.borderColor}`} />
                                  {stage.label}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => setSelectedItem(item)}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Note</DialogTitle>
                                <DialogDescription>
                                  Add a note for {candidate?.name} at {job?.company_name}
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 pt-4">
                                <Textarea
                                  placeholder="Enter your note..."
                                  value={noteContent}
                                  onChange={(e) => setNoteContent(e.target.value)}
                                  className="min-h-[100px]"
                                />
                                <div className="flex justify-end gap-2">
                                  <Button 
                                    onClick={handleAddNote}
                                    disabled={!noteContent.trim() || isAddingNote}
                                  >
                                    <Send className="h-4 w-4 mr-2" />
                                    {isAddingNote ? 'Adding...' : 'Add Note'}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          
                          <Link href={`/candidates/${candidate?.id}`}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
