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

/**
 * A GET is either an MCP client asking for a server-initiated stream, which
 * this server does not have (405, and the client carries on with POST), or a
 * person who opened the URL in a browser, who gets told what it is.
 */
export async function GET(req: NextRequest) {
  const accept = req.headers.get('accept') ?? ''
  if (accept.includes('text/event-stream')) return new NextResponse(null, { status: 405, headers: { Allow: 'POST, DELETE' } })
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Refery desk MCP</title>
<style>body{margin:0;background:#F2F1EB;color:#161613;font:15px/1.6 "DM Sans",-apple-system,system-ui,sans-serif}main{max-width:560px;margin:0 auto;padding:56px 20px}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 14px;color:#6E6E68}code{display:block;overflow-x:auto;white-space:pre;background:#fff;border:1px solid #E4E3DC;border-radius:8px;padding:10px 12px;font-size:12.5px;color:#161613}a{color:#1F3A2F}</style></head>
<body><main><h1>Refery desk MCP</h1>
<p>This address is a Model Context Protocol server, not a page. It answers an assistant that sends it JSON, not a browser.</p>
<p>To use it, issue a key at <a href="/admin/settings#mcp">refery.xyz/admin/settings#mcp</a>, then in Claude Code run, once:</p>
<code>claude mcp add --transport http refery-desk https://refery.xyz/api/mcp --header "Authorization: Bearer &lt;key&gt;"</code>
<p style="margin-top:14px">Start a new Claude Code session and ask "what needs me today".</p>
</main></body></html>`
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

/** Sessions do not exist here, so ending one is always fine. */
export async function DELETE() {
  return new NextResponse(null, { status: 200 })
}
