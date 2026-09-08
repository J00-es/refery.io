/**
 * The two model calls behind "Onboard a client".
 *
 * Call one turns the research pages into facts, each with the URL it came
 * from; anything without a page behind it is left out, and what the brief
 * needs but nobody could find becomes a question for the founder. Call two
 * writes the copy: Lily's voice, no em dashes, spoken sentences, one smiley at
 * most. The structure of both briefs is assembled in code afterwards, so the
 * model writes prose and facts, never JSON layout.
 *
 * OpenAI first (gpt-5.6-sol through the gateway, the approved route), Sonnet
 * only if OpenAI fails. Cost is recorded per run.
 */

import { generateText, Output } from 'ai'
import { z } from 'zod'
import { costOf } from '@/lib/desk/model'
import type { SourcePage } from './research'

const CHAIN = ['openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5']

export interface Usage {
  model: string
  tokensIn: number
  tokensOut: number
  costUsd: number
}

async function structured<T>(input: { system: string; user: string; schema: z.ZodType<T>; maxOutputTokens: number; label: string }): Promise<{ output: T; usage: Usage }> {
  let lastError: unknown
  for (const model of CHAIN) {
    const startedAt = Date.now()
    try {
      const { output, usage } = await generateText({
        model,
        output: Output.object({ schema: input.schema }),
        maxOutputTokens: input.maxOutputTokens,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(170_000),
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      })
      const tokensIn = usage?.inputTokens ?? 0
      const tokensOut = usage?.outputTokens ?? 0
      console.log(`[onboarding:${input.label}] model=${model} ms=${Date.now() - startedAt} in=${tokensIn} out=${tokensOut}`)
      return { output: output as T, usage: { model, tokensIn, tokensOut, costUsd: costOf(model, tokensIn, tokensOut) } }
    } catch (err) {
      lastError = err
      console.warn(`[onboarding:${input.label}] model=${model} failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`)
    }
  }
  throw new Error(`[onboarding:${input.label}] no model answered: ${lastError instanceof Error ? lastError.message : 'unknown'}`)
}

// ── call one: facts ──────────────────────────────────────────────────────────

const Fact = z.object({ text: z.string(), source: z.string().describe('URL of the page this came from, exactly as given') })

export const ResearchSchema = z.object({
  company: z.object({
    name: z.string(),
    legalName: z.string().nullable(),
    oneLiner: z.string().describe('What they do, in one sentence, in plain words'),
    founded: z.string().nullable(),
    hq: z.string().nullable(),
    headcount: z.string().nullable().describe('With the source date, e.g. "about 40 (press, Feb 2026)"'),
    stage: z.enum(['pre-seed', 'seed', 'series-a', 'series-b', 'series-c', 'later', 'bootstrapped', 'unknown']),
    funding: z.array(z.object({ when: z.string().nullable(), round: z.string().nullable(), amount: z.string().nullable(), investors: z.array(z.string()), source: z.string() })),
    founders: z.array(z.object({ name: z.string(), role: z.string(), background: z.string(), linkedin: z.string().nullable(), source: z.string() })),
    customers: z.array(Fact),
    metrics: z.array(Fact),
    products: z.array(Fact),
    press: z.array(Fact).describe('Notable coverage or launches, with dates in the text'),
  }),
  roles: z.array(
    z.object({
      title: z.string(),
      url: z.string().nullable(),
      location: z.string().nullable(),
      workingPattern: z.string().nullable().describe('on-site, hybrid, remote, or null if the posting does not say'),
      seniority: z.string().nullable(),
      summary: z.string().describe('What the role is, two or three sentences from the posting'),
      responsibilities: z.array(z.string()),
      requirements: z.array(z.string()),
      niceToHave: z.array(z.string()),
      language: z.string().nullable().describe('A language the posting requires, e.g. "Fluent Spanish is a must"'),
      postedWhen: z.string().nullable(),
      applicants: z.string().nullable(),
      source: z.string().nullable(),
    }),
  ),
  unknowns: z.array(z.string()).describe('What a recruiter needs and no page states: working pattern, process, hiring manager, equity, visa, etc.'),
  conflicts: z.array(z.string()).describe('Where two pages disagree, both figures with sources'),
})
export type Research = z.infer<typeof ResearchSchema>

export async function researchFacts(input: { companyName: string; website: string; notes: string; pages: SourcePage[] }): Promise<{ output: Research; usage: Usage }> {
  const system = `You extract facts about a company and its open roles for a recruiting brief.
Rules that do not bend:
- Every fact must come from one of the pages provided. Give the page URL as its source. If nothing on the pages supports a fact, leave it out.
- Numbers are dangerous: include a metric only with the date or context the page gives it. Never estimate a round size, revenue or headcount.
- Where pages disagree, keep both in "conflicts" with their sources rather than choosing.
- Roles: reproduce responsibilities and requirements faithfully from the posting, as short bullets, in the posting's own terms. Do not invent salary; salary comes from the operator's notes, not from you.
- The operator's notes (WhatsApp, email, call) are a source too: quote them as "operator notes, <date>" in the source field.
- Distinguish the company from any other company with a similar name; use the website domain as the anchor.
- "unknowns" lists what a recruiter needs and could not find: working pattern, interview process, hiring manager per role, equity range, visa sponsorship, whether the company may be named to candidates.
Output only the structured object.`

  const pagesText = input.pages
    .map((p, i) => `### Page ${i + 1} (${p.kind}) ${p.url}${p.title ? `\nTitle: ${p.title}` : ''}\n${p.text}`)
    .join('\n\n')
  const user = `Company: ${input.companyName} (${input.website})

Operator notes (the person onboarding them wrote these; quote them as a source):
${input.notes || '(none)'}

Pages:
${pagesText}`

  return structured({ system, user, schema: ResearchSchema, maxOutputTokens: 9_000, label: 'research' })
}

