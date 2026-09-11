import { NextResponse } from 'next/server'
import { getVapid } from '@/lib/push'

/**
 * The public half of the push key pair, which the browser needs to subscribe.
 * Public by design: it identifies the sender, it cannot send.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const vapid = await getVapid()
  if (!vapid) return NextResponse.json({ error: 'Push is not configured' }, { status: 404 })
  return NextResponse.json({ publicKey: vapid.publicKey }, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
