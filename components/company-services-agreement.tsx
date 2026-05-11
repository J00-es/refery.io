'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FileSignature, Copy, CheckCircle, ExternalLink, Plus, Loader2 } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'

interface ServicesLink {
  id: string
  token: string
  recipient_name: string
  recipient_email: string
  fee_percentage: number
  status: 'sent' | 'viewed' | 'signed' | 'revoked' | 'expired'
  sent_at: string
  viewed_at: string | null
  signed_at: string | null
  expires_at: string | null
}

interface Props {
  companyId: string
  companyName: string
  isAdmin: boolean
}

const STATUS_STYLES: Record<ServicesLink['status'], { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'bg-blue-100 text-blue-700' },
  viewed: { label: 'Viewed', cls: 'bg-amber-100 text-amber-700' },
  signed: { label: 'Signed', cls: 'bg-emerald-100 text-emerald-700' },
  revoked: { label: 'Revoked', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Expired', cls: 'bg-gray-100 text-gray-600' },
}

export function CompanyServicesAgreement({ companyId, companyName, isAdmin }: Props) {
  const supabase = createClient()
  const [links, setLinks] = useState<ServicesLink[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  // Modal form state
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [feePercent, setFeePercent] = useState<string>('20')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null)

  const refresh = async () => {
    const { data, error } = await supabase
      .from('client_agreement_links')
      .select(
        'id, token, recipient_name, recipient_email, fee_percentage, status, sent_at, viewed_at, signed_at, expires_at',
      )
      .eq('company_id', companyId)
      .order('sent_at', { ascending: false })

    if (!error && data) {
      setLinks(data as ServicesLink[])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!isAdmin) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, isAdmin])

  if (!isAdmin) return null

  const resetForm = () => {
    setRecipientName('')
    setRecipientEmail('')
    setFeePercent('20')
    setError(null)
    setGeneratedUrl(null)
    setCopiedUrl(false)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) resetForm()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const feeNum = Number(feePercent)
    if (!recipientName.trim() || !recipientEmail.trim()) {
      setError('Recipient name and email are required')
      return
    }
    if (!/\S+@\S+\.\S+/.test(recipientEmail.trim())) {
      setError('Enter a valid recipient email')
      return
    }
    if (!Number.isFinite(feeNum) || feeNum < 1 || feeNum > 50) {
      setError('Fee % must be between 1 and 50')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/agreements/client/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: companyId,
          recipient_name: recipientName.trim(),
          recipient_email: recipientEmail.trim(),
          fee_percent: feeNum,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to generate link')
        setSubmitting(false)
        return
      }
      setGeneratedUrl(data.sign_url)
      await refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  const copyUrl = async (url: string, rowId?: string) => {
    try {
      await navigator.clipboard.writeText(url)
      if (rowId) {
        setCopiedRowId(rowId)
        setTimeout(() => setCopiedRowId(null), 2000)
      } else {
        setCopiedUrl(true)
        setTimeout(() => setCopiedUrl(false), 2000)
      }
    } catch {
      // ignore
    }
  }

  const urlFor = (token: string) =>
    typeof window === 'undefined' ? `/sign/client-agreement/${token}` : `${window.location.origin}/sign/client-agreement/${token}`

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              Services Agreement
            </CardTitle>
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Generate Link
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-6 text-muted-foreground">Loading...</div>
          ) : links.length === 0 ? (
            <div className="text-center py-8">
              <FileSignature className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-1">
                No services agreement links yet for {companyName}.
              </p>
              <p className="text-xs text-muted-foreground">
                Generate a clickwrap link to send to the hiring manager.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {links.map((link) => {
                const meta = STATUS_STYLES[link.status]
                const dateLabel =
                  link.signed_at ?? link.viewed_at ?? link.sent_at
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between border rounded-lg p-3 gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className={`text-xs ${meta.cls}`}>
                          {meta.label}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          {link.recipient_name}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {Number(link.fee_percentage)}% fee
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {link.recipient_email}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {link.status === 'signed' && link.signed_at
                          ? `Signed ${formatDistanceToNow(new Date(link.signed_at))} ago`
                          : `Sent ${format(new Date(dateLabel), 'MMM d, yyyy')}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {link.status !== 'signed' && link.status !== 'revoked' && link.status !== 'expired' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyUrl(urlFor(link.token), link.id)}
                        >
                          {copiedRowId === link.id ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5 mr-1 text-green-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              Copy
                            </>
                          )}
                        </Button>
                      )}
                      <a
                        href={urlFor(link.token)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="ghost" size="icon">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Generate Services Agreement Link</DialogTitle>
            <DialogDescription>
              Creates a one-click, no-login signing link for {companyName}. The
              link expires in 30 days.
            </DialogDescription>
          </DialogHeader>

          {generatedUrl ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-emerald-50/50 border-emerald-200 p-3">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
                  <CheckCircle className="h-4 w-4" />
                  Link generated
                </div>
                <p className="text-xs text-emerald-700/80">
                  Send this URL to the hiring manager. They can sign with a single
                  click — no login required.
                </p>
              </div>
              <div>
                <Label className="text-xs">Signing URL</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={generatedUrl}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyUrl(generatedUrl)}
                  >
                    {copiedUrl ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Generate another
                </Button>
                <Button type="button" onClick={() => handleOpenChange(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="csa-name">Hiring manager full name</Label>
                <Input
                  id="csa-name"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="csa-email">Hiring manager email</Label>
                <Input
                  id="csa-email"
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="jane@company.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="csa-fee">Fee percentage</Label>
                <Input
                  id="csa-fee"
                  type="number"
                  value={feePercent}
                  onChange={(e) => setFeePercent(e.target.value)}
                  step={0.5}
                  min={1}
                  max={50}
                />
                <p className="text-xs text-muted-foreground">
                  Default is 20%. Override only for negotiated contracts.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Generate link
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
