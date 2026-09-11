/**
 * The target profile: what the client is actually looking for, built from
 * every source we hold on the seat and kept as versions.
 *
 * A version is drafted from the sources; Lily approves it; her edits are
 * overrides that ride on top of every later version. When a source changes
 * (the job row, the HM brief, a question answered, a call recorded, a person
 * she passed on with a reason) a new draft is built and shows the diff to the
 * approved one, so she reads what moved rather than the whole thing again.
 *
 * The model call is one per version on the draft chain, about ten cents.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { structured } from '@/lib/desk/model'
import { normalizeBrief, type BriefBlock } from '@/lib/brief'
import { noteDetail, transcriptText } from '@/lib/granola'
import { researchMarket } from '@/lib/sourcing/market'
import { BriefSpec, type BriefChange, type BriefOverride, type BriefRow, type BriefSource } from '@/lib/sourcing/types'

const MAX_TRANSCRIPT = 14_000
const MAX_BRIEF = 24_000

interface Gathered {
  companyId: string | null
  companyName: string
  title: string
  text: string
  sources: BriefSource[]
}

function domainOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

/** A brief block as plain text; every kind carries its words somewhere different. */
function blockText(b: BriefBlock): string {
  const j = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
  switch (b.kind) {
    case 'lede':
    case 'paragraph':
    case 'callout':
    case 'heading':
      return b.text
    case 'bullets':
    case 'steps':
      return b.items.map(i => `- ${i}`).join('\n')
    case 'blurb':
      return [b.label, ...b.paragraphs, b.note].filter(Boolean).join('\n')
    case 'facts':
    case 'table':
      return b.rows.map(r => j(r)).join('\n')
    case 'cards':
    case 'questions':
    case 'checklist':
    case 'people':
    case 'roles':
    case 'stats':
      return b.items.map(i => j(i)).join('\n')
    case 'jd':
      return b.items.map(it => [`JD: ${it.title}`, ...it.parts.flatMap(p => [`${p.heading}`, ...(p.paragraphs ?? []), ...(p.items ?? []).map(x => `- ${x}`)])].join('\n')).join('\n')
    case 'compbars':
      return [b.caption, ...b.rows.map(r => j(r)), b.note].filter(Boolean).join('\n')
    case 'bar':
      return b.groups.map(g => j(g)).join('\n')
    case 'choice':
      return `${b.prompt} (${b.options.map(o => o.label).join(' / ')})`
    default:
      return ''
  }
}

function day(iso: string | null | undefined): string | null {
  return iso ? iso.slice(0, 10) : null
}

