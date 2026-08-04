import { generateText, Output } from 'ai'
import { z } from 'zod'
import { get } from '@vercel/blob'
import { extractPdfText } from '@/lib/pdf-text'
import type { ParsedResumeData } from '@/lib/types'

/**
 * Bumped whenever the schema below gains fields. Stored on `parsed_data` so we
 * can tell at a glance which profiles were parsed by the thin original
 * extractor and would benefit from a re-run.
 */
export const PARSER_VERSION = 2

/**
 * How hard the model should think about the extraction.
 *
 * This is transcription with structure, not a problem to be reasoned about: the
 * answer is on the page. The default effort spends reasoning tokens — billed at
 * output rates — deliberating over facts that are simply written down, which is
 * most of what made a dense CV take over a minute. 'low' keeps enough judgement
 * for the genuinely ambiguous parts (which dates overlap, what counts as
 * professional experience) without paying to re-read a bullet point.
 */
const REASONING_EFFORT = process.env.RESUME_PARSER_EFFORT || 'low'

/**
 * Reasoning settings, omitted entirely when set to 'default'.
 *
 * Sending a provider option a model does not understand is a good way to turn a
 * working upload into a gateway error, so there has to be a way to switch it off
 * without a deploy — `RESUME_PARSER_EFFORT=default` does that.
 */
function reasoningOptions() {
  if (REASONING_EFFORT === 'default') return {}
  return { providerOptions: { openai: { reasoningEffort: REASONING_EFFORT } } }
}

/**
 * Models to try, in order, stopping at the first that answers.
 *
 * The gateway's catalogue moves faster than this repo does, so a hard-coded
 * single model id is a liability: the day it is retired, every upload starts
 * failing. The last entry is the one that has been serving this app in
 * production, so the chain can only ever be as bad as what we had before.
 */
const MODEL_CHAIN = [
  process.env.RESUME_PARSER_MODEL,
  // Measured, on a one-page résumé fed as text: gpt-5.6-sol produced 1,198
  // output tokens in 43 seconds — about 28 tokens a second. Only 316 of those
  // were reasoning tokens, so the wait was not deliberation we could tune away;
  // it is simply how fast that model writes. A Flash-class model is built for
  // exactly this shape of work — pull structure out of text that already
  // contains the answer — at a fraction of the latency and the price.
  'google/gemini-3.6-flash',
  // Kept behind it on quality grounds: this is what produced the extractions we
  // verified, so if Flash ever returns something the schema rejects, the résumé
  // still gets read properly rather than failing.
  'openai/gpt-5.6-sol',
  'openai/gpt-4o',
].filter((m): m is string => !!m)

/**
 * The first model in the chain that actually worked, remembered for the life of
 * the lambda so we pay the "model does not exist" round-trip at most once per
 * cold start rather than on every resume.
 */
let preferredModel: string | null = null

/**
 * Note on what is deliberately *not* in these schemas.
 *
 * Every field costs output tokens, and output is the expensive half. Three
 * fields were asking the model to say the same thing twice:
 *
 * - `description`, a 1-3 sentence summary of a role, said nothing that
 *   `highlights` did not already say in the candidate's own words.
 * - `duration`, the date range as a formatted string, is `start_date` and
 *   `end_date` glued together — which the UI can do for free, and which also
 *   leaves the dates sortable rather than trapped in prose.
 * - education `year`, likewise, next to `start_year` and `end_year`.
 *
 * Profiles parsed before this change still carry all three, so the display
 * falls back to them; nothing that was captured is lost.
 */
const WorkExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  employment_type: z.string().nullable().describe('full-time, contract, internship, founder, advisor...'),
  location: z.string().nullable(),
  start_date: z.string().nullable().describe('As written, e.g. "March 2022" or "2022-03"'),
  end_date: z.string().nullable().describe('As written, or null when the role is current'),
  is_current: z.boolean().nullable(),
  highlights: z.array(z.string()).describe('EVERY bullet point under this role, verbatim. Do not summarise, merge or drop any.'),
  technologies: z.array(z.string()).describe('Tools, languages and platforms named in this role'),
})

const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  start_year: z.string().nullable(),
  end_year: z.string().nullable(),
  gpa: z.string().nullable(),
  honors: z.string().nullable().describe('Latin honours, distinctions, scholarships, class rank'),
  activities: z.string().nullable().describe('Societies, clubs, teams, leadership positions'),
  location: z.string().nullable(),
})

