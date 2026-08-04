'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { RefreshCw } from 'lucide-react'
import { readJsonResponse } from '@/lib/api-client'

/**
 * Re-read this candidate's resume with the current extractor.
 *
 * Offered on every profile, but nudged (primary styling) only where the stored
 * parse predates the current extractor — that is where the re-read actually
 * adds something rather than costing a model call for the same result.
 */
export function ReanalyzeResume({ candidateId, isStale }: { candidateId: string; isStale: boolean }) {
  const router = useRouter()
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState('')

  const reanalyze = async () => {
    setIsRunning(true)
    setError('')

    try {
      const res = await fetch(`/api/candidates/${candidateId}/reanalyze`, { method: 'POST' })
      const data = await readJsonResponse<{ error?: string }>(res)

      if (!res.ok) {
        throw new Error(data.error || 'Could not re-read this resume')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant={isStale ? 'default' : 'outline'}
        size="sm"
        onClick={reanalyze}
        disabled={isRunning}
        className="w-full"
      >
        {isRunning ? <Spinner className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        {isRunning ? 'Re-reading resume...' : 'Re-read resume'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
