import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ThreadsListClient } from './threads-list-client'
import type { OutreachThread, OutreachRecipient } from '@/lib/outreach-types'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

interface SearchParams {
  search?: string
  status?: string
  pattern?: string
  persona?: string
  channel?: string
  range?: string
  has_reply?: string
  page?: string
}

export default async function ThreadsListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await cookies()
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if super admin
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email || '')

  // Get user role
  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role')
    .eq('email', user.email)
    .single()

  const userRole = isSuperAdmin ? 'super_admin' : adminData?.role || 'viewer'
  const isAdmin = ['super_admin', 'admin'].includes(userRole)

  // Redirect non-admins
  if (!isAdmin) {
    redirect('/dashboard')
  }

  // Build query with filters
  let query = adminClient
    .from('outreach_threads')
    .select(`
      *,
      recipient:outreach_recipients(
        id, name, email, persona, seniority, current_title,
        company:companies(id, name, stage)
      )
    `)
    .order('last_activity_at', { ascending: false, nullsFirst: false })

  // Apply filters
  if (params.status) {
    const statuses = params.status.split(',')
    query = query.in('status', statuses)
  }

  if (params.pattern) {
    const patterns = params.pattern.split(',')
    query = query.in('outreach_pattern', patterns)
  }

  if (params.channel) {
    query = query.eq('primary_channel', params.channel)
  }

  if (params.range) {
    const now = new Date()
    let startDate: Date
    switch (params.range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(0)
    }
    if (params.range !== 'all') {
      query = query.gte('created_at', startDate.toISOString())
    }
  }

  if (params.has_reply === 'yes') {
    query = query.not('first_reply_at', 'is', null)
  } else if (params.has_reply === 'no') {
    query = query.is('first_reply_at', null)
  }

  // Pagination
  const page = parseInt(params.page || '1', 10)
  const limit = 50
  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data: threads, error, count } = await query

  // Get total count for pagination
  const { count: totalCount } = await adminClient
    .from('outreach_threads')
    .select('*', { count: 'exact', head: true })

  // Type the threads properly
  const typedThreads = (threads || []) as (OutreachThread & {
    recipient: OutreachRecipient & {
      company: { id: string; name: string; stage?: string } | null
    } | null
  })[]

  // Filter by persona (needs to happen after fetch since it's on joined table)
  let filteredThreads = typedThreads
  if (params.persona) {
    const personas = params.persona.split(',')
    filteredThreads = typedThreads.filter(t => 
      t.recipient?.persona && personas.includes(t.recipient.persona)
    )
  }

  // Search filter (client-side for now, could be optimized with full-text search)
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    filteredThreads = filteredThreads.filter(t => 
      t.recipient?.name?.toLowerCase().includes(searchLower) ||
      t.recipient?.email?.toLowerCase().includes(searchLower) ||
      t.subject?.toLowerCase().includes(searchLower) ||
      t.recipient?.company?.name?.toLowerCase().includes(searchLower)
    )
  }

  return (
    <ThreadsListClient 
      threads={filteredThreads}
      totalCount={totalCount || 0}
      currentPage={page}
      pageSize={limit}
      initialFilters={{
        search: params.search || '',
        status: params.status?.split(',') || [],
        pattern: params.pattern?.split(',') || [],
        persona: params.persona?.split(',') || [],
        channel: params.channel || '',
        range: params.range || 'all',
        has_reply: params.has_reply || '',
      }}
    />
  )
}
