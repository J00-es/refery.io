'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface BatchUploadProps {
  type: 'jobs' | 'companies'
  onSuccess?: () => void
}

export function BatchUpload({ type, onSuccess }: BatchUploadProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [results, setResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const templateUrl = type === 'jobs' 
    ? '/templates/jobs-upload-template.csv'
    : '/templates/companies-upload-template.csv'

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
    const data = []

    for (let i = 1; i < lines.length; i++) {
      const values: string[] = []
      let current = ''
      let inQuotes = false

      for (const char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
      values.push(current.trim())

      const row: Record<string, string> = {}
      headers.forEach((header, idx) => {
        row[header] = values[idx]?.replace(/^"|"$/g, '') || ''
      })
      data.push(row)
    }

    return data
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setResults(null)

    try {
      const text = await file.text()
      const data = parseCSV(text)

      if (data.length === 0) {
        setResults({ success: 0, failed: 0, errors: ['No valid data found in file'] })
        return
      }

      const response = await fetch(`/api/${type}/batch-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: data })
      })

      const result = await response.json()
      setResults(result)

      if (result.success > 0 && onSuccess) {
        onSuccess()
      }
    } catch (error) {
      setResults({ success: 0, failed: 1, errors: ['Failed to process file'] })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" />
          Batch Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Batch Upload {type === 'jobs' ? 'Jobs' : 'Companies'}</DialogTitle>
          <DialogDescription>
            Upload multiple {type} at once using a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Step 1: Download Template</CardTitle>
              <CardDescription className="text-xs">
                Download the CSV template and fill in your data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <a href={templateUrl} download>
                <Button variant="outline" size="sm" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download Template
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Upload File */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Step 2: Upload Your File</CardTitle>
              <CardDescription className="text-xs">
                Upload your filled CSV file
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload">
                <Button 
                  variant="default" 
                  size="sm" 
                  className="w-full cursor-pointer" 
                  disabled={isUploading}
                  asChild
                >
                  <span>
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Select CSV File
                      </>
                    )}
                  </span>
                </Button>
              </label>
            </CardContent>
          </Card>

          {/* Results */}
          {results && (
            <Card className={results.failed > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex items-center gap-1 text-emerald-600">
                    <CheckCircle className="h-4 w-4" />
                    <span className="font-medium">{results.success} uploaded</span>
                  </div>
                  {results.failed > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-4 w-4" />
                      <span className="font-medium">{results.failed} failed</span>
                    </div>
                  )}
                </div>
                {results.errors.length > 0 && (
                  <div className="text-xs text-red-600 space-y-1 max-h-32 overflow-y-auto">
                    {results.errors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Instructions */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Tips:</strong></p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Use pipe (|) to separate multiple values (e.g., skills: Python|AWS|SQL)</li>
              <li>Keep text in quotes if it contains commas</li>
              <li>First row must be headers (matching the template)</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
