'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, ShieldAlert } from 'lucide-react'
import { use } from 'react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function EditCompanyPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    website: '',
    description: '',
    industry: '',
    stage: '',
    location: '',
    employee_count: '',
    linkedin_url: '',
    logo_url: '',
    funding_raised: '',
  })

  useEffect(() => {
    async function fetchCompany() {
      try {
        const res = await fetch(`/api/companies/${id}`)
        const data = await res.json()
        
        if (!res.ok || data.error) {
          setError(data.error || 'Company not found')
          setLoading(false)
          return
        }

        setCanManage(data.canManage ?? false)
        setFormData({
          name: data.name || '',
          website: data.website || '',
          description: data.description || '',
          industry: data.industry || '',
          stage: data.stage || '',
          location: data.location || '',
          employee_count: data.employee_count || '',
          linkedin_url: data.linkedin_url || '',
          logo_url: data.logo_url || '',
          funding_raised: data.funding_raised || '',
        })
        setLoading(false)
      } catch (err) {
        setError('Failed to load company')
        setLoading(false)
      }
    }

    fetchCompany()
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          website: formData.website || null,
          description: formData.description || null,
          industry: formData.industry || null,
          stage: formData.stage || null,
          location: formData.location || null,
          employee_count: formData.employee_count || null,
          linkedin_url: formData.linkedin_url || null,
          logo_url: formData.logo_url || null,
          funding_raised: formData.funding_raised || null,
        }),
      })

      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to update company')
        setSaving(false)
        return
      }

      router.push(`/companies/${id}`)
    } catch (err) {
      setError('Failed to update company')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error && !formData.name) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Link href="/companies">
          <Button variant="outline">Back to Companies</Button>
        </Link>
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md mb-6">
          You don&apos;t have permission to edit companies. Only super admins and admins can make changes.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.back()}>
            Go Back
          </Button>
          <Button onClick={() => router.push(`/companies/${id}`)}>
            View Company
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/companies/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Edit Company</h1>
          <p className="text-muted-foreground">Update {formData.name} details</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Company Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  placeholder="e.g., Technology, Healthcare, Finance"
                  value={formData.industry}
                  onChange={(e) => setFormData(prev => ({ ...prev, industry: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="stage">Company Stage</Label>
                <Select 
                  value={formData.stage} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, stage: v }))}
                >
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
              <div className="space-y-2">
                <Label htmlFor="employee_count">Employee Count</Label>
                <Select 
                  value={formData.employee_count} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, employee_count: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-10">1-10</SelectItem>
                    <SelectItem value="11-50">11-50</SelectItem>
                    <SelectItem value="51-200">51-200</SelectItem>
                    <SelectItem value="201-500">201-500</SelectItem>
                    <SelectItem value="501-1000">501-1000</SelectItem>
                    <SelectItem value="1001-5000">1001-5000</SelectItem>
                    <SelectItem value="5000+">5000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">Headquarters Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., San Francisco, CA"
                  value={formData.location}
                  onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="funding_raised">Funding Raised</Label>
                <Input
                  id="funding_raised"
                  placeholder="e.g., $50M, $150M Series C"
                  value={formData.funding_raised}
                  onChange={(e) => setFormData(prev => ({ ...prev, funding_raised: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="linkedin_url">LinkedIn URL</Label>
                <Input
                  id="linkedin_url"
                  type="url"
                  placeholder="https://linkedin.com/company/..."
                  value={formData.linkedin_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, linkedin_url: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="logo_url">Logo URL</Label>
                <Input
                  id="logo_url"
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={formData.logo_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">About the Company</Label>
              <Textarea
                id="description"
                rows={4}
                placeholder="Brief description of the company, its mission, and what they do..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-3 pt-4">
              <Link href={`/companies/${id}`}>
                <Button type="button" variant="outline">Cancel</Button>
              </Link>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
