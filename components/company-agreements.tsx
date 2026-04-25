'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileSignature, CheckCircle, Copy, ExternalLink, User, Globe } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

interface AgreementAcceptance {
  id: string
  user_id: string
  user_email: string
  user_name: string
  company_name: string
  company_id: string
  agreement_version: string
  acceptance_method: string
  accepted_at: string
  ip_address: string | null
}

interface CompanyAgreementsProps {
  companyId: string
  companyName: string
  isAdmin?: boolean
}

export function CompanyAgreements({ companyId, companyName, isAdmin = false }: CompanyAgreementsProps) {
  const supabase = createClient()
  const [acceptances, setAcceptances] = useState<AgreementAcceptance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Skip fetching if not admin
    if (!isAdmin) return
    
    const fetchAcceptances = async () => {
      const { data, error } = await supabase
        .from('agreement_acceptances')
        .select('*')
        .eq('company_id', companyId)
        .order('accepted_at', { ascending: false })

      if (!error && data) {
        setAcceptances(data)
      }
      setIsLoading(false)
    }
    
    fetchAcceptances()
  }, [companyId, isAdmin, supabase])
  
  // Only render for admins - AFTER all hooks
  if (!isAdmin) {
    return null
  }

  const copyAgreementLink = () => {
    const link = `${window.location.origin}/agreement/${companyId}`
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5" />
            Recruitment Agreements
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyAgreementLink}
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-1 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Link
                </>
              )}
            </Button>
            <a href={`/agreement/${companyId}`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                View
              </Button>
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-6 text-muted-foreground">Loading...</div>
        ) : acceptances.length === 0 ? (
          <div className="text-center py-6">
            <FileSignature className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No recruiters have signed the agreement for {companyName} yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Share the agreement link with recruiters to allow them to submit candidates.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-3">
              {acceptances.length} recruiter{acceptances.length !== 1 ? 's' : ''} signed the agreement
            </p>
            {acceptances.map((acceptance) => (
              <div key={acceptance.id} className="flex items-center justify-between border rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{acceptance.user_name}</p>
                    <p className="text-xs text-muted-foreground">{acceptance.user_email}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-xs mb-1">
                    v{acceptance.agreement_version}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(acceptance.accepted_at), 'MMM d, yyyy HH:mm')}
                  </p>
                  {acceptance.ip_address && (
                    <p className="text-xs text-muted-foreground font-mono flex items-center justify-end gap-1 mt-1">
                      <Globe className="h-3 w-3" />
                      {acceptance.ip_address}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
