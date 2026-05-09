import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export async function GET() {
  try {
    const supabase = await createClient()
    const adminClient = createAdminClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Super admin emails always have access
    const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')
    
    if (!isSuperAdmin) {
      // Check if user is admin using admin client
      const { data: adminUser } = await adminClient
        .from('users_admin')
        .select('role')
        .eq('email', user.email)
        .single()

      if (!adminUser || !['super_admin', 'admin'].includes(adminUser.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Get analytics data using admin client to bypass RLS
    const [
      { count: totalJobs },
      { count: openJobs },
      { count: totalCandidates },
      { data: recentJobs },
      { data: recentCandidates },
      { count: totalUsers },
    ] = await Promise.all([
      adminClient.from('jobs').select('*', { count: 'exact', head: true }),
      adminClient.from('jobs').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      adminClient.from('candidates').select('*', { count: 'exact', head: true }),
      adminClient.from('jobs').select('id, title, company_name, created_at, status').order('created_at', { ascending: false }).limit(5),
      adminClient.from('candidates').select('id, name, email, created_at, status').order('created_at', { ascending: false }).limit(5),
      adminClient.from('users_admin').select('*', { count: 'exact', head: true }),
    ])

    // Get status distributions using admin client
    const { data: jobsByStatus } = await adminClient
      .from('jobs')
      .select('status')
    
    const { data: candidatesByStatus } = await adminClient
      .from('candidates')
      .select('status')

    // Calculate distributions
    const jobStatusCounts = jobsByStatus?.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    const candidateStatusCounts = candidatesByStatus?.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    return NextResponse.json({
      overview: {
        totalJobs: totalJobs || 0,
        openJobs: openJobs || 0,
        totalCandidates: totalCandidates || 0,
        totalUsers: totalUsers || 0,
      },
      distributions: {
        jobsByStatus: jobStatusCounts,
        candidatesByStatus: candidateStatusCounts,
      },
      recent: {
        jobs: recentJobs || [],
        candidates: recentCandidates || [],
      },
    })
  } catch (error) {
    console.error('Error fetching analytics:', error)
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}
