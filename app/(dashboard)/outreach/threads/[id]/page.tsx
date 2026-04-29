import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ThreadDetailClient } from './thread-detail-client'
import type { OutreachThread, OutreachMessage, OutreachRecipient, OutreachFollowup, OutreachNote, OutreachMessageCandidate } from '@/lib/outreach-types'

const SUPER_ADMIN_EMAILS = ['lily@10kventures.co']

export default async function ThreadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  // Fetch thread with recipient
  const { data: thread, error } = await adminClient
    .from('outreach_threads')
    .select(`
      *,
      recipient:outreach_recipients(
        *,
        company:companies(id, name, stage, website, linkedin_url)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !thread) {
    notFound()
  }

  // Fetch messages, followups, notes, and referenced candidates in parallel
  const [messagesResult, followupsResult, notesResult, candidatesResult] = await Promise.all([
    adminClient
      .from('outreach_messages')
      .select(`
        *,
        message_candidates:outreach_message_candidates(
          id, candidate_id, role_label_in_message, position_in_message,
          candidate:candidates(id, name)
        )
      `)
      .eq('thread_id', id)
      .order('sent_at', { ascending: true }),
    adminClient
      .from('outreach_followups')
      .select('*')
      .eq('thread_id', id)
      .order('due_at', { ascending: true }),
    adminClient
      .from('outreach_notes')
      .select('*')
      .eq('thread_id', id)
      .order('created_at', { ascending: false }),
    adminClient
      .from('outreach_message_candidates')
      .select(`
        id, message_id, candidate_id, role_label_in_message, position_in_message,
        candidate:candidates(id, name),
        pipeline:job_candidate_pipeline(id, stage, job:jobs(id, title))
      `)
      .in('message_id', (await adminClient.from('outreach_messages').select('id').eq('thread_id', id)).data?.map(m => m.id) || [])
  ])

  const messages = (messagesResult.data || []) as (OutreachMessage & {
    message_candidates: (OutreachMessageCandidate & { candidate: { id: string; name: string } | null })[]
  })[]
  const followups = (followupsResult.data || []) as OutreachFollowup[]
  const notes = (notesResult.data || []) as OutreachNote[]
  
  // Get unique candidates referenced in this thread
  const referencedCandidates = (candidatesResult.data || []).reduce((acc, mc) => {
    if (mc.candidate && !acc.find(c => c.id === mc.candidate_id)) {
      acc.push({
        id: mc.candidate_id,
        name: mc.candidate.name,
        roleLabel: mc.role_label_in_message,
        pipeline: mc.pipeline
      })
    }
    return acc
  }, [] as { id: string; name: string; roleLabel: string | null; pipeline: { id: string; stage: string; job: { id: string; title: string } | null } | null }[])

  const typedThread = thread as OutreachThread & {
    recipient: OutreachRecipient & {
      company: { id: string; name: string; stage?: string; website?: string; linkedin_url?: string } | null
    } | null
  }

  return (
    <ThreadDetailClient
      thread={typedThread}
      messages={messages}
      followups={followups}
      notes={notes}
      referencedCandidates={referencedCandidates}
      currentUserId={currentUserId || ''}
    />
  )
}
