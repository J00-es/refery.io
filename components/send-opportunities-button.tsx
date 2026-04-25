'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { EmailComposer } from '@/components/email-composer'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Send, Sparkles } from 'lucide-react'
import type { Candidate, JobMatch, Job } from '@/lib/types'

interface SendOpportunitiesButtonProps {
  candidate: Candidate
  matches: (JobMatch & { job: Job })[]
}

export function SendOpportunitiesButton({ candidate, matches }: SendOpportunitiesButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedJobs, setSelectedJobs] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedEmail, setGeneratedEmail] = useState({ subject: '', body: '' })
  const [selectedJobObjects, setSelectedJobObjects] = useState<Job[]>([])

  const toggleJob = (id: string) => {
    setSelectedJobs(prev =>
      prev.includes(id) ? prev.filter(j => j !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    if (selectedJobs.length === 0) return

    setIsGenerating(true)
    try {
      const res = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candidate_opportunities',
          candidateId: candidate.id,
          jobIds: selectedJobs,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate email')

      const data = await res.json()
      setGeneratedEmail({ subject: data.subject, body: data.email })
      setSelectedJobObjects(data.jobs || [])
      
      setDialogOpen(false)
      setComposerOpen(true)
    } catch (error) {
      console.error('Error generating email:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const goodMatches = matches.filter(m => m.overall_score >= 60 && m.job?.status === 'open')

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Send className="h-4 w-4 mr-2" />
            Send Opportunities
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Job Opportunities</DialogTitle>
            <DialogDescription>
              Select matching jobs to share with {candidate.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Job Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Jobs ({selectedJobs.length} selected)</Label>
                {goodMatches.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedJobs(goodMatches.map(m => m.job_id))}
                  >
                    Select top matches
                  </Button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border p-2">
                {matches.filter(m => m.job?.status === 'open').length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No open jobs matched yet
                  </p>
                ) : (
                  matches
                    .filter(m => m.job?.status === 'open')
                    .map((match) => (
                      <label
                        key={match.job_id}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedJobs.includes(match.job_id)}
                          onCheckedChange={() => toggleJob(match.job_id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{match.job?.title}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            {match.job?.company_name} • {match.job?.location || 'Remote'}
                          </p>
                          {match.job?.salary_min && match.job?.salary_max && (
                            <p className="text-xs text-muted-foreground">
                              ${match.job.salary_min.toLocaleString()} - ${match.job.salary_max.toLocaleString()}
                            </p>
                          )}
                        </div>
                        <span className={`text-sm font-medium ${
                          match.overall_score >= 80 ? 'text-green-600' :
                          match.overall_score >= 60 ? 'text-blue-600' :
                          'text-yellow-600'
                        }`}>
                          {match.overall_score}%
                        </span>
                      </label>
                    ))
                )}
              </div>
            </div>

            {candidate.email && (
              <div className="rounded-lg border p-3 bg-muted/30">
                <p className="text-sm">
                  <span className="text-muted-foreground">Sending to: </span>
                  <span className="font-medium">{candidate.email}</span>
                </p>
              </div>
            )}

            <Button 
              onClick={handleGenerate} 
              disabled={selectedJobs.length === 0 || isGenerating || !candidate.email}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating Email...
                </>
              ) : !candidate.email ? (
                'No email address available'
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Email Draft
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <EmailComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        subject={generatedEmail.subject}
        body={generatedEmail.body}
        recipientEmail={candidate.email || ''}
        recipientName={candidate.name}
        jobs={selectedJobObjects}
      />
    </>
  )
}
