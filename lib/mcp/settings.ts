/**
 * The desk MCP, the switches.
 *
 * Reads are always on. Each write verb is off until Lily turns it on at
 * /admin/settings#mcp, and the state is one JSON object in desk_settings under
 * 'mcp_writes', so turning one on is a deliberate act with a timestamp.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const WRITES_KEY = 'mcp_writes'

export type WriteSwitches = Record<string, boolean>

export async function loadWrites(admin: SupabaseClient): Promise<WriteSwitches> {
  const { data } = await admin.from('desk_settings').select('value').eq('key', WRITES_KEY).maybeSingle()
  const v = data?.value
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, x === true]))
}

export async function saveWrites(admin: SupabaseClient, patch: WriteSwitches, allowed: ReadonlySet<string>): Promise<WriteSwitches> {
  const current = await loadWrites(admin)
  for (const [k, on] of Object.entries(patch)) if (allowed.has(k)) current[k] = on === true
  await admin.from('desk_settings').upsert({ key: WRITES_KEY, value: current as never, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return current
}
