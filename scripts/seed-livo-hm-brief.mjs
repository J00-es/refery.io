/**
 * The Livo hiring-manager brief at refery.xyz/b/livo-7kq3mxw.
 *
 * Written from Adnane Ouahabi's WhatsApp messages (4 to 7 Sep 2026), the two
 * LinkedIn postings, getlivo.com and the public sources listed in
 * docs/clients/livo-2026-09-07.md. The agreement button points at the open
 * client-agreement link issued on 7 Sep 2026 (v2.8, 10%, expires 7 Oct 2026).
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
  kicker: 'Hiring Manager Note · September 7, 2026',
  title: 'Livo',
  subtitle: 'AI-First Fullstack Engineer (Senior) · Product Manager, Livo Pool · Barcelona',
  url: 'https://getlivo.com',
  confidential: {
    heading: 'Before we start',
    paragraphs: [
      'Adnane, a short note so we are working from the same brief before I start bringing you people: how to start, how we work, and then your company, your team, the two roles and the bar, exactly as candidates will hear them from me. All of it is my read from our messages, the two LinkedIn postings and public research. If anything is off or has shifted, tell me and I recalibrate.',
      'Every section opens with an "in short" line, so you or whoever on the team picks this up can skim the headers and read the rest when there is time. Correct me freely: every section takes a note, and it reaches me straight away.',
    ],
    pointsHeading: 'If you have two minutes',
    points: [
      '[Sign the agreement. One button, two minutes, and we are live.](#start)',
      '[Tell me how you want to receive candidates: Slack, email or the platform. One tap.](#start)',
      '[Four one-line questions at the end, and we are fully calibrated.](#confirm)',
      '[Anything wrong in the company, team or roles sections: write it under the section and I fix it.](#company)',
    ],
  },
  sections: [
    {
      id: 'start',
      nav: 'Start here',
      heading: 'How to start, and how we work',
      summary: 'Sign, connect on Slack, correct this brief, then we kick off and calibrate on real candidates. Speed is the whole game.',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Refery is a private network of a few hundred scouts: founders, operators and investors who refer people they personally rate, and a small group of specialist recruiting partners. Scouts earn a share of the fee, so nobody spends their reputation on a weak profile. You get very few profiles from me, not a pipeline; each one is pre-screened by our team and, for these two roles, by me personally, so you sit as the final decision maker rather than the first filter. Our deepest pools are New York and San Francisco, and we have built a strong network in Spain and the UK; I will be honest when a market is thin.',
        },
        {
          kind: 'steps',
          items: [
            '**Agree the terms. Two minutes, and the only step blocking us.** The terms are what we discussed: 10% of first-year base, fully contingent, no retainer, one free replacement if the hire leaves within the first 90 days, invoiced 30 days after the start date. The button below opens the agreement; anyone with signing authority at Livo can sign it, no account needed. Then connect with me on Slack with the second button, so candidates and feedback move in one thread rather than an inbox.',
            '**Read this brief and correct it.** It is how I will pitch Livo and what I will screen for. Every section has a note box, and there are four short questions at the end. A line is plenty; it reaches me the moment you write it.',
            '**We kick off the search.** Once the agreement is signed and the brief is corrected, I brief the scouts and partners with your exact bar, and I go through our own pool first for anyone who already fits.',
            '**We share candidates to calibrate.** The first profiles are as much a calibration as a shortlist: each comes with why they fit, their LinkedIn and CV. A tip from every search we have run: speed matters, because the best profiles do not stay on the market long. A yes or a no on each, within a day or two, is what wins them, and a reason with it makes the next batch sharper.',
          ],
        },
        {
          kind: 'cta',
          label: 'Sign the client agreement',
          url: AGREEMENT_URL,
          note: 'Two minutes. Any signatory at Livo can sign; no account needed. Terms as above.',
        },
        {
          kind: 'cta',
          label: 'Start a direct message with Lily on Slack',
          url: SLACK_DM_URL,
          secondary: true,
          note: 'Opens a DM with me in Slack. Once we are connected I can add a shared channel for the team.',
        },
        {
          kind: 'choice',
          key: 'candidate_delivery',
          prompt: 'How would you like to receive candidates?',
          note: 'One tap. You can change it any time, and I am told the moment you choose.',
          options: [
            { value: 'slack', label: 'Slack', detail: 'Our main channel. Profiles, your yes or no, and scheduling in one thread.' },
            { value: 'email', label: 'Email', detail: 'One email per candidate: the profile, why they fit, and their CV attached.' },
            { value: 'platform', label: 'Refery platform', detail: 'A private page with every candidate, their status and your feedback in one place.' },
          ],
        },
        {
          kind: 'callout',
          text: 'Why speed: the engineers and PMs you want are usually talking to two or three companies at once. The hiring managers who consistently land them share feedback almost live and get the first call scheduled within days. Quick, honest feedback either way is all I ask.',
        },
      ],
    },
    {
      id: 'company',
      nav: 'Company',
      heading: 'The company, as I will pitch it',
      summary: 'Barcelona’s healthcare workforce marketplace: 200+ hospitals, 70,000+ professionals, Spain, Italy and Poland, three years in, backed by the Glovo founders’ fund.',
      blocks: [
        {
          kind: 'lede',
          text: 'Livo builds **the operating system for the healthcare workforce**: a marketplace where hospitals cover shifts with verified nurses, nursing assistants and doctors (Livo Pool), permanent hiring (Livo Offers), internal shift management (Livo Internal), a physician vertical (Livo Doctors) and a training marketplace (Livo Formación). Founded in Barcelona in 2023, launched in August that year, and now inside more than 200 hospital and care centres across Spain, Italy and Poland.',
        },
        {
          kind: 'stats',
          items: [
            { value: '200+', label: 'Hospital and care centres, as published July 2026' },
            { value: '70,000+', label: 'Registered healthcare professionals, July 2026 (the job ads still say 50,000; tell me which to use)' },
            { value: '3', label: 'Countries: Spain, Italy, Poland' },
            { value: '~40', label: 'People on the team, per press in February 2026 (confirm today’s number)' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            '**What you do, in one loop.** Hospitals publish shifts and vacancies; verified professionals pick them up in the app; Lina, your AI layer, proposes shifts over WhatsApp, answers most support questions inside minutes and runs first-round candidate calls. I pitch Pool, Offers and Internal as one workforce system rather than three products, with Doctors and Formación as this year’s expansion.',
            '**Who you serve.** Quirónsalud, HLA, Ribera, SCIAS Hospital de Barcelona, Clínica Sagrada Família, Clínica Tres Torres, Badalona Serveis Assistencials, Fundació Puigvert, Hermanas Hospitalarias and Hospital San Francisco de Asís in Madrid, and abroad Policlinico di Monza, Gruppo INI, the National Institute of Geriatrics in Warsaw and Brzeziny Specialist Hospital. I use the logos that are on your website; tell me if any should stay off.',
            '**The money.** Backed by Yellow, the pre-seed fund of the Glovo founders, plus Cusp Capital and Lanai. No round size is public anywhere, so I quote none. If there is a number you want candidates to hear, tell me.',
            '**The founder record.** You were Glovo’s founding engineer in 2015 and rose to Director of Engineering over six and a half years. Carlos ran real estate for CloudKitchens across Southern Europe after ESADE. In April 2025 you bought Nursea, the Catalan nurse-shift platform, and brought its founder in to run institutional relations. I tell candidates this is a team that has already built one Barcelona marketplace at scale.',
            '**Trajectory.** From 100 centres in December 2024 to 200+ and three countries by mid-2026, with a physician vertical and a training marketplace launched this year. I tell candidates these are seats on a product that is compounding, not a pilot.',
          ],
        },
        {
          kind: 'callout',
          text: 'The context I will use with candidates: every hospital in Europe has the same staffing problem, and the company that owns the workforce layer, with the professionals on one side and the hospitals on the other, owns the category. Livo is already the one with the network in Spain and is now proving it in Italy and Poland.',
        },
      ],
    },
    {
      id: 'team',
      nav: 'Team',
      heading: 'The team, as I present it',
      summary: 'Two founders, one technical and one commercial, a clinician-founder from the Nursea acquisition, and a team of around forty.',
      blocks: [
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Candidates at this level always ask who they will work with, so this is the picture I give them. Tell me if I have anyone’s role wrong or should add someone, especially whoever leads engineering and product day to day.',
        },
        {
          kind: 'people',
          items: [
            {
              name: 'Adnane Ouahabi',
              role: 'Co-founder',
              linkedin: 'https://www.linkedin.com/in/ouahabi',
              note: 'Founding engineer at Glovo in 2015, then Engineering Manager and Director of Engineering through 2021. Master’s in computer engineering, ENSA Tangier. Your older job ads mention a co-founder and CPTO; I assume that is you and that both roles report to you. Correct me if not.',
            },
            {
              name: 'Carlos Manubens',
              role: 'Co-founder and CEO',
              linkedin: 'https://www.linkedin.com/in/carlos-manubens-mercadé-a7563168',
              note: 'Ran real estate for CloudKitchens in Southern Europe, before that Deutsche Asset Management and Unibail-Rodamco. ESADE BBA and MSc Finance, CEMS. Public voice of the company in the Spanish press.',
            },
            {
              name: 'Cristina Romagosa',
              role: 'Head of Institutional Relations',
              linkedin: 'https://www.linkedin.com/in/crisromagosa',
              note: 'Founded Nursea, acquired by Livo in April 2025. ICU nurse by background, previously COO at MediQuo. The clinical credibility candidates ask about.',
            },
          ],
        },
        {
          kind: 'cards',
          items: [
            { title: 'The founders', body: 'A Glovo founding engineer and an operator-financier who built the commercial side. Candidates read that as a team that has shipped a marketplace at scale before and knows how to sell into hospitals.' },
            { title: 'The team today', body: 'Around forty people per the February 2026 press, with a Milan office opening (you are hiring a General Manager for Italy). Engineering and product are founder-led and small, which is the point for both seats.' },
            { title: 'What this tells candidates', body: 'Real ownership from day one, founders close to the work, a product nurses use every day, and a company that has already moved into two new countries. That is the story I sell.' },
          ],
        },
      ],
    },
    {
      id: 'roles',
      nav: 'The roles',
      heading: 'The roles',
      summary: 'A senior AI-first full-stack engineer and a PM to own the Pool marketplace, both in Barcelona, both live in parallel.',
      blocks: [
        {
          kind: 'lede',
          text: 'My read: two live seats, run in parallel with equal weight, since you named both on the same day. Both postings are unusually clear about what they are and are not, and I have kept that wording. If one is more urgent than the other, tell me and I re-weight.',
        },
        {
          kind: 'roles',
          items: [
            {
              tag: 'Live now · LinkedIn posting, 80+ applicants',
              title: 'AI-First Fullstack Engineer (Senior)',
              scope: 'Product & Tech · Barcelona · reporting line to confirm',
              points: [
                'Owns features end to end, frontend to database to production, and owns outcomes at product and company level rather than tasks. Works directly with account managers to turn hospital needs into shipped software.',
                'Treats AI as part of the development lifecycle: AI-assisted design, implementation, testing, debugging, documentation and operations, with full accountability for what ships and a clear sense of where LLMs fail.',
                'Stack from the posting: TypeScript and React, Java/Kotlin, Python or Go, MySQL or Postgres on AWS or GCP, with real-time workflows and the security and compliance bar of healthcare data.',
              ],
              want: '**What I will screen for:** 5+ years shipping production web applications with ownership of the whole stack, daily and critical use of AI coding assistants, strong SQL and data modelling, and a product mindset. Nice to have, from the posting: LLM APIs in production, RAG, agent workflows, evaluation frameworks, scheduling or constraint systems.',
              exclude: 'I will filter out: single-layer specialists, engineers who treat AI tooling as a side experiment, people who need a large platform team around them, and anyone anchored to a base above €90K.',
              comp: '€60K to €90K base + early-stage equity, as you gave it to me on 5 September',
            },
            {
              tag: 'Live now · LinkedIn and Teamtailor, 50 applicants',
              title: 'Product Manager, Livo Pool',
              scope: 'Product & Tech · Barcelona · works with the founders and the marketplace business lead',
              points: [
                'Owns Livo Pool end to end: vision, roadmap and execution for the shift marketplace across Spain, Italy and Poland, and the liquidity and matching quality that make it work.',
                'Lives on both sides of the marketplace: nurses, assistants and doctors on one side, HR, nurse directors and supervisors on the other, through customer conversations, field visits and data.',
                'Designs, builds and ships AI agents that replace manual coordination with automated, observable, reliable processes, with human oversight where risk or trust requires it.',
              ],
              want: '**What I will screen for:** 4+ years as a PM on marketplaces or multi-sided products, hands-on production experience deploying AI agents in operational workflows, fluent marketplace vocabulary, direct and regular contact with users and enterprise customers, and fluent Spanish. Health tech background optional, as your posting says.',
              exclude: 'I will filter out: delivery-only or ticket-management PMs, proxy project managers, PMs whose AI experience is slideware, anyone without fluent Spanish, and anyone who wants a large product org to slot into. Your posting names most of these itself.',
              comp: '€70K to €100K base + equity, as you gave it to me on 5 September',
            },
          ],
        },
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Both roles are public on LinkedIn, so I ask every candidate whether they have already applied before I introduce them. Only fresh introductions count against our agreement, and I would rather know early.',
        },
      ],
    },
    {
      id: 'bar',
      nav: 'The bar',
      heading: 'The bar',
      summary: 'AI as a daily working material, ownership at company level, depth in the craft, Barcelona, and Spanish for the PM.',
      blocks: [
        {
          kind: 'bar',
          groups: [
            {
              tone: 'must',
              heading: 'Non-negotiable',
              items: [
                '**AI as a daily working material.** The engineer builds with AI assistants as the standard workflow and verifies everything they produce. The PM has built and deployed AI agents in production, not read about them.',
                '**Ownership at company level.** Both postings say it in the same words: outcomes, not tasks. Small team, founders close.',
                '**Depth in the craft.** 5+ years shipping web applications end to end for the engineer; 4+ years on marketplaces or multi-sided products for the PM.',
                '**Barcelona.** Both roles are Barcelona-based. The working pattern is the first thing I need from you; see the confirm list.',
                '**Fluent Spanish for the PM.** Stated as a must in your posting. The engineering ad does not mention language, so I am not filtering on it there.',
              ],
            },
            {
              tone: 'nice',
              heading: 'Explicitly not required',
              items: [
                '**Healthcare background.** The PM posting calls it optional; the engineering posting does not ask for it. I will not filter on it.',
                '**A particular backend language.** Java/Kotlin, Python or Go all clear, per the posting.',
                '**Prior LLM product work for the engineer.** A nice to have, along with RAG, vector databases, agent workflows and scheduling systems.',
                '**Spanish for the engineer.** Unless you tell me otherwise.',
              ],
            },
            {
              tone: 'no',
              heading: 'What I will filter out',
              items: [
                '**Engineers who treat AI tooling as an experiment on the side,** or cannot say where it fails.',
                '**Delivery-only or ticket-management PMs, and proxy project managers.** Your ad names these directly.',
                '**PMs without fluent Spanish.**',
                '**Anyone anchored to a base above the band.** €90K is the ceiling for the engineer, €100K for the PM, unless you tell me there is flex for an exceptional person.',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'logistics',
      nav: 'Logistics',
      heading: 'Logistics',
      summary: 'Barcelona, euros, equity on both seats. Working pattern, process, work authorisation and hiring manager still to confirm.',
      blocks: [
        {
          kind: 'facts',
          rows: [
            { label: 'Location', value: 'Barcelona. Your registered office is at Paseo de Gracia 6. Whether the roles are on-site, hybrid or open to remote inside Spain is not in either posting and you have not said yet; it is the first question on the confirm list.' },
            { label: 'Compensation', value: 'EUR. Engineer €60K to €90K base plus early-stage equity; PM €70K to €100K base plus equity, in your words on 5 September. Equity size not stated; I say "meaningful early-stage equity" to candidates until you give me a range.' },
            { label: 'Language', value: 'Fluent Spanish is a must for the PM. Not stated for the engineer.' },
            { label: 'Work authorisation', value: 'Not stated. I assume EU work authorisation, or an existing permit for Spain, and no sponsorship. Tell me if you would sponsor for the right person.' },
            { label: 'Reporting', value: 'PM works with the founders and the marketplace business lead, per the posting. Engineer: not stated. I assume both report to you.' },
            { label: 'Process', value: 'Not yet discussed. Candidates ask on the first call, so the steps, who runs them and the days from intro to offer are on the confirm list.' },
            { label: 'Channel', value: 'Slack with you or whoever on the team owns these searches while you are away. Feedback within a day or two on each candidate.' },
          ],
        },
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Until the working pattern is confirmed I am running both searches as Barcelona-based, with candidates elsewhere in Spain only if they will relocate. If hybrid or remote inside Spain is on the table, say so and the funnel roughly doubles.',
        },
      ],
    },
    {
      id: 'blurb',
      nav: 'Candidate blurb',
      heading: 'What we will share with candidates',
      summary: 'The anonymised blurb candidates see. Nothing in it identifies Livo.',
      blocks: [
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'This is the exact anonymised blurb candidates see before an introduction. Nothing in it identifies Livo.',
        },
        {
          kind: 'blurb',
          label: 'Candidate blurb',
          note: 'Anonymous until your go-sign',
          paragraphs: [
            "I'm working with a three-year-old Barcelona company building the workforce platform for hospitals: a marketplace where more than 200 hospitals across Spain, Italy and Poland cover shifts and hire from over 70,000 verified nurses, assistants and doctors, with an AI layer that already proposes shifts and runs first-round calls. Around forty people, founder-led, technical, backed by the fund of one of Spain's best-known consumer-tech founding teams.",
            'They have two roles open in Barcelona. A senior full-stack engineer, five-plus years, TypeScript and React with Java, Kotlin, Python or Go behind, who already builds with AI tools every day and wants to own outcomes rather than tickets: €60K to €90K base plus early-stage equity. And a product manager to own the core marketplace end to end with the founders, four-plus years on marketplaces or multi-sided products, who has shipped AI agents into real operational workflows and speaks fluent Spanish: €70K to €100K base plus equity.',
            "It is a small team where the founders are close to the work, and the product is used by nurses every day. I can share the name once we're a step further along.",
          ],
        },
        {
          kind: 'callout',
          text: 'I have kept Livo unnamed for now. Say the word and I will name you openly, which makes the first conversation considerably easier, especially since both roles are already public on LinkedIn.',
        },
      ],
    },
    {
      id: 'confirm',
      nav: 'To confirm',
      heading: 'A few things to confirm',
      summary: 'Four one-line answers and we are fully calibrated.',
      blocks: [
        {
          kind: 'checklist',
          note: 'A one-line reply on each is plenty. Answer them here and they come straight to me. No email needed, and you can edit or delete anything you write.',
          items: [
            {
              ask: 'Working pattern: on-site in Barcelona, hybrid, or open to remote inside Spain? And would you sponsor a work permit for the right person?',
              why: 'Together these decide whether I run a Barcelona search or a Spain-wide one. It roughly doubles the funnel.',
            },
            {
              ask: 'Interview process and who runs it: the steps for each role, who the hiring manager is, and the days from intro to offer you can commit to.',
              why: 'Candidates ask on the first call, and speed is what wins the people you want.',
            },
            {
              ask: 'Naming: may I share the Livo name openly with candidates, or keep it anonymous until you approve each intro?',
              why: 'Naming you makes the first conversation materially easier, and both roles are already public on LinkedIn.',
            },
            {
              ask: 'Equity: a range I may quote for each seat, and whether the €60K to €90K and €70K to €100K bands have any flex for an exceptional person.',
              why: 'Equity is the part of the package candidates weigh most at this stage, and I can only pitch a number.',
            },
          ],
        },
      ],
    },
  ],
  signoff: {
    name: 'Lily Joo',
    lines: [
      'Founding Partner, Refery · [lily@refery.io](mailto:lily@refery.io)',
      'Anything to correct or add, write it under the section it belongs to. It reaches me straight away.',
    ],
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
