import { createClient, createAdminClient } from '@/lib/supabase/server'
import { ComposeClient } from './compose-client'
import type { OutreachRecipient, OutreachThread } from '@/lib/outreach-types'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

interface SearchParams {
  recipient?: string
  thread?: string
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const adminClient = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  const isSuperAdmin = SUPER_ADMIN_EMAILS.includes(user?.email || '')

  const { data: adminData } = await adminClient
    .from('users_admin')
    .select('role, full_name, user_id')
    .eq('email', user?.email)
    .single()

  const currentUserId = adminData?.user_id || user?.id

  // Fetch recipient if specified
  let preselectedRecipient: (OutreachRecipient & { company: { id: string; name: string } | null }) | null = null
  if (params.recipient) {
    const { data } = await adminClient
      .from('outreach_recipients')
      .select('*, company:companies(id, name)')
      .eq('id', params.recipient)
      .single()
    if (data) {
      preselectedRecipient = data as OutreachRecipient & { company: { id: string; name: string } | null }
    }
  }

  // Fetch thread if specified (for follow-ups)
  let existingThread: (OutreachThread & { recipient: OutreachRecipient & { company: { id: string; name: string } | null } }) | null = null
  if (params.thread) {
    const { data } = await adminClient
      .from('outreach_threads')
      .select('*, recipient:outreach_recipients(*, company:companies(id, name))')
      .eq('id', params.thread)
      .single()
    if (data) {
      existingThread = data as OutreachThread & { recipient: OutreachRecipient & { company: { id: string; name: string } | null } }
      preselectedRecipient = existingThread.recipient
    }
  }

  // Fetch recent recipients for quick selection
  const { data: recentRecipients } = await adminClient
    .from('outreach_recipients')
    .select('id, name, email, persona, company:companies(id, name)')
    .order('last_contacted_at', { ascending: false, nullsFirst: false })
    .limit(10)

  // Fetch candidates for attachment
  const { data: candidates } = await adminClient
    .from('candidates')
    .select('id, name, experience_years, location')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <ComposeClient
      preselectedRecipient={preselectedRecipient}
      existingThread={existingThread}
      recentRecipients={(recentRecipients || []) as (OutreachRecipient & { company: { id: string; name: string } | null })[]}
      candidates={(candidates || []) as { id: string; name: string; experience_years?: number; location?: string }[]}
      currentUserId={currentUserId || ''}
    />
  )
}
