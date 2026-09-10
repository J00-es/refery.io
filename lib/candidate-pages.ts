/**
 * Candidate pages: the version of a search a candidate may read, at
 * refery.xyz/j/<slug>, no login.
 *
 * The company is never named on it. The page is drafted from the original
 * JD once, when the search goes live: a rule pass strips everything that
 * identifies the client (name, aliases, people, URLs, the posted title), then
 * one model pass rewrites the posting in its own words with "the company" in
 * place of the name and offers the "good to know" lines that are safe for a
 * candidate. The rule pass runs again over whatever the model returns. The
 * draft goes live at once, conservative by construction; Lily reviews it live
 * and edits from the role page. A search that closes shows a closed page;
 * rotating the slug breaks every copied link.
 *
 * Partner-only facts never cross: the fee, the payout, the bar (not_for),
 * intake notes verbatim, hiring-manager quotes and hunting grounds, the URL.
 */

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Output } from 'ai'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { BudgetDeferredError, paidGenerateText } from '@/lib/engine/paid'
import { fetchJob } from '@/lib/client-onboarding/research'
import { postToFeed } from '@/lib/desk-notifications'
import { esc } from '@/lib/slack-bot'
import { REMOTE_LABELS, formatSalary, seniorityLabel, visaSignal } from '@/lib/job-ui'
import { anonLabel } from '@/lib/partners'
import { hashIp } from '@/lib/apply/profile'
import { viewerContext } from '@/lib/hm-brief'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://refery.xyz').replace(/\/$/, '')
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const SLUG_LENGTH = 7
const CHAIN = ['openai/gpt-5.6-sol', 'anthropic/claude-sonnet-5']

export function mintSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export function candidatePageUrl(slug: string, via?: string | null): string {
  return `${APP_URL}/j/${slug}${via ? `?via=${encodeURIComponent(via)}` : ''}`
}

export interface InterviewStep {
  title: string
  detail: string | null
}

export interface CandidatePageRow {
  job_id: string
  slug: string
  status: 'draft' | 'published' | 'revoked'
  headline: string | null
  company_line: string | null
  company_blurb: string | null
  jd_text: string | null
  requirements: string[]
  good_to_know: string[]
  good_to_know_offered: string[]
  interview_steps: InterviewStep[]
  show_salary: boolean
  show_equity: boolean
  draft_flags: DraftFlags
  version: number
  drafted_at: string | null
  drafted_by: string | null
  published_at: string | null
  revoked_at: string | null
  edited_at: string | null
  updated_at: string
}

export interface DraftFlags {
  removed?: string[]
  kept?: string[]
  softened?: string[]
  model?: string | null
  cost_usd?: number | null
  fallback?: string | null
}

// ── the rule pass ───────────────────────────────────────────────────────────

const STOP = new Set(['the', 'and', 'inc', 'labs', 'lab', 'company', 'co', 'ltd', 'llc', 'corp', 'group', 'ai', 'technologies', 'technology', 'software', 'systems', 'team', 'studio'])

/** Every spelling of the company we can predict: full name, name minus suffixes, distinctive tokens, the domain. */
export function forbiddenTerms(input: { companyName: string | null; aliases?: (string | null | undefined)[]; website?: string | null; people?: (string | null | undefined)[] }): string[] {
  const out = new Set<string>()
  const add = (s: string | null | undefined) => {
    const t = (s ?? '').trim()
    if (t.length >= 3) out.add(t)
  }
  for (const name of [input.companyName, ...(input.aliases ?? [])]) {
    if (!name) continue
    add(name)
    const stripped = name.replace(/\b(inc|labs?|llc|ltd|co|corp|corporation|technologies|technology)\b\.?/gi, '').replace(/[.,]+$/, '').trim()
    if (stripped && stripped.toLowerCase() !== name.toLowerCase()) add(stripped)
    for (const token of name.split(/[\s,()/-]+/)) {
      const t = token.replace(/[^A-Za-z0-9]/g, '')
      if (t.length >= 4 && !STOP.has(t.toLowerCase())) add(t)
    }
  }
  if (input.website) {
    const host = input.website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0]
    add(host)
    const root = host.split('.')[0]
    if (root.length >= 4 && !STOP.has(root)) add(root)
  }
  for (const person of input.people ?? []) {
    const p = (person ?? '').trim()
    if (!p) continue
    add(p)
    const first = p.split(/\s+/)[0]
    if (first.length >= 3) add(first)
  }
  return [...out].sort((a, b) => b.length - a.length)
}

