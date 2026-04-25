'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { Candidate } from '@/lib/types'

export default function EditCandidatePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [location, setLocation] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [remotePreference, setRemotePreference] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [skills, setSkills] = useState('')
  const [status, setStatus] = useState<Candidate['status']>('new')

  useEffect(() => {
    async function fetchCandidate() {
      const { data, error } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !data) {
        setError('Failed to load candidate')
        setLoading(false)
        return
      }

      const candidate = data as Candidate
      setName(candidate.name)
      setEmail(candidate.email || '')
      setPhone(candidate.phone || '')
      setLinkedinUrl(candidate.linkedin_url || '')
      setLocation(candidate.location || '')
      setExperienceYears(candidate.experience_years?.toString() || '')
      setRemotePreference(candidate.remote_preference || '')
      setSalaryMin(candidate.salary_expectation_min?.toString() || '')
      setSalaryMax(candidate.salary_expectation_max?.toString() || '')
      setSkills(candidate.skills?.join(', ') || '')
      setStatus(candidate.status)
      setLoading(false)
    }

    fetchCandidate()
  }, [id, supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const updateData: Partial<Candidate> = {
      name,
      email: email || null,
      phone: phone || null,
      linkedin_url: linkedinUrl || null,
      location: location || null,
      experience_years: experienceYears ? parseInt(experienceYears) : null,
      remote_preference: remotePreference || null,
      salary_expectation_min: salaryMin ? parseInt(salaryMin) : null,
      salary_expectation_max: salaryMax ? parseInt(salaryMax) : null,
      skills: skills ? skills.split(',').map(s => s.trim()).filter(Boolean) : null,
      status,
    }

    const { error } = await supabase
      .from('candidates')
      .update(updateData)
      .eq('id', id)

    if (error) {
      setError('Failed to update candidate')
      setSaving(false)
      return
    }

    router.push(`/candidates/${id}`)
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <Link href={`/candidates/${id}`} className="w-fit">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight text-foreground">Edit Candidate</h1>
          <p className="text-sm text-muted-foreground">Update candidate information</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 sm:p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-base sm:text-lg">Basic Information</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Core candidate details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                <Input
                  id="linkedinUrl"
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  placeholder="City, State/Country"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Candidate['status'])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewing">Reviewing</SelectItem>
                    <SelectItem value="shortlisted">Shortlisted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="hired">Hired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 sm:px-6">
              <CardTitle className="text-base sm:text-lg">Professional Details</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Experience and preferences</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
              <div className="space-y-2">
                <Label htmlFor="experienceYears">Years of Experience</Label>
                <Input
                  id="experienceYears"
                  type="number"
                  min="0"
                  value={experienceYears}
                  onChange={(e) => setExperienceYears(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remotePreference">Remote Preference</Label>
                <Select value={remotePreference} onValueChange={setRemotePreference}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote Only</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                    <SelectItem value="flexible">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="salaryMin">Salary Min ($)</Label>
                  <Input
                    id="salaryMin"
                    type="number"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salaryMax">Salary Max ($)</Label>
                  <Input
                    id="salaryMax"
                    type="number"
                    value={salaryMax}
                    onChange={(e) => setSalaryMax(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="skills">Skills (comma-separated)</Label>
                <Textarea
                  id="skills"
                  placeholder="JavaScript, React, Node.js, ..."
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 mt-6">
          <Link href={`/candidates/${id}`} className="sm:order-1">
            <Button type="button" variant="outline" className="w-full sm:w-auto">Cancel</Button>
          </Link>
          <Button type="submit" disabled={saving} className="w-full sm:w-auto sm:order-2">
            {saving && <Spinner className="mr-2 h-4 w-4" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  )
}
