'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ResumeUploader } from '@/components/resume-uploader'
import { Spinner } from '@/components/ui/spinner'
import type { ParsedResumeData } from '@/lib/types'

interface UploadResult {
  pathname: string
  filename: string
  parsed_data: ParsedResumeData
}

export default function NewCandidatePage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isMatching, setIsMatching] = useState(false)

  const handleUploadComplete = (data: { pathname: string; filename: string; parsed_data: Record<string, unknown> }) => {
    setUploadResult(data as UploadResult)
    setError('')
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
    setUploadResult(null)
  }

  const handleCreateCandidate = async (matchJobs: boolean = true) => {
    if (!uploadResult) return

    setIsCreating(true)
    setError('')

    try {
      const candidateData = {
        name: uploadResult.parsed_data.name,
        email: uploadResult.parsed_data.email,
        phone: uploadResult.parsed_data.phone,
        resume_blob_pathname: uploadResult.pathname,
        resume_filename: uploadResult.filename,
        parsed_data: uploadResult.parsed_data,
        skills: uploadResult.parsed_data.skills,
        experience_years: uploadResult.parsed_data.experience_years,
        location: uploadResult.parsed_data.location,
        remote_preference: uploadResult.parsed_data.remote_preference,
        salary_expectation_min: uploadResult.parsed_data.salary_expectation_min,
        salary_expectation_max: uploadResult.parsed_data.salary_expectation_max,
        status: 'new',
      }

      const res = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidateData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create candidate')
      }

      const { candidate } = await res.json()

      if (matchJobs) {
        setIsMatching(true)
        
        // Get all open jobs
        const jobsRes = await fetch('/api/jobs')
        const { jobs } = await jobsRes.json()
        const openJobs = jobs?.filter((j: { status: string }) => j.status === 'open') ?? []

        if (openJobs.length > 0) {
          // Match against all open jobs
          await fetch('/api/match-candidate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              candidate_id: candidate.id,
              job_ids: openJobs.map((j: { id: string }) => j.id),
            }),
          })
        }
      }

      router.push(`/candidates/${candidate.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsCreating(false)
      setIsMatching(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-0">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">Upload Resume</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Upload a PDF resume for AI-powered analysis and job matching.{' '}
          <a href="/candidates/bulk" className="text-primary hover:underline">
            Need to upload multiple resumes?
          </a>
        </p>
      </div>

      {error && (
        <div className="mb-4 sm:mb-6 rounded-lg bg-destructive/10 border border-destructive/30 p-3 sm:p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!uploadResult ? (
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
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="rounded-full bg-emerald-500/10 p-2">
                <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-foreground">Resume analyzed successfully</p>
                <p className="text-sm text-muted-foreground">{uploadResult.filename}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Extracted Information</CardTitle>
              <CardDescription>
                Review the AI-extracted data before creating the candidate
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Name</p>
                  <p className="font-medium text-foreground">{uploadResult.parsed_data.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Email</p>
                  <p className="font-medium text-foreground">{uploadResult.parsed_data.email || 'Not found'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Phone</p>
                  <p className="font-medium text-foreground">{uploadResult.parsed_data.phone || 'Not found'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Location</p>
                  <p className="font-medium text-foreground">{uploadResult.parsed_data.location || 'Not found'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Experience</p>
                  <p className="font-medium text-foreground">{uploadResult.parsed_data.experience_years} years</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Remote Preference</p>
                  <p className="font-medium text-foreground capitalize">{uploadResult.parsed_data.remote_preference || 'Not specified'}</p>
                </div>
              </div>

              {(uploadResult.parsed_data.salary_expectation_min || uploadResult.parsed_data.salary_expectation_max) && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Salary Expectations</p>
                  <p className="font-medium text-foreground">
                    ${uploadResult.parsed_data.salary_expectation_min?.toLocaleString() ?? '?'} - ${uploadResult.parsed_data.salary_expectation_max?.toLocaleString() ?? '?'}
                  </p>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-2">Skills</p>
                <div className="flex flex-wrap gap-2">
                  {uploadResult.parsed_data.skills.map((skill) => (
                    <span key={skill} className="rounded-md bg-primary/10 px-3 py-1 text-sm text-primary font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-1">Summary</p>
                <p className="text-foreground">{uploadResult.parsed_data.summary}</p>
              </div>

              {uploadResult.parsed_data.work_history.length > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Work History</p>
                  <div className="space-y-3">
                    {uploadResult.parsed_data.work_history.slice(0, 3).map((work, i) => (
                      <div key={i} className="rounded-lg border border-border p-3">
                        <p className="font-medium text-foreground">{work.title}</p>
                        <p className="text-sm text-muted-foreground">{work.company} - {work.duration}</p>
                      </div>
                    ))}
                    {uploadResult.parsed_data.work_history.length > 3 && (
                      <p className="text-sm text-muted-foreground">+{uploadResult.parsed_data.work_history.length - 3} more positions</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <Button onClick={() => handleCreateCandidate(true)} disabled={isCreating || isMatching} className="w-full sm:w-auto">
              {(isCreating || isMatching) && <Spinner className="mr-2 h-4 w-4" />}
              {isMatching ? 'Matching Jobs...' : isCreating ? 'Creating...' : 'Create & Match Jobs'}
            </Button>
            <Button variant="outline" onClick={() => handleCreateCandidate(false)} disabled={isCreating || isMatching} className="w-full sm:w-auto">
              Create Without Matching
            </Button>
            <Button variant="ghost" onClick={() => setUploadResult(null)} disabled={isCreating || isMatching} className="w-full sm:w-auto">
              Upload Different Resume
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
