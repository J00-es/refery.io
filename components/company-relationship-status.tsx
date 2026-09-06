'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  TrendingUp, 
  PhoneOff, 
  Phone, 
  MessageSquare, 
  FileText, 
  CheckCircle, 
  XCircle,
  Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface CompanyRelationshipStatusProps {
  companyId: string
  currentStatus: string
}

const statusOptions = [
  { value: 'in_pipeline', label: 'In Pipeline', icon: TrendingUp, color: 'bg-orange-100 text-orange-700', description: 'In sales pipeline (Admin only)', adminOnly: true },
  { value: 'not_contacted', label: 'Not Contacted', icon: PhoneOff, color: 'bg-gray-100 text-gray-600', description: 'No outreach made yet' },
  { value: 'cold_outreached', label: 'Cold Outreach', icon: Phone, color: 'bg-blue-100 text-blue-700', description: 'Initial contact attempted' },
  { value: 'warm_lead', label: 'Warm Lead', icon: TrendingUp, color: 'bg-amber-100 text-amber-700', description: 'Showing interest' },
  { value: 'in_conversation', label: 'In Conversation', icon: MessageSquare, color: 'bg-purple-100 text-purple-700', description: 'Active discussions' },
  { value: 'proposal_sent', label: 'Proposal Sent', icon: FileText, color: 'bg-cyan-100 text-cyan-700', description: 'Awaiting decision' },
  { value: 'contract_signed', label: 'Contract Signed', icon: CheckCircle, color: 'bg-emerald-100 text-emerald-700', description: 'Deal closed' },
  { value: 'active_client', label: 'Active Client', icon: CheckCircle, color: 'bg-green-100 text-green-800', description: 'Actively working together' },
  { value: 'churned', label: 'Churned', icon: XCircle, color: 'bg-red-100 text-red-700', description: 'Previously active, now inactive' },
  { value: 'lost', label: 'Lost', icon: XCircle, color: 'bg-gray-200 text-gray-600', description: 'Did not convert' },
]

export { statusOptions }

export function CompanyRelationshipStatus({ companyId, currentStatus }: CompanyRelationshipStatusProps) {
  const [status, setStatus] = useState(currentStatus)
  const [isUpdating, setIsUpdating] = useState(false)
  const supabase = createClient()

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true)
    setStatus(newStatus)

    const { error } = await supabase
      .from('companies')
      .update({ relationship_status: newStatus })
      .eq('id', companyId)

    if (error) {
      console.error('Failed to update relationship status:', error)
      setStatus(currentStatus) // Revert on error
    }

    setIsUpdating(false)
  }

  const currentOption = statusOptions.find(s => s.value === status) || statusOptions[0]
  const Icon = currentOption.icon

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Sales Relationship Status
            </CardTitle>
            <CardDescription className="text-xs">
              Track your sales pipeline progress with this company (Admin only)
            </CardDescription>
          </div>
          {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Select value={status} onValueChange={handleStatusChange} disabled={isUpdating}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => {
                const StatusIcon = option.icon
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <StatusIcon className="h-4 w-4" />
                      {option.label}
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={currentOption.color}>
                <Icon className="h-3 w-3 mr-1" />
                {currentOption.label}
              </Badge>
              <span className="text-sm text-muted-foreground">{currentOption.description}</span>
            </div>
          </div>
        </div>

        {/* Visual Pipeline */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            {statusOptions.slice(0, 8).map((option, index) => {
              const isActive = statusOptions.findIndex(s => s.value === status) >= index
              const isCurrent = option.value === status
              return (
                <div 
                  key={option.value} 
                  className="flex flex-col items-center flex-1"
                >
                  <div 
                    className={`w-full h-1.5 ${
                      index === 0 ? 'rounded-l-full' : ''
                    } ${
                      index === 7 ? 'rounded-r-full' : ''
                    } ${
                      isActive 
                        ? isCurrent 
                          ? 'bg-primary' 
                          : 'bg-primary/60' 
                        : 'bg-muted'
                    }`}
                  />
                  <span className={`text-xs mt-1 ${isCurrent ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                    {index === 0 ? 'Pipeline' : index === 7 ? 'Client' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
