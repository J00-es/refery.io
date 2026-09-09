/**
 * Source versions: what a decision was made from, by content hash.
 *
 * A candidate's résumé text (or, failing that, the parsed document) is
 * hashed; the hash names the version. An assessment points at the version it
 * read, an embedding records the hash of what it embedded, and a repeat
 * request for the same version reuses the result instead of paying again.
 * updated_at never triggers work; content does (audit findings 7, 11, 15).
 */

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** A stable hash over an object, key order independent. */
export function stableHash(value: unknown): string {
  return sha256(canonical(value))
}

function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null)
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`
}

export interface SourceVersion {
  id: string | null
  kind: 'resume_text' | 'parsed_data' | 'facts'
  contentHash: string
  chars: number
  /** The row could not be written (table missing before the migration, or an error); the hash is still valid. */
  unrecorded: boolean
}

/**
 * The version of the candidate's evidence the panel reads. Raw text wins;
 * with none on record the parsed document is the source; with neither, the
 * structured facts are all there is and the caller must say so.
 */
export function candidateSourceText(candidate: Record<string, unknown>, parsed: Record<string, unknown> | null): { kind: SourceVersion['kind']; text: string } {
  const raw = typeof parsed?.raw_text === 'string' ? parsed.raw_text.trim() : ''
  if (raw.length > 400) return { kind: 'resume_text', text: raw }
  if (parsed && Object.keys(parsed).length) return { kind: 'parsed_data', text: canonical(parsed) }
  const facts = { work_history: candidate.work_history ?? null, education: candidate.education ?? null, skills: candidate.skills ?? null, ai_analysis: candidate.ai_analysis ?? null }
  return { kind: 'facts', text: canonical(facts) }
}

export async function recordSourceVersion(admin: SupabaseClient, candidateId: string, source: { kind: SourceVersion['kind']; text: string }, sourceRef: Record<string, unknown> = {}): Promise<SourceVersion> {
  const contentHash = sha256(source.text)
  const base = { id: null, kind: source.kind, contentHash, chars: source.text.length, unrecorded: true }
  try {
    const { data: existing } = await admin.from('candidate_source_versions').select('id').eq('candidate_id', candidateId).eq('kind', source.kind).eq('content_hash', contentHash).maybeSingle()
    if (existing?.id) return { ...base, id: existing.id as string, unrecorded: false }
    const { data, error } = await admin
      .from('candidate_source_versions')
      .insert({ candidate_id: candidateId, kind: source.kind, content_hash: contentHash, chars: source.text.length, source_ref: sourceRef })
      .select('id')
      .single()
    if (error || !data) return base
    return { ...base, id: data.id as string, unrecorded: false }
  } catch {
    return base
  }
}
