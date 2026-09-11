/**
 * The desk MCP endpoint: refery.xyz/api/mcp.
 *
 * Streamable HTTP, stateless. One POST per message, JSON back, no session and
 * no server-initiated stream, which is the smallest shape the spec allows and
 * all a single-operator server needs. Bearer key from /admin/settings#mcp;
 * every tools/call is journaled whether it worked or not.
 *
 *   claude mcp add --transport http refery-desk https://refery.xyz/api/mcp \
 *     --header "Authorization: Bearer <key>"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { authenticate } from '@/lib/mcp/auth'
import { handleBody, PARSE_ERROR, type ToolRegistry } from '@/lib/mcp/protocol'
import { buildRegistry, toolKind } from '@/lib/mcp/tools'
import { journal } from '@/lib/mcp/journal'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ACTOR = 'lily'

function unauthorized(reason: string) {
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32001, message: reason } },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="refery-desk"' } },
  )
}

/** The registry, with a journal line around every call. */
function journaled(admin: SupabaseClient, inner: ToolRegistry): ToolRegistry {
  return {
    specs: () => inner.specs(),
    async call(name, args) {
      const kind = toolKind(name) ?? 'read'
      const started = Date.now()
      try {
        const r = await inner.call(name, args)
        await journal(admin, { tool: name, kind, args, ok: !r.isError, summary: r.text.split('\n').find(l => l.trim() && !l.startsWith('Everything below')) ?? '', durationMs: Date.now() - started, actor: ACTOR })
        return r
      } catch (e) {
        await journal(admin, { tool: name, kind, args, ok: false, summary: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started, actor: ACTOR })
        throw e
      }
    },
  }
}

export async function POST(req: NextRequest) {
  const admin = createAdminClient()
  const auth = await authenticate(admin, req.headers.get('authorization'))
  if (!auth.ok) {
    return unauthorized(
      auth.reason === 'no_key_issued'
        ? 'No key has been issued. Generate one at /admin/settings#mcp.'
        : auth.reason === 'missing'
          ? 'Send the key as Authorization: Bearer <key>.'
          : 'That key is not the live one.',
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Body is not JSON' } }, { status: 400 })
  }

  const out = await handleBody(body, journaled(admin, buildRegistry(admin, ACTOR)))
  if (out.body === null) return new NextResponse(null, { status: out.status })
  return NextResponse.json(out.body, { status: out.status })
}

/** No server-initiated stream: a client that opens one is told so and carries on with POST. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, DELETE' } })
}

/** Sessions do not exist here, so ending one is always fine. */
export async function DELETE() {
  return new NextResponse(null, { status: 200 })
}
