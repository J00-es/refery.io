/**
 * The desk MCP, the record.
 *
 * Every tool call lands in desk_mcp_calls: what was asked (long strings cut
 * short, never a CV or an email body), whether it worked, and one line a
 * person can read. That list is the "last calls" panel on the settings page
 * and the answer to "what did the assistant do on Tuesday".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolKind } from '@/lib/mcp/protocol'

export interface JournalEntry {
  tool: string
  kind: ToolKind
  args: Record<string, unknown>
  ok: boolean
  summary: string
  durationMs: number
  actor: string
}

export interface JournalRow {
  id: string
  tool: string
  kind: ToolKind
  args: Record<string, unknown>
  ok: boolean
  summary: string | null
  duration_ms: number | null
  actor: string
  created_at: string
}

const SECRET_KEYS = new Set(['body', 'html', 'cv', 'resume'])

/** Strings cut to 160 characters; email bodies and CVs replaced by their length. */
export function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (SECRET_KEYS.has(k) && typeof v === 'string') out[k] = `<${v.length} chars>`
    else if (typeof v === 'string') out[k] = v.length > 160 ? `${v.slice(0, 157)}...` : v
    else if (Array.isArray(v)) out[k] = v.length > 25 ? [...v.slice(0, 25), `+${v.length - 25} more`] : v
    else out[k] = v
  }
  return out
}

export async function journal(admin: SupabaseClient, e: JournalEntry): Promise<void> {
  try {
    await admin.from('desk_mcp_calls').insert({
      tool: e.tool,
      kind: e.kind,
      args: redactArgs(e.args),
      ok: e.ok,
      summary: e.summary.slice(0, 400),
      duration_ms: Math.round(e.durationMs),
      actor: e.actor,
    })
  } catch (err) {
    // The record must never fail the call it records.
    console.error('[desk-mcp] journal write failed:', err)
  }
}

export async function recentCalls(admin: SupabaseClient, limit = 20): Promise<JournalRow[]> {
  const { data } = await admin
    .from('desk_mcp_calls')
    .select('id, tool, kind, args, ok, summary, duration_ms, actor, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as JournalRow[]
}
