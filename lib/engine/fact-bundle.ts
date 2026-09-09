import { stableHash } from './evidence'
import type { SupabaseClient } from '@supabase/supabase-js'

export const FACT_VERSION = 'structured-facts-v1'
export interface EvidenceFact {
  fact_key: string
  fact_value: unknown
  status: 'self_reported' | 'unknown'
  span: string | null
  source_path: string
}

/** A parser output is a claim, not independent verification. Preserve the
 * structured source path even when the parser's wording has no exact raw span. */
export function buildFactBundle(parsed: Record<string, unknown>) {
  const raw = typeof parsed.raw_text === 'string' ? parsed.raw_text : ''
  const facts: EvidenceFact[] = []
  const add = (key: string, value: unknown, sourcePath: string) => {
    if (value === undefined || value === null || value === '') return
    const quote = typeof value === 'string' && raw.includes(value) ? value : null
    facts.push({ fact_key: key, fact_value: value, status: 'self_reported', span: quote, source_path: sourcePath })
  }
  for (const field of ['skills', 'experience_years', 'work_authorization', 'location', 'remote_preference', 'salary_expectation_min', 'salary_expectation_max', 'salary_currency', 'notice_period', 'willing_to_relocate']) add(field, parsed[field], `parsed_data.${field}`)
  for (const field of ['work_history', 'projects']) {
    const rows = Array.isArray(parsed[field]) ? parsed[field] as Record<string, unknown>[] : []
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') return
      for (const key of ['title', 'description', 'highlights', 'technologies', 'start_date', 'end_date', 'is_current']) add(`${field}.${i}.${key}`, row[key], `parsed_data.${field}[${i}].${key}`)
    })
  }
  return { version: FACT_VERSION, contentHash: stableHash(parsed), facts }
}

export async function persistFactBundle(admin: SupabaseClient, candidateId: string, parsed: Record<string, unknown>) {
  const bundle = buildFactBundle(parsed)
  const { data, error } = await admin.rpc('engine_save_fact_bundle', { p_candidate_id: candidateId, p_parsed: parsed, p_hash: bundle.contentHash, p_facts: bundle.facts })
  if (error || typeof data !== 'string') throw new Error(`Evidence persistence failed: ${error?.message ?? 'missing source version'}`)
  return data
}
