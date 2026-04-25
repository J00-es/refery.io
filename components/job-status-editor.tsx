'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronDown, Check } from 'lucide-react'
import { INTERNAL_DEAL_TYPES } from '@/lib/types'

interface JobStatusEditorProps {
  jobId: string
  currentStatus: 'open' | 'closed' | 'draft'
  currentDealType: 'pipeline' | 'partnership' | 'direct' | 'public' | null
  isAdmin: boolean
}

const statusOptions = [
  { value: 'open', label: 'Open', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' },
  { value: 'closed', label: 'Closed', color: 'bg-muted text-muted-foreground border-muted' },
  { value: 'draft', label: 'Draft', color: 'bg-amber-500/10 text-amber-600 border-amber-500/30' },
]

const dealTypeOptions = [
  { value: 'pipeline', label: 'Pipeline', color: 'bg-amber-100 text-amber-700' },
  { value: 'partnership', label: 'Partnership', color: 'bg-purple-100 text-purple-700' },
  { value: 'direct', label: 'Direct', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'public', label: 'Public', color: 'bg-blue-100 text-blue-700' },
]

export function JobStatusEditor({ jobId, currentStatus, currentDealType, isAdmin }: JobStatusEditorProps) {
  const [status, setStatus] = useState(currentStatus)
  const [dealType, setDealType] = useState(currentDealType || 'public')
  const [statusOpen, setStatusOpen] = useState(false)
  const [dealTypeOpen, setDealTypeOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const supabase = createClient()

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus as 'open' | 'closed' | 'draft')
    setStatusOpen(false)
    
    startTransition(async () => {
      await supabase
        .from('jobs')
        .update({ status: newStatus })
        .eq('id', jobId)
      
      router.refresh()
    })
  }

  const handleDealTypeChange = async (newDealType: string) => {
    setDealType(newDealType as 'pipeline' | 'partnership' | 'direct' | 'public')
    setDealTypeOpen(false)
    
    startTransition(async () => {
      await supabase
        .from('jobs')
        .update({ internal_deal_type: newDealType })
        .eq('id', jobId)
      
      router.refresh()
    })
  }

  const currentStatusOption = statusOptions.find(s => s.value === status)
  const currentDealTypeOption = dealTypeOptions.find(d => d.value === dealType)

  return (
    <div className="flex items-center gap-2">
      {/* Status Editor */}
      <Popover open={statusOpen} onOpenChange={setStatusOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'rounded-full border px-3 py-1 text-sm font-medium capitalize h-auto',
              currentStatusOption?.color,
              isPending && 'opacity-50'
            )}
          >
            {currentStatusOption?.label || status}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="start">
          {statusOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleStatusChange(option.value)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors',
                status === option.value && 'bg-muted'
              )}
            >
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', option.color)}>
                {option.label}
              </span>
              {status === option.value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {/* Deal Type Editor - Admin only */}
      {isAdmin && (
        <Popover open={dealTypeOpen} onOpenChange={setDealTypeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium h-auto',
                currentDealTypeOption?.color,
                isPending && 'opacity-50'
              )}
            >
              {currentDealTypeOption?.label || 'Public'}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <div className="text-xs text-muted-foreground px-3 py-2 border-b">Internal Deal Type</div>
            {dealTypeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleDealTypeChange(option.value)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-muted transition-colors',
                  dealType === option.value && 'bg-muted'
                )}
              >
                <div className="flex flex-col items-start">
                  <span className={cn('rounded-md px-2 py-0.5 text-xs font-medium', option.color)}>
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {INTERNAL_DEAL_TYPES[option.value as keyof typeof INTERNAL_DEAL_TYPES]?.description}
                  </span>
                </div>
                {dealType === option.value && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
