import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveIntroLink, sendIntroForPartner } from '@/lib/desk/intro'

/**
 * The button on /intro/[token]. POST only: a GET never sends anything, so a
 * link scanner opening the page cannot email a candidate. The token is
 * single-use and dies when the person leaves intro_requested.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()
  const r = await resolveIntroLink(admin, token)
  if (r.state !== 'ready') {
    const why = r.state === 'invalid' ? 'This link does not work.' : r.state === 'expired' ? 'This link has expired.' : r.state === 'used' ? 'Already done.' : 'This person has moved on from here.'
    return NextResponse.json({ ok: false, error: why }, { status: 409 })
  }
  const by = r.owner?.email ?? `link:${token.slice(0, 6)}`
  const out = await sendIntroForPartner(admin, r.candidate, { by, via: 'link' })
  return NextResponse.json(out, { status: out.ok ? 200 : 500 })
}
