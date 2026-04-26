'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import { PROSPECT_OUTREACH_STATUSES, PROSPECT_ASSESSMENTS, RECRUITER_TYPES } from '@/lib/types'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditRecruiterPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    linkedin_url: '',
    company: '',
    title: '',
    location: '',
    recruiter_type: '',
    overview: '',
    why_good_fit: '',
    outreach_status: 'prospect',
    assessment: '',
    source: '',
    notes: '',
  })

  const loadRecruiter = useCallback(async () => {
    const supabase = createClient()
    setError(null)
    
    const { data, error: fetchError } = await supabase
      .from('prospect_recruiters')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.log('[v0] Error loading recruiter:', fetchError)
      setError('Failed to load recruiter data')
      setIsLoading(false)
      return
    }

    if (data) {
      console.log('[v0] Loaded recruiter data:', data)
      setFormData({
        name: data.name || '',
        email: data.email || '',
        linkedin_url: data.linkedin_url || '',
        company: data.company || '',
        title: data.title || '',
        location: data.location || '',
        recruiter_type: data.recruiter_type || '',
        overview: data.overview || '',
        why_good_fit: data.why_good_fit || '',
        outreach_status: data.outreach_status || 'prospect',
        assessment: data.assessment || '',
        source: data.source || '',
        notes: data.notes || '',
      })
    }
    setIsLoading(false)
  }, [id])

  useEffect(() => {
    loadRecruiter()
  }, [loadRecruiter])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    const supabase = createClient()

    // Build update payload, converting empty strings to null
    const updatePayload = {
      name: formData.name,
      email: formData.email || null,
      linkedin_url: formData.linkedin_url || null,
      company: formData.company || null,
      title: formData.title || null,
      location: formData.location || null,
      recruiter_type: formData.recruiter_type || null,
      overview: formData.overview || null,
      why_good_fit: formData.why_good_fit || null,
      outreach_status: formData.outreach_status,
      assessment: formData.assessment || null,
      source: formData.source || null,
      notes: formData.notes || null,
      updated_at: new Date().toISOString(),
    }

    console.log('[v0] Updating recruiter with:', updatePayload)

    const { error: updateError } = await supabase
      .from('prospect_recruiters')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      console.log('[v0] Update error:', updateError)
      setError(`Failed to save changes: ${updateError.message}`)
      setIsSaving(false)
      return
    }

    console.log('[v0] Update successful, redirecting...')
    router.push(`/recruiters/${id}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div className="flex items-center gap-4">
        <Link href={`/recruiters/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit Recruiter</h1>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recruiter Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name *</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">LinkedIn URL</label>
                <Input
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company</label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Location</label>
                <Input
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={formData.recruiter_type || '_none'}
                  onValueChange={(v) => setFormData({ ...formData, recruiter_type: v === '_none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {Object.entries(RECRUITER_TYPES).map(([value, config]) => (
                      <SelectItem key={value} value={value}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Source</label>
                <Input
                  value={formData.source}
                  onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                  placeholder="e.g., LinkedIn, Referral"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={formData.outreach_status || 'prospect'}
                  onValueChange={(v) => setFormData({ ...formData, outreach_status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROSPECT_OUTREACH_STATUSES).map(([value, config]) => (
                      <SelectItem key={value} value={value}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Assessment</label>
                <Select
                  value={formData.assessment || '_none'}
                  onValueChange={(v) => setFormData({ ...formData, assessment: v === '_none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assessment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {Object.entries(PROSPECT_ASSESSMENTS).map(([value, config]) => (
                      <SelectItem key={value} value={value}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Overview</label>
              <Textarea
                value={formData.overview}
                onChange={(e) => setFormData({ ...formData, overview: e.target.value })}
                rows={3}
                placeholder="Brief overview of the recruiter"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Why a Good Fit for Refery</label>
              <Textarea
                value={formData.why_good_fit}
                onChange={(e) => setFormData({ ...formData, why_good_fit: e.target.value })}
                rows={3}
                placeholder="What makes this recruiter a good fit"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Notes</label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button type="submit" disabled={isSaving || !formData.name}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
              <Link href={`/recruiters/${id}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
