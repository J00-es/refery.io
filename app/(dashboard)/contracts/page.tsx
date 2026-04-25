"use client"

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FileText, Plus, Copy, Check, Clock, X, Building2, Download, Eye, Globe, Monitor } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import Link from 'next/link'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Company {
  id: string
  name: string
}

interface CompanyAgreement {
  id: string
  company_id: string
  token: string
  signer_name: string
  signer_title: string | null
  signer_email: string
  status: 'pending' | 'signed' | 'expired' | 'revoked'
  agreement_type: string
  agreement_version: string
  signed_at: string | null
  signed_ip_address: string | null
  signed_user_agent: string | null
  signed_agreement_hash: string | null
  pdf_url: string | null
  email_sent_at: string | null
  expires_at: string | null
  created_at: string
  companies?: { name: string }
}

interface AgreementAcceptance {
  id: string
  user_email: string
  user_name: string
  company_name: string
  company_id: string
  ip_address: string | null
  user_agent: string | null
  agreement_version: string
  agreement_hash: string | null
  agreement_type: string | null
  accepted_at: string
  pdf_url: string | null
}

// Agreement sections for viewing signed agreements
const AGREEMENT_SECTIONS = [
  { number: 1, title: "How It Works", content: "Refery connects your company (\"Client\") with independent recruiters and talent scouts (\"Partners\") who source candidates for your open roles. Submit roles through the platform. When you hire a candidate introduced through Refery, a placement fee applies. This agreement covers all roles you submit — now and in the future. No new agreement is needed for additional roles." },
  { number: 2, title: "Candidate Introduction", content: "A candidate is considered \"Introduced\" when Refery or a Partner shares their profile, resume, or identifying details with you. An introduction remains valid for twelve (12) months. If you hire an Introduced Candidate within this window — regardless of role, department, method, or whether they also applied directly — the placement fee applies." },
  { number: 3, title: "Placement Fee", content: "The placement fee is 10% of the hired candidate's first-year annual base salary. Bonuses, equity, commissions, and variable compensation are excluded from the calculation." },
  { number: 4, title: "Payment", content: "The placement fee is due within thirty (30) calendar days of the candidate's start date. If not paid within this period, a late fee of 1.5% per month accrues on the unpaid balance until paid in full. Refery may suspend services for balances overdue by more than 60 days." },
  { number: 5, title: "90-Day Guarantee", content: "If a placed candidate leaves or is terminated for cause within 90 days of starting, Refery refunds 100% of the placement fee. Notify Refery within 7 business days of departure. This guarantee does not apply if: (a) the role was materially changed from the original listing; (b) compensation or conditions differ from what was described; or (c) the departure resulted from layoffs or restructuring." },
  { number: 6, title: "Anti-Circumvention", content: "You agree not to hire any Introduced Candidate through channels that bypass Refery — including direct contact, other agencies, or contractor arrangements. If this occurs, the full placement fee remains due." },
  { number: 7, title: "Confidentiality", content: "All candidate information is confidential. Use it only to evaluate candidates for employment. Do not share candidate details with third parties without Refery's written consent." },
  { number: 8, title: "Liability", content: "Refery's total liability is capped at fees paid in the prior 12 months. Refery is not liable for indirect or consequential damages and does not guarantee any specific placement outcome." },
  { number: 9, title: "Term & Termination", content: "This agreement stays in effect until either party gives 30 days' written notice. Termination does not cancel: fees already owed, the 12-month introduction window for candidates already introduced, or active guarantee periods." },
  { number: 10, title: "General", content: "Governed by Delaware law. Disputes resolved by binding arbitration (AAA rules, conducted remotely). Refery may update terms with 30 days' notice — continued platform use after notice constitutes acceptance. This is the entire agreement between the parties." }
]

