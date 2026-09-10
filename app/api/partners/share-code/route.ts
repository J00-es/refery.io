import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolvePartnerAccess } from '@/lib/partners-access'
import { claimCode, codesFor, ensureShareCode, referralUrl, rotateCode } from '@/lib/share-codes'
import { linkStats } from '@/lib/referrals'

/**
 * A partner's own link. GET reads it (minting on first use) with the counts;
 * PUT replaces the code with one they chose; POST {rotate:true} swaps it for
 * a fresh random one and kills every old link.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createAdminClient()
  const userId = access.appUser.id
  const code = await ensureShareCode(admin, userId)
  const codes = await codesFor(admin, userId)
  const stats = await linkStats(admin, userId, codes)
  return NextResponse.json({ code, url: referralUrl(code), stats, firstName: (access.appUser.fullName ?? '').split(/\s+/)[0] || null })
}

export async function PUT(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const wanted = typeof body?.code === 'string' ? body.code : ''
  const admin = createAdminClient()
  const r = await claimCode(admin, access.appUser.id, wanted, access.appUser.fullName)
  if (!r.ok) return NextResponse.json({ error: r.message, reason: r.reason, suggestions: r.suggestions }, { status: 409 })
  return NextResponse.json({ code: r.code, url: referralUrl(r.code) })
}

export async function POST(req: Request) {
  const access = await resolvePartnerAccess()
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (body?.rotate !== true) return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
  const admin = createAdminClient()
  const code = await rotateCode(admin, access.appUser.id)
  return NextResponse.json({ code, url: referralUrl(code) })
}
