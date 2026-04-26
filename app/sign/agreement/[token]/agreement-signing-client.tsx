'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { 
  FileSignature, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Shield, 
  FileText,
  User,
  Mail,
  Calendar,
  Hash
} from 'lucide-react'
import { format } from 'date-fns'
import { AGREEMENT_TYPE_LABELS } from '@/lib/agreements'
import { AgreementContent } from '@/components/agreement-content'

interface AgreementData {
  id: string
  recruiter_name: string
  recruiter_email: string
  agreement_type: 'scout' | 'recruiter'
  agreement_version: string
  agreement_content: string
  status: string
  expires_at: string
}

interface SigningResult {
  success: boolean
  signature_id: string
  signed_at: string
  agreement_hash: string
}

export function AgreementSigningClient({ token }: { token: string }) {
  const [agreement, setAgreement] = useState<AgreementData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [signatureResult, setSignatureResult] = useState<SigningResult | null>(null)
  
  // Form state
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [readAgreement, setReadAgreement] = useState(false)

  useEffect(() => {
    async function fetchAgreement() {
      try {
        const response = await fetch(`/api/agreements/public/${token}`)
        const data = await response.json()

        if (!response.ok) {
          setError(data.error || 'Failed to load agreement')
          if (data.signed_at) {
            setSigned(true)
          }
          return
        }

        setAgreement(data)
        setSignerName(data.recruiter_name)
        setSignerEmail(data.recruiter_email)
      } catch (err) {
        setError('Failed to load agreement')
      } finally {
        setLoading(false)
      }
    }

    fetchAgreement()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const handleSign = async () => {
    if (!accepted || !readAgreement || !signerName || !signerEmail) return

    setSigning(true)
    try {
      const response = await fetch(`/api/agreements/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signer_name: signerName,
          signer_email: signerEmail,
          accepted: true,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to sign agreement')
        return
      }

      setSignatureResult(data)
      setSigned(true)
    } catch (err) {
      setError('Failed to sign agreement')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Spinner className="h-8 w-8 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading agreement...</p>
        </div>
      </div>
    )
  }

  if (error && !signed) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Unable to Load Agreement</h2>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (signed) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">Agreement Signed Successfully</h2>
              <p className="text-muted-foreground mb-6">
                Thank you for signing the agreement. A confirmation email has been sent to your email address.
              </p>
              
              {signatureResult && (
                <div className="bg-slate-50 rounded-lg p-4 text-left space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Signed at:</span>
                    <span className="font-medium">{format(new Date(signatureResult.signed_at), 'PPpp')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Signature ID:</span>
                    <code className="text-xs bg-slate-200 px-2 py-0.5 rounded">{signatureResult.signature_id.slice(0, 8)}...</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Agreement hash:</span>
                    <code className="text-xs bg-slate-200 px-2 py-0.5 rounded">{signatureResult.agreement_hash.slice(0, 12)}...</code>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  You can now access the Refery platform. If you have any questions, contact us at{' '}
                  <a href="mailto:partners@refery.io" className="text-emerald-600 hover:underline">
                    partners@refery.io
                  </a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!agreement) return null

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <div className="text-center mb-8 md:mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-5">
            <FileSignature className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-serif font-normal tracking-tight text-foreground mb-3">
            Refery Partner Agreement
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
            Please review and sign the agreement below to become a Refery partner.
          </p>
        </div>

      {/* Agreement Info Card */}
      <Card className="mb-6 border-emerald-100 bg-gradient-to-b from-emerald-50/30 to-white">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg font-semibold text-foreground">
                {AGREEMENT_TYPE_LABELS[agreement.agreement_type]}
              </CardTitle>
              <CardDescription className="text-emerald-700/70">
                Version {agreement.agreement_version}
              </CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-slate-300 text-slate-600 gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Expires {format(new Date(agreement.expires_at), 'PPP')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-white/80 rounded-lg border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <User className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Prepared for</p>
                <p className="font-medium text-foreground">{agreement.recruiter_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <Mail className="h-4 w-4 text-slate-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                <p className="font-medium text-foreground">{agreement.recruiter_email}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agreement Content */}
      <Card className="mb-6 overflow-hidden">
        <CardHeader className="pb-3 bg-slate-50/50 border-b">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg">Agreement Terms</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px] md:h-[650px]">
            <div className="px-5 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 bg-white">
              <AgreementContent content={agreement.agreement_content} />
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Signing Form */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="bg-slate-50/50 border-b">
          <CardTitle className="text-lg font-semibold">Sign Agreement</CardTitle>
          <CardDescription>
            Please confirm your details and accept the terms to sign the agreement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Signer Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Enter your full legal name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="Enter your email address"
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-start gap-3">
              <Checkbox
                id="read"
                checked={readAgreement}
                onCheckedChange={(checked) => setReadAgreement(checked === true)}
              />
              <label htmlFor="read" className="text-sm leading-relaxed cursor-pointer">
                I have read and understand the entire agreement above, including all terms regarding compensation, 
                candidate protection, confidentiality, and non-circumvention.
              </label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="accept"
                checked={accepted}
                onCheckedChange={(checked) => setAccepted(checked === true)}
              />
              <label htmlFor="accept" className="text-sm leading-relaxed cursor-pointer">
                I agree to be legally bound by all terms and conditions set forth in this agreement. I understand 
                this is a binding contract and my electronic signature has the same legal effect as a handwritten signature.
              </label>
            </div>
          </div>

          {/* Legal Notice */}
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Shield className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Legal Notice</p>
              <p>
                By clicking &quot;Sign Agreement&quot;, you are creating a legally binding electronic signature. 
                Your IP address, browser information, and timestamp will be recorded as part of the signing record 
                for verification purposes.
              </p>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Sign Button */}
          <Button
            onClick={handleSign}
            disabled={!accepted || !readAgreement || !signerName || !signerEmail || signing}
            className="w-full h-12 text-base bg-emerald-600 hover:bg-emerald-700"
          >
            {signing ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Signing...
              </>
            ) : (
              <>
                <FileSignature className="mr-2 h-5 w-5" />
                Sign Agreement
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
