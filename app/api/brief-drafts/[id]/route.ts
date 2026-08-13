import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { BRIEFS_SUPER_ADMIN_ONLY, getAppUser, ownsCandidate } from '@/lib/current-user'

/** Load a draft and confirm the caller may act on its candidate. */
async function loadAuthorized(id: string) {
  const appUser = await getAppUser()
  if (!appUser?.isActive) return { error: 'Unauthorized', status: 401 as const }
  // Super-admin-only for now — see BRIEFS_SUPER_ADMIN_ONLY. This gate covers the
  // preview GET and the send/dismiss PATCH alike, which matters because sending
  // is the one irreversible step in the pipeline.
  if (BRIEFS_SUPER_ADMIN_ONLY && !appUser.isSuperAdmin) {
    return { error: 'Not found', status: 404 as const }
  }

  const adminClient = createAdminClient()
  const { data: draft } = await adminClient
    .from('brief_email_drafts')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!draft) return { error: 'Not found', status: 404 as const }

  const { data: candidate } = await adminClient
    .from('candidates')
    .select('owner_user_id, uploaded_by_user_id, user_id')
    .eq('id', draft.candidate_id)
    .maybeSingle()

  if (!ownsCandidate(appUser, candidate)) return { error: 'Not found', status: 404 as const }
  return { appUser, adminClient, draft }
}

/** Full HTML for the preview pane. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await loadAuthorized(id)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ draft: res.draft })
}

/**
 * Send or dismiss. Sending is the one irreversible step in the whole pipeline,
 * so it happens only here, only on an explicit request, and never from the
 * nightly.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const res = await loadAuthorized(id)
    if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
    const { appUser, adminClient, draft } = res

    const { action } = await request.json()

    if (action === 'dismiss') {
      await adminClient.from('brief_email_drafts')
        .update({ status: 'dismissed' }).eq('id', id)
      return NextResponse.json({ ok: true, status: 'dismissed' })
    }

    if (action !== 'send') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
    if (draft.status === 'sent') {
      return NextResponse.json({ error: 'Already sent' }, { status: 409 })
    }

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured on this deployment.' },
        { status: 503 },
      )
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.BRIEF_FROM_EMAIL || 'Refery <lily@refery.io>',
        to: [draft.recipient_email],
        subject: draft.subject,
        html: draft.html_body,
      }),
    })

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300)
      // Recorded on the row so a failure is visible in the queue rather than
      // only in a server log.
      await adminClient.from('brief_email_drafts')
        .update({ status: 'failed', send_error: detail }).eq('id', id)
      return NextResponse.json({ error: `Send failed: ${detail}` }, { status: 502 })
    }

    await adminClient.from('brief_email_drafts').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_by_user_id: appUser.id,
      send_error: null,
    }).eq('id', id)

    return NextResponse.json({ ok: true, status: 'sent' })
  } catch (error) {
    console.error('Error acting on brief draft:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