/** Everything we hold on the seat, as one labelled text block for the model plus the list of what was read. */
export async function gatherSources(admin: SupabaseClient, jobId: string, opts: { market?: boolean } = {}): Promise<Gathered> {
  const sources: BriefSource[] = []
  const parts: string[] = []

  const { data: seat } = await admin
    .from('partner_roles_v')
    .select('job_id, company_id, company_name, company_stage, title, headline, location, remote_policy, salary_min, salary_max, salary_currency, visa_requirement, experience_years_min, experience_years_max, hard_requirements, not_for, context, hiring_manager_name, updated_at')
    .eq('job_id', jobId)
    .maybeSingle()
  const { data: job } = await admin.from('jobs').select('description, recruiter_notes, requirements, skills_required, updated_at, company_id, company_name, title').eq('id', jobId).maybeSingle()
  const companyId = (seat?.company_id ?? job?.company_id ?? null) as string | null
  const companyName = (seat?.company_name ?? job?.company_name ?? 'the client') as string
  const title = (seat?.title ?? job?.title ?? 'the role') as string

  const jobText = [
    `Title: ${title}${seat?.headline ? ` (${seat.headline})` : ''}`,
    `Company: ${companyName}${seat?.company_stage ? `, ${seat.company_stage}` : ''}`,
    `Location: ${seat?.location ?? 'not stated'} · ${seat?.remote_policy ?? 'policy not stated'}`,
    `Pay: ${seat?.salary_min && seat?.salary_max ? `${seat.salary_currency ?? 'USD'} ${seat.salary_min} to ${seat.salary_max}` : 'not stated'}`,
    `Work authorisation: ${seat?.visa_requirement ?? 'not stated'}`,
    `Years: ${seat?.experience_years_min ?? '?'} to ${seat?.experience_years_max ?? '?'}`,
    (seat?.hard_requirements as string[] | null)?.length ? `Must (from the job row):\n- ${(seat!.hard_requirements as string[]).join('\n- ')}` : null,
    seat?.not_for ? `Not for: ${seat.not_for}` : null,
    seat?.context ? `Context: ${seat.context}` : null,
    (job?.requirements as string[] | null)?.length ? `Requirements listed: ${(job!.requirements as string[]).join('; ')}` : null,
    (job?.skills_required as string[] | null)?.length ? `Skills listed: ${(job!.skills_required as string[]).join(', ')}` : null,
    job?.description ? `Description:\n${String(job.description).slice(0, 6000)}` : null,
    job?.recruiter_notes ? `Recruiter notes: ${job.recruiter_notes}` : null,
  ]
    .filter(Boolean)
    .join('\n')
  parts.push(`## JOB ROW (source kind "job")\n${jobText}`)
  sources.push({ kind: 'job', label: 'job row', ref: jobId, at: day((seat?.updated_at ?? job?.updated_at) as string | null), chars: jobText.length })

  if (companyId) {
    const { data: briefs } = await admin
      .from('hm_briefs')
      .select('id, title, status, content, published_at, updated_at')
      .eq('company_id', companyId)
      .order('updated_at', { ascending: false })
      .limit(2)
    for (const b of briefs ?? []) {
      const content = normalizeBrief(b.content)
      const text = [
        content.title,
        content.subtitle,
        ...(content.confidential?.paragraphs ?? []),
        ...(content.confidential?.points ?? []),
        ...content.sections.flatMap(sec => [`### ${sec.heading}`, sec.summary ?? '', ...sec.blocks.map(blockText)]),
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_BRIEF)
      if (text.trim().length < 40) continue
      parts.push(`## HIRING-MANAGER BRIEF "${b.title}" (${b.status}; source kind "hm_brief")\n${text}`)
      sources.push({ kind: 'hm_brief', label: `HM brief${b.status === 'published' ? '' : ' (draft)'}`, ref: b.id, at: day((b.published_at ?? b.updated_at) as string), chars: text.length })

      const { data: answers } = await admin.from('hm_brief_answers').select('key, label, value, author_name, created_at').eq('brief_id', b.id).order('created_at')
      if (answers?.length) {
        const text2 = answers.map(a => `- ${a.label ?? a.key}: ${a.value}${a.author_name ? ` (${a.author_name})` : ''}`).join('\n')
        parts.push(`## HIRING-MANAGER ANSWERS on the brief (source kind "hm_answer")\n${text2}`)
        sources.push({ kind: 'hm_answer', label: `${answers.length} HM answer${answers.length === 1 ? '' : 's'}`, ref: b.id, at: day(answers[answers.length - 1].created_at), chars: text2.length })
      }
    }
  }

  const { data: questions } = await admin.from('search_questions').select('question, answer, answered_at, created_at').eq('job_id', jobId).order('created_at')
  if (questions?.length) {
    const text = questions.map(q => `Q: ${q.question}\nA: ${q.answer ?? '(not answered yet)'}`).join('\n\n')
    parts.push(`## SEARCH QUESTIONS asked by partners, answered by the client (source kind "question")\n${text}`)
    sources.push({ kind: 'question', label: `${questions.length} search question${questions.length === 1 ? '' : 's'}`, ref: jobId, at: day(questions[questions.length - 1].answered_at ?? questions[questions.length - 1].created_at), chars: text.length })
  }

  // Calls: recaps are not linked to a company, so match on the counterparty's
  // email domain or a name mention, and read the transcript when Granola has it.
  const { data: company } = companyId ? await admin.from('companies').select('website, name').eq('id', companyId).maybeSingle() : { data: null }
  const domain = domainOf(company?.website)
  const { data: calls } = await admin
    .from('call_recaps')
    .select('id, granola_note_id, person_name, person_email, occurred_at, title, summary')
    .gte('occurred_at', new Date(Date.now() - 120 * 86_400_000).toISOString())
    .order('occurred_at', { ascending: false })
    .limit(40)
  const nameRe = new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  const related = (calls ?? []).filter(c => (domain && (c.person_email ?? '').toLowerCase().endsWith(`@${domain}`)) || nameRe.test(`${c.title ?? ''} ${JSON.stringify(c.summary ?? '')}`))
  for (const c of related.slice(0, 3)) {
    let text = `Summary: ${JSON.stringify(c.summary ?? {}).slice(0, 3000)}`
    if (c.granola_note_id) {
      try {
        const detail = await noteDetail(c.granola_note_id)
        if (detail) {
          const t = transcriptText(detail, c.person_name ?? 'Them')
          if (t.trim()) text = `Transcript (${c.person_name ?? 'them'} and Lily):\n${t.slice(0, MAX_TRANSCRIPT)}`
        }
      } catch (err) {
        console.warn('[sourcing:brief] transcript unavailable:', err instanceof Error ? err.message : err)
      }
    }
    parts.push(`## CALL with ${c.person_name ?? 'the client'} on ${day(c.occurred_at)} (source kind "call")\n${text}`)
    sources.push({ kind: 'call', label: `call with ${c.person_name?.split(' ')[0] ?? 'client'} ${day(c.occurred_at) ?? ''}`.trim(), ref: c.id, at: day(c.occurred_at), chars: text.length })
  }

  // What Lily already decided on this seat, with her reasons. Two rejected
  // people from one background are two facts, not a rule; the prompt says so.
  const { data: decided } = await admin
    .from('sourcing_pool')
    .select('decision, decision_reason, decided_at, sourcing_people(full_name, current_title, current_employer)')
    .eq('job_id', jobId)
    .in('decision', ['not_fit', 'held', 'ready'])
    .not('decision_reason', 'is', null)
    .order('decided_at', { ascending: false })
    .limit(30)
  if (decided?.length) {
    const text = decided
      .map(d => {
        const p = (Array.isArray(d.sourcing_people) ? d.sourcing_people[0] : d.sourcing_people) as { full_name: string; current_title: string | null; current_employer: string | null } | null
        return `- ${d.decision.replace('_', ' ')}: ${p?.full_name ?? 'someone'} (${p?.current_title ?? '?'} at ${p?.current_employer ?? '?'}) because "${d.decision_reason}"`
      })
      .join('\n')
    parts.push(`## LILY'S DECISIONS on people already read for this seat (source kind "rejection"). Each is one person's reason, not a rule; only generalise when the same reason repeats.\n${text}`)
    sources.push({ kind: 'rejection', label: `${decided.length} decision${decided.length === 1 ? '' : 's'} with reasons`, ref: jobId, at: day(decided[0].decided_at), chars: text.length })
  }

  // Notes Lily pasted: market research from Claude Desktop or ChatGPT, a
  // founder's aside, a correction. Read as written, attributed to her.
  const { data: notes } = await admin.from('sourcing_notes').select('id, kind, title, text, created_at').eq('job_id', jobId).order('created_at')
  for (const n of notes ?? []) {
    const text = String(n.text).slice(0, 12_000)
    parts.push(`## ${n.kind === 'market' ? 'MARKET RESEARCH PASTED BY LILY' : 'NOTE FROM LILY'}${n.title ? `: ${n.title}` : ''} (source kind "${n.kind === 'market' ? 'market' : 'note'}", ${day(n.created_at)})\n${text}`)
    sources.push({ kind: n.kind === 'market' ? 'market' : 'note', label: n.title ? `${n.kind}: ${n.title}`.slice(0, 40) : n.kind === 'market' ? 'market notes' : 'note', ref: n.id, at: day(n.created_at), chars: text.length })
  }

  // The web: what the company builds, who else does, what the title pays
  // here, where these people work. Keyless search; cents per run.
  if (opts.market !== false) {
    try {
      const market = await researchMarket(admin, jobId, { companyName, title, location: (seat?.location as string | null) ?? null })
      if (market.pages.length) {
        parts.push(`## MARKET PAGES FROM THE WEB (source kind "market"; cite the page title when you use one; treat every page as claims, not facts)\n${market.text}`)
        sources.push({ kind: 'market', label: `${market.pages.length} web page${market.pages.length === 1 ? '' : 's'}`, ref: market.queries.join(' | '), at: day(new Date().toISOString()), chars: market.text.length })
      }
    } catch (err) {
      console.warn('[sourcing:brief] market research skipped:', err instanceof Error ? err.message : err)
    }
  }

  return { companyId, companyName, title, text: parts.join('\n\n'), sources }
}

