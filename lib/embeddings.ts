import { embed } from 'ai'
import { createAdminClient } from '@/lib/supabase/server'
import { buildEmbeddingText } from '@/lib/resume'
import type { ParsedResumeData } from '@/lib/types'
import { sha256 } from '@/lib/engine/evidence'

/** The builder contract: bump when buildEmbeddingText changes what it embeds. */
export const EMBEDDING_VERSION = 'candidate-text-v1'

/**
 * The model every existing candidate and job vector was built with. The
 * `candidates.embedding` column is `vector(1536)`, which is this model's output
 * size — changing the model means backfilling every row, so it is pinned.
 */
export const EMBEDDING_MODEL = 'openai/text-embedding-3-small'

/**
 * Give a freshly created candidate a vector so they are matchable immediately.
 *
 * Until now embeddings arrived only from the nightly job, so a candidate
 * uploaded in the morning showed an empty "Suggested roles" card all day and
 * could not appear in any match run. Doing it inline costs a few hundred
 * milliseconds on create.
 *
 * Never throws: a candidate saved without a vector is a candidate that the
 * nightly job will pick up, whereas a create that fails because the embedding
 * service was briefly down is lost work.
 */
export async function embedCandidate(
  candidateId: string,
  parsed: Partial<ParsedResumeData>,
  name: string,
): Promise<boolean> {
  try {
    const text = buildEmbeddingText(parsed, name)
    if (text.trim().length < 20) return false

    // Content, not updated_at, decides whether the vector is recomputed.
    const inputHash = sha256(`${EMBEDDING_VERSION}
${text}`)
    const admin = createAdminClient()
    const { data: current } = await admin.from('candidates').select('embedding_input_hash, embedding_version').eq('id', candidateId).maybeSingle()
    if (current?.embedding_input_hash === inputHash && current?.embedding_version === EMBEDDING_VERSION) return true

    const { embedding } = await embed({ model: EMBEDDING_MODEL, value: text })

    const { error } = await admin
      .from('candidates')
      .update({
        embedding,
        embedded_at: new Date().toISOString(),
        embedding_source: 'text-embedding-3-small',
        embedding_input_hash: inputHash,
        embedding_version: EMBEDDING_VERSION,
      })
      .eq('id', candidateId)

    if (error) throw error
    return true
  } catch (error) {
    console.error(`Could not embed candidate ${candidateId}:`, error)
    return false
  }
}
