/**
 * "Onboard a client": one trigger, everything drafted, one review card.
 *
 * Research the company and the roles, write the copy in Lily's voice, then
 * create every record Livo needed by hand this week: the company, the client
 * card (unpublished), the searches (live but invisible until the client is
 * published), the partner brief (draft), the founder brief (draft, with the
 * agreement button, Slack by email and the delivery choice), an open
 * agreement link and a private Slack room. Then post one card in #refery-desk.
 * Nothing reaches a partner or a founder until Lily reacts :+1: on that card;
 * :-1: leaves everything unpublished.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { postMessage, postThreadReply, esc, type SlackBlock } from '@/lib/slack-bot'
import { deskChannel } from '@/lib/desk-notifications'
import { briefUrl, newBriefSlug } from '@/lib/hm-brief'
import { issueClientAgreementLink } from '@/lib/agreement-links'
import { ensureClientRoom } from '@/lib/slack-connect'
import { gatherSources } from './research'
import { researchFacts, writeCopy, type Copy, type Research } from './draft'
import { Resend } from 'resend'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://refery.xyz').replace(/\/$/, '')

export interface OnboardInput {
  website: string
  companyName: string | null
  contactName: string | null
  contactEmail: string | null
  roleInputs: string[]
  currency: 'USD' | 'EUR' | 'GBP'
  bands: string
  workingPattern: string | null
  feePercent: number
  notes: string
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function guessName(website: string): string {
  const host = website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  const base = host.replace(/^get/, '').split('.')[0]
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Stable job ids per run so a re-run of the same client updates rather than duplicates. */
async function setStatus(admin: SupabaseClient, runId: string, patch: Record<string, unknown>) {
  await admin.from('onboarding_runs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', runId)
}

const CONFIDENTIAL = {
  heading: 'Before you read on',
  paragraphs: [
    'This brief is confidential and shared with Refery partners only. Please do not forward it, and do not share it with candidates.',
    'The company name stays with you. When you approach a candidate, use the blurb at the end of this brief and do not send links that name the company. Once a candidate is in and has agreed to a conversation, share the company, the founders and this brief freely.',
  ],
}
const SUBMIT_STEPS = [
  '**Press Submit a candidate on the search.** Pick from your candidates or add someone new from a PDF CV.',
  '**Write why them, against the bar.** Three lines. Work authorisation and comp are two taps. Refery reads it, then it goes to the hiring manager with your name on it.',
  '**It is timestamped the moment you press submit.** That starts your 24-month protection on the candidate with this client. Refery confirms within a day.',
  '**Ask before you submit:** has this person already applied to or been contacted by the company another way? Only fresh introductions are attributable.',
]
const SIGNOFF = { name: 'Lily Joo', lines: ['Founding Partner, Refery', 'lily@refery.io'], reminder: 'Questions on fit, comp or process: ask on the search and the answer is added for everyone on it.' }

