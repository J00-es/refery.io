'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Spinner } from '@/components/ui/spinner'
import type { Candidate } from '@/lib/types'

interface CandidateActionsProps {
  candidate: Candidate
}

export function CandidateActions({ candidate }: CandidateActionsProps) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRematching, setIsRematching] = useState(false)

  const handleStatusChange = async (status: string) => {
    try {
      await fetch(`/api/candidates/${candidate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      router.refresh()
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleRematch = async () => {
    setIsRematching(true)
    try {
      // Get all open jobs
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
      router.refresh()
    } catch (error) {
      console.error('Failed to rematch:', error)
    } finally {
      setIsRematching(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await fetch(`/api/candidates/${candidate.id}`, {
        method: 'DELETE',
      })
      router.push('/candidates')
      router.refresh()
    } catch (error) {
      console.error('Failed to delete candidate:', error)
    } finally {
      setIsDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={handleRematch} disabled={isRematching}>
        {isRematching && <Spinner className="mr-2 h-4 w-4" />}
        {isRematching ? 'Matching...' : 'Rematch Jobs'}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleStatusChange('new')}>
            Mark as New
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStatusChange('reviewing')}>
            Mark as Reviewing
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStatusChange('shortlisted')}>
            Mark as Shortlisted
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStatusChange('rejected')}>
            Mark as Rejected
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleStatusChange('hired')}>
            Mark as Hired
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete Candidate
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Candidate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {candidate.name}? This will also delete their resume and all job matches. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
