'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
import { Mail, EyeOff, Eye, Sparkles } from 'lucide-react'
import type { Job, JobMatch, Candidate } from '@/lib/types'

interface SendCandidatesButtonProps {
  job: Job
  matches: (JobMatch & { candidate: Candidate })[]
}

export function SendCandidatesButton({ job, matches }: SendCandidatesButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([])
  const [mode, setMode] = useState<'anonymized' | 'full'>('anonymized')
  const [hiringManagerName, setHiringManagerName] = useState(job.hiring_manager_name || '')
  const [hiringManagerEmail, setHiringManagerEmail] = useState(job.hiring_manager_email || '')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedEmail, setGeneratedEmail] = useState({ subject: '', body: '' })
  const [selectedCandidateObjects, setSelectedCandidateObjects] = useState<Candidate[]>([])

  const toggleCandidate = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    if (selectedCandidates.length === 0) return

    setIsGenerating(true)
    try {
      const res = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'hiring_manager',
          mode,
          jobId: job.id,
          candidateIds: selectedCandidates,
          hiringManagerName,
          companyName: job.company_name,
        }),
      })

      if (!res.ok) throw new Error('Failed to generate email')

      const data = await res.json()
      setGeneratedEmail({ subject: data.subject, body: data.email })
      
      if (mode === 'full' && data.candidates) {
        setSelectedCandidateObjects(data.candidates)
      } else {
        setSelectedCandidateObjects([])
      }
      
      setDialogOpen(false)
      setComposerOpen(true)
    } catch (error) {
      console.error('Error generating email:', error)
    } finally {
      setIsGenerating(false)
    }
  }

  const goodMatches = matches.filter(m => m.overall_score >= 60)

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Mail className="h-4 w-4 mr-2" />
            Email Candidates to HM
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Send Candidates to Hiring Manager</DialogTitle>
            <DialogDescription>
              Select candidates and generate an email for the hiring manager
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Hiring Manager Info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hm_name">Hiring Manager Name</Label>
                <Input
                  id="hm_name"
                  value={hiringManagerName}
                  onChange={(e) => setHiringManagerName(e.target.value)}
                  placeholder="e.g. John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hm_email">Email</Label>
                <Input
                  id="hm_email"
                  type="email"
                  value={hiringManagerEmail}
                  onChange={(e) => setHiringManagerEmail(e.target.value)}
                  placeholder="john@company.com"
                />
              </div>
            </div>

            {/* Mode Selection */}
            <div className="space-y-3">
              <Label>Email Mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'anonymized' | 'full')}>
                <div className="flex items-center space-x-2 rounded-lg border p-3">
                  <RadioGroupItem value="anonymized" id="anonymized" />
                  <Label htmlFor="anonymized" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Anonymized</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Share candidate profiles without names - great for cold outreach
                    </p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 rounded-lg border p-3">
                  <RadioGroupItem value="full" id="full" />
                  <Label htmlFor="full" className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">Full Details</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Include names, LinkedIn profiles, and resumes - for warm intros
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Candidate Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Select Candidates ({selectedCandidates.length} selected)</Label>
                {goodMatches.length > 0 && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedCandidates(goodMatches.map(m => m.candidate_id))}
                  >
                    Select top matches
                  </Button>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border p-2">
                {matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No matched candidates yet
                  </p>
                ) : (
                  matches.map((match) => (
                    <label
                      key={match.candidate_id}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCandidates.includes(match.candidate_id)}
                        onCheckedChange={() => toggleCandidate(match.candidate_id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{match.candidate?.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {match.candidate?.experience_years} yrs exp • {match.overall_score}% match
                        </p>
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

            <Button 
              onClick={handleGenerate} 
              disabled={selectedCandidates.length === 0 || isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Generating Email...
                </>
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
        recipientEmail={hiringManagerEmail}
        recipientName={hiringManagerName}
        candidates={mode === 'full' ? selectedCandidateObjects : undefined}
      />
    </>
  )
}
