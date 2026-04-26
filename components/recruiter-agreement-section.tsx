'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { 
  FileSignature, 
  Copy, 
  Check, 
  Send, 
  Eye, 
  Clock, 
  Shield,
  AlertCircle,
  ExternalLink,
  Ban
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { 
  AgreementType, 
  AgreementLink, 
  AgreementSignature,
  AGREEMENT_STATUS_LABELS, 
  AGREEMENT_TYPE_LABELS,
  getAgreementText 
} from '@/lib/agreements'
import { AgreementContent } from '@/components/agreement-content'

interface RecruiterAgreementSectionProps {
  recruiterId: string
  recruiterName: string
  recruiterEmail: string
}

export function RecruiterAgreementSection({ 
  recruiterId, 
  recruiterName, 
  recruiterEmail 
}: RecruiterAgreementSectionProps) {
  const supabase = createClient()
  const [links, setLinks] = useState<AgreementLink[]>([])
  const [signatures, setSignatures] = useState<AgreementSignature[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedType, setSelectedType] = useState<AgreementType>('scout')
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const [viewingAgreement, setViewingAgreement] = useState<AgreementLink | null>(null)
  const [viewingSignature, setViewingSignature] = useState<AgreementSignature | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [linksRes, sigsRes] = await Promise.all([
        fetch(`/api/agreements/links?recruiter_id=${recruiterId}`),
        fetch(`/api/agreements/signatures?recruiter_id=${recruiterId}`)
      ])
      
      if (linksRes.ok) {
        const linksData = await linksRes.json()
        setLinks(linksData)
      }
      
      if (sigsRes.ok) {
        const sigsData = await sigsRes.json()
        setSignatures(sigsData)
      }
    } catch (error) {
      console.error('Failed to fetch agreement data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recruiterId])

  const handleCreateLink = async () => {
    setCreating(true)
    setActionError(null)
    try {
      const response = await fetch('/api/agreements/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recruiter_id: recruiterId,
          agreement_type: selectedType,
        }),
      })

      if (response.ok) {
        await fetchData()
      } else {
        const payload = await response.json().catch(() => null)
        const message =
          payload?.error ||
          `Failed to create agreement link (${response.status})`
        console.error('[recruiter-agreement] create failed:', message)
        setActionError(message)
      }
    } catch (error) {
      console.error('[recruiter-agreement] create error:', error)
      setActionError(
        error instanceof Error ? error.message : 'Failed to create agreement link',
      )
    } finally {
      setCreating(false)
    }
  }

  const handleCopyLink = (link: AgreementLink) => {
    const url = `${window.location.origin}/sign/agreement/${link.token}`
    navigator.clipboard.writeText(url)
    setCopiedLinkId(link.id)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  const handleRevokeLink = async (linkId: string) => {
    setActionError(null)
    try {
      const response = await fetch(`/api/agreements/links/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'revoked' }),
      })

      if (response.ok) {
        await fetchData()
      } else {
        const payload = await response.json().catch(() => null)
        setActionError(
          payload?.error || `Failed to revoke link (${response.status})`,
        )
      }
    } catch (error) {
      console.error('[recruiter-agreement] revoke error:', error)
      setActionError(
        error instanceof Error ? error.message : 'Failed to revoke link',
      )
    }
  }

  const hasSignedAgreement = signatures.length > 0
  const latestSignature = signatures[0]
  const pendingLinks = links.filter(l => ['sent', 'viewed'].includes(l.status))

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Agreements
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner className="h-6 w-6" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            Agreements
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Agreement Status */}
          {hasSignedAgreement ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">Agreement Active</span>
              </div>
              <p className="text-xs text-emerald-700 mb-2">
                {AGREEMENT_TYPE_LABELS[latestSignature.agreement_type as AgreementType]} v{latestSignature.agreement_version}
              </p>
              <p className="text-xs text-emerald-600">
                Signed {formatDistanceToNow(new Date(latestSignature.signed_at), { addSuffix: true })}
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2 h-7 text-xs text-emerald-700 hover:text-emerald-800"
                onClick={() => setViewingSignature(latestSignature)}
              >
                <Eye className="h-3 w-3 mr-1" />
                View Details
              </Button>
            </div>
          ) : pendingLinks.length > 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">Agreement Pending</span>
              </div>
              <p className="text-xs text-amber-700">
                Signing link sent - awaiting signature
              </p>
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700">No Agreement</span>
              </div>
              <p className="text-xs text-slate-600">
                Send an agreement link to get started
              </p>
            </div>
          )}

          {/* Create New Link Section */}
          {!hasSignedAgreement && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <Select 
                  value={selectedType} 
                  onValueChange={(v) => setSelectedType(v as AgreementType)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scout">Scout/Partner</SelectItem>
                    <SelectItem value="recruiter">Recruiter Partner</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleCreateLink} 
                  disabled={creating}
                  size="sm"
                >
                  {creating ? (
                    <Spinner className="h-4 w-4" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Create
                    </>
                  )}
                </Button>
              </div>
              {actionError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1">{actionError}</span>
                </div>
              )}
            </div>
          )}

          {/* Links History */}
          {links.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Link History</p>
              <div className="space-y-2">
                {links.slice(0, 5).map((link) => {
                  const statusConfig = AGREEMENT_STATUS_LABELS[link.status]
                  return (
                    <div 
                      key={link.id} 
                      className="flex items-center justify-between p-2 bg-muted/30 rounded text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={`text-[10px] ${statusConfig.color}`}>
                          {statusConfig.label}
                        </Badge>
                        <span className="text-muted-foreground">
                          {link.agreement_type === 'scout' ? 'Scout' : 'Recruiter'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {['sent', 'viewed'].includes(link.status) && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6"
                              onClick={() => handleCopyLink(link)}
                            >
                              {copiedLinkId === link.id ? (
                                <Check className="h-3 w-3 text-emerald-600" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-red-500 hover:text-red-600"
                              onClick={() => handleRevokeLink(link.id)}
                            >
                              <Ban className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6"
                          onClick={() => setViewingAgreement(link)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* All Signatures */}
          {signatures.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">Signed Agreements</p>
              <div className="space-y-2">
                {signatures.map((sig) => (
                  <div 
                    key={sig.id}
                    className="flex items-center justify-between p-2 bg-emerald-50/50 rounded text-xs cursor-pointer hover:bg-emerald-50"
                    onClick={() => setViewingSignature(sig)}
                  >
                    <div>
                      <span className="font-medium">{AGREEMENT_TYPE_LABELS[sig.agreement_type as AgreementType]}</span>
                      <span className="text-muted-foreground ml-2">v{sig.agreement_version}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {format(new Date(sig.signed_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreement Details Dialog */}
      <Dialog open={!!viewingAgreement} onOpenChange={() => setViewingAgreement(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Agreement Link Details</DialogTitle>
            <DialogDescription>
              {viewingAgreement && AGREEMENT_TYPE_LABELS[viewingAgreement.agreement_type as AgreementType]} - 
              v{viewingAgreement?.agreement_version}
            </DialogDescription>
          </DialogHeader>
          {viewingAgreement && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge className={AGREEMENT_STATUS_LABELS[viewingAgreement.status].color}>
                    {AGREEMENT_STATUS_LABELS[viewingAgreement.status].label}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{format(new Date(viewingAgreement.sent_at), 'PPp')}</p>
                </div>
                {viewingAgreement.viewed_at && (
                  <div>
                    <p className="text-muted-foreground">Viewed</p>
                    <p>{format(new Date(viewingAgreement.viewed_at), 'PPp')}</p>
                  </div>
                )}
                {viewingAgreement.signed_at && (
                  <div>
                    <p className="text-muted-foreground">Signed</p>
                    <p>{format(new Date(viewingAgreement.signed_at), 'PPp')}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Expires</p>
                  <p>{format(new Date(viewingAgreement.expires_at), 'PPp')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hash</p>
                  <code className="text-xs bg-muted px-1 rounded">{viewingAgreement.agreement_hash.slice(0, 16)}...</code>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-muted-foreground mb-2">Agreement Content</p>
                <ScrollArea className="h-[420px] border rounded-lg" style={{ background: '#F8F8F3' }}>
                  <div className="px-6 py-6">
                    <AgreementContent
                      content={viewingAgreement.agreement_content}
                      density="compact"
                      showEyebrow={false}
                    />
                  </div>
                </ScrollArea>
              </div>
            </div>
          )}
          <DialogFooter>
            {viewingAgreement && ['sent', 'viewed'].includes(viewingAgreement.status) && (
              <Button variant="outline" onClick={() => handleCopyLink(viewingAgreement)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Link
              </Button>
            )}
            <Button variant="secondary" onClick={() => setViewingAgreement(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Details Dialog */}
      <Dialog open={!!viewingSignature} onOpenChange={() => setViewingSignature(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Signature Record</DialogTitle>
            <DialogDescription>
              Legally binding electronic signature
            </DialogDescription>
          </DialogHeader>
          {viewingSignature && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium text-emerald-800">Valid Signature</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Signer Name</span>
                    <span className="font-medium">{viewingSignature.signer_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Signer Email</span>
                    <span className="font-medium">{viewingSignature.signer_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Agreement Type</span>
                    <span className="font-medium">{AGREEMENT_TYPE_LABELS[viewingSignature.agreement_type as AgreementType]}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Version</span>
                    <span className="font-medium">v{viewingSignature.agreement_version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-700">Signed At</span>
                    <span className="font-medium">{format(new Date(viewingSignature.signed_at), 'PPpp')}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <p className="font-medium">Technical Details</p>
                <div className="p-3 bg-muted rounded-lg space-y-2 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Signature ID</span>
                    <span>{viewingSignature.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IP Address</span>
                    <span>{viewingSignature.ip_address || 'Not recorded'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Agreement Hash</span>
                    <span className="truncate max-w-[200px]">{viewingSignature.agreement_hash}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Method</span>
                    <span>{viewingSignature.acceptance_method}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setViewingSignature(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
