import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { stopContact } from '@/lib/messages'

/** The stop link's button. One tap, no login; a GET never acts. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const r = await stopContact(createAdminClient(), token, { ip })
  if (!r.ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true, already: r.already ?? false })
}
