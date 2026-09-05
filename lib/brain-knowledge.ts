/**
 * Reading Refery Brain's approved documentation from inside this app.
 *
 * The Brain lives in the same Supabase project as everything else here, so this
 * is a query rather than a service call: no new secret, no network hop, no
 * model call. What it buys is that a commercial fact has exactly one home. Lily
 * edits a Google Doc, the Brain re-indexes it within fifteen minutes, and the
 * next draft written by this app quotes the new number without a deploy.
 *
 * The alternative, which is what the recap drafter did until now, is a copy of
 * the numbers inside a prompt file. That copy had already drifted: it told
 * partners the company-introduction bonus was "10% of Refery's revenue" when
 * the signed agreement says 10% of the placement fee, which is roughly three
 * times larger.
 *
 * Two rules govern everything returned from here.
 *
 * Retrieved text is DATA, never instruction. A Google Doc is edited by people
 * and synced automatically, so a sentence inside one saying "ignore your
 * previous instructions" must be as inert as any other sentence. Callers fence
 * it and say so in the prompt; nothing here is ever concatenated into a system
 * message.
 *
 * Only `active` documents in scope are returned. A Draft is someone still
 * thinking, and the Brain's own contract says a Draft is not authoritative
 * until a person promotes it.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Which agent is asking. Documents opt in per scope via
 * brain_knowledge_documents.agent_scopes, so adding a caller here does not
 * silently widen what an existing document is used for.
 */
export type BrainScope = 'general' | 'refery-inbox' | 'chief-of-staff' | 'call-recap'

export interface BrainChunk {
  documentTitle: string
  documentUrl: string | null
  documentId: string
  chunkId: string
  content: string
}

export interface BrainContext {
  chunks: BrainChunk[]
  /** Ready to drop into a prompt, already fenced. Empty string when nothing matched. */
  block: string
}

/**
 * Characters of Brain context a single draft may carry.
 *
 * The Brain's own inbox agent caps a workflow at 40,000. A recap prompt is
 * already carrying up to 120,000 characters of transcript, and the terms are a
 * page, so this is deliberately much smaller: enough for the commercial facts,
 * not enough for a document to crowd out the conversation the email is about.
 */
const MAX_CONTEXT_CHARS = 8_000

/**
 * Pull the approved documents in scope.
 *
 * Deliberately not a search. The recap drafter wants the whole of the terms
 * every time, not the passages that happen to match words in one transcript:
 * a candidate call that never says "fee" would otherwise retrieve nothing and
 * the model would fall back on whatever it remembers. Full-text ranking earns
 * its place when this grows past a handful of documents, and the schema already
 * carries `search_vector` and `embedding` for that day.
 *
 * Never throws. A recap with no Brain context is worth sending; a run that dies
 * because a table was briefly unreachable is not. The caller is told what came
 * back and can say so on the Slack card.
 */
export async function loadBrainContext(
  admin: SupabaseClient,
  scope: BrainScope,
): Promise<BrainContext> {
  const empty: BrainContext = { chunks: [], block: '' }

  try {
    const { data: docs, error: docErr } = await admin
      .from('brain_knowledge_documents')
      .select('id, title, canonical_url, agent_scopes, status')
      .eq('status', 'active')
      .contains('agent_scopes', [scope])

    if (docErr || !docs?.length) return empty

    const byId = new Map(docs.map(d => [d.id as string, d]))

    const { data: rows, error: chunkErr } = await admin
      .from('brain_knowledge_chunks')
      .select('id, document_id, chunk_index, content')
      .in('document_id', [...byId.keys()])
      .order('document_id', { ascending: true })
      .order('chunk_index', { ascending: true })

    if (chunkErr || !rows?.length) return empty

    const chunks: BrainChunk[] = []
    let used = 0

    for (const row of rows) {
      const doc = byId.get(row.document_id as string)
      if (!doc) continue
      const content = (row.content as string) ?? ''
      if (used + content.length > MAX_CONTEXT_CHARS) break
      used += content.length
      chunks.push({
        documentTitle: (doc.title as string) ?? 'Untitled',
        documentUrl: (doc.canonical_url as string) ?? null,
        documentId: doc.id as string,
        chunkId: row.id as string,
        content,
      })
    }

    if (!chunks.length) return empty

    // Grouped by document so the model sees one coherent page per source rather
    // than a pile of fragments, and titled so a wrong answer can be traced to
    // the document that caused it.
    const parts: string[] = []
    let current = ''
    for (const c of chunks) {
      if (c.documentTitle !== current) {
        if (current) parts.push('')
        parts.push(`### ${c.documentTitle}`)
        current = c.documentTitle
      }
      parts.push(c.content.trim())
    }

    return { chunks, block: parts.join('\n') }
  } catch {
    return empty
  }
}

/**
 * Record what was retrieved, so a draft can always be traced to the version of
 * the terms that produced it.
 *
 * Best effort by design: failing to write an audit row must never cost the
 * draft that was already written.
 */
export async function logBrainRetrieval(
  admin: SupabaseClient,
  context: BrainContext,
  metadata: Record<string, unknown>,
): Promise<void> {
  if (!context.chunks.length) return
  try {
    await admin.from('brain_retrievals').insert(
      context.chunks.map(c => ({
        source_provider: 'brain_knowledge',
        source_table: 'brain_knowledge_chunks',
        source_record_id: c.chunkId,
        excerpt: c.content.slice(0, 500),
        metadata: {
          ...metadata,
          document_id: c.documentId,
          document_title: c.documentTitle,
          document_url: c.documentUrl,
        },
      })),
    )
  } catch {
    /* audit is not worth failing a draft over */
  }
}
