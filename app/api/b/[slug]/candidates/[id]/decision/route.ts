/**
 * The founder's decision on a delivered candidate: Interview, Not a fit, Later.
 * The brief slug is the credential, as everywhere under /b.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { findPublishedBrief } from '@/lib/hm-brief'
import { recordClientDecision, REASON_CODES, type ClientDecision } from '@/lib/client-delivery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const decision = raw.decision as ClientDecision
  if (!['interview', 'not_a_fit', 'later'].includes(decision)) {
    return NextResponse.json({ error: 'Pick Interview, Not a fit or Later.' }, { status: 400 })
  }
  const reasonCode = typeof raw.reasonCode === 'string' && raw.reasonCode in REASON_CODES ? raw.reasonCode : null
  const reason = typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim().slice(0, 1000) : null
  if (decision === 'not_a_fit' && !reasonCode && !reason) {
    return NextResponse.json({ error: 'One tap on a reason, or a line. It goes to the partner, not the candidate.' }, { status: 400 })
  }
  const decidedBy = typeof raw.decidedBy === 'string' && raw.decidedBy.trim() ? raw.decidedBy.trim().slice(0, 80) : brief.recipientName

  const result = await recordClientDecision({ submissionId: id, slug, decision, reasonCode, reason, decidedBy })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Could not save that.' }, { status: 400 })
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