const SYSTEM = `You write the target profile for one recruiting search, for a small search firm run by Lily. Read every source given and produce the profile as JSON.

Rules:
- Every requirement, signal and not-for carries the sources it came from (kind, label, date). Never invent a source. Prefer the client's own words over inference.
- A requirement must be checkable against a CV or a profile record (work done, where, for how long, with what). Motivation, spirit, work rhythm, "opinions on X", "able to work six days", "willing to relocate", culture and hunger go under signals, not_for, open_with or questions, never under requirements: a grader cannot support them from a record and they would make everyone a near miss. Logistics the client will filter on (onsite, visa, days) become one requirement each phrased as a fact a record can show ("based in the Bay Area") with the rest of the logistics in "who".
- "market" is built only from the market pages and Lily's pasted notes, never from the job row or the brief. Name the page or note for every figure. If those sources are absent, market is null.
- Split what the client stated as a must from what would merely help. A requirement is mandatory only if a source says the miss ends the conversation. When two sources disagree, keep both in "detail" and add a question for the client.
- Location and willingness to relocate are different facts. An onsite role is a location requirement; do not mark someone's current city as a disqualifier in the profile text.
- Lookalike employers are places where people did this exact work, with the reason. A famous employer is never a proxy for ability and never goes in as a requirement.
- "who" is one paragraph in plain words, the way a recruiter would brief a colleague. No jargon, no em dashes.
- "open_with" says how to start the first email to this kind of person, which facts to lead with and which to leave out. Comp band in the open if the sources give it.
- "questions" are only things the sources genuinely do not settle.
- Decisions with reasons are individual facts about individual people. Two rejected people from big companies do not make "big company" a not-for unless a source states the rule.`

