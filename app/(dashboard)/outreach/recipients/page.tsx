import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { RecipientsListClient } from './recipients-list-client'
import type { OutreachRecipient } from '@/lib/outreach-types'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

interface SearchParams {
  search?: string
  persona?: string
  seniority?: string
  has_replied?: string
  do_not_contact?: string
  page?: string
}

export default async function RecipientsPage({
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

  // Build query
  let query = adminClient
    .from('outreach_recipients')
    .select(`
      *,
      company:companies(id, name, stage)
    `)
    .order('last_contacted_at', { ascending: false, nullsFirst: false })

  // Apply filters
  if (params.persona) {
    const personas = params.persona.split(',')
    query = query.in('persona', personas)
  }

  if (params.seniority) {
    const seniorities = params.seniority.split(',')
    query = query.in('seniority', seniorities)
  }

  if (params.has_replied === 'yes') {
    query = query.gt('lifetime_replies', 0)
  } else if (params.has_replied === 'no') {
    query = query.eq('lifetime_replies', 0)
  }

  if (params.do_not_contact === 'yes') {
    query = query.eq('do_not_contact', true)
  } else if (params.do_not_contact === 'no') {
    query = query.eq('do_not_contact', false)
  }

  // Pagination
  const page = parseInt(params.page || '1', 10)
  const limit = 30
  const offset = (page - 1) * limit
  query = query.range(offset, offset + limit - 1)

  const { data: recipients, error } = await query

  // Get total count
  const { count: totalCount } = await adminClient
    .from('outreach_recipients')
    .select('*', { count: 'exact', head: true })

  const typedRecipients = (recipients || []) as (OutreachRecipient & {
    company: { id: string; name: string; stage?: string } | null
  })[]

  // Search filter (client-side)
  let filteredRecipients = typedRecipients
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    filteredRecipients = typedRecipients.filter(r =>
      r.name?.toLowerCase().includes(searchLower) ||
      r.email?.toLowerCase().includes(searchLower) ||
      r.company?.name?.toLowerCase().includes(searchLower)
    )
  }

  return (
    <RecipientsListClient
      recipients={filteredRecipients}
      totalCount={totalCount || 0}
      currentPage={page}
      pageSize={limit}
      initialFilters={{
        search: params.search || '',
        persona: params.persona?.split(',') || [],
        seniority: params.seniority?.split(',') || [],
        has_replied: params.has_replied || '',
        do_not_contact: params.do_not_contact || '',
      }}
    />
  )
}
