'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { UserAdmin } from '@/lib/types'
import { 
  ArrowLeft, 
  Mail, 
  Calendar, 
  Shield, 
  ShieldCheck, 
  User, 
  Eye, 
  Building, 
  Search,
  Briefcase,
  Users,
  ExternalLink,
  Linkedin
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

const statusColors = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-red-100 text-red-700',
  pending: 'bg-yellow-100 text-yellow-700',
}

interface UserData {
  user: UserAdmin
  ownedJobs: Array<{ id: string; title: string; company_name: string; status: string; created_at: string }>
  ownedCandidates: Array<{ id: string; name: string; email: string; status: string; created_at: string }>
  uploadedCandidates: Array<{ id: string; name: string; email: string; status: string; created_at: string }>
}

export default function UserDetailPage() {
  const router = useRouter()
  const params = useParams()
  const [data, setData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch(`/api/admin/users/${params.id}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to fetch user')
        }
        const userData = await res.json()
        setData(userData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [params.id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4 px-4 sm:px-0">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-4 text-destructive">
          {error || 'User not found'}
        </div>
      </div>
    )
  }

  const { user, ownedJobs, ownedCandidates, uploadedCandidates } = data
  const RoleIcon = roleIcons[user.role as keyof typeof roleIcons] || User
  const roleColor = roleColors[user.role as keyof typeof roleColors] || 'bg-gray-100 text-gray-700'
  const statusColor = statusColors[user.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700'

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {user.full_name || user.email}
          </h1>
          <p className="text-sm text-muted-foreground">User Details</p>
        </div>
      </div>

      {/* User Info Card */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg">Profile</CardTitle>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="flex flex-col items-center text-center mb-6">
              <div className={`flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full ${roleColor} mb-3`}>
                <RoleIcon className="h-8 w-8 sm:h-10 sm:w-10" />
              </div>
              <h3 className="font-semibold text-foreground">{user.full_name || 'No name set'}</h3>
              <p className="text-sm text-muted-foreground break-all">{user.email}</p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${roleColor}`}>
                  {user.role.replace('_', ' ')}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusColor}`}>
                  {user.status}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="break-all">{user.email}</span>
              </div>
              <div className="flex items-center gap-3 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
              </div>
              {user.linkedin_url && (
                <a 
                  href={user.linkedin_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-primary hover:underline"
                >
                  <Linkedin className="h-4 w-4 shrink-0" />
                  <span>LinkedIn Profile</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {user.accepted_terms_at && (
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Shield className="h-4 w-4 shrink-0" />
                  <span>Terms accepted {new Date(user.accepted_terms_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 px-4 sm:px-6">
            <CardTitle className="text-base sm:text-lg">Activity Summary</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Jobs and candidates assigned to this user</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-3 sm:p-4 text-center">
                <Briefcase className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-blue-600" />
                <div className="text-xl sm:text-2xl font-bold">{ownedJobs.length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Owned Jobs</div>
              </div>
              <div className="rounded-lg border p-3 sm:p-4 text-center">
                <Users className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-green-600" />
                <div className="text-xl sm:text-2xl font-bold">{ownedCandidates.length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Owned Candidates</div>
              </div>
              <div className="rounded-lg border p-3 sm:p-4 text-center">
                <Users className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 text-purple-600" />
                <div className="text-xl sm:text-2xl font-bold">{uploadedCandidates.length}</div>
                <div className="text-xs sm:text-sm text-muted-foreground">Uploaded</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Owned Jobs */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Briefcase className="h-4 w-4 sm:h-5 sm:w-5" />
            Owned Jobs
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Jobs assigned to this user</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {ownedJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No jobs assigned</p>
          ) : (
            <div className="space-y-2">
              {ownedJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="font-medium text-sm sm:text-base truncate">{job.title}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground truncate">{job.company_name}</div>
                  </div>
                  <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full shrink-0 ${
                    job.status === 'open' ? 'bg-green-100 text-green-700' :
                    job.status === 'closed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {job.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Owned Candidates */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            Owned Candidates
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Candidates assigned to this user</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {ownedCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No candidates assigned</p>
          ) : (
            <div className="space-y-2">
              {ownedCandidates.map((candidate) => (
                <Link
                  key={candidate.id}
                  href={`/candidates/${candidate.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="font-medium text-sm sm:text-base truncate">{candidate.name}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground truncate">{candidate.email}</div>
                  </div>
                  <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full shrink-0 ${
                    candidate.status === 'shortlisted' ? 'bg-green-100 text-green-700' :
                    candidate.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    candidate.status === 'hired' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {candidate.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Candidates */}
      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Users className="h-4 w-4 sm:h-5 sm:w-5" />
            Uploaded Candidates
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">Candidates uploaded by this user</CardDescription>
        </CardHeader>
        <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6">
          {uploadedCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No candidates uploaded</p>
          ) : (
            <div className="space-y-2">
              {uploadedCandidates.map((candidate) => (
                <Link
                  key={candidate.id}
                  href={`/candidates/${candidate.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted transition-colors"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="font-medium text-sm sm:text-base truncate">{candidate.name}</div>
                    <div className="text-xs sm:text-sm text-muted-foreground truncate">{candidate.email}</div>
                  </div>
                  <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full shrink-0 ${
                    candidate.status === 'shortlisted' ? 'bg-green-100 text-green-700' :
                    candidate.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    candidate.status === 'hired' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {candidate.status}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