function diffSpecs(before: BriefSpec | null, after: BriefSpec): BriefChange[] {
  if (!before) return []
  const out: BriefChange[] = []
  const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v))
  if (before.who !== after.who) out.push({ field: 'who', before: before.who, after: after.who })
  if (before.open_with !== after.open_with) out.push({ field: 'open_with', before: before.open_with, after: after.open_with })
  const bReq = new Map(before.requirements.map(r => [r.key, r]))
  const aReq = new Map(after.requirements.map(r => [r.key, r]))
  for (const [k, r] of aReq) {
    const prev = bReq.get(k)
    if (!prev) out.push({ field: `requirement ${k}`, before: '', after: `${r.mandatory ? 'must' : 'prefer'}: ${r.label}` })
    else if (prev.mandatory !== r.mandatory || prev.label !== r.label) out.push({ field: `requirement ${k}`, before: `${prev.mandatory ? 'must' : 'prefer'}: ${prev.label}`, after: `${r.mandatory ? 'must' : 'prefer'}: ${r.label}` })
  }
  for (const [k, r] of bReq) if (!aReq.has(k)) out.push({ field: `requirement ${k}`, before: `${r.mandatory ? 'must' : 'prefer'}: ${r.label}`, after: '' })
  const lists: (keyof BriefSpec)[] = ['signals', 'not_for', 'titles', 'employers', 'keywords', 'locations']
  for (const f of lists) {
    const b = (before[f] as unknown[]).map(x => (typeof x === 'string' ? x : str((x as { text?: string; name?: string }).text ?? (x as { name?: string }).name)))
    const a = (after[f] as unknown[]).map(x => (typeof x === 'string' ? x : str((x as { text?: string; name?: string }).text ?? (x as { name?: string }).name)))
    const added = a.filter(x => !b.includes(x))
    const removed = b.filter(x => !a.includes(x))
    if (added.length || removed.length) out.push({ field: String(f), before: removed.join('; '), after: added.join('; ') })
  }
  if (str(before.years) !== str(after.years)) out.push({ field: 'years', before: str(before.years), after: str(after.years) })
  if (before.onsite !== after.onsite) out.push({ field: 'onsite', before: before.onsite, after: after.onsite })
  return out
}

export async function latestBrief(admin: SupabaseClient, jobId: string): Promise<BriefRow | null> {
  const { data } = await admin.from('sourcing_briefs').select('*').eq('job_id', jobId).order('version', { ascending: false }).limit(1).maybeSingle()
  return (data as BriefRow | null) ?? null
}

export async function approvedBrief(admin: SupabaseClient, jobId: string): Promise<BriefRow | null> {
  const { data } = await admin.from('sourcing_briefs').select('*').eq('job_id', jobId).eq('status', 'approved').order('version', { ascending: false }).limit(1).maybeSingle()
  return (data as BriefRow | null) ?? null
}

/**
 * Build a new draft version from the sources. Overrides from the latest
 * version are carried forward; the diff is against the approved version.
 */
