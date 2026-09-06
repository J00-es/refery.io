'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { BulkResumeUploader } from '@/components/bulk-resume-uploader'
import { BulkFactsTable, type CreatedRow } from '@/components/candidates/bulk-facts-table'

export default function BulkUploadPage() {
  const router = useRouter()
  const [results, setResults] = useState<{ successful: number; failed: number; duplicates: number } | null>(null)
  const [created, setCreated] = useState<CreatedRow[]>([])

  const handleAllComplete = (data: { successful: number; failed: number; duplicates: number; created?: CreatedRow[] }) => {
    setResults(data)
    if (data.created?.length) setCreated(prev => [...prev, ...data.created!.filter(c => !prev.some(p => p.id === c.id))])
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/candidates" className="hover:text-foreground">Candidates</Link>
          <span>/</span>
          <span>Bulk Upload</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Bulk Resume Upload</h1>
        <p className="text-muted-foreground">
          Upload multiple PDF resumes at once for AI-powered analysis and job matching
        </p>
      </div>

      {results && (
        <Card className={results.failed > 0 ? 'border-amber-500/30 bg-amber-500/5 mb-6' : 'border-emerald-500/30 bg-emerald-500/5 mb-6'}>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className={`rounded-full p-2 ${results.failed > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
                {results.failed > 0 ? (
                  <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div>
                <p className="font-medium text-foreground">
                  {results.successful} profile{results.successful !== 1 ? 's' : ''} created
                  {results.duplicates > 0 && `, ${results.duplicates} already on file`}
                  {results.failed > 0 && `, ${results.failed} failed`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {results.failed > 0
                    ? 'Each failure shows its reason below — use Retry once you have addressed it.'
                    : 'Every résumé was read in full and each profile is ready to match against open roles.'}
                </p>
              </div>
            </div>
            <Button onClick={() => router.push('/candidates')}>
              View Candidates
            </Button>
          </CardContent>
        </Card>
      )}

      {created.length > 0 && (
        <div className="mb-6">
          <BulkFactsTable rows={created} />
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Upload Multiple Resumes</CardTitle>
          <CardDescription>
            Select or drag multiple PDF files. Each resume will be automatically analyzed and matched with open jobs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulkResumeUploader onAllComplete={handleAllComplete} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Link href="/candidates/new">
          <Button variant="outline">Upload Single Resume</Button>
        </Link>
        <Link href="/candidates">
          <Button variant="ghost">Back to Candidates</Button>
        </Link>
      </div>
    </div>
  )
}
