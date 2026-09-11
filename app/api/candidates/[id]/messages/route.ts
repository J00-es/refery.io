import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireCandidateAccess } from '@/lib/current-user'
import { MOMENTS, MOMENT_LABEL, draftFor, loadWriter, messageContext, sendPartnerMessage, type Moment } from '@/lib/messages'

/**
 * A partner writes to their own candidate.
 *
 *   GET  ?moment=intro&submission=…   the filled draft plus what is possible
 *   POST { moment, subject, body, ccLily, submissionId }   sends it
 *
 * Both run every rule in lib/messages; the composer only shows what this
 * route says. Nothing is sent on GET.
 */

function momentOf(v: string | null | undefined, fallback: Moment): Moment {
  return v && (MOMENTS as string[]).includes(v) ? (v as Moment) : fallback
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireCandidateAccess(id)
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const admin = createAdminClient()
  const writer = await loadWriter(admin, access.appUser)
  const ctx = await messageContext(admin, id, writer)
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const moment = momentOf(request.nextUrl.searchParams.get('moment'), ctx.suggested)
  const submissionId = request.nextUrl.searchParams.get('submission')
  const draft = ctx.unavailable[moment] ? null : draftFor(ctx, moment, submissionId)
  return NextResponse.json({
    first: ctx.candidateFirst,
    to: ctx.email,
    from: `${writer.name} via Refery`,
    replyTo: writer.email,
    hasSignature: Boolean(writer.signature),
    blocked: ctx.blocked,
    suggested: ctx.suggested,
    moments: MOMENTS.map(m => ({ key: m, label: MOMENT_LABEL[m], unavailable: ctx.unavailable[m] ?? null })),
    submissions: ctx.submissions.map(s => ({ id: s.id, status: s.status, jobTitle: s.headline || s.jobTitle, company: s.consentStatus === 'agreed' || ['client_interview', 'offer', 'placed', 'declined'].includes(s.status) ? s.companyName : s.anonAlias || 'a company I work with' })),
    draft,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireCandidateAccess(id)
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const body = (await request.json().catch(() => ({}))) as { moment?: string; subject?: string; body?: string; ccLily?: boolean; submissionId?: string | null }
  if (!body.moment || !(MOMENTS as string[]).includes(body.moment)) return NextResponse.json({ error: 'Pick a moment.' }, { status: 400 })
  const admin = createAdminClient()
  const writer = await loadWriter(admin, access.appUser)
  const ctx = await messageContext(admin, id, writer)
  if (!ctx) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const r = await sendPartnerMessage(admin, ctx, {
    moment: body.moment as Moment,
    subject: String(body.subject ?? ''),
    body: String(body.body ?? ''),
    ccLily: Boolean(body.ccLily),
    submissionId: body.submissionId ?? null,
    via: 'page',
  })
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.code === 'send' || r.code === 'config' || r.code === 'ledger' ? 500 : 409 })
  return NextResponse.json({ ok: true, message: r.message, emailId: r.emailId })
}
