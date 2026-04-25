'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { UserAdmin } from '@/lib/types'
import { 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  ShieldCheck,
  Eye, 
  Building, 
  Search,
  Linkedin,
  Save,
  CheckCircle2
} from 'lucide-react'

const roleIcons = {
  super_admin: ShieldCheck,
  admin: Shield,
  recruiter: User,
  scout: Search,
  hiring_manager: Building,
  viewer: Eye,
}

const roleColors = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  recruiter: 'bg-green-100 text-green-700',
  scout: 'bg-teal-100 text-teal-700',
  hiring_manager: 'bg-orange-100 text-orange-700',
  viewer: 'bg-gray-100 text-gray-700',
}

const roleDescriptions = {
  super_admin: 'Full access to all features including user management',
  admin: 'Access to analytics and can manage jobs, candidates, and companies',
  recruiter: 'Can manage jobs and candidates, view all jobs',
  scout: 'Can upload and manage candidates assigned to them',
  hiring_manager: 'Can view and manage jobs assigned to them',
  viewer: 'Read-only access to assigned items',
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserAdmin | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  // Editable fields
  const [fullName, setFullName] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/profile')
        if (!res.ok) throw new Error('Failed to fetch profile')
        const data = await res.json()
        setProfile(data.profile)
        setFullName(data.profile.full_name || '')
        setLinkedinUrl(data.profile.linkedin_url || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError('')

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName || null,
          linkedin_url: linkedinUrl || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      const data = await res.json()
      setProfile(data.profile)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="px-4 sm:px-0">
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-destructive">
          {error || 'Profile not found'}
        </div>
      </div>
    )
  }

  const RoleIcon = roleIcons[profile.role as keyof typeof roleIcons] || User
  const roleColor = roleColors[profile.role as keyof typeof roleColors] || 'bg-gray-100 text-gray-700'
  const roleDescription = roleDescriptions[profile.role as keyof typeof roleDescriptions] || ''

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">My Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account settings</p>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 sm:p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Profile Overview */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg">Profile Overview</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col items-center text-center">
              <div className={`flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full ${roleColor} mb-3`}>
                <RoleIcon className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">{profile.full_name || 'No name set'}</h3>
              <p className="text-sm text-muted-foreground break-all">{profile.email}</p>
              <div className="mt-3">
                <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${roleColor}`}>
                  {profile.role.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {roleDescription}
              </p>
            </div>

            <div className="mt-6 pt-4 border-t space-y-3 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="break-all">{profile.email}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className={`h-2 w-2 rounded-full ${
                  profile.status === 'active' ? 'bg-green-500' :
                  profile.status === 'inactive' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
                <span className="capitalize">{profile.status}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Editable Fields */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg">Edit Profile</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Update your personal information</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="space-y-4 sm:space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email}
                  disabled
                  className="bg-muted h-10 sm:h-11 text-sm sm:text-base"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="h-10 sm:h-11 text-sm sm:text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedinUrl" className="text-sm flex items-center gap-2">
                  <Linkedin className="h-4 w-4" />
                  LinkedIn Profile URL
                </Label>
                <Input
                  id="linkedinUrl"
                  type="url"
                  placeholder="https://linkedin.com/in/yourprofile"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className="h-10 sm:h-11 text-sm sm:text-base"
                />
              </div>

              <div className="pt-2">
                <Button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="w-full sm:w-auto h-10 sm:h-11"
                >
                  {saving ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Saving...
                    </>
                  ) : saved ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Saved!
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Info */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg">Account Information</CardTitle>
          <CardDescription className="text-xs sm:text-sm">Details about your account</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border p-3 sm:p-4">
              <div className="text-xs sm:text-sm text-muted-foreground">Role</div>
              <div className="font-medium capitalize mt-1">{profile.role.replace('_', ' ')}</div>
            </div>
            <div className="rounded-lg border p-3 sm:p-4">
              <div className="text-xs sm:text-sm text-muted-foreground">Status</div>
              <div className="font-medium capitalize mt-1 flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${
                  profile.status === 'active' ? 'bg-green-500' :
                  profile.status === 'inactive' ? 'bg-red-500' :
                  'bg-yellow-500'
                }`} />
                {profile.status}
              </div>
            </div>
            <div className="rounded-lg border p-3 sm:p-4">
              <div className="text-xs sm:text-sm text-muted-foreground">Member Since</div>
              <div className="font-medium mt-1">{new Date(profile.created_at).toLocaleDateString()}</div>
            </div>
            <div className="rounded-lg border p-3 sm:p-4">
              <div className="text-xs sm:text-sm text-muted-foreground">Last Updated</div>
              <div className="font-medium mt-1">{new Date(profile.updated_at).toLocaleDateString()}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
