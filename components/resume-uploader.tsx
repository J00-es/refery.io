'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface ResumeUploaderProps {
  onUploadComplete: (data: { pathname: string; filename: string; parsed_data: Record<string, unknown> }) => void
  onError?: (error: string) => void
}

export function ResumeUploader({ onUploadComplete, onError }: ResumeUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      onError?.('Only PDF files are allowed')
      return
    }

    if (file.size > 10 * 1024 * 1024) {
      onError?.('File size must be less than 10MB')
      return
    }

    try {
      setIsUploading(true)
      setUploadProgress('Uploading resume...')

      // Upload the file
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadRes.ok) {
        const error = await uploadRes.json()
        throw new Error(error.error || 'Upload failed')
      }

      const { pathname, filename } = await uploadRes.json()
      
      setIsUploading(false)
      setIsAnalyzing(true)
      setUploadProgress('Analyzing resume with AI...')

      // Analyze with AI
      const analyzeRes = await fetch('/api/analyze-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pathname }),
      })

      if (!analyzeRes.ok) {
        const errorData = await analyzeRes.json()
        if (errorData.code === 'VERIFICATION_REQUIRED') {
          throw new Error('Add a credit card to your Vercel account to unlock AI features')
        }
        throw new Error(errorData.error || 'Analysis failed')
      }

      const { parsed_data } = await analyzeRes.json()

      onUploadComplete({ pathname, filename, parsed_data })
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsUploading(false)
      setIsAnalyzing(false)
      setUploadProgress('')
    }
  }, [onUploadComplete, onError])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: isUploading || isAnalyzing,
  })

  const isProcessing = isUploading || isAnalyzing

  return (
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
        
        {isProcessing ? (
          <div className="flex flex-col items-center gap-4">
            <Spinner className="h-10 w-10 text-primary" />
            <p className="text-sm font-medium text-foreground">{uploadProgress}</p>
            <p className="text-xs text-muted-foreground">
              {isAnalyzing ? 'This may take a moment...' : 'Please wait...'}
            </p>
          </div>
        ) : (
          <>
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
              {isDragActive ? 'Drop the resume here' : 'Drag and drop a resume'}
            </p>
            <p className="mb-4 text-xs text-muted-foreground">
              or click to browse (PDF, max 10MB)
            </p>
            <Button type="button" variant="outline" size="sm">
              Select File
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
