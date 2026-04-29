import { createClient, createAdminClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { DASHBOARD_BUCKETS, getStageConfig } from '@/lib/pipeline-stages'
import { notFound } from 'next/navigation'
import { StageDrillDownClient } from './stage-drill-down-client'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

interface PageProps {
  params: Promise<{ stage: string }>
  searchParams: Promise<{ sort?: string; stale?: string }>
}

export default async function StageDrillDownPage({ params, searchParams }: PageProps) {
  const { stage: bucketKey } = await params
  const { sort = 'days_desc', stale } = await searchParams
  
  const supabase = await createClient()
  const adminClient = createAdminClient()

  // Find the bucket configuration
  const bucket = DASHBOARD_BUCKETS.find(b => b.key === bucketKey)
  if (!bucket) {
    notFound()
  }

  // Get current user and role
  const { data: { user } } = await supabase.auth.getUser()
  
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')
  
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role, full_name, user_id')
    .eq('email', user?.email)
    .single()
  
  const userRole = isSuperAdmin ? 'super_admin' : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)
  const currentUserId = adminData?.user_id || user?.id

  // Fetch pipeline data for the stages in this bucket
  const { data: pipelineData, error } = await adminClient
    .from('job_candidate_pipeline')
    .select(`
      id,
      stage,
      updated_at,
      created_at,
      job_id,
      candidate_id,
      owner_user_id,
      jobs(id, title, company_name),
      candidates(id, name, email, linkedin_url, location, owner_user_id, uploaded_by_user_id, user_id)
    `)
    .in('stage', bucket.stages)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Pipeline fetch error:', error)
  }

  // Filter by ownership for non-admins
  const filteredData = isAdmin 
    ? pipelineData || []
    : (pipelineData || []).filter(p => {
        if (p.owner_user_id === currentUserId) return true
        const candidate = p.candidates as { owner_user_id: string | null; uploaded_by_user_id: string | null; user_id: string | null } | null
        return candidate && (
          candidate.owner_user_id === currentUserId ||
          candidate.uploaded_by_user_id === currentUserId ||
          candidate.user_id === currentUserId
        )
      })

  // Fetch owner info for all pipeline items
  const ownerIds = [...new Set(filteredData.map(p => p.owner_user_id).filter(Boolean))]
  const { data: owners } = ownerIds.length > 0 
    ? await adminClient
        .from('users_admin')
        .select('user_id, email, full_name')
        .in('user_id', ownerIds)
    : { data: [] }

  const ownerMap = new Map(owners?.map(o => [o.user_id, o]) || [])

  // Calculate days in stage and add owner info - serialize for client component
  const enrichedData = filteredData.map(item => {
    const daysInStage = Math.floor((Date.now() - new Date(item.updated_at).getTime()) / (1000 * 60 * 60 * 24))
    const owner = item.owner_user_id ? ownerMap.get(item.owner_user_id) : null
    const stageConfig = getStageConfig(item.stage)
    
    return {
      id: item.id,
      stage: item.stage,
      updated_at: item.updated_at,
      created_at: item.created_at,
      job_id: item.job_id,
      candidate_id: item.candidate_id,
      owner_user_id: item.owner_user_id,
      jobs: item.jobs,
      candidates: item.candidates,
      daysInStage,
      owner: owner ? { user_id: owner.user_id, email: owner.email, full_name: owner.full_name } : null,
      stageLabel: stageConfig.label,
      stageColor: stageConfig.color,
      stageDotColor: stageConfig.dotColor,
      isStale: daysInStage > 7,
      isVeryStale: daysInStage > 14
    }
  })

  // Apply stale filter if requested
  const displayData = stale === 'true' 
    ? enrichedData.filter(item => item.isStale)
    : enrichedData

  // Sort data
  const sortedData = [...displayData].sort((a, b) => {
    switch (sort) {
      case 'days_asc':
        return a.daysInStage - b.daysInStage
      case 'days_desc':
        return b.daysInStage - a.daysInStage
      case 'activity':
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      case 'name':
        const nameA = (a.candidates as { name: string } | null)?.name || ''
        const nameB = (b.candidates as { name: string } | null)?.name || ''
        return nameA.localeCompare(nameB)
      default:
        return b.daysInStage - a.daysInStage
    }
  })

  // Stats
  const totalCount = enrichedData.length
  const staleCount = enrichedData.filter(i => i.isStale).length
  const veryStaleCount = enrichedData.filter(i => i.isVeryStale).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {bucket.label}
              </h1>
              <Badge className={bucket.color} variant="secondary">
                {totalCount} candidate{totalCount !== 1 ? 's' : ''}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {bucket.stages.length > 1 
                ? `Includes: ${bucket.stages.map(s => getStageConfig(s).label).join(', ')}`
                : 'View and manage candidates in this stage'
              }
            </p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {totalCount > 0 && (
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-card">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-sm text-muted-foreground">Total: <span className="font-medium text-foreground">{totalCount}</span></span>
          </div>
          {staleCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-amber-50 border-amber-200">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-sm text-amber-700">
                {staleCount} stale ({'>'}7 days)
              </span>
            </div>
          )}
          {veryStaleCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-red-50 border-red-200">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
              <span className="text-sm text-red-700">
                {veryStaleCount} critical ({'>'}14 days)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Client component for filters and table */}
      <StageDrillDownClient 
        data={sortedData} 
        bucketKey={bucketKey}
        currentSort={sort}
        showStaleOnly={stale === 'true'}
        isAdmin={isAdmin}
      />
    </div>
  )
}
