/**
 * The founder tells us an offer was accepted: start date and base salary.
 * That is what the client agreement asks them to send within five business
 * days, and it starts the three clocks (invoice, guarantee, partner payout).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { findPublishedBrief } from '@/lib/hm-brief'
import { recordOfferAccepted } from '@/lib/client-delivery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest, ctx: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await ctx.params
  const brief = await findPublishedBrief(slug)
  if (!brief) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!raw) return NextResponse.json({ error: 'Expected a JSON body' }, { status: 400 })

  const startDate = typeof raw.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.startDate) ? raw.startDate : null
  if (!startDate || Number.isNaN(Date.parse(startDate))) return NextResponse.json({ error: 'A start date, please.' }, { status: 400 })
  const baseSalary = typeof raw.baseSalary === 'number' ? raw.baseSalary : Number(String(raw.baseSalary ?? '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(baseSalary) || baseSalary < 10_000 || baseSalary > 5_000_000) {
    return NextResponse.json({ error: 'The annual base salary, as a number.' }, { status: 400 })
  }
  const decidedBy = typeof raw.decidedBy === 'string' && raw.decidedBy.trim() ? raw.decidedBy.trim().slice(0, 80) : brief.recipientName

  const result = await recordOfferAccepted({ submissionId: id, slug, startDate, baseSalary: Math.round(baseSalary), decidedBy })
  if (!result.ok) return NextResponse.json({ error: result.error ?? 'Could not save that.' }, { status: 400 })
  return NextResponse.json({ ok: true, clock: result.clock }, { headers: { 'Cache-Control': 'no-store' } })
}
