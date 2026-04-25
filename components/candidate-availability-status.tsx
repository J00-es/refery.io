'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { AVAILABILITY_STATUSES } from '@/lib/types'
import { CheckCircle, XCircle, HelpCircle, ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface CandidateAvailabilityStatusProps {
  candidateId: string
  currentStatus: 'active' | 'off_market' | 'not_yet_talked' | 'not_qualified'
}

const statusIcons: Record<string, React.ReactNode> = {
  active: <CheckCircle className="h-3.5 w-3.5" />,
  off_market: <XCircle className="h-3.5 w-3.5" />,
  not_yet_talked: <HelpCircle className="h-3.5 w-3.5" />,
  not_qualified: <XCircle className="h-3.5 w-3.5" />,
}

export function CandidateAvailabilityStatus({ candidateId, currentStatus }: CandidateAvailabilityStatusProps) {
  const [status, setStatus] = useState(currentStatus)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()

  const statusConfig = AVAILABILITY_STATUSES[status]

  const handleStatusChange = async (newStatus: 'active' | 'off_market' | 'not_yet_talked' | 'not_qualified') => {
    if (newStatus === status) return
    
    setStatus(newStatus)
    
    startTransition(async () => {
      const { error } = await supabase
        .from('candidates')
        .update({ availability_status: newStatus })
        .eq('id', candidateId)
      
      if (error) {
        console.error('Failed to update availability status:', error)
        setStatus(status) // Revert on error
      } else {
        router.refresh()
      }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className={`${statusConfig.color} border-0 gap-1.5 h-7`}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            statusIcons[status]
          )}
          {statusConfig.label}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(AVAILABILITY_STATUSES).map(([key, config]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => handleStatusChange(key as 'active' | 'off_market' | 'not_yet_talked' | 'not_qualified')}
            className="gap-2"
          >
            <span className={`flex items-center gap-2 ${config.color} px-2 py-0.5 rounded`}>
              {statusIcons[key]}
              {config.label}
            </span>
            {key === status && <CheckCircle className="h-4 w-4 ml-auto text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
