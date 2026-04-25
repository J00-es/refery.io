'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { ShieldAlert } from 'lucide-react'
import type { Job } from '@/lib/types'

export default function EditJobPage() {
  const router = useRouter()
  const params = useParams()
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [job, setJob] = useState<Job | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [skillsInput, setSkillsInput] = useState('')
  const [requirementsInput, setRequirementsInput] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [referralBonusType, setReferralBonusType] = useState<'usd' | 'percent'>('usd')
  const [referralBonusValue, setReferralBonusValue] = useState('')

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${params.id}`)
        if (!res.ok) throw new Error('Failed to fetch job')
        const data = await res.json()
        setJob(data.job)
        setCanEdit(data.canEdit ?? false)
        setSkillsInput(data.job.skills_required?.join(', ') || '')
        setRequirementsInput(data.job.requirements?.join('\n') || '')
        setTagsInput(data.job.tags?.join(', ') || '')
        setReferralBonusType(data.job.referral_bonus_type || 'usd')
        setReferralBonusValue(data.job.referral_bonus != null ? String(data.job.referral_bonus) : '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }
    fetchJob()
  }, [params.id])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const formData = new FormData(e.currentTarget)

    const skills = skillsInput.split(',').map(s => s.trim()).filter(Boolean)
    const requirements = requirementsInput.split('\n').map(r => r.trim()).filter(Boolean)
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)

    const jobData = {
      title: formData.get('title'),
      company_name: formData.get('company_name') || null,
      job_post_url: formData.get('job_post_url') || null,
      department: formData.get('department') || null,
      location: formData.get('location') || null,
      remote_policy: formData.get('remote_policy') || null,
      description: formData.get('description'),
      skills_required: skills.length > 0 ? skills : null,
      requirements: requirements.length > 0 ? requirements : null,
      experience_years_min: parseInt(formData.get('experience_min') as string) || 0,
      experience_years_max: parseInt(formData.get('experience_max') as string) || null,
      salary_min: parseInt(formData.get('salary_min') as string) || null,
      salary_max: parseInt(formData.get('salary_max') as string) || null,
      referral_bonus: parseFloat(referralBonusValue) || null,
  referral_bonus_type: referralBonusValue ? referralBonusType : null,
      company_stage: formData.get('company_stage') || null,
      tags: tags.length > 0 ? tags : null,
      hiring_manager_name: formData.get('hiring_manager_name') || null,
      hiring_manager_linkedin: formData.get('hiring_manager_linkedin') || null,
      hiring_manager_email: formData.get('hiring_manager_email') || null,
      recruiter_notes: formData.get('recruiter_notes') || null,
      visa_requirement: formData.get('visa_requirement') || null,
      status: formData.get('status') || 'open',
    }

    try {
      const res = await fetch(`/api/jobs/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update job')
      }

      router.push(`/jobs/${params.id}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Job not found</p>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          You don&apos;t have permission to edit this job. Only super admins, admins, or the assigned job owner can make changes.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Go Back
          </Button>
          <Button onClick={() => router.push(`/jobs/${params.id}`)}>
            View Job
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-0">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Edit Job</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Update the job listing details
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            Modify the job requirements and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input id="title" name="title" required defaultValue={job.title} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input id="company_name" name="company_name" defaultValue={job.company_name || ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_stage">Company Stage</Label>
                <Select name="company_stage" defaultValue={job.company_stage || ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select stage..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seed">Seed</SelectItem>
                    <SelectItem value="series-a">Series A</SelectItem>
                    <SelectItem value="series-b">Series B</SelectItem>
                    <SelectItem value="series-c">Series C</SelectItem>
                    <SelectItem value="series-d">Series D+</SelectItem>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="established">Established</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="job_post_url">Job Post URL</Label>
              <Input id="job_post_url" name="job_post_url" type="url" defaultValue={job.job_post_url || ''} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select name="department" defaultValue={job.department || ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Product">Product</SelectItem>
                    <SelectItem value="Design">Design</SelectItem>
                    <SelectItem value="Sales">Sales</SelectItem>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Customer Success">Customer Success</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                    <SelectItem value="Data">Data</SelectItem>
                    <SelectItem value="IT">IT</SelectItem>
                    <SelectItem value="Executive">Executive</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location (City, State/Country)</Label>
                <Input 
                  id="location" 
                  name="location" 
                  defaultValue={job.location || ''} 
                  placeholder="e.g., San Francisco, CA or London, UK"
                />
                <p className="text-xs text-muted-foreground">Format: City, State/Province or City, Country</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="remote_policy">Remote Policy</Label>
                <Select name="remote_policy" defaultValue={job.remote_policy || ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="onsite">On-site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="visa_requirement">Work Authorization</Label>
                <Select name="visa_requirement" defaultValue={job.visa_requirement || ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_restriction">No Restriction</SelectItem>
                    <SelectItem value="sponsorship_available">Sponsorship Available</SelectItem>
                    <SelectItem value="us_authorized">Must Be Authorized</SelectItem>
                    <SelectItem value="us_citizen_only">US Citizen / Green Card</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue={job.status}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Job Description *</Label>
              <Textarea
                id="description"
                name="description"
                required
                rows={5}
                defaultValue={job.description}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="skills">Required Skills</Label>
              <Input
                id="skills"
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                placeholder="e.g. React, TypeScript, Node.js (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">Separate skills with commas</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea
                id="requirements"
                value={requirementsInput}
                onChange={(e) => setRequirementsInput(e.target.value)}
                rows={4}
                placeholder="Enter each requirement on a new line..."
              />
              <p className="text-xs text-muted-foreground">One requirement per line</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="experience_min">Min Experience (years)</Label>
                <Input id="experience_min" name="experience_min" type="number" min="0" defaultValue={job.experience_years_min} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_max">Max Experience (years)</Label>
                <Input id="experience_max" name="experience_max" type="number" min="0" defaultValue={job.experience_years_max ?? ''} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="salary_min">Min Salary (USD)</Label>
                <Input id="salary_min" name="salary_min" type="number" min="0" defaultValue={job.salary_min ?? ''} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Max Salary (USD)</Label>
                <Input id="salary_max" name="salary_max" type="number" min="0" defaultValue={job.salary_max ?? ''} />
              </div>
                  <div className="space-y-2">
                    <Label>Referral Bonus</Label>
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setReferralBonusType('usd')}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${referralBonusType === 'usd' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                      >
                        $ Amount
                      </button>
                      <button
                        type="button"
                        onClick={() => setReferralBonusType('percent')}
                        className={`flex-1 px-3 py-2 text-sm font-medium transition-colors border-l border-border ${referralBonusType === 'percent' ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
                      >
                        % of Base Salary
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium pointer-events-none">
                        {referralBonusType === 'usd' ? '$' : '%'}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        max={referralBonusType === 'percent' ? 100 : undefined}
                        step={referralBonusType === 'percent' ? 0.1 : 1}
                        value={referralBonusValue}
                        onChange={(e) => setReferralBonusValue(e.target.value)}
                        placeholder={referralBonusType === 'usd' ? 'e.g. 5000' : 'e.g. 10'}
                        className="pl-7"
                      />
                    </div>
                    {referralBonusType === 'percent' && (
                      <p className="text-xs text-muted-foreground">Percentage of the candidate&apos;s first year base salary</p>
                    )}
                  </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. urgent, high-priority, referral (comma-separated)"
              />
              <p className="text-xs text-muted-foreground">Tags help you organize and filter jobs later</p>
            </div>

            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Hiring Manager / Recruiter Contact</CardTitle>
                <CardDescription>Optional contact information for this role</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="hiring_manager_name">Name</Label>
                    <Input id="hiring_manager_name" name="hiring_manager_name" defaultValue={job.hiring_manager_name || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hiring_manager_email">Email</Label>
                    <Input id="hiring_manager_email" name="hiring_manager_email" type="email" defaultValue={job.hiring_manager_email || ''} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hiring_manager_linkedin">LinkedIn URL</Label>
                  <Input id="hiring_manager_linkedin" name="hiring_manager_linkedin" type="url" defaultValue={job.hiring_manager_linkedin || ''} />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="recruiter_notes">Recruiter Notes</Label>
              <Textarea
                id="recruiter_notes"
                name="recruiter_notes"
                rows={4}
                defaultValue={job.recruiter_notes || ''}
                placeholder="Internal notes about this role, hiring process, or important details..."
              />
              <p className="text-xs text-muted-foreground">Private notes visible only to you</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
