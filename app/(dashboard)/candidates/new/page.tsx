'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ResumeUploader } from '@/components/resume-uploader'
import { Spinner } from '@/components/ui/spinner'
import { ResumeBodySections, LanguagesSection } from '@/components/candidates/parsed-resume'
import { resumeCompleteness } from '@/lib/resume'
import { readJsonResponse } from '@/lib/api-client'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { ParsedResumeData } from '@/lib/types'

interface UploadResult {
  pathname: string
  filename: string
  parsed_data: ParsedResumeData
}

export default function NewCandidatePage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const handleUploadComplete = (data: { pathname: string; filename: string; parsed_data: Record<string, unknown> }) => {
    setUploadResult(data as unknown as UploadResult)
    setError('')
    setDuplicate(null)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
    setUploadResult(null)
  }

  const handleCreateCandidate = async () => {
    if (!uploadResult) return

    setIsCreating(true)
    setError('')
    setDuplicate(null)

    try {
      // Post the parse itself rather than a hand-picked handful of fields. The
      // server derives every column from it, so the profile keeps everything
      // the resume said instead of the six values this page used to forward.
      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_data: uploadResult.parsed_data,
          resume_blob_pathname: uploadResult.pathname,
          resume_filename: uploadResult.filename,
          status: 'new',
        }),
      })

      const data = await readJsonResponse<{ candidate?: { id: string; name: string }; error?: string; code?: string }>(res)

      if (!res.ok) {
        if (data.code === 'DUPLICATE' && data.candidate) {
          setDuplicate(data.candidate)
        }
        throw new Error(data.error || 'Failed to create candidate')
      }

      router.push(`/candidates/${data.candidate!.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsCreating(false)
    }
  }

  const parsed = uploadResult?.parsed_data
  const completeness = parsed ? resumeCompleteness(parsed) : null

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-0">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">Upload Resume</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Upload a PDF resume and we&apos;ll read it end to end.{' '}
          <a href="/candidates/bulk" className="text-primary hover:underline">
            Need to upload multiple resumes?
          </a>
        </p>
      </div>

      {error && (
        <div className="mb-4 sm:mb-6 rounded-lg bg-destructive/10 border border-destructive/30 p-3 sm:p-4 text-sm text-destructive">
          <p>{error}</p>
          {duplicate && (
            <Link
              href={`/candidates/${duplicate.id}`}
              className="mt-2 inline-block font-medium underline"
            >
              Open {duplicate.name}&apos;s existing profile
            </Link>
          )}
        </div>
      )}

      {!uploadResult || !parsed ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload Resume</CardTitle>
            <CardDescription>
              Drag and drop a PDF resume or click to browse
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResumeUploader onUploadComplete={handleUploadComplete} onError={handleError} />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className={completeness && completeness.score < 70 ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}>
            <CardContent className="flex items-start gap-4 py-4">
              <div className={`rounded-full p-2 ${completeness && completeness.score < 70 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                {completeness && completeness.score < 70 ? (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  Résumé read — {completeness?.score}% of fields captured
                </p>
                <p className="text-sm text-muted-foreground">{uploadResult.filename}</p>
                {completeness && completeness.missing.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Not found on this résumé: {completeness.missing.join(', ')}. You can fill these in after creating the profile.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extracted Information</CardTitle>
              <CardDescription>
                This is exactly what the profile will show. Review it before creating the candidate.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" value={parsed.name} />
                <Field label="Email" value={parsed.email} />
                <Field label="Phone" value={parsed.phone} />
                <Field label="Location" value={parsed.location} />
                <Field
                  label="Current Role"
                  value={[parsed.current_title, parsed.current_company].filter(Boolean).join(' at ')}
                />
                <Field label="Seniority" value={parsed.seniority_level} />
                <Field
                  label="Experience"
                  value={parsed.experience_years != null ? `${parsed.experience_years} years` : null}
                />
                <Field label="Remote Preference" value={parsed.remote_preference} />
                <Field label="Work Authorization" value={parsed.work_authorization} />
                <Field label="LinkedIn" value={parsed.linkedin_url} />
              </div>

              {(parsed.salary_expectation_min || parsed.salary_expectation_max) && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Salary Expectations</p>
                  <p className="font-medium text-foreground">
                    ${parsed.salary_expectation_min?.toLocaleString() ?? '?'} - ${parsed.salary_expectation_max?.toLocaleString() ?? '?'}
                    {parsed.salary_currency ? ` ${parsed.salary_currency}` : ''}
                  </p>
                </div>
              )}

              {parsed.skills?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Skills ({parsed.skills.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {parsed.skills.map((skill) => (
                      <span key={skill} className="rounded-md bg-primary/10 px-3 py-1 text-sm text-primary font-medium">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {parsed.summary && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Summary</p>
                  <p className="text-foreground">{parsed.summary}</p>
                </div>
              )}

              {parsed.certifications?.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Certifications</p>
                  <ul className="space-y-1">
                    {parsed.certifications.map((cert, i) => (
                      <li key={i} className="text-sm text-foreground">{cert}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <LanguagesSection parsed={parsed} />
          <ResumeBodySections parsed={parsed} />

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button onClick={() => handleCreateCandidate()} disabled={isCreating} className="w-full sm:w-auto">
              {isCreating && <Spinner className="mr-2 h-4 w-4" />}
              {isCreating ? 'Creating...' : 'Create Candidate'}
            </Button>
            <Button variant="ghost" onClick={() => setUploadResult(null)} disabled={isCreating} className="w-full sm:w-auto">
              Upload Different Resume
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className="font-medium text-foreground break-words">{value || 'Not found'}</p>
    </div>
  )
}
