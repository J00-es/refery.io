/** The candidate's one tap: yes, or not now. */

import { NextResponse, type NextRequest } from 'next/server'
import { answerConsent } from '@/lib/candidate-consent'
import { viewerContext } from '@/lib/hm-brief'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const answer = raw?.answer === 'agreed' ? 'agreed' : raw?.answer === 'declined' ? 'declined' : null
  if (!answer) return NextResponse.json({ error: 'Yes or not now.' }, { status: 400 })
  const note = typeof raw?.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 500) : null
  const v = viewerContext(request.headers)
  const result = await answerConsent(token, answer, { ip: v.ip, userAgent: v.userAgent, note })
  if (!result.ok) return NextResponse.json({ error: 'That link does not work.' }, { status: 404 })
  return NextResponse.json({ ok: true, status: result.view?.status }, { headers: { 'Cache-Control': 'no-store' } })
}