function partnerBrief(copy: Copy, research: Research, website: string) {
  const name = research.company.name
  return {
    kicker: 'Refery · Partner brief',
    title: name,
    subtitle: `${copy.roles.length} ${copy.roles.length === 1 ? 'search' : 'searches'}${research.company.hq ? ` · ${research.company.hq}` : ''}`,
    url: website,
    confidential: CONFIDENTIAL,
    sections: [
      { id: 'company', heading: 'The company', summary: copy.companySummary, blocks: [
        { kind: 'lede', text: copy.companyLede },
        { kind: 'stats', items: copy.stats },
        { kind: 'bullets', items: copy.companyBullets },
        { kind: 'callout', text: copy.pitchCallout },
      ] },
      { id: 'bar', heading: 'The bar', blocks: [{ kind: 'bar', groups: [
        { tone: 'must', heading: 'Non-negotiable', items: copy.bar.must },
        { tone: 'nice', heading: 'Explicitly not required', items: copy.bar.nice },
        { tone: 'no', heading: 'Will not clear', items: copy.bar.no },
      ] }] },
      { id: 'logistics', heading: 'Logistics', blocks: [
        { kind: 'facts', rows: copy.logistics },
        ...(copy.logisticsNote ? [{ kind: 'paragraph', tone: 'note', text: copy.logisticsNote }] : []),
      ] },
      { id: 'pools', heading: 'Where the strongest profiles come from', blocks: [{ kind: 'cards', items: copy.pools }] },
      { id: 'screening', heading: 'Screening guide', blocks: [{ kind: 'questions', items: copy.screening.map(q => ({ question: q.question, looking_for: q.lookingFor })) }] },
      { id: 'blurb', heading: 'What to say to a candidate', blocks: [{ kind: 'blurb', label: 'Copy to adapt', note: 'Anonymous until Refery clears the name. Adapt to the person, never send raw. No company name, no investor names, no links.', paragraphs: copy.blurb }] },
      { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
    ],
    signoff: SIGNOFF,
  }
}

function founderBrief(copy: Copy, research: Research, input: OnboardInput, agreementUrl: string) {
  const name = research.company.name
  const first = input.contactName?.split(/\s+/)[0] ?? null
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const domain = input.website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
  return {
    kicker: `Refery · ${today}`,
    title: name,
    subtitle: copy.roles.map(r => r.title).join(' · ') + (research.company.hq ? ` · ${research.company.hq}` : ''),
    url: input.website,
    confidential: { heading: 'Before we start', paragraphs: copy.founderIntro },
    sections: [
      { id: 'start', nav: 'How we work', heading: 'How we work', open: true, summary: 'Sign, connect on Slack, tell me how you want candidates. Then I go, and you answer fast.', blocks: [
        { kind: 'steps', items: [
          `**Agree the terms.** ${input.feePercent}% of first-year base, fully contingent, no retainer, one free replacement if the hire leaves within 90 days, invoiced 30 days after start. Anyone with signing authority at ${name} can sign, no account needed.`,
          '**Connect on Slack.** Type your email below and I invite you to a channel with me. One thread for profiles, your yes or no, and scheduling; nothing sits in an inbox.',
          `**Correct this brief.** A line under any section is plenty. ${copy.questions.length} short questions at the end.`,
          '**Then we kick off.** I check our own pool first, then brief the scouts with your exact bar. The first profiles are as much calibration as shortlist, so a yes or no on each within a day or two, with a reason, is what makes the next batch sharper.',
        ] },
        { kind: 'cta', label: 'Sign the client agreement', url: agreementUrl, note: 'Two minutes. Terms as above.' },
        { kind: 'invite', prompt: 'Connect on Slack: type your email and I invite you, or a teammate, to a channel with me.', note: 'One address at a time. You get the invitation from Slack by email.', placeholder: `you@${domain}`, button: 'Invite me to Slack' },
        { kind: 'choice', key: 'candidate_delivery', prompt: 'How would you like to receive candidates?', note: 'One tap. Change it any time; I am told the moment you choose.', options: [
          { value: 'slack', label: 'Slack', detail: 'Profiles, your yes or no, and scheduling in one thread.' },
          { value: 'email', label: 'Email', detail: 'One email per candidate with the profile and CV.' },
          { value: 'platform', label: 'Refery platform', detail: 'Every candidate, their status and your feedback on one private page.' },
        ] },
        { kind: 'callout', text: 'Why speed: the people you want are talking to two or three companies at once. The hiring managers who land them reply almost live and get the first call booked within days.' },
      ] },
      { id: 'company', nav: 'Company', heading: `${name}, as I will pitch it`, summary: copy.companySummary, blocks: [
        { kind: 'lede', text: copy.companyLede },
        { kind: 'stats', items: copy.stats },
        { kind: 'bullets', items: copy.companyBullets },
      ] },
      { id: 'team', nav: 'Team', heading: 'The team, as I present it', summary: copy.teamSummary, blocks: [
        { kind: 'people', items: copy.people.map(p => ({ name: p.name, role: p.role, linkedin: p.linkedin ?? undefined, note: p.note })), footer: copy.teamFooter ?? undefined },
      ] },
      { id: 'roles', nav: 'Roles', heading: copy.roles.length === 1 ? 'The role' : `The ${copy.roles.length} roles`, summary: copy.rolesSummary, blocks: [
        { kind: 'roles', items: copy.roles.map(r => ({ tag: r.tag, title: r.title, scope: r.scope, points: r.points, want: r.want, exclude: r.exclude, comp: r.comp })) },
        { kind: 'paragraph', tone: 'note', text: 'Roles that are public are checked with every candidate before I introduce them: only fresh introductions count.' },
      ] },
      { id: 'bar', nav: 'The bar', heading: 'The bar', summary: copy.barSummary, blocks: [{ kind: 'bar', groups: [
        { tone: 'must', heading: 'Non-negotiable', items: copy.bar.must },
        { tone: 'nice', heading: 'Not required', items: copy.bar.nice },
        { tone: 'no', heading: 'I will filter out', items: copy.bar.no },
      ] }] },
      { id: 'logistics', nav: 'Logistics', heading: 'Logistics', summary: copy.logisticsSummary, blocks: [
        { kind: 'facts', rows: copy.logistics },
        ...(copy.logisticsNote ? [{ kind: 'paragraph', tone: 'note', text: copy.logisticsNote }] : []),
      ] },
      { id: 'blurb', nav: 'Blurb', heading: 'What candidates see', summary: `The anonymised blurb, word for word. Nothing in it identifies ${name}.`, blocks: [
        { kind: 'blurb', label: 'Candidate blurb', note: 'Anonymous until your go-sign', paragraphs: copy.blurb },
        { kind: 'paragraph', tone: 'note', text: `Say the word and I name ${name} openly. It makes the first conversation easier.` },
      ] },
      { id: 'confirm', nav: 'Questions', heading: `${copy.questions.length === 1 ? 'One quick question' : `${['Two', 'Three', 'Four'][copy.questions.length - 2] ?? copy.questions.length} quick questions`}`, open: true, summary: 'One line each and we are calibrated.', blocks: [
        { kind: 'checklist', note: 'Answer here, a line each. You can edit or delete anything you write.', items: copy.questions.map(q => ({ ask: q.ask, why: q.why ?? undefined })) },
      ] },
    ],
    signoff: { name: 'Lily', lines: ['Founding Partner, Refery · [lily@refery.io](mailto:lily@refery.io)', 'Anything to correct, write it under the section. It reaches me straight away.'], reminder: `Confidential · prepared for ${name}${first ? ` and ${first}` : ''}` },
  }
}

function parseBand(bands: string, index: number): { min: number | null; max: number | null } {
  const parts = bands.split(/[·;|]/).map(s => s.trim()).filter(Boolean)
  const part = parts[index] ?? parts[0] ?? ''
  const nums = [...part.matchAll(/(\d+(?:[.,]\d+)?)\s*(k)?/gi)].map(m => {
    const n = Number(m[1].replace(',', '.'))
    return m[2] || n < 1000 ? Math.round(n * 1000) : Math.round(n)
  })
  if (!nums.length) return { min: null, max: null }
  return { min: nums[0], max: nums[1] ?? nums[0] }
}

/** The whole run. Never throws past the status update: a failure is a row Lily can read. */
export async function runOnboarding(runId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: run } = await admin.from('onboarding_runs').select('*').eq('id', runId).single()
  if (!run) return
  const input = run.input as OnboardInput
  const createdBy = run.created_by as string

  try {
    const website = /^https?:\/\//i.test(input.website) ? input.website : `https://${input.website}`
    const companyName = input.companyName?.trim() || guessName(website)

    // ── research ──
    await setStatus(admin, runId, { status: 'researching' })
    const pages = await gatherSources({ website, companyName, roleInputs: input.roleInputs })
    const notes = [input.notes, input.bands ? `Comp bands (${input.currency}): ${input.bands}` : '', input.workingPattern ? `Working pattern: ${input.workingPattern}` : '']
      .filter(Boolean)
      .join('\n')
    const research = await researchFacts({ companyName, website, notes, pages })
    let cost = research.usage.costUsd
    await setStatus(admin, runId, { status: 'drafting', research: research.output, sources: pages.map(p => ({ url: p.url, kind: p.kind, title: p.title })), cost_usd: cost, model: research.usage.model })

    // ── copy ──
    const copy = await writeCopy({
      research: research.output,
      notes,
      currency: input.currency,
      feePercent: input.feePercent,
      bands: input.bands,
      contactFirstName: input.contactName?.split(/\s+/)[0] ?? null,
      workingPattern: input.workingPattern,
    })
    cost += copy.usage.costUsd
    await setStatus(admin, runId, { copy: copy.output, cost_usd: cost })

    const name = research.output.company.name || companyName
    const c = copy.output
    const r = research.output
    const now = new Date().toISOString()

    // ── company ──
    const { data: existing } = await admin.from('companies').select('id').ilike('website', `%${website.replace(/^https?:\/\/(www\.)?/, '')}%`).limit(1).maybeSingle()
    const companyRow = {
      name,
      website,
      description: `${r.company.oneLiner}${r.company.founders.length ? ` Founded by ${r.company.founders.map(f => f.name).join(' and ')}.` : ''}`,
      stage: ['seed', 'series-a', 'series-b', 'series-c'].includes(r.company.stage) ? r.company.stage : null,
      location: r.company.hq,
      employee_count: r.company.headcount,
      top_investors: [...new Set(r.company.funding.flatMap(f => f.investors))].slice(0, 6).join(', ') || null,
      relationship_status: 'active_client',
      source: 'onboarding',
      updated_at: now,
    }
    let companyId = existing?.id as string | undefined
    if (companyId) await admin.from('companies').update(companyRow).eq('id', companyId)
    else {
      const { data: created, error } = await admin.from('companies').insert({ ...companyRow, created_by_user_id: createdBy }).select('id').single()
      if (error || !created) throw new Error(`company: ${error?.message}`)
      companyId = created.id as string
    }
    await setStatus(admin, runId, { company_id: companyId })

    // ── client card, unpublished until :+1: ──
    const clientRow = {
      relationship: 'client',
      is_published: false,
      is_active: true,
      anon_alias: c.anonAlias,
      public_blurb: c.publicBlurb,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      channel: 'Slack room with the founder once they accept the invitation; WhatsApp or email until then.',
      convo_stage: `Onboarded ${new Date().toLocaleDateString('en-GB')}. Agreement link issued at ${input.feePercent}%, not yet signed.`,
      next_step: 'Founder to sign, join Slack and answer the questions on the brief.',
      engagement_notes: [`Operator notes at onboarding:\n${input.notes}`, r.conflicts.length ? `Conflicts in the research: ${r.conflicts.join(' | ')}` : '', r.unknowns.length ? `Unknown at onboarding: ${r.unknowns.join('; ')}` : ''].filter(Boolean).join('\n\n'),
    }
    const { data: clientExisting } = await admin.from('client_companies').select('company_id').eq('company_id', companyId).maybeSingle()
    if (clientExisting) await admin.from('client_companies').update(clientRow).eq('company_id', companyId)
    else await admin.from('client_companies').insert({ company_id: companyId, ...clientRow })

    // ── jobs and searches ──
    const jobIds: string[] = []
    for (const [i, role] of c.roles.entries()) {
      const band = parseBand(input.bands, i)
      const source = r.roles[i]
      const { data: job, error } = await admin
        .from('jobs')
        .insert({
          title: role.title,
          department: null,
          location: source?.location ?? r.company.hq,
          remote_policy: /remote/i.test(source?.workingPattern ?? input.workingPattern ?? '') ? 'remote' : /hybrid/i.test(source?.workingPattern ?? input.workingPattern ?? '') ? 'hybrid' : /on-?site|office/i.test(source?.workingPattern ?? input.workingPattern ?? '') ? 'onsite' : null,
          description: role.description,
          requirements: role.requirements,
          salary_min: band.min,
          salary_max: band.max,
          salary_currency: input.currency,
          experience_years_min: role.experienceYearsMin,
          status: 'open',
          user_id: createdBy,
          owner_user_id: createdBy,
          created_by_user_id: createdBy,
          company_id: companyId,
          company_name: name,
          job_post_url: source?.url ?? null,
          internal_deal_type: 'partnership',
          updated_at: now,
        })
        .select('id')
        .single()
      if (error || !job) throw new Error(`job ${role.title}: ${error?.message}`)
      jobIds.push(job.id as string)
      await admin.from('partner_roles').upsert(
        {
          job_id: job.id,
          company_id: companyId,
          is_live: true,
          priority: role.priority,
          headline: role.headline,
          context: role.partnerContext,
          fee_percentage: input.feePercent === 10 ? null : input.feePercent,
          hard_requirements: role.requirements,
          intake_notes: role.intakeNotes,
          not_for: role.notFor,
          interview_steps: [],
          decision_days: null,
          added_by: createdBy,
          updated_at: now,
        },
        { onConflict: 'job_id' },
      )
    }

    // ── partner brief, draft ──
    const pb = partnerBrief(c, r, website)
    const { data: pbExisting } = await admin.from('partner_briefs').select('id, version').eq('company_id', companyId).is('job_id', null).maybeSingle()
    const pbRow = { company_id: companyId, job_id: null, title: `${name} · Partner brief`, status: 'draft', content: pb, created_by: createdBy, updated_at: now }
    if (pbExisting) await admin.from('partner_briefs').update({ ...pbRow, version: (pbExisting.version ?? 1) + 1 }).eq('id', pbExisting.id)
    else await admin.from('partner_briefs').insert(pbRow)

    // ── agreement link and Slack room ──
    const agreement = await issueClientAgreementLink(admin, { companyId, companyName: name, feePercent: input.feePercent, recipientName: null, recipientEmail: null, createdBy })
    const room = await ensureClientRoom(name, true)
    if (room) await admin.from('client_companies').update({ slack_channel_id: room.id, slack_channel_name: room.name }).eq('company_id', companyId)

    // ── founder brief, draft ──
    const fb = founderBrief(c, r, { ...input, website }, agreement.url)
    const { data: hm, error: hmErr } = await admin
      .from('hm_briefs')
      .insert({
        company_id: companyId,
        slug: newBriefSlug(name),
        title: name,
        status: 'draft',
        content: fb,
        recipient_name: input.contactName,
        recipient_email: input.contactEmail,
        ribbon_note: `Prepared for ${name} by Refery · please don't forward`,
        created_by: createdBy,
      })
      .select('id, slug')
      .single()
    if (hmErr || !hm) throw new Error(`founder brief: ${hmErr?.message}`)

    await setStatus(admin, runId, {
      status: 'ready',
      hm_brief_id: hm.id,
      agreement_link_id: agreement.id,
      slack_channel_id: room?.id ?? null,
      slack_channel_name: room?.name ?? null,
      cost_usd: cost,
    })

    // ── the review card ──
    const channel = deskChannel('decide')
    const unknowns = r.unknowns.slice(0, 4).join(' · ') || 'nothing'
    const blocks: SlackBlock[] = [
      { type: 'section', text: { type: 'mrkdwn', text: `*${esc(name)} is drafted and waiting for you.* ${c.roles.length} ${c.roles.length === 1 ? 'search' : 'searches'}, partner brief, founder brief, agreement link at ${input.feePercent}%, private room${room ? ` #${room.name}` : ''}. ${pages.length} pages read, $${cost.toFixed(2)} of model time.` } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Searches*\n${c.roles.map(rl => `${esc(rl.headline)} · ${esc(rl.comp)}`).join('\n')}` },
        { type: 'mrkdwn', text: `*Could not verify*\n${esc(unknowns)}` },
      ] },
      { type: 'actions', elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Client page' }, url: `${APP_URL}/searches/${companyId}` },
        { type: 'button', text: { type: 'plain_text', text: 'Founder brief (draft)' }, url: `${APP_URL}/b/${hm.slug}` },
        { type: 'button', text: { type: 'plain_text', text: 'Onboarding run' }, url: `${APP_URL}/admin/onboard?run=${runId}` },
      ] },
      { type: 'context', elements: [{ type: 'mrkdwn', text: ':+1: publishes everything and sends the founder their brief. :-1: leaves it all unpublished. Edit anything on the client page first if you like; the reaction publishes what is there at that moment.' }] },
    ]
    const posted = await postMessage(channel, `${name} is drafted. React :+1: to publish.`, blocks)
    if (posted.ok && posted.ts) await setStatus(admin, runId, { review_channel: posted.channel ?? channel, review_ts: posted.ts })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[onboarding] failed:', message)
    await setStatus(admin, runId, { status: 'failed', error: message.slice(0, 2000) })
    await postMessage(deskChannel('decide'), `:warning: Onboarding ${esc(input.companyName ?? input.website)} failed: ${esc(message.slice(0, 300))}`, [])
  }
}

