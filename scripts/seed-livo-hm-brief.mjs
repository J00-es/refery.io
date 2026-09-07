/**
 * The Livo hiring-manager brief at refery.xyz/b/livo-7kq3mxw.
 *
 * Written from Adnane Ouahabi's WhatsApp messages (4 to 7 Sep 2026), the two
 * LinkedIn postings, getlivo.com and the public sources listed in
 * docs/clients/livo-2026-09-07.md. The agreement button points at the open
 * client-agreement link issued on 7 Sep 2026 (v2.8, 10%, expires 7 Oct 2026).
 *
 * Voice: docs/proposals/2026-09-07-onboarding/01-voice-spec.md. Short, warm,
 * founder to founder, one action at a time, phone first. Sections fold on the
 * page; `open: true` marks the two that start expanded.
 *
 * Idempotent: upserts on slug and bumps the version on a rerun.
 *
 *   node scripts/seed-livo-hm-brief.mjs          # apply
 *   node scripts/seed-livo-hm-brief.mjs --dry    # print the plan only
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry')

const LILY = '864aa3a4-f9e0-49c6-a35a-7ca02ffe04a7'
const COMPANY_ID = '9c2b7d10-6f4e-4a8b-9d21-1e5b0a7c3f40'
const SLUG = 'livo-7kq3mxw'
const AGREEMENT_URL = 'https://refery.xyz/sign/client-agreement/c7f596952ed166e1e152137b724b6ebafaa7cc0e8b8251efe9264e7800b39631'
const SLACK_DM_URL = 'https://join.slack.com/shareDM/zt-4960b8goh-v6NajYY5aZxeRsiM1e9ppg'

export const content = {
  kicker: 'Refery · 7 September 2026',
  title: 'Livo',
  subtitle: 'Senior AI-first full-stack engineer · Product manager, Livo Pool · Barcelona',
  url: 'https://getlivo.com',
  confidential: {
    heading: 'Before we start',
    paragraphs: [
      'Adnane, this is how I will pitch Livo and what I will screen for, so we start from the same page. Skim the headers, open what matters, and correct me anywhere: every section takes a note and it reaches me straight away :)',
      'Three things are yours to do, listed just below. The rest can wait for a quiet moment.',
    ],
  },
  sections: [
    {
      id: 'start',
      nav: 'How we work',
      heading: 'How we work',
      open: true,
      summary: 'Sign, connect on Slack, tell me how you want candidates. Then I go, and you answer fast.',
      blocks: [
        {
          kind: 'steps',
          items: [
            '**Agree the terms.** What we discussed: 10% of first-year base, fully contingent, no retainer, one free replacement if the hire leaves within 90 days, invoiced 30 days after start. Anyone with signing authority at Livo can sign, no account needed.',
            '**Connect on Slack.** One thread for profiles, your yes or no, and scheduling. Nothing sits in an inbox.',
            '**Correct this brief.** A line under any section is plenty. Four short questions at the end.',
            '**Then we kick off.** I check our own pool first, then brief the scouts with your exact bar. The first profiles are as much calibration as shortlist, so a yes or no on each within a day or two, with a reason, is what makes the next batch sharper.',
          ],
        },
        {
          kind: 'cta',
          label: 'Sign the client agreement',
          url: AGREEMENT_URL,
          note: 'Two minutes. Terms as above.',
        },
        {
          kind: 'cta',
          label: 'Message Lily on Slack',
          url: SLACK_DM_URL,
          secondary: true,
          note: 'Opens a direct message. I add a shared channel for the team once we are connected.',
        },
        {
          kind: 'choice',
          key: 'candidate_delivery',
          prompt: 'How would you like to receive candidates?',
          note: 'One tap. Change it any time; I am told the moment you choose.',
          options: [
            { value: 'slack', label: 'Slack', detail: 'Profiles, your yes or no, and scheduling in one thread.' },
            { value: 'email', label: 'Email', detail: 'One email per candidate with the profile and CV.' },
            { value: 'platform', label: 'Refery platform', detail: 'Every candidate, their status and your feedback on one private page.' },
          ],
        },
        {
          kind: 'callout',
          text: 'Why speed: the engineers and PMs you want are talking to two or three companies at once. The hiring managers who land them reply almost live and get the first call booked within days.',
        },
      ],
    },
    {
      id: 'company',
      nav: 'Company',
      heading: 'Livo, as I will pitch it',
      summary: 'Barcelona’s healthcare workforce marketplace: 200+ hospitals, 70,000+ professionals, three countries, backed by the Glovo founders’ fund.',
      blocks: [
        {
          kind: 'lede',
          text: 'Livo is **the operating system for the healthcare workforce**: hospitals cover shifts with verified nurses, assistants and doctors, hire permanently, and run internal rotas, all in one place. Founded in Barcelona in 2023, inside 200+ hospital and care centres across Spain, Italy and Poland by July 2026.',
        },
        {
          kind: 'stats',
          items: [
            { value: '200+', label: 'Hospitals and care centres' },
            { value: '70,000+', label: 'Registered professionals (your ads still say 50,000; which do I use?)' },
            { value: '3', label: 'Countries: Spain, Italy, Poland' },
            { value: '~40', label: 'People, per press in Feb 2026' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            '**One loop.** Hospitals publish shifts and vacancies, professionals pick them up in the app, and Lina, your AI layer, proposes shifts on WhatsApp, answers support in minutes and runs first-round calls. Both roles build this.',
            '**Customers I name:** Quirónsalud, HLA, Ribera, Hospital de Barcelona, Clínica Sagrada Família, Fundació Puigvert; Policlinico di Monza and Gruppo INI in Italy; Warsaw’s National Institute of Geriatrics. All from your site. Tell me if any should stay off.',
            '**Backers:** Yellow, the Glovo founders’ pre-seed fund, plus Cusp Capital and Lanai. No round size is public, so I quote none.',
            '**The story:** you were Glovo’s founding engineer and later its Director of Engineering; Carlos ran real estate for CloudKitchens in Southern Europe. You bought Nursea in April 2025. A team that has built one Barcelona marketplace at scale, building another.',
          ],
        },
      ],
    },
    {
      id: 'team',
      nav: 'Team',
      heading: 'The team, as I present it',
      summary: 'You on product and engineering, Carlos as CEO, Cristina from Nursea on the clinical side. Correct me if I have a role wrong.',
      blocks: [
        {
          kind: 'people',
          items: [
            { name: 'Adnane Ouahabi', role: 'Co-founder', linkedin: 'https://www.linkedin.com/in/ouahabi', note: 'Glovo founding engineer, 2015; Director of Engineering by 2021. I assume both roles report to you and that you are the CPTO your older ads mention. Say if not.' },
            { name: 'Carlos Manubens', role: 'Co-founder and CEO', linkedin: 'https://www.linkedin.com/in/carlos-manubens-mercadé-a7563168', note: 'CloudKitchens real estate for Southern Europe, ESADE. The public voice of Livo in the Spanish press.' },
            { name: 'Cristina Romagosa', role: 'Head of Institutional Relations', linkedin: 'https://www.linkedin.com/in/crisromagosa', note: 'Founded Nursea, ICU nurse by background. The clinical credibility candidates ask about.' },
          ],
          footer: 'Around forty people, with a Milan office opening. Engineering and product are small and founder-led, which is the point of both seats.',
        },
      ],
    },
    {
      id: 'roles',
      nav: 'Roles',
      heading: 'The two roles',
      summary: 'A senior AI-first full-stack engineer and a PM to own the Pool marketplace. Both live, equal weight, Barcelona.',
      blocks: [
        {
          kind: 'roles',
          items: [
            {
              tag: 'Live · LinkedIn, 80+ applicants',
              title: 'AI-First Fullstack Engineer, Senior',
              scope: 'Product & Tech · Barcelona',
              points: [
                'Owns features end to end, frontend to database to production, and owns outcomes, not tasks.',
                'Builds with AI assistants as the daily workflow and verifies everything they produce.',
                'TypeScript and React; Java/Kotlin, Python or Go; MySQL or Postgres on AWS or GCP. Healthcare-grade security.',
              ],
              want: '**I screen for:** 5+ years shipping production web apps across the stack, daily and critical use of AI coding tools, strong SQL, a product mindset.',
              exclude: 'I filter out: single-layer specialists, engineers who treat AI tools as a side experiment, and anyone anchored above €90K.',
              comp: '€60K to €90K base + early-stage equity',
            },
            {
              tag: 'Live · LinkedIn and Teamtailor, 50 applicants',
              title: 'Product Manager, Livo Pool',
              scope: 'Product & Tech · Barcelona · with the founders and the marketplace lead',
              points: [
                'Owns Pool end to end: vision, roadmap, execution, liquidity and matching across three countries.',
                'Lives on both sides of the marketplace: nurses and doctors, HR and nurse directors. Field visits, data, conversations.',
                'Ships AI agents that replace manual coordination, with human oversight where trust needs it.',
              ],
              want: '**I screen for:** 4+ years on marketplaces or multi-sided products, AI agents deployed in real operational workflows, direct customer contact, fluent Spanish.',
              exclude: 'I filter out: delivery-only or ticket PMs, proxy project managers, slideware AI experience, no Spanish. Your ad names most of these itself.',
              comp: '€70K to €100K base + equity',
            },
          ],
        },
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Both roles are public, so I ask every candidate whether they already applied before I introduce them.',
        },
      ],
    },
    {
      id: 'bar',
      nav: 'The bar',
      heading: 'The bar',
      summary: 'AI as a daily tool, ownership at company level, real depth, Barcelona, Spanish for the PM.',
      blocks: [
        {
          kind: 'bar',
          groups: [
            { tone: 'must', heading: 'Non-negotiable', items: ['**AI as a daily working material,** verified, not experimented with.', '**Ownership at company level.** Outcomes, not tasks.', '**Depth:** 5+ years shipping for the engineer, 4+ years on marketplaces for the PM.', '**Barcelona,** on whatever pattern you confirm.', '**Fluent Spanish for the PM.**'] },
            { tone: 'nice', heading: 'Not required', items: ['Healthcare background.', 'A particular backend language.', 'Prior LLM product work for the engineer. Nice to have, not a filter.', 'Spanish for the engineer, unless you say so.'] },
            { tone: 'no', heading: 'I will filter out', items: ['Engineers who cannot say where AI tools fail.', 'Delivery-only PMs and proxy project managers.', 'PMs without fluent Spanish.', 'Anyone anchored above the band, unless you tell me there is flex.'] },
          ],
        },
      ],
    },
    {
      id: 'logistics',
      nav: 'Logistics',
      heading: 'Logistics',
      summary: 'Barcelona, euros, equity on both seats. Working pattern, process and sponsorship still to confirm.',
      blocks: [
        {
          kind: 'facts',
          rows: [
            { label: 'Location', value: 'Barcelona, Paseo de Gracia. On-site, hybrid or remote inside Spain: not in the postings and not yet from you. First question below.' },
            { label: 'Pay', value: 'EUR. Engineer €60K to €90K plus early-stage equity; PM €70K to €100K plus equity, in your words. I say "meaningful early-stage equity" until you give me a range.' },
            { label: 'Work permit', value: 'Not stated. I assume EU authorisation or an existing permit, no sponsorship. Say if you would sponsor for the right person.' },
            { label: 'Reporting', value: 'PM works with the founders and the marketplace lead, per the ad. Engineer not stated; I assume you.' },
            { label: 'Process', value: 'Not yet discussed. Candidates ask on the first call.' },
          ],
        },
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Until the pattern is confirmed I run both as Barcelona-based, with the rest of Spain only for people who will relocate. Hybrid or remote inside Spain roughly doubles the funnel.',
        },
      ],
    },
    {
      id: 'blurb',
      nav: 'Blurb',
      heading: 'What candidates see',
      summary: 'The anonymised blurb, word for word. Nothing in it identifies Livo.',
      blocks: [
        {
          kind: 'blurb',
          label: 'Candidate blurb',
          note: 'Anonymous until your go-sign',
          paragraphs: [
            "I'm working with a three-year-old Barcelona company building the workforce platform for hospitals: a marketplace where more than 200 hospitals across Spain, Italy and Poland cover shifts and hire from over 70,000 verified nurses, assistants and doctors, with an AI layer that already proposes shifts and runs first-round calls. Around forty people, founder-led, technical, backed by the fund of one of Spain's best-known consumer-tech founding teams.",
            'Two roles in Barcelona. A senior full-stack engineer, five-plus years, TypeScript and React with Java, Kotlin, Python or Go behind, who already builds with AI tools every day and wants to own outcomes rather than tickets: €60K to €90K base plus early-stage equity. And a product manager to own the core marketplace end to end with the founders, four-plus years on marketplaces, who has shipped AI agents into real operational workflows and speaks fluent Spanish: €70K to €100K base plus equity.',
            "Small team, founders close to the work, a product nurses use every day. I can share the name once we're a step further along.",
          ],
        },
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Say the word and I name Livo openly. It makes the first conversation easier, and both roles are already public.',
        },
      ],
    },
    {
      id: 'confirm',
      nav: 'Questions',
      heading: 'Four quick questions',
      open: true,
      summary: 'One line each and we are calibrated.',
      blocks: [
        {
          kind: 'checklist',
          note: 'Answer here, a line each. You can edit or delete anything you write.',
          items: [
            { ask: 'Working pattern: on-site, hybrid, or remote inside Spain? And would you sponsor a permit for the right person?', why: 'Decides whether this is a Barcelona search or a Spain-wide one.' },
            { ask: 'Process: the steps for each role, who runs them, and how fast you can go from intro to offer.', why: 'Candidates ask on the first call.' },
            { ask: 'May I name Livo openly, or keep it anonymous until you approve each intro?' },
            { ask: 'Equity: a range I can quote per seat, and any flex above €90K and €100K for an exceptional person.' },
          ],
        },
      ],
    },
  ],
  signoff: {
    name: 'Lily',
    lines: ['Founding Partner, Refery · [lily@refery.io](mailto:lily@refery.io)', 'Anything to correct, write it under the section. It reaches me straight away.'],
    reminder: 'Confidential · prepared for Livo',
  },
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) {
  const { data: existing } = await supabase.from('hm_briefs').select('id, version').eq('slug', SLUG).maybeSingle()
  const blocks = content.sections.reduce((n, s) => n + s.blocks.length, 0)
  console.log(existing ? `update brief v${existing.version} → v${existing.version + 1}` : 'insert brief', SLUG, `${content.sections.length} sections, ${blocks} blocks`)
  if (!DRY) {
    const now = new Date().toISOString()
    if (existing) {
      const { error } = await supabase.from('hm_briefs').update({ content, version: existing.version + 1, status: 'published', updated_at: now }).eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await supabase.from('hm_briefs').insert({
        company_id: COMPANY_ID,
        slug: SLUG,
        title: 'Livo',
        status: 'published',
        content,
        recipient_name: 'Adnane Ouahabi',
        ribbon_note: "Prepared for Livo by Refery · please don't forward",
        published_at: now,
        created_by: LILY,
      })
      if (error) throw new Error(error.message)
    }
  }
  console.log(DRY ? 'Dry run. Nothing written.' : `Done. https://refery.xyz/b/${SLUG}`)
}
