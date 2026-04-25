'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft } from 'lucide-react'
import { PROSPECT_OUTREACH_STATUSES, PROSPECT_ASSESSMENTS, TALENT_TYPES } from '@/lib/types'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditTalentPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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

  useEffect(() => {
    async function loadTalent() {
      const { data, error } = await supabase
        .from('prospect_talents')
        .select('*')
        .eq('id', id)
        .single()

      if (data) {
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
    }
    loadTalent()
  }, [id, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    const skillsArray = formData.skills
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)

    const { error } = await supabase
      .from('prospect_talents')
      .update({
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
      })
      .eq('id', id)

    if (!error) {
      router.push(`/talents/${id}`)
    } else {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-6">Loading...</div>
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
                  value={formData.talent_type}
                  onValueChange={(v) => setFormData({ ...formData, talent_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
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
                  value={formData.outreach_status}
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
                  value={formData.assessment}
                  onValueChange={(v) => setFormData({ ...formData, assessment: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select assessment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
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
                {isSaving ? 'Saving...' : 'Save Changes'}
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