export default function ContractsPage() {
  const supabase = createClient()
  const [companyAgreements, setCompanyAgreements] = useState<CompanyAgreement[]>([])
  const [acceptances, setAcceptances] = useState<AgreementAcceptance[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [viewAgreement, setViewAgreement] = useState<CompanyAgreement | AgreementAcceptance | null>(null)
  const [viewType, setViewType] = useState<'company' | 'recruiter'>('company')
  
  // Form state
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [signerName, setSignerName] = useState('')
  const [signerTitle, setSignerTitle] = useState('')
  const [signerEmail, setSignerEmail] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    
    const [agreementsRes, acceptancesRes, companiesRes] = await Promise.all([
      supabase
        .from('company_agreements')
        .select('*, companies(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('agreement_acceptances')
        .select('*')
        .order('accepted_at', { ascending: false }),
      supabase
        .from('companies')
        .select('id, name')
        .order('name')
    ])

    if (agreementsRes.data) setCompanyAgreements(agreementsRes.data)
    if (acceptancesRes.data) setAcceptances(acceptancesRes.data)
    if (companiesRes.data) setCompanies(companiesRes.data)
    
    setLoading(false)
  }

  async function createAgreement() {
    if (!selectedCompanyId || !signerName || !signerEmail) return
    setCreating(true)

    const { data: { user } } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('company_agreements')
      .insert({
        company_id: selectedCompanyId,
        signer_name: signerName,
        signer_title: signerTitle || null,
        signer_email: signerEmail,
        created_by: user?.id,
      })

    if (!error) {
      setCreateDialogOpen(false)
      setSelectedCompanyId('')
      setSignerName('')
      setSignerTitle('')
      setSignerEmail('')
      fetchData()
    }
    setCreating(false)
  }

  function copySigningLink(token: string) {
    const url = `${window.location.origin}/sign/${token}`
    navigator.clipboard.writeText(url)
    setCopiedId(token)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'signed':
        return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200"><Check className="h-3 w-3 mr-1" /> Signed</Badge>
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>
      case 'expired':
        return <Badge variant="outline" className="text-muted-foreground"><X className="h-3 w-3 mr-1" /> Expired</Badge>
      case 'revoked':
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" /> Revoked</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  function openViewDialog(agreement: CompanyAgreement | AgreementAcceptance, type: 'company' | 'recruiter') {
    setViewAgreement(agreement)
    setViewType(type)
  }

  const pendingCount = companyAgreements.filter(a => a.status === 'pending').length
  const signedCompanyCount = companyAgreements.filter(a => a.status === 'signed').length
  const signedRecruiterCount = acceptances.length
  const totalSigned = signedCompanyCount + signedRecruiterCount

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Contracts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage recruitment service agreements with companies and scouts
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Agreement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Agreement</DialogTitle>
              <DialogDescription>
                Generate a signing link to send to a hiring manager or company representative.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Company</FieldLabel>
                  <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>Signer Name</FieldLabel>
                  <Input
                    placeholder="John Smith"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Signer Title (Optional)</FieldLabel>
                  <Input
                    placeholder="VP of Engineering"
                    value={signerTitle}
                    onChange={(e) => setSignerTitle(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel>Signer Email</FieldLabel>
                  <Input
                    type="email"
                    placeholder="john@company.com"
                    value={signerEmail}
                    onChange={(e) => setSignerEmail(e.target.value)}
                  />
                </Field>
              </FieldGroup>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={createAgreement} 
                disabled={creating || !selectedCompanyId || !signerName || !signerEmail}
              >
                {creating ? 'Creating...' : 'Create Agreement'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{companyAgreements.length + acceptances.length}</div>
            <p className="text-xs text-muted-foreground">Total Agreements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-emerald-600">{totalSigned}</div>
            <p className="text-xs text-muted-foreground">Signed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{signedCompanyCount}</div>
            <p className="text-xs text-muted-foreground">Company Agreements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-purple-600">{signedRecruiterCount}</div>
            <p className="text-xs text-muted-foreground">Scout/Partner Agreements</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="company" className="space-y-4">
        <TabsList>
          <TabsTrigger value="company">Company Agreements ({companyAgreements.length})</TabsTrigger>
          <TabsTrigger value="recruiter">Scout/Partner Agreements ({acceptances.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recruitment Services Agreements</CardTitle>
              <CardDescription>
                Agreements sent to hiring managers and company representatives
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : companyAgreements.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium text-lg mb-2">No agreements yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first agreement to send to a company
                  </p>
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Agreement
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead>Signer</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                        <TableHead className="hidden sm:table-cell">Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyAgreements.map((agreement) => (
                        <TableRow key={agreement.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium">{agreement.companies?.name || 'Unknown'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{agreement.signer_name}</div>
                              <div className="text-xs text-muted-foreground">{agreement.signer_email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(agreement.status)}
                            {agreement.signed_at && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {format(new Date(agreement.signed_at), 'MMM d, yyyy HH:mm')}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs hidden lg:table-cell">
                            {agreement.signed_ip_address || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground hidden sm:table-cell">
                            {formatDistanceToNow(new Date(agreement.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {agreement.status === 'pending' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copySigningLink(agreement.token)}
                                >
                                  {copiedId === agreement.token ? (
                                    <><Check className="h-3 w-3 mr-1" /> Copied</>
                                  ) : (
                                    <><Copy className="h-3 w-3 mr-1" /> Copy Link</>
                                  )}
                                </Button>
                              )}
                              {agreement.status === 'signed' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openViewDialog(agreement, 'company')}
                                >
                                  <Eye className="h-3 w-3 mr-1" /> View
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recruiter">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scout/Partner Agreements</CardTitle>
              <CardDescription>
                Agreements accepted by recruiters and talent scouts on the platform
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : acceptances.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No recruiter acceptances yet
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recruiter</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead className="hidden sm:table-cell">Version</TableHead>
                        <TableHead className="hidden lg:table-cell">IP Address</TableHead>
                        <TableHead>Signed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acceptances.map((acceptance) => (
                        <TableRow key={acceptance.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{acceptance.user_name}</div>
                              <div className="text-xs text-muted-foreground">{acceptance.user_email}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link href={`/companies/${acceptance.company_id}`} className="hover:underline text-primary">
                              {acceptance.company_name}
                            </Link>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <Badge variant="outline">v{acceptance.agreement_version}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-xs hidden lg:table-cell">
                            {acceptance.ip_address || '-'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(acceptance.accepted_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openViewDialog(acceptance, 'recruiter')}
                            >
                              <Eye className="h-3 w-3 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* View Agreement Dialog */}
      <Dialog open={!!viewAgreement} onOpenChange={(open) => !open && setViewAgreement(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {viewType === 'company' ? 'Recruitment Services Agreement' : 'Scout/Partner Agreement'}
            </DialogTitle>
            <DialogDescription>
              Signed agreement details and full text
            </DialogDescription>
          </DialogHeader>
          
          {viewAgreement && (
            <div className="flex-1 overflow-hidden flex flex-col gap-4">
              {/* Signing Details */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block">Signed By</span>
                    <span className="font-medium">
                      {viewType === 'company' 
                        ? (viewAgreement as CompanyAgreement).signer_name
                        : (viewAgreement as AgreementAcceptance).user_name}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Email</span>
                    <span className="font-medium">
                      {viewType === 'company' 
                        ? (viewAgreement as CompanyAgreement).signer_email
                        : (viewAgreement as AgreementAcceptance).user_email}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Version</span>
                    <Badge variant="outline">
                      v{viewType === 'company' 
                        ? (viewAgreement as CompanyAgreement).agreement_version
                        : (viewAgreement as AgreementAcceptance).agreement_version}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Signed At</span>
                    <span className="font-medium">
                      {format(new Date(
                        viewType === 'company' 
                          ? (viewAgreement as CompanyAgreement).signed_at!
                          : (viewAgreement as AgreementAcceptance).accepted_at
                      ), 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">IP Address:</span>
                    <span className="font-mono text-xs">
                      {viewType === 'company' 
                        ? (viewAgreement as CompanyAgreement).signed_ip_address || 'Not recorded'
                        : (viewAgreement as AgreementAcceptance).ip_address || 'Not recorded'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Hash:</span>
                    <span className="font-mono text-xs truncate">
                      {viewType === 'company' 
                        ? (viewAgreement as CompanyAgreement).signed_agreement_hash?.slice(0, 16) || 'N/A'
                        : (viewAgreement as AgreementAcceptance).agreement_hash?.slice(0, 16) || 'N/A'}...
                    </span>
                  </div>
                </div>
              </div>

              {/* Agreement Text */}
              <ScrollArea className="flex-1 border rounded-lg">
                <div className="p-6 space-y-6">
                  <h3 className="font-semibold text-lg">Recruitment Services Agreement</h3>
                  {AGREEMENT_SECTIONS.map((section) => (
                    <div key={section.number} className="flex gap-4">
                      <div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm font-semibold">
                        {section.number}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm mb-1">
                          Section {section.number} — {section.title}
                        </h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {section.content}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewAgreement(null)}>
              Close
            </Button>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
