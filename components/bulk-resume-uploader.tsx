'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { ParsedResumeData } from '@/lib/types'

interface FileUploadState {
  file: File
  status: 'pending' | 'uploading' | 'analyzing' | 'creating' | 'matching' | 'done' | 'error'
  error?: string
  candidateId?: string
  parsedData?: ParsedResumeData
}

interface BulkResumeUploaderProps {
  onAllComplete?: (results: { successful: number; failed: number }) => void
}

export function BulkResumeUploader({ onAllComplete }: BulkResumeUploaderProps) {
  const [files, setFiles] = useState<FileUploadState[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pdfFiles = acceptedFiles.filter(f => f.type === 'application/pdf')
    const newFiles: FileUploadState[] = pdfFiles.map(file => ({
      file,
      status: 'pending',
    }))
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

  const processFile = async (fileState: FileUploadState, index: number): Promise<boolean> => {
    try {
      // Upload
      updateFileStatus(index, { status: 'uploading' })
      const formData = new FormData()
      formData.append('file', fileState.file)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const error = await uploadRes.json()
        throw new Error(error.error || 'Upload failed')
      }

      const { pathname, filename } = await uploadRes.json()

      // Analyze
      updateFileStatus(index, { status: 'analyzing' })
      const analyzeRes = await fetch('/api/analyze-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname }),
      })

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json()
        if (errorData.code === 'VERIFICATION_REQUIRED') {
          throw new Error('Add a credit card to Vercel to unlock AI features')
        }
        throw new Error(errorData.error || 'Analysis failed')
      }

      const { parsed_data } = await analyzeRes.json()
      updateFileStatus(index, { parsedData: parsed_data })

      // Create candidate
      updateFileStatus(index, { status: 'creating' })
      const candidateData = {
        name: parsed_data.name,
        email: parsed_data.email,
        phone: parsed_data.phone,
        resume_blob_pathname: pathname,
        resume_filename: filename,
        parsed_data: parsed_data,
        skills: parsed_data.skills,
        experience_years: parsed_data.experience_years,
        location: parsed_data.location,
        remote_preference: parsed_data.remote_preference,
        salary_expectation_min: parsed_data.salary_expectation_min,
        salary_expectation_max: parsed_data.salary_expectation_max,
        status: 'new',
      }

      const createRes = await fetch('/api/candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidateData),
      })

      if (!createRes.ok) {
        const error = await createRes.json()
        throw new Error(error.error || 'Failed to create candidate')
      }

      const { candidate } = await createRes.json()

      // Match against jobs
      updateFileStatus(index, { status: 'matching' })
      const jobsRes = await fetch('/api/jobs')
      const { jobs } = await jobsRes.json()
      const openJobs = jobs?.filter((j: { status: string }) => j.status === 'open') ?? []

      if (openJobs.length > 0) {
        await fetch('/api/match-candidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidate_id: candidate.id,
            job_ids: openJobs.map((j: { id: string }) => j.id),
          }),
        })
      }

      updateFileStatus(index, { status: 'done', candidateId: candidate.id })
      return true
    } catch (error) {
      updateFileStatus(index, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      return false
    }
  }

  const processAllFiles = async () => {
    setIsProcessing(true)
    let successful = 0
    let failed = 0

    // Process files sequentially to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === 'pending') {
        const success = await processFile(files[i], i)
        if (success) {
          successful++
        } else {
          failed++
        }
      }
    }

    setIsProcessing(false)
    onAllComplete?.({ successful, failed })
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const completedCount = files.filter(f => f.status === 'done').length
  const errorCount = files.filter(f => f.status === 'error').length
  const processingCount = files.filter(f => ['uploading', 'analyzing', 'creating', 'matching'].includes(f.status)).length

  const getStatusLabel = (status: FileUploadState['status']) => {
    switch (status) {
      case 'pending': return 'Pending'
      case 'uploading': return 'Uploading...'
      case 'analyzing': return 'Analyzing...'
      case 'creating': return 'Creating candidate...'
      case 'matching': return 'Matching jobs...'
      case 'done': return 'Complete'
      case 'error': return 'Failed'
    }
  }

  const getStatusColor = (status: FileUploadState['status']) => {
    switch (status) {
      case 'pending': return 'text-muted-foreground'
      case 'uploading':
      case 'analyzing':
      case 'creating':
      case 'matching': return 'text-amber-600'
      case 'done': return 'text-emerald-600'
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
            or click to browse (PDF files only, max 10MB each)
          </p>
          <Button type="button" variant="outline" size="sm" disabled={isProcessing}>
            Select Files
          </Button>
        </CardContent>
      </Card>

      {files.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {pendingCount > 0 && <span>{pendingCount} pending</span>}
              {processingCount > 0 && <span className="ml-2">{processingCount} processing</span>}
              {completedCount > 0 && <span className="ml-2 text-emerald-600">{completedCount} complete</span>}
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
                    <p className="font-medium text-foreground truncate">{fileState.file.name}</p>
                    <p className={cn('text-sm', getStatusColor(fileState.status))}>
                      {fileState.error || getStatusLabel(fileState.status)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {fileState.status === 'done' && fileState.candidateId && (
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