export async function buildBrief(admin: SupabaseClient, jobId: string, by: string): Promise<BriefRow> {
  const gathered = await gatherSources(admin, jobId)
  const previous = await latestBrief(admin, jobId)
  const approved = await approvedBrief(admin, jobId)

  const user = `Search: ${gathered.title} at ${gathered.companyName}.\n\n${gathered.text}${
    previous ? `\n\n## PREVIOUS VERSION of this profile (v${previous.version}, ${previous.status}). Keep requirement keys stable where the requirement is the same.\n${JSON.stringify(previous.spec).slice(0, 6000)}` : ''
  }`
  const r = await structured('draft', { system: SYSTEM, user, schema: BriefSpec, maxOutputTokens: 6000 }, { task: 'sourcing_brief', metadata: { job_id: jobId } })

  const spec = r.output
  const changes = diffSpecs(approved ? effectiveSpec(approved) : null, spec)
  const version = (previous?.version ?? 0) + 1
  const overrides = previous?.overrides ?? []
  const { data, error } = await admin
    .from('sourcing_briefs')
    .insert({ job_id: jobId, version, status: 'draft', spec, sources: gathered.sources, changes, overrides, model: r.model, created_by: by })
    .select('*')
    .single()
  if (error) throw new Error(`sourcing_briefs insert: ${error.message}`)
  return data as BriefRow
}

/** Approve a draft; the previously approved version becomes superseded. */
export async function approveBrief(admin: SupabaseClient, briefId: string, by: string): Promise<BriefRow> {
  const { data: b } = await admin.from('sourcing_briefs').select('*').eq('id', briefId).maybeSingle()
  if (!b) throw new Error('brief not found')
  await admin.from('sourcing_briefs').update({ status: 'superseded' }).eq('job_id', b.job_id).eq('status', 'approved').neq('id', briefId)
  const { data, error } = await admin.from('sourcing_briefs').update({ status: 'approved', approved_by: by, approved_at: new Date().toISOString() }).eq('id', briefId).select('*').single()
  if (error) throw new Error(error.message)
  return data as BriefRow
}

/**
 * Overrides: Lily's edits, kept with author, time and reason, applied on top
 * of every version. Paths are dotted; a segment that names a requirement key
 * or an employer name addresses that item ("requirements.react_native.mandatory").
 * The value `null` on an item path removes the item.
 */
export function effectiveSpec(brief: BriefRow): BriefSpec {
  const spec = JSON.parse(JSON.stringify(brief.spec)) as BriefSpec
  for (const o of brief.overrides ?? []) applyPath(spec as unknown as Record<string, unknown>, o.path.split('.'), o.value)
  return spec
}

function applyPath(obj: Record<string, unknown>, segs: string[], value: unknown): void {
  const [head, ...rest] = segs
  if (!head) return
  const cur = obj[head]
  if (!rest.length) {
    if (value === null && Array.isArray(cur)) return
    obj[head] = value
    return
  }
  if (Array.isArray(cur)) {
    const idx = cur.findIndex(item => typeof item === 'object' && item && ((item as { key?: string }).key === rest[0] || (item as { name?: string }).name === rest[0] || (item as { text?: string }).text === rest[0]))
    if (idx < 0) {
      if (rest.length === 1 && value && typeof value === 'object') cur.push(value)
      return
    }
    if (rest.length === 1 && value === null) {
      cur.splice(idx, 1)
      return
    }
    if (rest.length === 1 && value && typeof value === 'object') {
      cur[idx] = { ...(cur[idx] as object), ...(value as object) }
      return
    }
    applyPath(cur[idx] as Record<string, unknown>, rest.slice(1), value)
    return
  }
  if (cur && typeof cur === 'object') applyPath(cur as Record<string, unknown>, rest, value)
}

export async function addOverride(admin: SupabaseClient, briefId: string, override: Omit<BriefOverride, 'at'>): Promise<BriefRow> {
  const { data: b } = await admin.from('sourcing_briefs').select('overrides').eq('id', briefId).maybeSingle()
  if (!b) throw new Error('brief not found')
  const overrides = [...((b.overrides as BriefOverride[]) ?? []).filter(o => o.path !== override.path), { ...override, at: new Date().toISOString() }]
  const { data, error } = await admin.from('sourcing_briefs').update({ overrides }).eq('id', briefId).select('*').single()
  if (error) throw new Error(error.message)
  return data as BriefRow
}

/** The brief as one text block for the grader and the drafter: the effective spec, numbered. */
export function briefText(spec: BriefSpec, companyName: string, title: string): string {
  return [
    `SEARCH: ${title} at ${companyName}`,
    `WHO: ${spec.who}`,
    `REQUIREMENTS:`,
    ...spec.requirements.map(r => `  [${r.key}] (${r.mandatory ? 'MUST' : 'prefer'}) ${r.label}${r.detail ? ` :: evidence: ${r.detail}` : ''}`),
    spec.signals.length ? `STRONG SIGNALS: ${spec.signals.map(s => s.text).join('; ')}` : null,
    spec.not_for.length ? `NOT FOR: ${spec.not_for.map(s => s.text).join('; ')}` : null,
    `LOCATION: ${spec.locations.join(', ') || 'not stated'} (${spec.onsite})`,
    `YEARS: ${spec.years.min ?? '?'} to ${spec.years.max ?? '?'}`,
    `OPEN WITH: ${spec.open_with}`,
  ]
    .filter(Boolean)
    .join('\n')
}