const ParsedResumeSchema = z.object({
  // Identity
  name: z.string(),
  headline: z.string().nullable().describe('The tagline under the name, if there is one'),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable().describe('City, state/country'),

  // Links
  linkedin_url: z.string().nullable(),
  github_url: z.string().nullable(),
  portfolio_url: z.string().nullable().describe('Personal site, portfolio, Dribbble, Substack...'),
  other_links: z.array(z.string()).describe('Any remaining URLs on the resume'),

  // Positioning
  current_title: z.string().nullable(),
  current_company: z.string().nullable(),
  seniority_level: z.string().nullable().describe('intern, junior, mid, senior, staff, principal, director, vp, c-level, founder'),
  experience_years: z.number().describe('Total years of professional experience. A decimal such as 1.5 is fine and preferred over rounding.'),
  summary: z.string().describe('2-4 sentences on who this person is professionally'),

  // Substance
  skills: z.array(z.string()).describe('Every skill, tool, language and platform named anywhere on the resume'),
  industries: z.array(z.string()).describe('Industries and domains this person has worked in'),
  work_history: z.array(WorkExperienceSchema).describe('EVERY position on the resume, newest first. Never truncate this list.'),
  education: z.array(EducationSchema).describe('EVERY school, degree, bootcamp and course listed'),
  certifications: z.array(z.string()).describe('Each certification as "Name — Issuer, Year" where those are known'),
  languages: z.array(z.object({
    language: z.string(),
    proficiency: z.string().nullable(),
  })),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string().nullable(),
    url: z.string().nullable(),
    technologies: z.array(z.string()),
  })),
  awards: z.array(z.object({
    name: z.string(),
    issuer: z.string().nullable(),
    year: z.string().nullable(),
    description: z.string().nullable(),
  })),
  publications: z.array(z.object({
    title: z.string(),
    venue: z.string().nullable(),
    year: z.string().nullable(),
    url: z.string().nullable(),
  })),
  volunteer: z.array(z.object({
    organization: z.string(),
    role: z.string().nullable(),
    duration: z.string().nullable(),
    description: z.string().nullable(),
  })),

  // Availability
  remote_preference: z.string().nullable().describe('remote, hybrid or onsite — only if stated'),
  willing_to_relocate: z.boolean().nullable(),
  work_authorization: z.string().nullable().describe('Visa status or work eligibility, only if stated'),
  notice_period: z.string().nullable(),
  salary_expectation_min: z.number().nullable(),
  salary_expectation_max: z.number().nullable(),
  salary_currency: z.string().nullable(),

  // Fidelity
  extraction_notes: z.string().nullable().describe('Anything present on the resume that did not fit a field above'),
})

const SYSTEM_PROMPT = `You are an expert technical recruiter who reads resumes exhaustively.

Your single most important rule: READ THE ENTIRE DOCUMENT, EVERY PAGE. A resume is
not a summary to be compressed — it is a record to be transferred. A recruiter
reading the extracted profile should never have to open the PDF to discover
something that was on it.

Specifically:
- Capture EVERY position in work_history, including internships, contract work,
  advisory roles, founder roles and side ventures. Never stop at the most recent
  three. Never collapse two roles at the same company into one.
- Under each position, put EVERY bullet point into highlights, kept close to the
  original wording. Numbers, percentages, dollar figures, team sizes and named
  customers are the most valuable content on a resume — never paraphrase them
  away.
- Capture EVERY education entry, including bootcamps, certificates, exchange
  programmes and unfinished degrees, along with honours and activities.
- Skills must include everything named anywhere on the page, including tools
  mentioned only inside a bullet point, not just the "Skills" section.

Accuracy rules:
- Extract what is stated. Infer only where the inference is unambiguous — for
  example, seniority from job titles, or total years of experience from the date
  ranges of the roles.
- experience_years is professional experience only; exclude schooling. Overlapping
  roles count once. A decimal such as 2.5 is expected and better than rounding.
- Return null for anything the resume does not state. Never invent an email,
  a phone number, a salary expectation or a visa status.
- Preserve the candidate's own wording for titles and companies; do not
  normalise "Founding Engineer" into "Software Engineer".`

