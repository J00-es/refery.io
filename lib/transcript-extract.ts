import { generateText, Output } from 'ai'
import { z } from 'zod'

/**
 * Pull candidate facts out of an intro-call transcript.
 *
 * These are the fields a résumé structurally cannot supply. Across all 263
 * profiles parsed by the current extractor, salary expectation is null 263
 * times, remote preference 251 times and work authorisation 255 times: not
 * because the parser misses them, but because people do not put them on a CV.
 * They say them out loud on the intro call instead, and those calls have been
 * sitting in `ingested_signals` as full transcripts averaging 36,000
 * characters.
 *
 * Nothing here writes to a candidate row. Every extraction becomes a row in
 * `crm_update_proposals` for review, so a mis-heard number can never silently
 * replace a correct one.
 */

/**
 * Only fields that actually exist as columns on `candidates`.
 *
 * The transcripts contain far more than this: notice periods, visa status,
 * why someone is leaving. There is nowhere to put those today, and inventing
 * columns to hold them is a schema decision, not an extraction one.
 */
export const EXTRACTABLE_FIELDS = [
  'location',
  'remote_preference',
  'salary_expectation_min',
  'salary_expectation_max',
  'availability_status',
] as const

export type ExtractableField = (typeof EXTRACTABLE_FIELDS)[number]

/**
 * Vocabularies the tables already use.
 *
 * `availability_status` is constraint-enforced to exactly these four, so a
 * proposal outside the list is not a bad suggestion, it is a row that will
 * fail to apply. `remote_preference` has no constraint and has drifted into
 * eight spellings including a capitalised duplicate; these four cover 113 of
 * the 129 rows that have a value, and holding new extractions to them stops
 * the drift getting worse.
 */
const REMOTE_PREFERENCE = ['remote', 'hybrid', 'onsite', 'flexible'] as const
const AVAILABILITY_STATUS = ['active', 'off_market', 'not_yet_talked', 'not_qualified'] as const

const FindingSchema = z.object({
  field: z.enum(EXTRACTABLE_FIELDS),
  value: z
    .string()
    .describe(
      'The value as a plain string. Salary figures as bare annual numbers with no currency symbol, separators or units, e.g. "120000" for £120k. remote_preference must be one of: ' +
        REMOTE_PREFERENCE.join(', ') +
        '. availability_status must be one of: ' +
        AVAILABILITY_STATUS.join(', ') +
        '.',
    ),
  quote: z
    .string()
    .describe(
      'The verbatim sentence or two from the transcript where this is stated. Copy it exactly, never paraphrase. This is what the reviewer reads to decide whether to accept.',
    ),
  confidence: z
    .number()
    .describe(
      '0 to 1. Use above 0.9 only when the candidate states the fact plainly about themselves. Use below 0.7 when you are inferring, when it was said in passing, or when the transcript is garbled.',
    ),
})

const ExtractionSchema = z.object({
  findings: z.array(FindingSchema).describe('One entry per fact the transcript actually states. Empty when it states none of them.'),
  currency: z
    .string()
    .nullable()
    .describe('The currency any salary figure was quoted in, as a three-letter code. Null when no salary was discussed.'),
  summary: z.string().describe('One or two sentences on where this person is professionally and what they are looking for.'),
})

export type TranscriptExtraction = z.infer<typeof ExtractionSchema>
export type TranscriptFinding = z.infer<typeof FindingSchema>

const SYSTEM_PROMPT = `You are reading the transcript of a recruiter's intro call with a candidate, to capture the handful of facts a CV never contains.

Report only what the candidate says about themselves. A transcript is evidence, not a form to be completed: returning two findings that are actually in the call is a better result than returning five where three were guessed.

Rules that matter most:
- Never infer a salary. "I'm on about 90 now and looking for a step up" gives you a current salary, not an expectation. Only record salary_expectation_min or salary_expectation_max when the candidate states what they want or would accept.
- A range said out loud ("I'd be looking at 120 to 140") is two findings, a min and a max. A single figure ("I'd want around 130") is a min only.
- Salary figures are annual base, as bare numbers. "130k" is 130000. If the figure is monthly or daily, convert it and say so in the quote.
- location is where the candidate currently lives, city and country. It is not where they want to work and not where their employer is.
- remote_preference is what they want next, not what they have now. Someone remote today who says they would like to be in an office is 'onsite'.
- availability_status: 'active' means they are looking now. 'off_market' means they have accepted something, withdrawn, or said they are staying put. Do not use 'not_yet_talked' — you are reading a call, so they have been talked to. Only use 'not_qualified' if the recruiter concludes it explicitly.
- Every finding needs a verbatim quote. If you cannot quote it, you cannot report it.
- Transcripts are auto-generated and sometimes garbled or fragmented. When a passage is unintelligible, return no findings from it rather than guessing at what was probably said.
- Say nothing about the recruiter's own circumstances, or about other people mentioned in the call.`

