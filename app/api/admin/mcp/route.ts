/**
 * The settings behind /admin/settings#mcp. Super admin only, 404 to anyone else.
 *
 *   GET     the key's state (never the key), the switches, the verbs, the last calls
 *   POST    { action: 'issue' } a new key, returned once · { action: 'revoke' }
 *   PATCH   { writes: { decide_candidate: true, ... } }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAppUser } from '@/lib/current-user'
import { issueToken, loadTokenRecord, revokeToken } from '@/lib/mcp/auth'
import { loadWrites, saveWrites } from '@/lib/mcp/settings'
import { recentCalls } from '@/lib/mcp/journal'
import { TOOL_SPECS, WRITE_TOOL_NAMES } from '@/lib/mcp/tools'
import { APP_URL } from '@/lib/desk/intro'

async function gate() {
  const appUser = await getAppUser()
  return appUser?.isSuperAdmin ? appUser : null
}

export async function GET() {
  if (!(await gate())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const admin = createAdminClient()
  const [token, writes, calls] = await Promise.all([loadTokenRecord(admin), loadWrites(admin), recentCalls(admin, 20)])
  return NextResponse.json({
    endpoint: `${APP_URL}/api/mcp`,
    token: token ? { issued: true, hint: token.hint, created_at: token.created_at, last_used_at: token.last_used_at } : { issued: false },
    writes,
    tools: TOOL_SPECS.map(t => ({ name: t.name, kind: t.kind, description: t.description })),
    calls,
  })
}

export async function POST(request: NextRequest) {
  if (!(await gate())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { action?: string }
  const admin = createAdminClient()
  if (body.action === 'issue') {
    const token = await issueToken(admin)
    return NextResponse.json({ ok: true, token, endpoint: `${APP_URL}/api/mcp` })
  }
  if (body.action === 'revoke') {
    await revokeToken(admin)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'action must be issue or revoke' }, { status: 400 })
}

export async function PATCH(request: NextRequest) {
  if (!(await gate())) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = (await request.json().catch(() => ({}))) as { writes?: Record<string, unknown> }
  if (!body.writes || typeof body.writes !== 'object') return NextResponse.json({ error: 'writes is required' }, { status: 400 })
  const patch = Object.fromEntries(Object.entries(body.writes).map(([k, v]) => [k, v === true]))
  const writes = await saveWrites(createAdminClient(), patch, WRITE_TOOL_NAMES)
  return NextResponse.json({ ok: true, writes })
}
