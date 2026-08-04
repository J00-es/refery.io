import { generateText, Output } from 'ai'
import { z } from 'zod'
import { get } from '@vercel/blob'
import type { ParsedResumeData } from '@/lib/types'

/**
 * Bumped whenever the schema below gains fields. Stored on `parsed_data` so we
 * can tell at a glance which profiles were parsed by the thin original
 * extractor and would benefit from a re-run.
 */
export const PARSER_VERSION = 2

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
  'openai/gpt-5.6-sol',
  'openai/gpt-4o',
].filter((m): m is string => !!m)

/**
 * The first model in the chain that actually worked, remembered for the life of
 * the lambda so we pay the "model does not exist" round-trip at most once per
 * cold start rather than on every resume.
 */
let preferredModel: string | null = null

const WorkExperienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  employment_type: z.string().nullable().describe('full-time, contract, internship, founder, advisor...'),
  location: z.string().nullable(),
  start_date: z.string().nullable().describe('As written, e.g. "March 2022" or "2022-03"'),
  end_date: z.string().nullable().describe('As written, or null when the role is current'),
  is_current: z.boolean().nullable(),
  duration: z.string().describe('The date range exactly as it appears on the resume'),
  description: z.string().describe('A faithful summary of the role in 1-3 sentences'),
  highlights: z.array(z.string()).describe('EVERY bullet point under this role, verbatim. Do not summarise, merge or drop any.'),
  technologies: z.array(z.string()).describe('Tools, languages and platforms named in this role'),
})

const EducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  year: z.string().describe('The years as written, e.g. "2018 - 2022"'),
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

/** Too little time left to be worth starting another model. */
const MIN_ATTEMPT_MS = 10_000

interface AnalyzeSuccess {
  parsed: z.infer<typeof ParsedResumeSchema>
  model: string
}

/** The chain to try, most recently successful model first. */
function modelChain(): string[] {
  return preferredModel
    ? [preferredModel, ...MODEL_CHAIN.filter(m => m !== preferredModel)]
    : MODEL_CHAIN
}

/**
 * True when the attempt died because it ran out of time rather than because the
 * model was wrong for the job.
 *
 * The distinction decides whether falling back is worth anything: a model id the
 * gateway does not serve fails in milliseconds and the next one deserves a go,
 * whereas a model that ran out the clock has left nothing for anyone else — and
 * the next model would be no faster on the same document.
 */
function isTimeout(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    (error instanceof Error && error.name === 'TimeoutError') ||
    message.includes('aborted') ||
    message.includes('timeout')
  )
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
    const remaining = deadline - Date.now()
    if (remaining < MIN_ATTEMPT_MS) break

    try {
      const { text } = await generateText({
        model,
        system: TRANSCRIBE_PROMPT,
        maxOutputTokens: 16000,
        maxRetries: 1,
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
      if (isAccountError(message) || isTimeout(error)) return null
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
async function analyzeWithFallback(base64: string, deadline: number): Promise<AnalyzeSuccess> {
  let lastError: unknown

  for (const model of modelChain()) {
    const remaining = deadline - Date.now()
    if (remaining < MIN_ATTEMPT_MS) break

    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: ParsedResumeSchema }),
        system: SYSTEM_PROMPT,
        // Every bullet of a long career is a lot of structured output; the
        // default cap truncates the last few roles on a dense CV.
        maxOutputTokens: 16000,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(remaining),
        messages: [
          {
            role: 'user',
            content: [
              { type: 'file', data: base64, mediaType: 'application/pdf' },
              {
                type: 'text',
                text: 'Read this resume end to end and extract every field. Include every role and every bullet point.',
              },
            ],
          },
        ],
      })

      preferredModel = model
      return { parsed: output, model }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`Resume analysis failed on ${model}: ${message}`)

      // Billing and quota problems will hit every model in the chain
      // identically, so surface them immediately instead of burning the chain.
      if (isAccountError(message)) throw error
      // Out of time, not out of options — another model will not be faster.
      if (isTimeout(error)) throw error
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

  const base64 = Buffer.concat(chunks).toString('base64')

  // Concurrent, not sequential: the platform gives the route 60 seconds total,
  // and running these back to back is what made long CVs time out with nothing
  // to show for it.
  const [structured, rawText] = await Promise.all([
    analyzeWithFallback(base64, deadline),
    transcribeResume(base64, deadline),
  ])

  return {
    ...structured.parsed,
    raw_text: rawText,
    parser_version: PARSER_VERSION,
    parser_model: structured.model,
    parsed_at: new Date().toISOString(),
  } as ParsedResumeData
}

export class ResumeNotFoundError extends Error {
  constructor(pathname: string) {
    super(`Resume file not found in storage: ${pathname}`)
    this.name = 'ResumeNotFoundError'
  }
}
