'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Mail, Copy, Check, ExternalLink } from 'lucide-react'
import type { Candidate, Job } from '@/lib/types'

interface EmailComposerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: string
  body: string
  recipientEmail?: string
  recipientName?: string
  attachments?: Array<{ name: string; url?: string }>
  candidates?: Candidate[]
  jobs?: Job[]
}

export function EmailComposer({
  open,
  onOpenChange,
  subject: initialSubject,
  body: initialBody,
  recipientEmail,
  recipientName,
  attachments,
  candidates,
  jobs,
}: EmailComposerProps) {
  const [subject, setSubject] = useState(initialSubject)
  const [body, setBody] = useState(initialBody)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const fullEmail = `Subject: ${subject}\n\n${body}`
    await navigator.clipboard.writeText(fullEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenInMail = () => {
    const mailtoLink = `mailto:${recipientEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(mailtoLink, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Compose Email
          </DialogTitle>
          <DialogDescription>
            Review and edit the email before sending
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {recipientEmail && (
            <div className="space-y-2">
              <Label>To</Label>
              <Input 
                value={recipientName ? `${recipientName} <${recipientEmail}>` : recipientEmail} 
                readOnly 
                className="bg-muted"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Message</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
          </div>

          {candidates && candidates.length > 0 && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Candidate Profiles Included:</p>
              <div className="space-y-2">
                {candidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span>{c.name}</span>
                    <div className="flex gap-2">
                      {c.linkedin_url && (
                        <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs">
                          LinkedIn
                        </a>
                      )}
                      <a 
                        href={`/api/file?pathname=${encodeURIComponent(c.resume_blob_pathname)}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-primary hover:underline text-xs"
                      >
                        Resume
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Download and attach resumes separately when sending via email client.
              </p>
            </div>
          )}

          {jobs && jobs.length > 0 && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Jobs Referenced:</p>
              <div className="space-y-2">
                {jobs.map((j) => (
                  <div key={j.id} className="flex items-center justify-between text-sm">
                    <span>{j.title} at {j.company_name}</span>
                    {j.job_post_url && (
                      <a href={j.job_post_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs flex items-center gap-1">
                        View Job <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {attachments && attachments.length > 0 && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <p className="text-sm font-medium mb-2">Attachments:</p>
              <div className="space-y-1">
                {attachments.map((a, i) => (
                  <div key={i} className="text-sm">
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {a.name}
                      </a>
                    ) : (
                      <span>{a.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button onClick={handleOpenInMail} className="flex-1">
              <Mail className="mr-2 h-4 w-4" />
              Open in Email Client
            </Button>
            <Button variant="outline" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
