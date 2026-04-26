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
import { PROSPECT_OUTREACH_STATUSES, PROSPECT_ASSESSMENTS, TALENT_TYPES } from '@/lib/types'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditTalentPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    linkedin_url: '',
    current_company: '',
    current_title: '',
    location: '',
    talent_type: '',
    skills: '',
    overview: '',
    outreach_status: 'prospect',
    assessment: '',
    source: '',
    notes: '',
  })

  const loadTalent = useCallback(async () => {
    const supabase = createClient()
    setError(null)
    
    const { data, error: fetchError } = await supabase
      .from('prospect_talents')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.log('[v0] Error loading talent:', fetchError)
      setError('Failed to load talent data')
      setIsLoading(false)
      return
    }

    if (data) {
      console.log('[v0] Loaded talent data:', data)
      setFormData({
        name: data.name || '',
        email: data.email || '',
        linkedin_url: data.linkedin_url || '',
        current_company: data.current_company || '',
        current_title: data.current_title || '',
        location: data.location || '',
        talent_type: data.talent_type || '',
        skills: (data.skills || []).join(', '),
        overview: data.overview || '',
        outreach_status: data.outreach_status || 'prospect',
        assessment: data.assessment || '',
        source: data.source || '',
        notes: data.notes || '',
      })
    }
    setIsLoading(false)
  }, [id])

  useEffect(() => {
    loadTalent()
  }, [loadTalent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    const supabase = createClient()

    const skillsArray = formData.skills
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    // Build update payload, converting empty strings to null
    const updatePayload = {
      name: formData.name,
      email: formData.email || null,
      linkedin_url: formData.linkedin_url || null,
      current_company: formData.current_company || null,
      current_title: formData.current_title || null,
      location: formData.location || null,
      talent_type: formData.talent_type || null,
      skills: skillsArray.length > 0 ? skillsArray : null,
      overview: formData.overview || null,
      outreach_status: formData.outreach_status,
      assessment: formData.assessment || null,
      source: formData.source || null,
      notes: formData.notes || null,
      updated_at: new Date().toISOString(),
    }

    console.log('[v0] Updating talent with:', updatePayload)

    const { error: updateError } = await supabase
      .from('prospect_talents')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) {
      console.log('[v0] Update error:', updateError)
      setError(`Failed to save changes: ${updateError.message}`)
      setIsSaving(false)
      return
    }

    console.log('[v0] Update successful, redirecting...')
    router.push(`/talents/${id}`)
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
        <Link href={`/talents/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Edit Talent</h1>
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
            <CardTitle className="text-base">Talent Information</CardTitle>
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
                <label className="text-sm font-medium">Current Company</label>
                <Input
                  value={formData.current_company}
                  onChange={(e) => setFormData({ ...formData, current_company: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Current Title</label>
                <Input
                  value={formData.current_title}
                  onChange={(e) => setFormData({ ...formData, current_title: e.target.value })}
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
                  value={formData.talent_type || '_none'}
                  onValueChange={(v) => setFormData({ ...formData, talent_type: v === '_none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">None</SelectItem>
                    {Object.entries(TALENT_TYPES).map(([value, config]) => (
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
              <label className="text-sm font-medium">Skills</label>
              <Input
                value={formData.skills}
                onChange={(e) => setFormData({ ...formData, skills: e.target.value })}
                placeholder="Comma-separated skills (e.g., React, TypeScript, Node.js)"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Overview</label>
              <Textarea
                value={formData.overview}
                onChange={(e) => setFormData({ ...formData, overview: e.target.value })}
                rows={3}
                placeholder="Brief overview of the talent"
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
              <Link href={`/talents/${id}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
