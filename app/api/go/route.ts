import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizeEmail } from '@/lib/current-user'
import { linkedinKey, looksLikeTestRow } from '@/lib/onboarding/identity'
import { reviewDate } from '@/lib/onboarding/decisions'

export const dynamic = 'force-dynamic'

/**
 * The who-are-you step behind a campaign link.
 *
 * Matching the person to the campaign audience (by normalised LinkedIn URL,
 * or by email where the audience carries one) is the admission decision:
 * Marj chose them when she built the list. A match creates the application
 * already approved with the campaign as its source. No match creates a
 * normal application, which reaches Lily's Slack like any other. Both go
 * through the insert trigger, so the receipt and the card are the usual ones.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const slug = String(body.slug ?? '').trim()
  const name = String(body.name ?? '').trim().slice(0, 120)
  const email = normalizeEmail(String(body.email ?? ''))
  const linkedin = String(body.linkedin ?? '').trim().slice(0, 300)
  const key = linkedinKey(linkedin)
  if (!slug || !name || !email.includes('@') || !key) return NextResponse.json({ error: 'Name, email and a LinkedIn profile URL are needed.' }, { status: 400 })
  if (looksLikeTestRow({ full_name: name, email })) return NextResponse.json({ error: 'That does not look like a real name and email.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: campaign } = await admin.from('outbound_campaigns').select('*').eq('slug', slug).maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'This link is not active.' }, { status: 404 })
  if (campaign.active_to && new Date(campaign.active_to as string).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This link has closed.' }, { status: 410 })
  }

  const { data: account } = await admin.from('users_admin').select('status').eq('email', email).maybeSingle()
  if (account?.status === 'active') return NextResponse.json({ state: 'account' })

  const { data: earlier } = await admin
    .from('scout_applications')
    .select('id, status, invite_token')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (earlier && ['approved', 'in_conversation'].includes(earlier.status ?? '') && earlier.invite_token) {
    return NextResponse.json({ state: 'matched', next: `/auth/sign-up?invite=${encodeURIComponent(earlier.invite_token as string)}` })
  }
  if (earlier && ['new', 'clarification'].includes(earlier.status ?? '')) return NextResponse.json({ state: 'applied' })

  const { data: audience } = await admin
    .from('campaign_audience')
    .select('id, matched_application_id')
    .eq('campaign_id', campaign.id)
    .or(`linkedin_key.eq.${key},email.eq.${email}`)
    .limit(1)
    .maybeSingle()
  const matched = Boolean(audience)
  const token = randomBytes(18).toString('base64url')
  const now = new Date().toISOString()

  const { data: created, error } = await admin
    .from('scout_applications')
    .insert({
      full_name: name,
      email,
      linkedin_url: linkedin,
      linkedin_key: key,
      terms_accepted_at: now,
      source: matched ? 'outbound' : 'outbound-link',
      source_campaign: slug,
      status: matched ? 'approved' : 'new',
      decision: matched ? 'approve' : null,
      decided_by: matched ? `campaign:${slug} (${campaign.sender_name})` : null,
      decided_at: matched ? now : null,
      contribution_mode: 'introduce',
      invite_token: token,
    })
    .select('id')
    .single()
  if (error || !created) return NextResponse.json({ error: 'Could not save that. Try again in a moment.' }, { status: 500 })

  if (audience) {
    await admin.from('campaign_audience').update({ matched_application_id: created.id, matched_at: now }).eq('id', audience.id)
  }

  return matched
    ? NextResponse.json({ state: 'matched', next: `/auth/sign-up?invite=${encodeURIComponent(token)}` })
    : NextResponse.json({ state: 'review', reviewDate: reviewDate() })
}
