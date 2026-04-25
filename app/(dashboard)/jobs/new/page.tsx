'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { LinkIcon, Sparkles } from 'lucide-react'

export default function NewJobPage() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState('')
  const [parseSuccess, setParseSuccess] = useState(false)
  
  // Form state for URL auto-fill
  const [jobUrl, setJobUrl] = useState('')
  const [title, setTitle] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyStage, setCompanyStage] = useState('')
  const [department, setDepartment] = useState('')
  const [location, setLocation] = useState('')
  const [remotePolicy, setRemotePolicy] = useState('')
  const [status, setStatus] = useState('open')
  const [description, setDescription] = useState('')
  const [skillsInput, setSkillsInput] = useState('')
  const [requirementsInput, setRequirementsInput] = useState('')
  const [experienceMin, setExperienceMin] = useState('0')
  const [experienceMax, setExperienceMax] = useState('')
  const [salaryMin, setSalaryMin] = useState('')
  const [salaryMax, setSalaryMax] = useState('')
  const [referralBonus, setReferralBonus] = useState('')
  const [referralBonusType, setReferralBonusType] = useState<'usd' | 'percent'>('usd')
  const [tagsInput, setTagsInput] = useState('')
  const [hiringManagerName, setHiringManagerName] = useState('')
  const [hiringManagerEmail, setHiringManagerEmail] = useState('')
  const [hiringManagerLinkedin, setHiringManagerLinkedin] = useState('')
  const [recruiterNotes, setRecruiterNotes] = useState('')
  const [visaRequirement, setVisaRequirement] = useState('')

  const handleParseUrl = async () => {
    if (!jobUrl) return
    
    setIsParsing(true)
    setError('')
    setParseSuccess(false)

    try {
      const res = await fetch('/api/jobs/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jobUrl }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to parse URL')
      }

      const { parsed_data } = await res.json()

      // Auto-fill form fields
      if (parsed_data.title) setTitle(parsed_data.title)
      if (parsed_data.company_name) setCompanyName(parsed_data.company_name)
      if (parsed_data.company_stage) setCompanyStage(parsed_data.company_stage)
      if (parsed_data.department) setDepartment(parsed_data.department)
      if (parsed_data.location) setLocation(parsed_data.location)
      if (parsed_data.remote_policy) setRemotePolicy(parsed_data.remote_policy)
      if (parsed_data.description) setDescription(parsed_data.description)
      if (parsed_data.skills_required) setSkillsInput(parsed_data.skills_required.join(', '))
      if (parsed_data.requirements) setRequirementsInput(parsed_data.requirements.join('\n'))
      if (parsed_data.experience_years_min !== undefined) setExperienceMin(String(parsed_data.experience_years_min))
      if (parsed_data.experience_years_max) setExperienceMax(String(parsed_data.experience_years_max))
      if (parsed_data.salary_min) setSalaryMin(String(parsed_data.salary_min))
      if (parsed_data.salary_max) setSalaryMax(String(parsed_data.salary_max))
      if (parsed_data.tags) setTagsInput(parsed_data.tags.join(', '))
      if (parsed_data.visa_requirement) setVisaRequirement(parsed_data.visa_requirement)
      if (parsed_data.referral_bonus) setReferralBonus(String(parsed_data.referral_bonus))
      if (parsed_data.hiring_manager_name) setHiringManagerName(parsed_data.hiring_manager_name)
      if (parsed_data.hiring_manager_email) setHiringManagerEmail(parsed_data.hiring_manager_email)

      setParseSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse job URL')
    } finally {
      setIsParsing(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')

    const skills = skillsInput.split(',').map(s => s.trim()).filter(Boolean)
    const requirements = requirementsInput.split('\n').map(r => r.trim()).filter(Boolean)
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)

    const jobData = {
      title,
      company_name: companyName || null,
      job_post_url: jobUrl || null,
      department: department || null,
      location: location || null,
      remote_policy: remotePolicy || null,
      description,
      skills_required: skills.length > 0 ? skills : null,
      requirements: requirements.length > 0 ? requirements : null,
      experience_years_min: parseInt(experienceMin) || 0,
      experience_years_max: parseInt(experienceMax) || null,
      salary_min: parseInt(salaryMin) || null,
      salary_max: parseInt(salaryMax) || null,
      referral_bonus: parseFloat(referralBonus) || null,
  referral_bonus_type: referralBonus ? referralBonusType : null,
      company_stage: companyStage || null,
      tags: tags.length > 0 ? tags : null,
      hiring_manager_name: hiringManagerName || null,
      hiring_manager_linkedin: hiringManagerLinkedin || null,
      hiring_manager_email: hiringManagerEmail || null,
      recruiter_notes: recruiterNotes || null,
      visa_requirement: visaRequirement || null,
      status,
    }

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create job')
      }

      router.push('/jobs')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Job</h1>
        <p className="text-muted-foreground">
          Add a new job listing for candidates to match against
        </p>
      </div>

      {/* URL Auto-Fill Card */}
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Auto-fill from Job URL
          </CardTitle>
          <CardDescription>
            Paste a job posting URL and we&apos;ll automatically extract the details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://jobs.lever.co/company/job-id or any job posting URL"
                className="pl-9"
              />
            </div>
            <Button 
              type="button" 
              onClick={handleParseUrl} 
              disabled={isParsing || !jobUrl}
              variant="secondary"
            >
              {isParsing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Parsing...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Auto-fill
                </>
              )}
            </Button>
          </div>
          {parseSuccess && (
            <p className="mt-2 text-sm text-green-600">
              Job details extracted successfully! Review and edit below.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
          <CardDescription>
            Enter the job requirements and preferences
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
              <Input 
                id="title" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required 
                placeholder="e.g. Senior Frontend Developer" 
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company_name">Company Name</Label>
                <Input 
                  id="company_name" 
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_stage">Company Stage</Label>
                <Select value={companyStage} onValueChange={setCompanyStage}>
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select value={department} onValueChange={setDepartment}>
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
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., San Francisco, CA or London, UK" 
                />
                <p className="text-xs text-muted-foreground">Format: City, State/Province or City, Country</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="remote_policy">Remote Policy</Label>
                <Select value={remotePolicy} onValueChange={setRemotePolicy}>
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
                <Label htmlFor="visa_requirement">Visa / Work Authorization</Label>
                <Select value={visaRequirement} onValueChange={setVisaRequirement}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no_restriction">No Restriction</SelectItem>
                    <SelectItem value="sponsorship_available">Sponsorship Available</SelectItem>
                    <SelectItem value="us_authorized">Must Be Authorized to Work in US</SelectItem>
                    <SelectItem value="us_citizen_only">US Citizen / Green Card Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
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
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={5}
                placeholder="Describe the role, responsibilities, and what you're looking for..."
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
                <Input 
                  id="experience_min" 
                  type="number" 
                  min="0" 
                  value={experienceMin}
                  onChange={(e) => setExperienceMin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="experience_max">Max Experience (years)</Label>
                <Input 
                  id="experience_max" 
                  type="number" 
                  min="0" 
                  value={experienceMax}
                  onChange={(e) => setExperienceMax(e.target.value)}
                  placeholder="No max" 
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="salary_min">Min Salary (USD)</Label>
                <Input 
                  id="salary_min" 
                  type="number" 
                  min="0" 
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 80000" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="salary_max">Max Salary (USD)</Label>
                <Input 
                  id="salary_max" 
                  type="number" 
                  min="0" 
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 120000" 
                />
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
                        id="referral_bonus"
                        type="number"
                        min="0"
                        max={referralBonusType === 'percent' ? 100 : undefined}
                        step={referralBonusType === 'percent' ? 0.1 : 1}
                        value={referralBonus}
                        onChange={(e) => setReferralBonus(e.target.value)}
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
                    <Input 
                      id="hiring_manager_name" 
                      value={hiringManagerName}
                      onChange={(e) => setHiringManagerName(e.target.value)}
                      placeholder="e.g. John Smith" 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hiring_manager_email">Email</Label>
                    <Input 
                      id="hiring_manager_email" 
                      type="email" 
                      value={hiringManagerEmail}
                      onChange={(e) => setHiringManagerEmail(e.target.value)}
                      placeholder="e.g. john@company.com" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hiring_manager_linkedin">LinkedIn URL</Label>
                  <Input 
                    id="hiring_manager_linkedin" 
                    type="url" 
                    value={hiringManagerLinkedin}
                    onChange={(e) => setHiringManagerLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/username" 
                  />
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="recruiter_notes">Recruiter Notes</Label>
              <Textarea
                id="recruiter_notes"
                value={recruiterNotes}
                onChange={(e) => setRecruiterNotes(e.target.value)}
                rows={4}
                placeholder="Internal notes about this role, hiring process, or important details..."
              />
              <p className="text-xs text-muted-foreground">Private notes visible only to you</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Spinner className="mr-2 h-4 w-4" />}
                Create Job
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