/**
 * Models to try, in order.
 *
 * Opus 5 leads because this is judgement work rather than transcription: the
 * hard part is telling "what I earn now" from "what I want next", and telling
 * a real answer from a garbled one. It thinks adaptively by default, so no
 * provider options are sent — this repo has been bitten before by handing a
 * gateway an option the model did not understand and turning a working call
 * into an error. The rest of the chain is what already serves this app, so a
 * retired model id degrades the run rather than ending it.
 */
const MODEL_CHAIN = [
  process.env.TRANSCRIPT_EXTRACT_MODEL,
  'anthropic/claude-opus-5',
  'openai/gpt-5.6-sol',
  'google/gemini-3.6-flash',
].filter((m): m is string => !!m)

let preferredModel: string | null = null

function modelChain(): string[] {
  return preferredModel ? [preferredModel, ...MODEL_CHAIN.filter(m => m !== preferredModel)] : MODEL_CHAIN
}

/** The longest any single extraction may run before we move to the next model. */
const ATTEMPT_TIMEOUT_MS = 120_000

export class NoExtractionModelError extends Error {
  constructor() {
    super('No transcript extraction model answered')
    this.name = 'NoExtractionModelError'
  }
}

export interface ExtractionResult {
  extraction: TranscriptExtraction
  model: string
}

/**
 * Read one candidate's call transcripts.
 *
 * `transcripts` is every linked call for that person, newest last, so the
 * model sees a salary expectation revised across two conversations in the
 * order it was revised.
 */
export async function extractFromTranscripts(
  candidateName: string,
  transcripts: { title: string; occurredAt: string; text: string }[],
): Promise<ExtractionResult> {
  const body = transcripts
    .map(t => `<call title="${t.title}" date="${t.occurredAt}">\n${t.text}\n</call>`)
    .join('\n\n')

  const prompt =
    `These are the intro call transcripts for ${candidateName}, oldest first. ` +
    `Where two calls disagree, the later one wins.\n\n${body}`

  let lastError: unknown

  for (const model of modelChain()) {
    const startedAt = Date.now()
    try {
      const { output, usage } = await generateText({
        model,
        output: Output.object({ schema: ExtractionSchema }),
        system: SYSTEM_PROMPT,
        maxOutputTokens: 8000,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        messages: [{ role: 'user', content: prompt }],
      })

      console.log(
        `[transcript-extract] ok model=${model} calls=${transcripts.length} ms=${Date.now() - startedAt} ` +
          `in=${usage?.inputTokens ?? '?'} out=${usage?.outputTokens ?? '?'} findings=${output.findings.length}`,
      )

      preferredModel = model
      return { extraction: output, model }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[transcript-extract] fail model=${model} ms=${Date.now() - startedAt}: ${message}`)
    }
  }

  throw lastError ?? new NoExtractionModelError()
}

/**
 * Turn a finding into the value the column actually holds, or null when it
 * cannot be one.
 *
 * The model is asked for plain strings because a single loose schema
 * extracts more reliably than five typed ones. The typing happens here, at
 * the boundary, where a bad value can be dropped instead of failing a write.
 */
export function coerceFinding(finding: TranscriptFinding): string | number | null {
  const raw = finding.value?.trim()
  if (!raw) return null

  switch (finding.field) {
    case 'salary_expectation_min':
    case 'salary_expectation_max': {
      // "£130,000 per year" and "130k" both reach here from time to time
      // despite the instruction, so strip rather than reject.
      const digits = raw.replace(/[^0-9.]/g, '')
      const n = Math.round(Number(digits))
      if (!Number.isFinite(n) || n <= 0) return null
      // A figure this small is a monthly or daily rate the model failed to
      // convert, or a stray page number. Either way it is not an annual
      // salary, and writing it would read as a catastrophic pay cut.
      if (n < 1000) return null
      return n
    }
    case 'remote_preference': {
      const v = raw.toLowerCase()
      return (REMOTE_PREFERENCE as readonly string[]).includes(v) ? v : null
    }
    case 'availability_status': {
      const v = raw.toLowerCase()
      return (AVAILABILITY_STATUS as readonly string[]).includes(v) ? v : null
    }
    case 'location':
      return raw
    default:
      return null
  }
}
