'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { resumeCompleteness } from '@/lib/resume'
import { readJsonResponse } from '@/lib/api-client'
import type { ParsedResumeData } from '@/lib/types'

type FileStatus = 'pending' | 'uploading' | 'analyzing' | 'creating' | 'done' | 'duplicate' | 'error'

interface FileUploadState {
  file: File
  status: FileStatus
  error?: string
  candidateId?: string
  candidateName?: string
  parsedData?: ParsedResumeData
  completeness?: number
}

interface BulkResumeUploaderProps {
  onAllComplete?: (results: { successful: number; failed: number; duplicates: number }) => void
}

/**
 * How many resumes to read at once.
 *
 * Reading a resume end to end takes several seconds, so a strictly sequential
 * run turned a twenty-file batch into a coffee break. Three at a time is close
 * to a three-fold speed-up while staying well inside the AI gateway's rate
 * limits — going wider mostly buys 429s, which surface to the user as failures.
 */
const CONCURRENCY = 3

const MAX_FILE_BYTES = 10 * 1024 * 1024

export function BulkResumeUploader({ onAllComplete }: BulkResumeUploaderProps) {
  const [files, setFiles] = useState<FileUploadState[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: FileUploadState[] = acceptedFiles.map(file => {
      // Reject locally rather than spending an upload round-trip to be told.
      if (file.type !== 'application/pdf') {
        return { file, status: 'error' as const, error: 'Only PDF files can be read' }
      }
      if (file.size > MAX_FILE_BYTES) {
        return { file, status: 'error' as const, error: 'Larger than 10MB' }
      }
      return { file, status: 'pending' as const }
    })

    setFiles(prev => [...prev, ...newFiles])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    disabled: isProcessing,
  })

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const updateFileStatus = (index: number, updates: Partial<FileUploadState>) => {
    setFiles(prev => prev.map((f, i) => i === index ? { ...f, ...updates } : f))
  }

  type Outcome = 'created' | 'duplicate' | 'failed'

  const processFile = async (file: File, index: number): Promise<Outcome> => {
    try {
      // Upload
      updateFileStatus(index, { status: 'uploading', error: undefined })
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      const uploadData = await readJsonResponse<{ pathname: string; filename: string; error?: string }>(uploadRes)

      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Upload failed')
      }

      const { pathname, filename } = uploadData

      // Analyze
      updateFileStatus(index, { status: 'analyzing' })
      const analyzeRes = await fetch('/api/analyze-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname }),
      })
      const analyzeData = await readJsonResponse<{ parsed_data?: ParsedResumeData; error?: string; code?: string }>(analyzeRes)

      if (!analyzeRes.ok) {
        if (analyzeData.code === 'VERIFICATION_REQUIRED') {
          throw new Error('Add a credit card to Vercel to unlock AI features')
        }
        throw new Error(analyzeData.error || 'Analysis failed')
      }

      const parsed = analyzeData.parsed_data as ParsedResumeData
      updateFileStatus(index, {
        parsedData: parsed,
        candidateName: parsed.name,
        completeness: resumeCompleteness(parsed).score,
      })

      // Create the candidate. Post the whole parse — the server derives every
      // column from it, so a bulk-uploaded profile ends up exactly as complete
      // as one created through the single-resume flow.
      updateFileStatus(index, { status: 'creating' })
      const createRes = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parsed_data: parsed,
          resume_blob_pathname: pathname,
          resume_filename: filename,
          status: 'new',
        }),
      })
      const createData = await readJsonResponse<{ candidate?: { id: string; name: string }; error?: string; code?: string }>(createRes)

      if (!createRes.ok) {
        // Already on file is not a failure — it is the correct outcome, and
        // counting it as an error made re-running a batch look catastrophic.
        if (createData.code === 'DUPLICATE' && createData.candidate) {
          updateFileStatus(index, {
            status: 'duplicate',
            candidateId: createData.candidate.id,
            candidateName: createData.candidate.name,
          })
          return 'duplicate'
        }
        throw new Error(createData.error || 'Failed to create candidate')
      }

      updateFileStatus(index, {
        status: 'done',
        candidateId: createData.candidate!.id,
        candidateName: createData.candidate!.name,
      })
      return 'created'
    } catch (error) {
      updateFileStatus(index, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return 'failed'
    }
  }

  /** Push `indices` through processFile, CONCURRENCY files in flight at a time. */
  const runQueue = async (indices: number[], snapshot: FileUploadState[]) => {
    if (indices.length === 0) return

    setIsProcessing(true)
    const tally = { created: 0, duplicate: 0, failed: 0 }

    let cursor = 0
    const worker = async () => {
      while (cursor < indices.length) {
        const index = indices[cursor++]
        tally[await processFile(snapshot[index].file, index)] += 1
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, indices.length) }, worker))

    setIsProcessing(false)
    onAllComplete?.({
      successful: tally.created,
      failed: tally.failed,
      duplicates: tally.duplicate,
    })
  }

  const indicesWithStatus = (snapshot: FileUploadState[], status: FileStatus) =>
    snapshot.map((f, i) => (f.status === status ? i : -1)).filter(i => i >= 0)

  const processAllFiles = async () => {
    const snapshot = files
    await runQueue(indicesWithStatus(snapshot, 'pending'), snapshot)
  }

  // A batch failure is usually transient — a rate limit, a cold model, one bad
  // PDF in twenty. Re-picking those files by hand was the alternative.
  const retryFailed = async () => {
    const snapshot = files
    await runQueue(indicesWithStatus(snapshot, 'error'), snapshot)
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const completedCount = files.filter(f => f.status === 'done').length
  const duplicateCount = files.filter(f => f.status === 'duplicate').length
  const errorCount = files.filter(f => f.status === 'error').length
  const processingCount = files.filter(f => ['uploading', 'analyzing', 'creating'].includes(f.status)).length

  const getStatusLabel = (state: FileUploadState) => {
    switch (state.status) {
      case 'pending': return 'Ready'
      case 'uploading': return 'Uploading...'
      case 'analyzing': return 'Reading résumé...'
      case 'creating': return 'Creating profile...'
      case 'done': return state.completeness
        ? `Created · ${state.completeness}% of fields captured`
        : 'Created'
      case 'duplicate': return 'Already in your candidates'
      case 'error': return state.error || 'Failed'
    }
  }

  const getStatusColor = (status: FileStatus) => {
    switch (status) {
      case 'pending': return 'text-muted-foreground'
      case 'uploading':
      case 'analyzing':
      case 'creating': return 'text-amber-600'
      case 'done': return 'text-emerald-600'
      case 'duplicate': return 'text-blue-600'
      case 'error': return 'text-red-600'
    }
  }

  return (
    <div className="space-y-6">
      <Card
        {...getRootProps()}
        className={cn(
          'cursor-pointer border-2 border-dashed transition-colors',
          isDragActive && 'border-primary bg-primary/5',
          isProcessing && 'cursor-wait opacity-70',
          !isDragActive && !isProcessing && 'hover:border-primary/50 hover:bg-accent/30'
        )}
      >
        <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <input {...getInputProps()} />

          <div className="mb-4 rounded-full bg-primary/10 p-4">
            <svg
              className="h-8 w-8 text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="mb-2 text-sm font-medium text-foreground">
            {isDragActive ? 'Drop the resumes here' : 'Drag and drop multiple resumes'}
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            or click to browse (PDF files only, max 10MB each) · {CONCURRENCY} read at a time
          </p>
          <Button type="button" variant="outline" size="sm" disabled={isProcessing}>
            Select Files
          </Button>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-muted-foreground">
              {pendingCount > 0 && <span>{pendingCount} ready</span>}
              {processingCount > 0 && <span className="ml-2 text-amber-600">{processingCount} processing</span>}
              {completedCount > 0 && <span className="ml-2 text-emerald-600">{completedCount} created</span>}
              {duplicateCount > 0 && <span className="ml-2 text-blue-600">{duplicateCount} already on file</span>}
              {errorCount > 0 && <span className="ml-2 text-red-600">{errorCount} failed</span>}
            </div>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <Button onClick={processAllFiles} disabled={isProcessing} size="sm">
                  {isProcessing ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Processing...
                    </>
                  ) : (
                    `Process ${pendingCount} Resume${pendingCount > 1 ? 's' : ''}`
                  )}
                </Button>
              )}
              {errorCount > 0 && !isProcessing && (
                <Button onClick={retryFailed} variant="outline" size="sm">
                  Retry {errorCount} failed
                </Button>
              )}
              {!isProcessing && files.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                  Clear All
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {files.map((fileState, index) => (
              <div
                key={`${fileState.file.name}-${index}`}
                className={cn(
                  'flex items-center justify-between rounded-lg border p-3',
                  fileState.status === 'done' && 'border-emerald-500/30 bg-emerald-500/5',
                  fileState.status === 'duplicate' && 'border-blue-500/30 bg-blue-500/5',
                  fileState.status === 'error' && 'border-red-500/30 bg-red-500/5'
                )}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="shrink-0">
                    {fileState.status === 'done' ? (
                      <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <svg className="h-4 w-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ) : fileState.status === 'duplicate' ? (
                      <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <svg className="h-4 w-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    ) : fileState.status === 'error' ? (
                      <div className="h-8 w-8 rounded-full bg-red-500/10 flex items-center justify-center">
                        <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    ) : fileState.status === 'pending' ? (
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    ) : (
                      <Spinner className="h-8 w-8 text-amber-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {fileState.candidateName || fileState.file.name}
                    </p>
                    <p className={cn('text-sm', getStatusColor(fileState.status))}>
                      {getStatusLabel(fileState)}
                    </p>
                    {fileState.candidateName && (
                      <p className="text-xs text-muted-foreground truncate">{fileState.file.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {(fileState.status === 'done' || fileState.status === 'duplicate') && fileState.candidateId && (
                    <a href={`/candidates/${fileState.candidateId}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </a>
                  )}
                  {fileState.status === 'pending' && !isProcessing && (
                    <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