const TRANSCRIBE_PROMPT = `Transcribe this document verbatim, in reading order.

Include every section heading, every bullet point, every date, every company and
every contact line, exactly as written. Preserve the order they appear in and put
each logical line on its own line.

Do not summarise, do not reformat into prose, do not comment on the document, and
never write a placeholder such as "[remainder of resume]". Output the document
text and nothing else.`

/**
 * Wall-clock budget for one extraction, shared by every attempt it makes.
 *
 * Two things went wrong before this was a shared deadline. A single call that
 * produced the structured fields *and* the transcription blew past the route's
 * limit on a dense three-page CV — so those are now separate calls run
 * concurrently, and the slow path is the longer of the two rather than their
 * sum. And when the first model timed out, the fallback started a *fresh* full
 * timeout, guaranteeing the route was killed before it could answer. The budget
 * now belongs to the operation, not to each attempt.
 *
 * Kept below the route's `maxDuration` so there is room to read the blob and
 * write the row.
 */
export const EXTRACTION_BUDGET_MS = 240_000

/**
 * The longest any single model call may run.
 *
 * Measured: a one-page résumé extracts in the mid-twenties of seconds and a
 * dense three-page CV in the mid-forties. Anything past this is not a slow
 * résumé, it is a stalled request — and without a cap it consumed the entire
 * budget, so the user sat on a spinner for four minutes and then got nothing.
 * Capping the attempt turns that into a fast failure with the whole fallback
 * chain still ahead of it.
 */
const ATTEMPT_TIMEOUT_MS = 75_000

/** Too little time left to be worth starting another model. */
const MIN_ATTEMPT_MS = 10_000

/** What this attempt gets: its own cap, or whatever is left, whichever is less. */
function attemptBudget(deadline: number): number {
  return Math.min(ATTEMPT_TIMEOUT_MS, deadline - Date.now())
}

interface AnalyzeSuccess {
  parsed: z.infer<typeof ParsedResumeSchema>
  model: string
}

/**
 * What we hand the model: the résumé's own text layer where the PDF has one,
 * the rendered pages where it does not.
 */
type ResumeSource =
  | { kind: 'text'; text: string }
  | { kind: 'pdf'; base64: string }

/** The chain to try, most recently successful model first. */
function modelChain(): string[] {
  return preferredModel
    ? [preferredModel, ...MODEL_CHAIN.filter(m => m !== preferredModel)]
    : MODEL_CHAIN
}


/**
 * Transcribe the document in full.
 *
 * Deliberately not part of the structured call: it is by far the largest chunk
 * of output, and it is also the part we can most afford to lose. Returns null
 * rather than throwing, so a résumé too long to transcribe inside the budget
 * still produces a complete structured profile.
 */