/**
 * Names the posting itself uses for the company: "About Arcanum Labs",
 * "Arcanum Labs works on…", "(Arx Labs)". The row's company name is often
 * the short form, and the posting opens with the long one.
 */
export function aliasesFromJd(text: string): string[] {
  const head = text.slice(0, 1_500)
  const out = new Set<string>()
  const name = '([A-Z][\\w&.-]*(?:\\s+[A-Z][\\w&.-]*){0,3})'
  for (const re of [new RegExp(`^\\s*About\\s+${name}`, 'm'), new RegExp(`^\\s*${name}\\s+(?:is|was|works|builds|helps|makes|creates|develops|partners)\\b`, 'm'), new RegExp(`\\(${name}\\)`)]) {
    const m = head.match(re)
    if (m?.[1] && m[1].length >= 3 && !/^(The|We|Our|About|This|You|Your)$/.test(m[1])) out.add(m[1].trim())
  }
  return [...out]
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Company names, people and URLs out; "the company" in. Counts what it changed. */
export function scrub(text: string, terms: string[], replacement = 'the company'): { text: string; removed: string[] } {
  let out = text
  const removed = new Set<string>()
  // URLs and email addresses first, whole.
  out = out.replace(/\bhttps?:\/\/[^\s)>\]]+/gi, m => {
    removed.add(m)
    return ''
  })
  out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, m => {
    removed.add(m)
    return ''
  })
  for (const term of terms) {
    const re = new RegExp(`(?<![\\w@])${escapeRe(term)}(?:'s)?(?![\\w])`, 'gi')
    if (re.test(out)) {
      removed.add(term)
      out = out.replace(re, m => (/'s$/i.test(m) ? `${replacement}'s` : replacement))
    }
  }
  // "The company the company", doubled articles and dangling "at the company (the company)".
  out = out
    .replace(/\b(the company)(\s+\1)+/gi, '$1')
    .replace(/\b(a|an|the)\s+the company\b/gi, 'the company')
    .replace(/\(\s*the company\s*\)/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // Sentence starts.
  out = out.replace(/(^|[.!?]\s+|\n\s*)the company\b/g, (_m, pre) => `${pre}The company`)
  return { text: out, removed: [...removed] }
}

// ── the model pass ──────────────────────────────────────────────────────────

const DraftSchema = z.object({
  jdText: z.string().describe('The job description rewritten for a candidate, in the posting\'s own words, with the company never named.'),
  companyBlurb: z.string().describe('One or two sentences about the company, no name, no named customers, investors or people.'),
  requirements: z.array(z.string()).describe('What they are looking for, one line each, from the posting and the hard requirements.'),
  goodToKnow: z.array(z.object({ text: z.string(), safe: z.boolean(), reason: z.string() })).describe('Candidate-facing lines drafted from the intake notes.'),
  interviewSteps: z.array(z.object({ title: z.string(), detail: z.string().nullable() })),
  keptProperNouns: z.array(z.string()).describe('Proper nouns that survive in the output, for review.'),
})
type Draft = z.infer<typeof DraftSchema>

const SYSTEM = `You write the candidate-facing version of a job description for Refery, a recruiting network. A candidate reads this page before agreeing to a conversation; the company's name comes only with that conversation.

Rules, all of them hard:
- Never name the company, its founders, hiring managers or employees, its products by name, its customers, its investors, or its job-board URL. Write "the company" or "they". Remove any "posted as" title.
- Keep the posting's own words and structure: responsibilities and requirements as they are, tightened only where a sentence names something forbidden. Do not add claims the posting did not make. No marketing filler. No em dashes.
- companyBlurb: one or two sentences a stranger could not use to identify the company. Replace named third parties with generic descriptors ("well-known AI companies", "large enterprise customers", "a top-tier fund").
- requirements: the hard requirements the hiring team set, one line each, with the same care about names.
- goodToKnow: from the intake notes, draft lines a candidate would be glad to know (equity range, visa rules, office rhythm, how the team works, what the interview values). Mark safe:false for anything that must stay with recruiters: direct quotes from the hiring manager, "hunting grounds" or companies to poach from, comp negotiation tactics, who will not clear, internal priorities or politics, client names. Include the unsafe ones too, marked, so a reviewer sees what was left out.
- interviewSteps: the same steps with people's names removed ("Intro call with a founder"), details shortened.
- keptProperNouns: every proper noun that remains anywhere in your output.`

async function modelDraft(input: { headline: string; original: string; requirements: string[]; intakeNotes: string[]; interviewSteps: InterviewStep[]; publicBlurb: string | null; alias: string | null; forbidden: string[] }): Promise<{ draft: Draft; model: string; costUsd: number } | { error: string }> {
  const user = [
    `Search headline: ${input.headline}`,
    `Company alias already approved for partners (may be used as a guide, not as text): ${input.alias ?? 'none'}`,
    `Company blurb approved for partners (soften named third parties): ${input.publicBlurb ?? 'none'}`,
    `Terms that must not appear anywhere in the output: ${input.forbidden.join(' | ') || 'none'}`,
    '',
    'Hard requirements set by the hiring team:',
    ...input.requirements.map(r => `- ${r}`),
    '',
    'Intake notes (recruiter-only source material; draft candidate-safe lines and mark the unsafe):',
    ...input.intakeNotes.map(n => `- ${n}`),
    '',
    'Interview steps:',
    ...input.interviewSteps.map(s => `- ${s.title}${s.detail ? ` | ${s.detail}` : ''}`),
    '',
    'The original job description:',
    input.original.slice(0, 14_000),
  ].join('\n')
  let lastError = 'no model answered'
  for (const model of CHAIN) {
    try {
      const { result, charge } = await paidGenerateText<Draft>(
        {
          model,
          output: Output.object({ schema: DraftSchema }),
          // Reasoning models spend output tokens thinking; 3k starved them into "No output generated".
          maxOutputTokens: 10_000,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(120_000),
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
        },
        { source: 'onboarding', task: 'candidate_page_draft', discretionary: true },
      )
      return { draft: result.output, model, costUsd: charge?.costUsd ?? 0 }
    } catch (err) {
      if (err instanceof BudgetDeferredError) return { error: 'budget deferred' }
      lastError = err instanceof Error ? err.message.slice(0, 200) : String(err)
      console.warn(`[candidate-page] model=${model} failed: ${lastError}`)
    }
  }
  return { error: lastError }
}

// ── the original JD ─────────────────────────────────────────────────────────

/** The posting as posted or pasted. Fetched once from job_post_url when nothing is on file. */
export async function ensureOriginalJd(admin: SupabaseClient, job: { id: string; description: string | null; description_original: string | null; description_source: string | null; job_post_url: string | null; internal_deal_type?: string | null }): Promise<{ text: string; source: string }> {
  if (job.description_original && job.description_original.trim().length > 80) return { text: job.description_original, source: job.description_source ?? 'unknown' }
  if (job.job_post_url) {
    const page = await fetchJob(job.job_post_url).catch(() => null)
    if (page && page.text.length > 300) {
      await admin.from('jobs').update({ description_original: page.text, description_source: 'posting' }).eq('id', job.id)
      return { text: page.text, source: 'posting' }
    }
  }
  // Nothing better: what the row holds. Ingested rows are the posting verbatim;
  // onboarded rows hold the summary, and the flags say so.
  const text = job.description ?? ''
  const source = job.internal_deal_type === 'public' ? 'posting' : 'unknown'
  if (text.trim()) await admin.from('jobs').update({ description_original: text, description_source: source }).eq('id', job.id)
  return { text, source }
}

// ── drafting ────────────────────────────────────────────────────────────────

interface RoleSource {
  job_id: string
  company_id: string
  title: string
  headline: string | null
  description: string | null
  requirements: string[] | null
  hard_requirements: string[] | null
  intake_notes: string[] | null
  interview_steps: InterviewStep[] | null
  job_post_url: string | null
  company_name: string | null
  hiring_manager_name: string | null
}

async function roleSource(admin: SupabaseClient, jobId: string): Promise<{ role: RoleSource; client: { anon_alias: string | null; public_blurb: string | null }; company: { name: string; website: string | null; stage: string | null; industry: string | null }; people: string[]; job: { id: string; description: string | null; description_original: string | null; description_source: string | null; job_post_url: string | null; internal_deal_type: string | null } } | null> {
  const { data: role } = await admin.from('partner_roles_v').select('job_id, company_id, title, headline, description, requirements, hard_requirements, intake_notes, interview_steps, job_post_url, company_name').eq('job_id', jobId).maybeSingle()
  if (!role) return null
  const [{ data: job }, { data: client }, { data: company }, { data: contacts }] = await Promise.all([
    admin.from('jobs').select('id, description, description_original, description_source, job_post_url, internal_deal_type, hiring_manager_name').eq('id', jobId).maybeSingle(),
    admin.from('client_companies').select('anon_alias, public_blurb').eq('company_id', role.company_id).maybeSingle(),
    admin.from('companies').select('name, website, stage, industry').eq('id', role.company_id).maybeSingle(),
    admin.from('company_contacts').select('name').eq('company_id', role.company_id).limit(20),
  ])
  if (!job || !company) return null
  const people = [job.hiring_manager_name as string | null, ...((contacts ?? []).map(c => c.name as string | null))].filter((p): p is string => !!p)
  return {
    role: { ...(role as unknown as RoleSource), hiring_manager_name: (job.hiring_manager_name as string | null) ?? null },
    client: { anon_alias: (client?.anon_alias as string | null) ?? null, public_blurb: (client?.public_blurb as string | null) ?? null },
    company: { name: company.name as string, website: (company.website as string | null) ?? null, stage: (company.stage as string | null) ?? null, industry: (company.industry as string | null) ?? null },
    people,
    job: job as { id: string; description: string | null; description_original: string | null; description_source: string | null; job_post_url: string | null; internal_deal_type: string | null },
  }
}

/** Only lines that name nobody and quote nobody survive the rule filter for the default set. */
function ruleSafe(line: string, forbidden: string[]): boolean {
  if (/["“”]/.test(line)) return false
  if (/\b(hunting ground|poach|steal|competitor|rival|negotiat|lowball|walk away|anchor)/i.test(line)) return false
  return scrub(line, forbidden).removed.length === 0
}

export interface DraftResult {
  page: CandidatePageRow
  created: boolean
}

/**
 * Draft, or re-draft, the page for a search and publish it. Idempotent by
 * job. `force` re-drafts an existing page (Lily's "Re-draft" button); the
 * slug and the toggles survive a re-draft, the text is replaced.
 */
export async function draftCandidatePage(admin: SupabaseClient, jobId: string, opts: { by: string; force?: boolean; publish?: boolean } = { by: 'system' }): Promise<DraftResult | null> {
  const { data: existing } = await admin.from('candidate_pages').select('*').eq('job_id', jobId).maybeSingle()
  if (existing && !opts.force) return { page: existing as CandidatePageRow, created: false }

  const src = await roleSource(admin, jobId)
  if (!src) return null
  const { role, client, company, people, job } = src
  const original = await ensureOriginalJd(admin, job)
  const forbidden = forbiddenTerms({ companyName: company.name, aliases: [role.company_name, ...aliasesFromJd(original.text)], website: company.website, people: [...people, role.hiring_manager_name] })
  const headline = (role.headline || role.title).trim()
  const requirements = (role.hard_requirements?.length ? role.hard_requirements : role.requirements ?? []).filter(Boolean)
  const intakeNotes = role.intake_notes ?? []
  const steps = Array.isArray(role.interview_steps) ? role.interview_steps : []
  const publicBlurb = client.public_blurb
  const alias = client.anon_alias ?? anonLabel({ anon_alias: null, stage: company.stage, industry: company.industry })

  const flags: DraftFlags = { removed: [], kept: [], softened: [], model: null, cost_usd: null, fallback: null }
  let jdText: string
  let companyBlurb: string | null
  let reqOut: string[]
  let offered: string[]
  let ticked: string[]
  let stepsOut: InterviewStep[]

  const m = original.text.trim().length > 80 ? await modelDraft({ headline, original: original.text, requirements, intakeNotes, interviewSteps: steps, publicBlurb, alias, forbidden }) : { error: 'no original JD on file' }
  if ('draft' in m) {
    const d = m.draft
    flags.model = m.model
    flags.cost_usd = m.costUsd
    const jd = scrub(d.jdText, forbidden)
    jdText = jd.text
    const blurb = scrub(d.companyBlurb, forbidden)
    companyBlurb = blurb.text || null
    reqOut = d.requirements.map(r => scrub(r, forbidden).text).filter(Boolean).slice(0, 10)
    offered = d.goodToKnow.map(g => scrub(g.text, forbidden).text).filter(Boolean).slice(0, 10)
    ticked = d.goodToKnow.filter(g => g.safe).map(g => scrub(g.text, forbidden).text).filter(t => t && ruleSafe(t, forbidden)).slice(0, 6)
    stepsOut = d.interviewSteps.map(s => ({ title: scrub(s.title, forbidden, 'the team').text.slice(0, 120), detail: s.detail ? scrub(s.detail, forbidden, 'the team').text.slice(0, 240) || null : null })).filter(s => s.title).slice(0, 8)
    flags.removed = [...new Set([...jd.removed, ...blurb.removed])]
    flags.kept = d.keptProperNouns.filter(n => !forbidden.some(f => f.toLowerCase() === n.toLowerCase())).slice(0, 20)
    flags.softened = d.goodToKnow.filter(g => !g.safe).map(g => `${g.text.slice(0, 80)} (${g.reason})`).slice(0, 10)
  } else {
    // No model: the rule pass alone, and the page says so in the flags.
    flags.fallback = m.error
    const jd = scrub(original.text || role.description || '', forbidden)
    jdText = jd.text
    companyBlurb = publicBlurb ? scrub(publicBlurb, forbidden).text : null
    reqOut = requirements.map(r => scrub(r, forbidden).text).filter(Boolean).slice(0, 10)
    offered = intakeNotes.map(n => scrub(n, forbidden).text).filter(Boolean)
    ticked = []
    stepsOut = steps.map(s => ({ title: scrub(s.title, forbidden, 'the team').text, detail: s.detail ? scrub(s.detail, forbidden, 'the team').text : null })).filter(s => s.title)
    flags.removed = jd.removed
  }

  const now = new Date().toISOString()
  // A rule-only draft is not safe to show: the posting's own name for the
  // company can survive it. It stays a draft until Lily has read it.
  const publish = opts.publish !== false && !flags.fallback
  const row = {
    job_id: jobId,
    headline,
    company_line: alias,
    company_blurb: companyBlurb,
    jd_text: jdText,
    requirements: reqOut,
    good_to_know: ticked,
    good_to_know_offered: offered,
    interview_steps: stepsOut,
    draft_flags: flags,
    drafted_at: now,
    drafted_by: opts.by,
  }
  if (existing) {
    const { data, error } = await admin
      .from('candidate_pages')
      .update({ ...row, version: (existing.version as number) + 1, show_salary: existing.show_salary, show_equity: existing.show_equity })
      .eq('job_id', jobId)
      .select('*')
      .single()
    if (error || !data) throw new Error(`candidate page: ${error?.message}`)
    return { page: data as CandidatePageRow, created: false }
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = mintSlug()
    const { data, error } = await admin
      .from('candidate_pages')
      .insert({ ...row, slug, status: publish ? 'published' : 'draft', published_at: publish ? now : null })
      .select('*')
      .single()
    if (!error && data) {
      await postToFeed(
        publish
          ? `:page_with_curl: Candidate page live for *${esc(headline)}* (${esc(company.name)}): ${candidatePageUrl(slug)}. Review it from the role page; edits go live at once.`
          : `:page_with_curl: Candidate page drafted for *${esc(headline)}* (${esc(company.name)}) but NOT live: the model did not answer (${esc(flags.fallback ?? 'unknown')}), so it is a rule pass only. Read it on the role page, edit, then publish.`,
      )
      return { page: data as CandidatePageRow, created: true }
    }
    if (error?.code !== '23505') throw new Error(`candidate page: ${error?.message}`)
  }
  throw new Error('candidate page: could not mint a unique slug')
}

/** When a search goes live, or is found live without a page. Never throws into the caller. */
export async function ensureCandidatePage(admin: SupabaseClient, jobId: string, by = 'system'): Promise<CandidatePageRow | null> {
  try {
    const r = await draftCandidatePage(admin, jobId, { by })
    return r?.page ?? null
  } catch (err) {
    console.error('[candidate-page] ensure failed:', err)
    return null
  }
}

// ── reading ─────────────────────────────────────────────────────────────────

export interface PublicCandidatePage {
  page: CandidatePageRow
  role: {
    location: string | null
    remoteLabel: string | null
    seniority: string | null
    salary: string | null
    visa: string | null
    priority: string
    decisionDays: number | null
    targetStart: string | null
    isOpen: boolean
    hasEquity: boolean
  }
  referrer: { code: string; firstName: string; fullName: string } | null
}

/**
 * The page behind a slug, or null for every reason alike (unknown, draft,
 * revoked). A closed search still returns, with isOpen false, so the page can
 * say so and keep the share-your-CV door.
 */
export const findCandidatePage = cache(async function findCandidatePage(slug: string, via: string | null): Promise<PublicCandidatePage | null> {
  if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{7}$/.test(slug)) return null
  const admin = createAdminClient()
  const { data: page } = await admin.from('candidate_pages').select('*').eq('slug', slug).maybeSingle()
  if (!page || page.status !== 'published') return null
  const { data: role } = await admin.from('partner_roles_v').select('location, remote_policy, seniority, salary_min, salary_max, salary_currency, visa_requirement, priority, decision_days, target_start, is_live, job_status').eq('job_id', page.job_id).maybeSingle()
  if (!role) return null
  let referrer: PublicCandidatePage['referrer'] = null
  if (via) {
    const { resolveCode } = await import('@/lib/share-codes')
    const code = await resolveCode(admin, via)
    if (code) {
      const { data: u } = await admin.from('users_admin').select('full_name').eq('user_id', code.userId).maybeSingle()
      const full = ((u?.full_name as string | null) ?? '').trim()
      if (full) referrer = { code: code.code, firstName: full.split(/\s+/)[0], fullName: full }
    }
  }
  return {
    page: page as CandidatePageRow,
    role: {
      location: (role.location as string | null) ?? null,
      remoteLabel: role.remote_policy ? REMOTE_LABELS[role.remote_policy as string] ?? null : null,
      seniority: role.seniority ? seniorityLabel(role.seniority as string) : null,
      salary: (page as CandidatePageRow).show_salary ? formatSalary(role.salary_min as number | null, role.salary_max as number | null, role.salary_currency as string | null) : null,
      visa: visaSignal(role.visa_requirement as string | null),
      priority: role.priority as string,
      decisionDays: (role.decision_days as number | null) ?? null,
      targetStart: role.target_start ? new Date(role.target_start as string).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null,
      isOpen: role.is_live === true && role.job_status === 'open',
      hasEquity: (page as CandidatePageRow).show_equity,
    },
    referrer,
  }
})

export async function recordPageEvent(admin: SupabaseClient, input: { jobId: string; slug: string; via: string | null; kind: 'view' | 'interested' | 'submitted'; sessionId: string | null; headers: Headers }): Promise<void> {
  const v = viewerContext(input.headers)
  const ua = v.userAgent ?? ''
  const device = /mobile|iphone|android/i.test(ua) ? 'phone' : /ipad|tablet/i.test(ua) ? 'tablet' : 'desktop'
  await admin.from('candidate_page_events').insert({ job_id: input.jobId, slug: input.slug, via_code: input.via, kind: input.kind, session_id: input.sessionId, ip_hash: hashIp(v.ip), country: v.country, device })
}

/** Opens of one search's page, per partner code, for the share panel. */
export async function pageOpens(admin: SupabaseClient, jobId: string, codes: string[]): Promise<{ opens: number; lastAt: string | null }> {
  if (!codes.length) return { opens: 0, lastAt: null }
  const { data, count } = await admin.from('candidate_page_events').select('created_at', { count: 'exact' }).eq('job_id', jobId).eq('kind', 'view').in('via_code', codes).order('created_at', { ascending: false }).limit(1)
  return { opens: count ?? 0, lastAt: (data?.[0]?.created_at as string | undefined) ?? null }
}

// ── editing ─────────────────────────────────────────────────────────────────

export interface PageEdit {
  headline?: string
  company_line?: string | null
  company_blurb?: string | null
  jd_text?: string
  requirements?: string[]
  good_to_know?: string[]
  interview_steps?: InterviewStep[]
  show_salary?: boolean
  show_equity?: boolean
  status?: 'published' | 'draft'
}

export async function updateCandidatePage(admin: SupabaseClient, jobId: string, edit: PageEdit): Promise<CandidatePageRow | null> {
  const patch: Record<string, unknown> = { edited_at: new Date().toISOString() }
  if (edit.headline !== undefined) patch.headline = edit.headline.trim().slice(0, 160)
  if (edit.company_line !== undefined) patch.company_line = edit.company_line?.trim().slice(0, 200) || null
  if (edit.company_blurb !== undefined) patch.company_blurb = edit.company_blurb?.trim().slice(0, 1200) || null
  if (edit.jd_text !== undefined) patch.jd_text = edit.jd_text.trim().slice(0, 20_000)
  if (edit.requirements) patch.requirements = edit.requirements.map(r => r.trim()).filter(Boolean).slice(0, 12)
  if (edit.good_to_know) patch.good_to_know = edit.good_to_know.map(r => r.trim()).filter(Boolean).slice(0, 10)
  if (edit.interview_steps) patch.interview_steps = edit.interview_steps.map(s => ({ title: s.title.trim().slice(0, 120), detail: s.detail?.trim().slice(0, 240) || null })).filter(s => s.title).slice(0, 8)
  if (typeof edit.show_salary === 'boolean') patch.show_salary = edit.show_salary
  if (typeof edit.show_equity === 'boolean') patch.show_equity = edit.show_equity
  if (edit.status) {
    patch.status = edit.status
    if (edit.status === 'published') patch.published_at = new Date().toISOString()
  }
  const { data, error } = await admin.from('candidate_pages').update(patch).eq('job_id', jobId).select('*').single()
  if (error) throw new Error(`candidate page: ${error.message}`)
  return (data as CandidatePageRow | null) ?? null
}

/** A new slug: every link ever copied stops working. */
export async function rotateCandidatePage(admin: SupabaseClient, jobId: string): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = mintSlug()
    const { error } = await admin.from('candidate_pages').update({ slug }).eq('job_id', jobId)
    if (!error) return slug
    if (error.code !== '23505') throw new Error(`candidate page: ${error.message}`)
  }
  throw new Error('candidate page: could not mint a unique slug')
}

/** Live searches without a page yet: drafted one by one, oldest first, a few per call. */
export async function draftMissingPages(admin: SupabaseClient, limit = 3): Promise<{ drafted: string[]; skipped: number }> {
  const { data: live } = await admin.from('partner_roles').select('job_id').eq('is_live', true)
  const ids = (live ?? []).map(r => r.job_id as string)
  if (!ids.length) return { drafted: [], skipped: 0 }
  const { data: have } = await admin.from('candidate_pages').select('job_id').in('job_id', ids)
  const done = new Set((have ?? []).map(r => r.job_id as string))
  const missing = ids.filter(id => !done.has(id))
  const drafted: string[] = []
  for (const id of missing.slice(0, limit)) {
    const r = await ensureCandidatePage(admin, id, 'cron')
    if (r) drafted.push(id)
  }
  return { drafted, skipped: Math.max(0, missing.length - drafted.length) }
}