/** Lily's :+1: on the review card. */
export async function publishRun(runId: string, actor: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { data: run } = await admin.from('onboarding_runs').select('*').eq('id', runId).single()
  if (!run) return { ok: false, error: 'no run' }
  if (run.status === 'published') return { ok: true }
  if (run.status !== 'ready') return { ok: false, error: `run is ${run.status}` }
  const now = new Date().toISOString()
  const companyId = run.company_id as string
  const input = run.input as OnboardInput

  await admin.from('client_companies').update({ is_published: true, is_active: true }).eq('company_id', companyId)
  await admin.from('partner_briefs').update({ status: 'published', published_at: now, updated_at: now }).eq('company_id', companyId).is('job_id', null)
  const { data: hm } = await admin.from('hm_briefs').update({ status: 'published', published_at: now, updated_at: now }).eq('id', run.hm_brief_id).select('slug, title').single()
  await admin.from('onboarding_runs').update({ status: 'published', published_at: now, updated_at: now }).eq('id', runId)

  const link = hm ? briefUrl(hm.slug as string) : null
  let emailed = false
  if (link && input.contactEmail && process.env.RESEND_API_KEY) {
    const first = input.contactName?.split(/\s+/)[0]
    const text = `${first ? `Hi ${first},` : 'Hi,'}\n\nAs promised, here is everything in one place: how we work, what I will say about ${hm?.title}, and a few quick questions. It takes about two minutes for your part.\n\n${link}\n\nBest,\nLily`
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error } = await resend.emails.send({ from: 'Lily at Refery <hello@refery.io>', to: input.contactEmail, replyTo: 'lily@refery.io', subject: `[Refery] ${hm?.title} | your brief`, text })
      emailed = !error
    } catch {
      emailed = false
    }
  }

  if (run.review_channel && run.review_ts) {
    await postThreadReply(
      run.review_channel as string,
      run.review_ts as string,
      `:white_check_mark: <@${actor}> published. Searches are live for partners, the partner brief is published, the founder brief is at ${link ?? 'no link'}${emailed ? ` and was emailed to ${esc(input.contactEmail ?? '')}` : input.contactEmail ? ' (email not sent; send the link yourself)' : ' (no founder email on record; send the link by WhatsApp)'}.`,
    )
  }
  return { ok: true }
}

export async function discardRun(runId: string, actor: string): Promise<void> {
  const admin = createAdminClient()
  const { data: run } = await admin.from('onboarding_runs').select('status, review_channel, review_ts').eq('id', runId).single()
  if (!run || run.status === 'published') return
  await admin.from('onboarding_runs').update({ status: 'discarded', updated_at: new Date().toISOString() }).eq('id', runId)
  if (run.review_channel && run.review_ts) {
    await postThreadReply(run.review_channel as string, run.review_ts as string, `<@${actor}> discarded. Nothing was published; the drafts stay on the client page, unpublished, in case you want them.`)
  }
}

export async function runForSlackMessage(channel: string, ts: string): Promise<{ id: string; status: string } | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('onboarding_runs').select('id, status').eq('review_channel', channel).eq('review_ts', ts).maybeSingle()
  return data ? { id: data.id as string, status: data.status as string } : null
}