async function transcribeResume(base64: string, deadline: number): Promise<string | null> {
  for (const model of modelChain()) {
    const remaining = attemptBudget(deadline)
    if (remaining < MIN_ATTEMPT_MS) break

    try {
      const { text } = await generateText({
        model,
        system: TRANSCRIBE_PROMPT,
        maxOutputTokens: 16000,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(remaining),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'file', data: base64, mediaType: 'application/pdf' },
              { type: 'text', text: 'Transcribe this document in full.' },
            ],
          },
        ],
      })

      const trimmed = text?.trim()
      if (trimmed) return trimmed
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Résumé transcription failed on ${model}: ${message}`)
      if (isAccountError(message)) return null
    }
  }

  return null
}

/**
 * Ask the first working model in the chain to read the PDF.
 *
 * A model id the gateway does not serve fails fast and deterministically, so
 * walking the chain costs one wasted call at most; anything else (a rate limit,
 * a refusal, a malformed structured response) is worth retrying on the next
 * model too, since the alternative is telling the user their resume is
 * unreadable.
 */
async function analyzeWithFallback(
  source: ResumeSource,
  deadline: number,
): Promise<AnalyzeSuccess> {
  let lastError: unknown

  // Plain text where we have it. Handing the model the résumé's own text layer
  // instead of its rendered pages is the cheapest change available: pages are
  // billed as images and cost several times what the same words cost as text,
  // and the model spends none of its budget doing OCR it does not need to do.
  const content =
    source.kind === 'text'
      ? [
          {
            type: 'text' as const,
            text: `Here is the résumé, as extracted from the PDF's text layer:\n\n<resume>\n${source.text}\n</resume>`,
          },
        ]
      : [
          { type: 'file' as const, data: source.base64, mediaType: 'application/pdf' },
          {
            type: 'text' as const,
            text: 'Read this résumé end to end and extract every field. Include every role and every bullet point.',
          },
        ]

  for (const model of modelChain()) {
    const remaining = attemptBudget(deadline)
    if (remaining < MIN_ATTEMPT_MS) break

    const startedAt = Date.now()
    try {
      const { output, usage } = await generateText({
        model,
        output: Output.object({ schema: ParsedResumeSchema }),
        system: SYSTEM_PROMPT,
        // Every bullet of a long career is a lot of structured output; the
        // default cap truncates the last few roles on a dense CV.
        maxOutputTokens: 16000,
        // No retry. A structured call that has already run for tens of seconds
        // is not helped by silently running again — it just doubles the wait
        // with nothing on screen to explain it.
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(remaining),
        ...reasoningOptions(),
        messages: [{ role: 'user', content }],
      })

      // Kept permanently: without it, "uploads feel slow" is unanswerable.
      // Reads as one line per extraction in the runtime logs.
      console.log(
        `[resume-parser] ok model=${model} source=${source.kind} ms=${Date.now() - startedAt} ` +
          `in=${usage?.inputTokens ?? '?'} out=${usage?.outputTokens ?? '?'} ` +
          `reasoning=${usage?.reasoningTokens ?? 0} effort=${REASONING_EFFORT}`,
      )

      preferredModel = model
      return { parsed: output, model }
    } catch (error) {
      console.warn(`[resume-parser] fail model=${model} ms=${Date.now() - startedAt}`)
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Resume analysis failed on ${model}: ${message}`)

      // Billing and quota problems will hit every model in the chain
      // identically, so surface them immediately instead of burning the chain.
      if (isAccountError(message)) throw error
      // A stall is now capped rather than open-ended, so there is time left to
      // hand the same résumé to the next model — which is usually all it takes.
    }
  }

  throw lastError ?? new Error('No resume parsing model available')
}

export function isAccountError(message: string): boolean {
  return (
    message.includes('credit card') ||
    message.includes('customer_verification_required') ||
    message.includes('rate limit') ||
    message.includes('quota')
  )
}

/**
 * Read a resume out of blob storage and extract it.
 *
 * Shared by the upload flow and by re-analysis, so a profile parsed today and a
 * profile re-parsed a year from now go through exactly the same extractor.
 */
export async function analyzeResumeFromBlob(
  pathname: string,
  budgetMs: number = EXTRACTION_BUDGET_MS,
): Promise<ParsedResumeData> {
  const deadline = Date.now() + budgetMs

  const result = await get(pathname, { access: 'private' })

  if (!result?.stream) {
    throw new ResumeNotFoundError(pathname)
  }

  const chunks: Uint8Array[] = []
  const reader = result.stream.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  const bytes = Buffer.concat(chunks)

  // Almost every résumé is a text export, and its words are already in the
  // file. Taking them from there means the verbatim record costs nothing and is
  // exact, and — more importantly — the extraction call can be fed text instead
  // of rendered pages. That turns the common case from two vision calls into
  // one text call.
  const pdfText = await extractPdfText(new Uint8Array(bytes))

  if (pdfText.usable) {
    const structured = await analyzeWithFallback({ kind: 'text', text: pdfText.text }, deadline)

    return {
      ...structured.parsed,
      raw_text: pdfText.text,
      parser_version: PARSER_VERSION,
      parser_model: structured.model,
      parsed_at: new Date().toISOString(),
      source: 'text-layer',
    } as ParsedResumeData
  }

  // A scan, or a design-led CV whose text is all outlines. The model has to
  // look at the pages, and it has to transcribe them too, since there is no
  // text layer to take the verbatim record from. Run both concurrently so the
  // slow path is the longer of the two rather than their sum.
  const base64 = bytes.toString('base64')
  const [structured, rawText] = await Promise.all([
    analyzeWithFallback({ kind: 'pdf', base64 }, deadline),
    transcribeResume(base64, deadline),
  ])

  return {
    ...structured.parsed,
    raw_text: rawText,
    parser_version: PARSER_VERSION,
    parser_model: structured.model,
    parsed_at: new Date().toISOString(),
    source: 'vision',
  } as ParsedResumeData
}

export class ResumeNotFoundError extends Error {
  constructor(pathname: string) {
    super(`Resume file not found in storage: ${pathname}`)
    this.name = 'ResumeNotFoundError'
  }
}