// ── call two: the copy ───────────────────────────────────────────────────────

export const CopySchema = z.object({
  anonAlias: z.string().describe('How partners see the client before they are on it, e.g. "Healthcare workforce marketplace, Barcelona". No company name.'),
  publicBlurb: z.string().describe('Two sentences a partner sees on the anonymised card. No company name.'),
  companySummary: z.string().describe('One line for the fold: the company in under 25 words'),
  companyLede: z.string().describe('The company as Lily pitches it, two sentences, with one **bold** phrase for what they build'),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).min(2).max(4),
  companyBullets: z.array(z.string()).min(3).max(5).describe('Each starts with a **bold** lead-in: customers, backers, founders, trajectory, product'),
  pitchCallout: z.string().describe('The one-paragraph pitch to a candidate'),
  teamSummary: z.string(),
  people: z.array(z.object({ name: z.string(), role: z.string(), linkedin: z.string().nullable(), note: z.string() })).max(4),
  teamFooter: z.string().nullable(),
  roles: z.array(
    z.object({
      title: z.string().describe('Short title as candidates see it'),
      headline: z.string().describe('Title on the desk, e.g. "Product Manager, Livo Pool"'),
      tag: z.string().describe('e.g. "Live · LinkedIn, 80+ applicants"'),
      scope: z.string().describe('Team · location · reporting, as far as known'),
      points: z.array(z.string()).min(2).max(3),
      want: z.string().describe('Starts with "**I screen for:**"'),
      exclude: z.string().describe('Starts with "I filter out:"'),
      comp: z.string().describe('e.g. "€60K to €90K base + early-stage equity", from the operator notes'),
      description: z.string().describe('The job description for the desk, 4 to 6 sentences, including comp and location'),
      requirements: z.array(z.string()).min(3).max(6),
      partnerContext: z.string().describe('Two to four sentences of context for partners: team, stack, why now'),
      intakeNotes: z.array(z.string()).min(3).max(6).describe('Facts from the operator and the posting partners need; unknowns stated as "not yet confirmed"'),
      notFor: z.string(),
      priority: z.enum(['urgent', 'high', 'normal']),
      experienceYearsMin: z.number().nullable(),
    }),
  ),
  bar: z.object({ must: z.array(z.string()).min(3).max(5), nice: z.array(z.string()).min(2).max(4), no: z.array(z.string()).min(2).max(4) }),
  barSummary: z.string(),
  logistics: z.array(z.object({ label: z.string(), value: z.string() })).min(4).max(7),
  logisticsSummary: z.string(),
  logisticsNote: z.string().nullable(),
  pools: z.array(z.object({ title: z.string(), body: z.string() })).min(3).max(5),
  screening: z.array(z.object({ question: z.string(), lookingFor: z.string() })).min(3).max(5),
  blurb: z.array(z.string()).min(2).max(3).describe('The anonymised candidate blurb, no company name, no investor names'),
  questions: z.array(z.object({ ask: z.string(), why: z.string().nullable() })).min(2).max(4).describe('For the founder, one line answers each'),
  founderIntro: z.array(z.string()).min(1).max(2).describe('Two short lines to the founder by first name, one smiley at most'),
  rolesSummary: z.string(),
  teamNote: z.string().describe('One line: correct me if I have a role wrong'),
})
export type Copy = z.infer<typeof CopySchema>

const VOICE = `You write as Lily, founding partner of Refery, a scout and recruiter network for startups. Lily writes warm, observant, direct and practical; she says why something fits and what happens next. Rules:
- No em dashes anywhere. Use a comma, a colon or a full stop.
- Spoken sentences, mostly under 20 words. Phone first: short paragraphs.
- Only facts from the research. A number without a source is left out. Where the research says unknown, say "not yet confirmed" and put it in the questions.
- Never state a round size unless the research has one with a source. Say "round size not public" instead.
- Currency exactly as given in the operator notes (euros stay euros).
- The founder brief is first person ("as I will pitch it", "I screen for"); the partner brief is for scouts and says "the company" and "you" for the partner.
- One smiley at most in the founder intro, none elsewhere. No exclamation marks.
- Bold with **double asterisks** only where indicated. No other markup.
- Anonymised text (anonAlias, publicBlurb, blurb) never names the company, its investors or its founders.`

export async function writeCopy(input: { research: Research; notes: string; currency: string; feePercent: number; bands: string; contactFirstName: string | null; workingPattern: string | null }): Promise<{ output: Copy; usage: Usage }> {
  const user = `Research (facts with sources):
${JSON.stringify(input.research, null, 1)}

Operator notes:
${input.notes || '(none)'}

Comp bands as the operator gave them (currency ${input.currency}): ${input.bands || 'not given'}
Working pattern as the operator gave it: ${input.workingPattern || 'not given, ask'}
Founder first name: ${input.contactFirstName ?? 'unknown'}
Refery terms for this client: ${input.feePercent}% of first-year base, fully contingent, no retainer, one free replacement within 90 days, invoiced 30 days after start.

Write every field of the schema. Keep the whole thing tight: a founder reads it on a phone.`

  return structured({ system: VOICE, user, schema: CopySchema, maxOutputTokens: 12_000, label: 'copy' })
}
