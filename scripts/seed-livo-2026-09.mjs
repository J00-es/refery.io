/**
 * Loads Livo (getlivo.com, Barcelona) onto the desk as a client with two live
 * searches and a company brief.
 *
 * Sources, in order of authority: Adnane Ouahabi's WhatsApp messages to Lily on
 * 4, 5 and 7 Sep 2026 (comp bands, equity, fee expectations, the two LinkedIn
 * postings); the LinkedIn job postings 4456740667 (AI-First Fullstack Engineer,
 * Senior) and 4446071728 (Product Manager, Livo Pool) plus the Teamtailor ad
 * for the PM role; getlivo.com (products, metrics, customer logos, case
 * studies); Spanish trade press (servimedia Dec 2024, phmk Apr and Oct 2025,
 * telemadrid Aug 2025, rrhhdigital Nov 2025, elnacional Feb 2026, thestandardcio
 * Jul 2026); Specter and Tracxn for founders and investors; the Spanish company
 * registry (einforma) for the legal entity. Round sizes are undisclosed
 * everywhere, so none are stated. Facts that could not be verified beyond a
 * search snippet (perks, Glassdoor rating, extra investors) are left out.
 *
 * Idempotent: every write is an upsert keyed on a stable id.
 *
 *   node scripts/seed-livo-2026-09.mjs          # apply
 *   node scripts/seed-livo-2026-09.mjs --dry    # print the plan only
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
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const DRY = process.argv.includes('--dry')

const LILY = '864aa3a4-f9e0-49c6-a35a-7ca02ffe04a7'

// Stable ids so re-runs upsert.
const COMPANY_ID = '9c2b7d10-6f4e-4a8b-9d21-1e5b0a7c3f40'
const JOB = {
  fullstack: '9c2b7d10-6f4e-4a8b-9d21-1e5b0a7c3f41',
  pm: '9c2b7d10-6f4e-4a8b-9d21-1e5b0a7c3f42',
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
  '**Ask before you submit:** has this person already applied to or been contacted by the company another way? Only fresh introductions are attributable. Both roles are on LinkedIn, so ask specifically whether they have applied there.',
]

const SIGNOFF = {
  name: 'Lily Joo',
  lines: ['Founding Partner, Refery', 'lily@refery.io'],
  reminder: 'Questions on fit, comp or process: ask on the search and the answer is added for everyone on it.',
}

// ── the data ─────────────────────────────────────────────────────────────────

const company = {
  id: COMPANY_ID,
  name: 'Livo',
  website: 'https://getlivo.com',
  description:
    'Livo Health S.L. builds an AI-powered operating system for the healthcare workforce: a marketplace where hospitals cover shifts with verified nurses, nursing assistants and doctors (Livo Pool), permanent hiring (Livo Offers), internal shift management (Livo Internal), a physician vertical (Livo Doctors) and a training marketplace (Livo Formación). Founded in Barcelona in 2023 by Carlos Manubens (CEO, ex-CloudKitchens) and Adnane Ouahabi (ex-Glovo founding engineer and Director of Engineering). 200+ hospital and care centres and 70,000+ registered professionals across Spain, Italy and Poland as of July 2026. Backed by Yellow (the Glovo founders’ fund), Cusp Capital and Lanai; round sizes undisclosed. Acquired Nursea in April 2025.',
  industry: 'Health tech · HR tech · marketplace',
  stage: 'seed',
  location: 'Barcelona, Spain',
  employee_count: '~40 (press, Feb 2026)',
  linkedin_url: 'https://www.linkedin.com/company/livoapp',
  careers_url: 'https://livo.teamtailor.com',
  top_investors: 'Yellow, Cusp Capital, Lanai',
  last_funding_type: 'seed',
  last_funding_date: '2024-08-02',
  relationship_status: 'active_client',
  source: 'lily',
  created_by_user_id: LILY,
}

const client = {
  relationship: 'client',
  is_published: true,
  is_active: true,
  anon_alias: 'Healthcare workforce marketplace, Barcelona',
  public_blurb:
    'Three years in, 200+ hospitals and 70,000+ healthcare professionals across Spain, Italy and Poland, backed by the Glovo founders’ fund. A senior AI-first full-stack engineer and a marketplace product manager, both in Barcelona.',
  contact_name: 'Adnane Ouahabi',
  contact_email: null,
  channel: 'WhatsApp with Adnane (co-founder). He is on holiday the week of 7 Sep 2026 and is passing this to his team.',
  convo_stage:
    'No client agreement yet. Adnane on WhatsApp 7 Sep 2026: they have paid 10% to 12% in the past, prefer no retainer, and want a replacement if the hire does not pass the probation period. Lily replied that Refery is ~10%, fully contingent, no retainer, 90-day replacement guarantee. Fee on the desk is the 10% default until signed.',
  next_step:
    'Send Adnane the client agreement and the getting-started note for his team. Confirm on-site vs hybrid, the interview process, and who the hiring manager is for each role.',
  engagement_notes:
    'Lily met Adnane over lunch at the Livo office before Refery existed. He also asked Lily to recommend external recruiters (contingency, 10% to 12%, no retainer); Refery runs alongside them. Research 7 Sep 2026: CEO is Carlos Manubens per every public source; Adnane is co-founder and, by the job ads’ wording, the CPTO, though no source names him as such. Company registry: Livo Health S.L., CIF B44862860, Paseo de Gracia 6, 08007 Barcelona. Headcount conflicts: ~40 (press Feb 2026), 50 (registry 2025), 74 (Specter/Tracxn). Round sizes undisclosed everywhere. Sources kept in docs/clients/livo-2026-09-07.md.',
}

const jobs = [
  {
    id: JOB.fullstack,
    title: 'AI-First Fullstack Engineer (Senior)',
    department: 'Product & Tech',
    location: 'Barcelona, Spain',
    remote_policy: null,
    salary_min: 60000,
    salary_max: 90000,
    salary_currency: 'EUR',
    experience_years_min: 5,
    experience_years_max: null,
    visa_requirement: null,
    company_stage: 'seed',
    job_post_url: 'https://www.linkedin.com/jobs/view/4456740667',
    skills_required: ['TypeScript', 'React', 'Java or Kotlin, Python or Go', 'SQL (MySQL or Postgres)', 'AWS or GCP', 'AI-assisted development'],
    description:
      'A hands-on senior full-stack engineer, productive across frontend, backend, data and cloud, who treats AI as a core part of the software development lifecycle: not side experimentation, but AI-assisted design, implementation, testing, debugging, documentation and operations, with full accountability for what ships. Owns outcomes at product and company level, designs, builds, deploys and operates features end to end, models relational data for complex real-time workflows, takes part in architecture decisions and meets the performance, security and compliance bar for sensitive healthcare data. Works closely with account managers and fellow engineers. €60K to €90K base plus early-stage equity (Adnane, 5 Sep 2026). Barcelona; working pattern to be confirmed.',
    requirements: [
      '5+ years of professional software engineering with production ownership of web applications',
      'Strong JavaScript/TypeScript and a modern frontend framework, React preferred',
      'Solid backend experience (Java/Kotlin, Python or Go) with REST API and distributed-systems design',
      'Strong SQL and schema design (MySQL/Postgres); comfortable modelling complex workflows',
      'Has deployed and operated applications on AWS or GCP',
      'Uses AI coding assistants daily and can verify, test and safely operationalise what they produce',
    ],
  },
  {
    id: JOB.pm,
    title: 'Product Manager, Livo Pool',
    department: 'Product & Tech',
    location: 'Barcelona, Spain',
    remote_policy: null,
    salary_min: 70000,
    salary_max: 100000,
    salary_currency: 'EUR',
    experience_years_min: 4,
    experience_years_max: null,
    visa_requirement: null,
    company_stage: 'seed',
    job_post_url: 'https://www.linkedin.com/jobs/view/4446071728',
    skills_required: ['Marketplace product management', 'AI agents in production', 'Continuous discovery', 'Fluent Spanish'],
    description:
      'Owns Livo Pool, the shift marketplace connecting healthcare professionals with hospitals across Spain, Italy and Poland, end to end: vision, roadmap and execution, with the founders and the marketplace business lead. Becomes the expert on both sides of the marketplace (nurses, assistants and doctors on one side; HR, nurse directors and supervisors on the other), grows liquidity and matching quality, runs continuous discovery through customer conversations, field visits and data, and designs, builds and deploys AI agents that replace manual coordination with automated, observable, reliable processes. Explicitly not a delivery-only, ticket-management or proxy project-management role. €70K to €100K base plus equity (Adnane, 5 Sep 2026). Barcelona; working pattern to be confirmed. Fluent Spanish is a must.',
    requirements: [
      '4+ years as a Product Manager on networked products: marketplaces, platforms, multi-sided',
      'Hands-on production experience building and deploying AI agents for operational workflows',
      'Clear understanding of marketplace dynamics: supply, demand, liquidity, matching, incentives, trust',
      'Regular direct contact with users and enterprise customers; proven product judgment and ruthless prioritisation',
      'Fluent Spanish',
    ],
  },
]

const roles = {
  [JOB.fullstack]: {
    priority: 'normal',
    headline: 'AI-First Fullstack Engineer, Senior',
    fee_percentage: null,
    context:
      'Livo’s engineering is small and founder-led: Adnane Ouahabi (co-founder) was Glovo’s founding engineer and later its Director of Engineering. The posting is explicit that AI-assisted development is the standard workflow, not a bonus, and that the engineer owns outcomes at product and company level, working directly with account managers. The stack in the ad is TypeScript and React on the front, Java/Kotlin, Python or Go behind, MySQL or Postgres, on AWS or GCP; older Livo ads named Kotlin, Postgres and Terraform. Healthcare data means a real security and compliance bar. Posted late August 2026 on LinkedIn with 80+ applicants by 7 Sep, so speed and a warm introduction matter.',
    hard_requirements: [
      '5+ years of professional engineering with production ownership of web applications',
      'TypeScript with a modern frontend framework (React preferred) and a backend language among Java/Kotlin, Python or Go',
      'Strong SQL and schema design for complex, real-time workflows',
      'Deployed and operated applications on AWS or GCP',
      'Daily, critical use of AI coding assistants: knows where LLMs help and where they fall short, and verifies what they produce',
    ],
    intake_notes: [
      '€60K to €90K base plus early-stage equity, in Adnane’s words on 5 Sep 2026',
      'Barcelona. Adnane has not yet confirmed on-site versus hybrid; ask Refery before promising either',
      'Nice to have, from the posting: containers and orchestration, LLM APIs in production, RAG, vector databases, agent workflows, AI evaluation frameworks, constraint-solving or scheduling systems',
      'Product mindset and the communication to work with product, design and operations, not an engineer who wants a spec handed over',
      'Interview process, hiring manager and start date not yet confirmed by Livo',
    ],
    not_for:
      'single-layer specialists, engineers who treat AI tools as a curiosity rather than a daily workflow, people who need a large platform team around them, or anyone who wants a remote-first role before Livo has said so.',
    interview_steps: [],
    decision_days: null,
  },
  [JOB.pm]: {
    priority: 'normal',
    headline: 'Product Manager, Livo Pool',
    fee_percentage: null,
    context:
      'Livo Pool is the core marketplace: hospitals publish shifts, verified nurses, assistants and doctors pick them up, and Lina, Livo’s AI assistant, proposes shifts over WhatsApp and runs first-round candidate calls. The PM owns this product end to end with the founders and the marketplace business lead, and is expected to design and ship AI agents that remove manual coordination. The ad is unusually direct about what the role is not: not delivery-only, not a proxy project manager, not strategy detached from users, and not a place where AI is a buzzword. Fluent Spanish is a must. Posted early August 2026 with 50 applicants by 7 Sep.',
    hard_requirements: [
      '4+ years as a PM on marketplaces, platforms or multi-sided products',
      'Has built and deployed AI agents for operational workflows in production, not just read about them',
      'Fluent marketplace vocabulary: supply, demand, liquidity, matching, incentives, trust',
      'Direct, regular contact with users and enterprise customers; comfortable with field visits',
      'Fluent Spanish',
    ],
    intake_notes: [
      '€70K to €100K base plus equity, in Adnane’s words on 5 Sep 2026',
      'Barcelona. Working pattern not yet confirmed; ask Refery before promising on-site or hybrid',
      'Health tech background is optional per the posting; marketplace depth is what matters',
      'Works directly with the founders and the marketplace business lead',
      'Interview process, hiring manager and start date not yet confirmed by Livo',
    ],
    not_for:
      'delivery or ticket managers, PMs whose AI experience is slideware, people without Spanish, or anyone who wants a large product org to slot into.',
    interview_steps: [],
    decision_days: null,
  },
}

const brief = {
  kicker: 'Refery · Partner brief',
  title: 'Livo',
  subtitle: '2 searches · Barcelona',
  url: 'https://getlivo.com',
  confidential: CONFIDENTIAL,
  sections: [
    {
      id: 'company',
      heading: 'The company',
      summary: 'Barcelona’s healthcare workforce marketplace: 200+ hospitals, 70,000+ professionals, three countries, three years in, backed by the Glovo founders’ fund.',
      blocks: [
        {
          kind: 'lede',
          text: 'Livo builds **the operating system for the healthcare workforce**: a marketplace where hospitals cover shifts with verified nurses, nursing assistants and doctors, plus permanent hiring, internal shift management, a physician vertical and a training marketplace. Founded in Barcelona in 2023, launched in August that year, and now inside more than 200 hospital and care centres across Spain, Italy and Poland.',
        },
        {
          kind: 'stats',
          items: [
            { value: '200+', label: 'hospital and care centres (July 2026)' },
            { value: '70,000+', label: 'registered healthcare professionals (July 2026)' },
            { value: '3', label: 'countries: Spain, Italy, Poland' },
            { value: '~40', label: 'people on the team (press, Feb 2026)' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            '**Three products, one workforce.** Livo Pool covers shifts on demand with AI-matched, verified professionals. Livo Offers handles permanent hiring, with in-app interview scheduling and contract signing. Livo Internal runs internal schedules, shift swaps and absences. Livo Doctors (2,500+ physicians in Catalonia by July 2026) and Livo Formación (1,000+ accredited courses, launched April 2026) came this year.',
            '**Lina, the AI layer.** Launched November 2025: a WhatsApp assistant that proposes shifts, a support agent that Livo says resolves up to 80% of queries in under five minutes, and a voice agent that runs first candidate interviews. Both searches are about people who build this kind of thing.',
            '**Customers.** Quirónsalud, HLA Grupo Hospitalario, Ribera, SCIAS Hospital de Barcelona, Clínica Sagrada Família, Clínica Tres Torres, Badalona Serveis Assistencials, Fundació Puigvert, Hermanas Hospitalarias and Hospital San Francisco de Asís in Madrid. Abroad: Policlinico di Monza and Gruppo INI in Italy, the National Institute of Geriatrics in Warsaw and Brzeziny Specialist Hospital in Poland.',
            '**The founders.** Carlos Manubens (CEO) ran real estate for CloudKitchens in Southern Europe after ESADE. Adnane Ouahabi (co-founder) was Glovo’s founding engineer in 2015 and rose to Director of Engineering over six and a half years. They bought Nursea, the Catalan nurse-shift platform, in April 2025 and brought its founder in as Head of Institutional Relations.',
            '**Backers.** Yellow, the pre-seed fund of Glovo founders Oscar Pierre and Sacha Michaud; Cusp Capital; Lanai. Round sizes are undisclosed, so do not quote a number.',
          ],
        },
        {
          kind: 'callout',
          text: 'The pitch to your candidate: a small, technical, founder-led team applying AI to a problem every hospital has, with real customers, real scale across three countries and the Glovo founders behind it. Nurses use the product every day; the engineer and the PM will feel that.',
        },
      ],
    },
    {
      id: 'bar',
      heading: 'The bar',
      blocks: [
        {
          kind: 'bar',
          groups: [
            {
              tone: 'must',
              heading: 'Non-negotiable',
              items: [
                '**AI as a daily working material.** The engineer uses AI coding assistants as the standard workflow and verifies everything they produce. The PM has built and deployed AI agents for operational workflows in production.',
                '**Ownership at company level.** Both postings say it in the same words: outcomes, not tasks. Small team, founders close.',
                '**Depth in the craft.** 5+ years shipping web applications end to end for the engineer; 4+ years on marketplaces or multi-sided products for the PM.',
                '**Barcelona.** Both roles are Barcelona-based. The exact working pattern is still to be confirmed by Livo.',
                '**Fluent Spanish for the PM.** Stated as a must in the posting. The engineering ad does not mention language.',
              ],
            },
            {
              tone: 'nice',
              heading: 'Explicitly not required',
              items: [
                'Healthcare background. The PM posting calls it optional; the engineering posting does not ask for it.',
                'A particular backend language. Java/Kotlin, Python or Go all clear.',
                'Prior LLM product work for the engineer. It is a nice to have, along with RAG, vector databases, agent workflows and scheduling systems.',
              ],
            },
            {
              tone: 'no',
              heading: 'Will not clear',
              items: [
                'Engineers who treat AI tooling as an experiment on the side, or cannot say where it fails.',
                'Delivery-only or ticket-management PMs, and proxy project managers. The ad names these directly.',
                'PMs without fluent Spanish.',
                'Anyone anchored to a base above the band. €90K is the ceiling for the engineer, €100K for the PM.',
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'logistics',
      heading: 'Logistics',
      blocks: [
        {
          kind: 'facts',
          rows: [
            { label: 'Location', value: 'Barcelona. The office is at Paseo de Gracia 6. On-site versus hybrid is not yet confirmed by Livo; ask on the search before promising either.' },
            { label: 'Compensation', value: 'Engineer: €60K to €90K base plus early-stage equity. PM: €70K to €100K base plus equity. Adnane’s own words, 5 Sep 2026. Equity size not stated.' },
            { label: 'Language', value: 'Fluent Spanish is a must for the PM. Not stated for the engineer.' },
            { label: 'Work authorisation', value: 'Not stated in either posting. Ask Refery before submitting anyone who would need sponsorship in Spain.' },
            { label: 'Process', value: 'Not yet confirmed. Adnane is on holiday the week of 7 September and is passing the search to his team; Refery will add the steps here as soon as we have them.' },
            { label: 'Channel', value: 'Refery speaks to Adnane directly. Feedback comes back through the search.' },
          ],
        },
        {
          kind: 'paragraph',
          tone: 'note',
          text: 'Both roles are public on LinkedIn (posted August 2026, 80+ and 50 applicants by 7 September). Only fresh introductions are attributable, so ask every candidate whether they have already applied.',
        },
      ],
    },
    {
      id: 'pools',
      heading: 'Where the strongest profiles come from',
      blocks: [
        {
          kind: 'cards',
          items: [
            { title: 'Barcelona scale-ups with real engineering cultures', body: 'Glovo, Wallapop, TravelPerk, Factorial, Typeform, Preply, Wallbox, and the Amazon, Ocado Technology and Dynatrace offices in the city. Engineers three to eight years in who have owned a product surface end to end.' },
            { title: 'Marketplace and staffing product people (PM seat)', body: 'Glovo, Wallapop, Cabify and Jobandtalent are the obvious Spanish homes for PMs who have run supply and demand. Anyone who has shipped an AI agent into an operations flow, not a chatbot on a landing page, is the profile.' },
            { title: 'AI-native startups in Spain', body: 'Two to four year old companies where engineers already build with Cursor, Claude Code or Copilot as a matter of course and have put LLM features into production.' },
            { title: 'Ex-Glovo', body: 'Adnane spent six and a half years there, and the investors are the Glovo founders. Engineers and PMs from the logistics and marketplace teams will recognise the shape of the problem.' },
            { title: 'Skip these pools', body: 'Consultancies and IT services, big-bank engineering, and anyone whose AI experience is limited to a course certificate.' },
          ],
        },
      ],
    },
    {
      id: 'screening',
      heading: 'Screening guide',
      blocks: [
        {
          kind: 'questions',
          items: [
            { question: 'Engineer: walk me through something you shipped end to end in the last year, frontend to database to production. What did you own, and how did you know it worked?', looking_for: 'Whole-stack ownership, real users, tests and operations mentioned unprompted.' },
            { question: 'Engineer: how do you use AI tools in your daily work, and tell me about a time the output was wrong and how you caught it.', looking_for: 'Daily, specific use with a clear sense of where LLMs fail. Verification habits. Vague enthusiasm does not clear.' },
            { question: 'PM: describe a marketplace you ran. What did you do about liquidity and matching, and what moved?', looking_for: 'Fluency in supply, demand, liquidity and incentives, backed by numbers they owned.' },
            { question: 'PM: tell me about an AI agent you put into a real operational workflow. Who used it, what did it replace, and how did you keep it observable and safe?', looking_for: 'Production deployment, human oversight where it mattered, and honesty about what broke.' },
            { question: 'Both: the team is around forty people, founder-led, in Barcelona. How does that land, and what base would you need?', looking_for: 'Genuine pull toward a small technical team, and a base inside the band. The PM must be fluent in Spanish; check it in the call.' },
          ],
        },
      ],
    },
    {
      id: 'blurb',
      heading: 'What to say to a candidate',
      blocks: [
        {
          kind: 'blurb',
          label: 'Copy to adapt',
          note: 'Anonymous until Refery clears the name. Adapt to the person, never send raw. No company name, no investor names, no links.',
          paragraphs: [
            "I'm working with a three-year-old Barcelona company building the workforce platform for hospitals: a marketplace where more than 200 hospitals across Spain, Italy and Poland cover shifts and hire from over 70,000 verified nurses, assistants and doctors, with an AI layer that already proposes shifts and runs first-round calls. Around forty people, founder-led, technical, backed by the fund of one of Spain's best-known consumer-tech founding teams.",
            'They have two roles open in Barcelona. A senior full-stack engineer, five-plus years, TypeScript and React with Java, Kotlin, Python or Go behind, who already builds with AI tools every day and wants to own outcomes rather than tickets: €60K to €90K base plus early-stage equity. And a product manager to own the core marketplace end to end with the founders, four-plus years on marketplaces or multi-sided products, who has shipped AI agents into real operational workflows and speaks fluent Spanish: €70K to €100K base plus equity.',
            "It is a small team where the founders are close to the work, and the product is used by nurses every day. I can share the name once we're a step further along.",
          ],
        },
      ],
    },
    { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
  ],
  signoff: SIGNOFF,
}

// ── apply ────────────────────────────────────────────────────────────────────

async function must(label, promise) {
  const { error, data } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

const now = new Date().toISOString()

console.log('upsert company', company.name, COMPANY_ID)
if (!DRY) await must('company', supabase.from('companies').upsert({ ...company, updated_at: now }, { onConflict: 'id' }))

const { data: existing } = await supabase.from('client_companies').select('company_id').eq('company_id', COMPANY_ID).maybeSingle()
console.log(existing ? 'update client' : 'insert client', Object.keys(client).join(', '))
if (!DRY) {
  if (existing) await must('client update', supabase.from('client_companies').update(client).eq('company_id', COMPANY_ID))
  else await must('client insert', supabase.from('client_companies').insert({ company_id: COMPANY_ID, ...client }))
}

for (const j of jobs) {
  console.log('upsert job', j.title, `€${j.salary_min / 1000}k–${j.salary_max / 1000}k`)
  if (!DRY) {
    await must(`job ${j.title}`, supabase.from('jobs').upsert(
      { ...j, company_id: COMPANY_ID, company_name: company.name, user_id: LILY, owner_user_id: LILY, created_by_user_id: LILY, status: 'open', internal_deal_type: 'partnership', updated_at: now },
      { onConflict: 'id' },
    ))
  }
}

for (const [jobId, r] of Object.entries(roles)) {
  console.log('upsert role', jobId.slice(0, 8), r.headline, r.priority)
  if (!DRY) {
    await must(`role ${jobId}`, supabase.from('partner_roles').upsert(
      {
        job_id: jobId,
        company_id: COMPANY_ID,
        is_live: true,
        priority: r.priority,
        headline: r.headline,
        context: r.context,
        fee_percentage: r.fee_percentage,
        hard_requirements: r.hard_requirements,
        intake_notes: r.intake_notes,
        not_for: r.not_for,
        interview_steps: r.interview_steps,
        decision_days: r.decision_days,
        added_by: LILY,
        updated_at: now,
      },
      { onConflict: 'job_id' },
    ))
  }
}

const { data: existingBrief } = await supabase.from('partner_briefs').select('id, version').eq('company_id', COMPANY_ID).is('job_id', null).maybeSingle()
console.log(existingBrief ? `replace brief v${existingBrief.version}` : 'insert brief', `${brief.sections.length} sections`)
if (!DRY) {
  const row = {
    company_id: COMPANY_ID,
    job_id: null,
    title: `${brief.title} · Partner brief`,
    status: 'published',
    content: brief,
    published_at: now,
    created_by: LILY,
    updated_at: now,
  }
  if (existingBrief) await must('brief update', supabase.from('partner_briefs').update({ ...row, version: (existingBrief.version ?? 1) + 1 }).eq('id', existingBrief.id))
  else await must('brief insert', supabase.from('partner_briefs').insert(row))
}

console.log(DRY ? '\nDry run. Nothing written.' : '\nDone.')
