import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestContext, isLikelyBot } from '@/lib/request-context'
import { notifySlack } from '@/lib/slack'

/**
 * Sign-up funnel beacon.
 *
 * Public by necessity: it fires before anyone has an account. It records only
 * what the visitor is already typing into the form, plus the edge's own view of
 * where the request came from.
 *
 * A drop-off is a session that reached one step and never reached the next, so
 * every step is logged even though only some of them are worth a Slack ping.
 */

export const dynamic = 'force-dynamic'

const STEPS = ['page_view', 'role_selected', 'details_completed', 'agreement_viewed', 'completed', 'failed']

// Steps that interrupt someone's day. page_view is logged but not announced,
// since a landing is not yet a signal.
const ANNOUNCE = new Set(['role_selected', 'agreement_viewed', 'completed'])

const ROLE_LABEL: Record<string, string> = {
  scout: 'Scout',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring manager',
}

function headline(step: string, role: string | null, name: string | null): string {
  const who = name?.trim() || 'Someone'
  const what = role ? ROLE_LABEL[role] ?? role : 'unknown role'
  switch (step) {
    case 'role_selected':
      return `${who} started sign-up as ${what}`
    case 'agreement_viewed':
      return `${who} reached the Partner Terms (${what})`
    case 'completed':
      return `${who} completed sign-up as ${what}`
    default:
      return `${who}: ${step}`
  }
}

function advice(step: string): string | undefined {
  switch (step) {
    case 'role_selected':
      return 'They are on the form now. If they do not reach the terms in the next few minutes, the form itself is the problem.'
    case 'agreement_viewed':
      return 'They are reading the terms. No completion after this is the drop-off worth chasing.'
    case 'completed':
      return 'Account created and the agreement is on file. They still need approval before they can submit anyone.'
    default:
      return undefined
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const step = String(body?.step || '')
    const sessionId = String(body?.session_id || '')

    if (!STEPS.includes(step) || !sessionId) {
      return NextResponse.json({ ok: false }, { status: 400 })
    }

    const ctx = getRequestContext(request)
    if (isLikelyBot(ctx.userAgent)) {
      return NextResponse.json({ ok: true, ignored: 'bot' })
    }

    const role = body?.role ? String(body.role) : null
    const email = body?.email ? String(body.email).slice(0, 200) : null
    const fullName = body?.full_name ? String(body.full_name).slice(0, 200) : null
    const linkedinUrl = body?.linkedin_url ? String(body.linkedin_url).slice(0, 400) : null

    const admin = createAdminClient()
    await admin.from('signup_events').insert({
      session_id: sessionId,
      step,
      role,
      email,
      full_name: fullName,
      linkedin_url: linkedinUrl,
      ip_address: ctx.ip,
      city: ctx.city,
      region: ctx.region,
      country: ctx.country,
      device: ctx.device,
      user_agent: ctx.userAgent,
    })

    if (ANNOUNCE.has(step)) {
      const fields = [
        { label: 'Role', value: role ? ROLE_LABEL[role] ?? role : 'Not chosen yet' },
        { label: 'Location', value: ctx.location || 'Unknown' },
        { label: 'Device', value: ctx.device || 'Unknown' },
        { label: 'IP', value: ctx.ip || 'Unknown' },
      ]
      if (email) fields.push({ label: 'Email', value: email })
      if (linkedinUrl) fields.push({ label: 'LinkedIn', value: linkedinUrl })

      await notifySlack({
        stream: 'partners',
        emoji: step === 'completed' ? ':white_check_mark:' : ':eyes:',
        title: headline(step, role, fullName),
        context: advice(step),
        fields,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    // A beacon must never break the page it is reporting on.
    console.error('[signup/track] error:', err)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
