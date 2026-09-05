/**
 * Loads the six live clients onto the desk as searches, with the brief detail
 * a partner needs before they source: the bar, the intake notes, who it is not
 * for, how they interview, and a company brief per client.
 *
 * Sources, in order of authority: signed client agreements in
 * client_agreement_signatures (fees), the scout briefs Lily sent partners
 * (Augustus 29 Jul, NewForm 7 Aug, Alcor 12 Aug), the Arx Labs hiring-manager
 * brief and Rehan's intake calls (24 Aug, 3 and 4 Sep), Henry's Judgment Labs
 * intake (15 Jun), Lily's partner recaps for Hilbert's AI, and each company's
 * public Ashby board as checked on 5 Sep 2026.
 *
 * Idempotent: every write is an upsert keyed on a stable id, so running it
 * twice changes nothing.
 *
 *   node scripts/seed-searches-2026-09.mjs          # apply
 *   node scripts/seed-searches-2026-09.mjs --dry    # print the plan only
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

const COMPANY = {
  arx: 'bfa8d69d-2614-468a-aab3-ab27807c6aca',
  alcor: '0d07ebfa-06b9-49b1-bb18-2e74b5a33e8e',
  newform: '4cc6a4d2-4443-4740-8a45-f1ddfc465b35',
  augustus: 'f6d8fbd6-222b-4a32-a848-687586adf192',
  judgment: '4c4990da-a982-48e3-8903-2f61439abf12',
  hilberts: '63d57f07-4bff-4250-809a-3a7ca7b9b0b8',
}

// Stable ids for the jobs this script creates, so re-runs upsert.
const JOB = {
  arxFde: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e01',
  arxRe: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e02',
  alcorAi: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e11',
  alcorFs: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e12',
  alcorFw: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e13',
  alcorFde: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e14',
  hilbertGo: '7a1e0f2c-4b3d-4c5e-9f60-0a1b2c3d4e21',
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

// ── the data ─────────────────────────────────────────────────────────────────

const clients = [
  // ── Arx Labs ────────────────────────────────────────────────────────────
  {
    key: 'arx',
    company_id: COMPANY.arx,
    client: {
      relationship: 'client',
      is_published: true,
      is_active: true,
      anon_alias: 'Seed AI evaluation and post-training lab, San Francisco',
      public_blurb:
        'Four months in, eight people out of Glean, Palantir and NVIDIA, already revenue-generating with Fortune 200 customers. Two founding engineering seats, in person in San Francisco.',
      contact_name: 'Rehan Rupawalla',
      contact_email: 'rehan@arxlabs.ai',
      channel: 'Slack channel with the founders',
      convo_stage: 'Client agreement v2.7 signed 4 Sep 2026 at 15%. Second intake call 3 and 4 Sep.',
      next_step: 'Propose partners and send the first profiles from the pool.',
    },
    jobs: [
      {
        id: JOB.arxFde,
        title: 'Forward Deployed Engineer, Research',
        department: 'Deployed',
        location: 'San Francisco',
        remote_policy: 'onsite',
        salary_min: 130000,
        salary_max: 250000,
        experience_years_min: 0,
        experience_years_max: 8,
        visa_requirement: 'us_authorized',
        description:
          'Arx Labs builds the evaluation environments and post-training infrastructure that make long-horizon enterprise agents trainable, then uses that stack to train custom models for large technology companies. The deployed team embeds with very technical enterprise customers (ServiceNow and Workday shaped, not labs), takes the research team’s environments into their workflows, and trains custom models against them. You write the code and you hold your own with the customer’s researchers and engineers. New grad to senior; the archetype matters more than the years. $130K to $150K base new grad to one year out, $150K to $250K senior, 0.5% to 1% equity at the junior end and higher for senior. San Francisco, in person.',
        requirements: [
          'Significant experience building agent systems (the Decagon, Glean, Sierra, Harvey shape), or technical forward-deployed work where you wrote the code',
          'Strong software fundamentals in any stack',
          'Credible with very technical customers: their researchers and engineers',
          'San Francisco in person, or New York with 3 to 6 months in SF first',
        ],
      },
      {
        id: JOB.arxRe,
        title: 'Research Engineer, RL Environments and Infrastructure',
        department: 'Research',
        location: 'San Francisco',
        remote_policy: 'onsite',
        salary_min: 130000,
        salary_max: 250000,
        experience_years_min: 0,
        experience_years_max: 8,
        visa_requirement: 'us_authorized',
        description:
          'The research team works two open problems: evaluation environments for long-horizon agent workflows, where correctness and efficiency both get harder to judge as trajectories stretch, and high-fidelity mocks of large, messy enterprise systems so agents can be evaluated and trained outside production. You build the environments, evals and RL pipelines the deployed team and the models depend on. $130K to $250K base by level, 0.5% to 1% equity at the junior end and higher for senior. San Francisco, in person.',
        requirements: [
          'Built environments, evals or RL pipelines that ran in production',
          'Strong systems engineer who can pick up any stack',
          'San Francisco in person',
        ],
      },
    ],
    roles: {
      [JOB.arxFde]: {
        priority: 'high',
        headline: 'Forward Deployed Engineer, Research',
        fee_percentage: 15,
        context:
          'Two open-ended seats, both live in parallel, weighted toward the deployed seat first. Rehan: “If we came up with five good deployed engineers tomorrow, I would hire all of them.” Customers are engineers and researchers at ServiceNow and Workday sized companies, so candidates must be more technical than a typical Palantir deployment strategist. Tech stack is deliberately not a filter; anchoring to one stack is itself a negative signal.',
        hard_requirements: [
          'Significant experience building agent systems (Decagon, Glean, Sierra, Harvey shape), or technical forward-deployed work where they wrote the code',
          'Strong software fundamentals, any stack',
          'Credible with very technical customers: their researchers and engineers, not their buyers',
          'San Francisco in person, or New York with 3 to 6 months in SF first',
        ],
        intake_notes: [
          'Palantir FDEs who actually build, and FDEs from OpenAI, Anthropic and Cognition, are the named hunting grounds',
          'New grad to senior. Junior end $130K to $150K with 0.5% to 1%; senior above that with more equity',
          '“If someone opens with base salary, that tells me most of what I need.” Equity appetite is the first filter',
          'Bay Area candidates in once or twice a week, and senior US candidates who do 1 to 2 months in SF first, are case by case',
          'Visa: OPT with 2.5+ years and H-1B transfers work. No new petitions from abroad',
        ],
        not_for:
          'pre-sales or non-coding consulting, Palantir deployment strategists without deep technical skills, ten-year big-tech profiles looking for safety, or anyone anchored to one stack.',
        interview_steps: [
          { title: 'Intro call with Rehan', detail: '30 minutes, within days of the introduction' },
          { title: 'Technical session with both founders', detail: 'On a real Arx problem, not puzzles' },
          { title: 'Meet the team', detail: 'The eight, out of Glean, Palantir and NVIDIA' },
        ],
        decision_days: 14,
      },
      [JOB.arxRe]: {
        priority: 'normal',
        headline: 'Research Engineer, RL Environments and Infrastructure',
        fee_percentage: 15,
        context:
          'The research half of the same loop: environments and evals for long-horizon agents, and high-fidelity mocks of enterprise systems. Mercor environments researchers and Cognition research engineers are the comparison set for comp; expect a base cut against them and sell the ownership.',
        hard_requirements: [
          'Built environments, evals or RL pipelines that ran in production',
          'Strong systems engineer who can pick up any stack',
          'San Francisco in person',
        ],
        intake_notes: [
          'The best archetype: founders after an exit or a shutdown, deciding between starting again and joining something small',
          'Background from labs or data vendors with environment design or RL experience',
          'Equity first, cash competitive for the right person. 0.5% to 1% junior, higher senior',
        ],
        not_for: 'pretraining-only researchers, career academics, or anyone whose evals live in a notebook.',
        interview_steps: [
          { title: 'Intro call with Rehan', detail: '30 minutes' },
          { title: 'Technical session with both founders', detail: 'On a real Arx problem' },
          { title: 'Meet the team', detail: null },
        ],
        decision_days: 14,
      },
    },
    brief: {
      kicker: 'Refery · Partner brief',
      title: 'Arx Labs',
      subtitle: '2 founding engineering searches · San Francisco, in person',
      url: 'https://arxlabs.ai',
      confidential: CONFIDENTIAL,
      sections: [
        {
          id: 'company',
          heading: 'The company',
          summary: 'Evaluation environments and post-training infrastructure for enterprise agents, already inside Fortune 200 customers with revenue, four months in.',
          blocks: [
            { kind: 'lede', text: 'Arx Labs builds the **evaluation environments and post-training infrastructure that make long-horizon enterprise agents trainable**, then uses that stack to train custom models for large technology companies. Four months in, eight people, already revenue-generating with customers of a scale most seed companies never touch.' },
            { kind: 'stats', items: [{ value: '3 to 4', label: 'months since founding' }, { value: '8', label: 'people, out of Glean, Palantir, NVIDIA and prior founders' }, { value: '7 figures', label: 'monthly revenue' }, { value: 'F200', label: 'scale of the customers you work inside' }] },
            { kind: 'bullets', items: ['**Two halves, one loop.** A research team on evaluation environments for long-horizon agent workflows and high-fidelity mocks of messy enterprise systems. A deployed team that takes those environments into customers and trains custom models against their workflows.', '**Who they serve.** Very technical technology companies of the ServiceNow and Workday shape rather than labs, working directly with their researchers and engineers.', '**The founders.** Rehan Rupawalla co-founded Sups (acquired by U.S. News in 2025) and was one of the earliest team members at Mercor through its rise to a $10B valuation. His co-founder, who leads the deployed team, is ex-Palantir.'] },
            { kind: 'callout', text: 'The pitch to your candidate: as agent workflows get longer, evaluation is the bottleneck, and whoever owns realistic enterprise environments owns the training loop. Arx is the rare environment company already inside large enterprises with revenue, four months in.' },
          ],
        },
        {
          id: 'bar',
          heading: 'The bar',
          blocks: [
            { kind: 'bar', groups: [
              { tone: 'must', heading: 'Non-negotiable', items: ['**Strong engineer first.** Both seats. Systems engineers who have shipped production code and can pick up any stack.', '**Agent or environment depth.** Built agent systems or coded as an FDE for the deployed seat; built environments, evals or RL pipelines for research.', '**Equity appetite over cash.** The first thing Rehan named. People deciding between starting something and joining something small.', '**Technical enough for very technical customers.** Credibility with their researchers, not just their buyers.'] },
              { tone: 'nice', heading: 'Explicitly not required', items: ['Years. New grad to senior on both seats.', 'A particular stack. Being anchored to one is a negative signal.', 'Bay Area residence today. New York with an SF stint, or senior US candidates with 1 to 2 months on site, work.'] },
              { tone: 'no', heading: 'Will not clear', items: ['Cash-first. A mid-level Decagon or Sierra engineer takes a $30K to $100K base cut to join. Only the equity-motivated slice moves.', 'Remote. SF is a strong preference and hard for junior hires.', 'Visa cases needing a petition from abroad.'] },
            ] },
          ],
        },
        {
          id: 'hm',
          heading: 'In the hiring manager’s words',
          blocks: [
            { kind: 'cards', items: [
              { title: 'Who are you really looking for?', body: '“If they’re interested by the equity and by joining something small, I think that’s the best fit, especially people that might be considering founding their own thing.” Read: equity appetite is the first filter, before skills.' },
              { title: 'Does the stack matter?', body: '“We want systems engineers who can build anything.” Anchoring to one stack is a negative signal. Read: do not filter on languages or frameworks. Filter on shipped, and on range.' },
              { title: 'Who does not work?', body: '“People that have spent ten years in big tech tend to be worse because they’re looking for more safety.” Palantir deployment strategists without deep technical skills are not a fit either, because the customers are very technical.' },
              { title: 'How fast?', body: '“If we came up with five good deployed engineers tomorrow, I would hire all of them.” Read: there is no headcount ceiling on the deployed seat. Send as soon as you have conviction.' },
            ] },
          ],
        },
        {
          id: 'logistics',
          heading: 'Logistics',
          blocks: [
            { kind: 'facts', rows: [
              { label: 'Location', value: 'San Francisco, in person. Strong preference, hard for junior hires.' },
              { label: 'Flex', value: 'New York candidates who spend 3 to 6 months in SF up front. Senior candidates anywhere in the US who spend 1 to 2 months on site. Bay Area candidates in once or twice a week, case by case.' },
              { label: 'Visa', value: 'OPT with 2.5+ years remaining and H-1B transfers work. No new petitions from abroad.' },
              { label: 'Compensation', value: '$130K to $150K new grad to one year out; $150K to $250K senior. 0.5% to 1% equity at the junior end, higher for senior. Equity first, cash competitive for the right person.' },
              { label: 'Process', value: 'Intro call with Rehan, technical session with both founders on a real problem, then the team. About two weeks.' },
              { label: 'Channel', value: 'Slack with the founders. Reads come back to you within 24 hours of every step.' },
            ] },
          ],
        },
        {
          id: 'pools',
          heading: 'Where the strongest profiles come from',
          blocks: [
            { kind: 'cards', items: [
              { title: 'Ex-Palantir FDEs, 2 to 6 years out', body: 'The ones who built, not the ones who configured. In our pool they ask $150K to $240K, inside the band.' },
              { title: 'Founders after an exit or a shutdown', body: 'Deciding between starting again and joining something small. The best archetype, and the most equity-sensitive.' },
              { title: 'Agent companies, 1 to 3 years in', body: 'Decagon, Sierra, Harvey, Cognition, Glean. Past their cliff, with a founder itch.' },
              { title: 'Founding engineers at stalled seed startups', body: 'Three to eight years in, asking $160K to $220K.' },
              { title: 'Strong new grads and 1 to 3 year engineers', body: 'From good companies, at $150K rather than $130K.' },
              { title: 'Skip these pools', body: 'Pretraining-only research, big-tech-only with no builder signal, IT services and consulting DNA.' },
            ] },
          ],
        },
        {
          id: 'screening',
          heading: 'Screening guide',
          blocks: [
            { kind: 'questions', items: [
              { question: 'Walk me through a system you shipped that real users depended on. What did you own end to end, and how did you know it worked?', looking_for: 'Production, ownership of a whole layer, evals or regression harnesses mentioned unprompted.' },
              { question: 'You are choosing between starting something and joining an eight-person company with real revenue. How do you think about cash versus equity?', looking_for: 'Eyes lighting up at ownership. Anyone negotiating base first is likely the wrong profile.' },
              { question: 'Deployed seat: tell me about code you personally wrote inside a customer’s stack.', looking_for: 'Hands-on API, ETL or model work in the customer’s environment. Pre-sales narrative does not clear.' },
              { question: 'Research seat: how do you judge whether a long-horizon agent trajectory was correct and efficient?', looking_for: 'Fluency with evals beyond pass or fail, environments, trajectory scoring.' },
              { question: 'What is your current US work status?', looking_for: 'Citizen, green card, H-1B transfer, or OPT with 2.5+ years.' },
            ] },
          ],
        },
        {
          id: 'blurb',
          heading: 'What to say to a candidate',
          blocks: [
            { kind: 'blurb', label: 'Copy to adapt', note: 'Anonymous until Refery clears the name. Adapt to the person, never send raw.', paragraphs: [
              "I'm working with a four-month-old AI company in San Francisco that builds evaluation environments and post-training infrastructure for long-horizon enterprise agents, and uses it to train custom models for very large technology companies. Eight people today, out of places like Glean, Palantir and NVIDIA, led by repeat founders with a prior exit. A few million raised and already revenue-generating, with customers most seed companies never get near.",
              'Two open-ended seats: forward deployed engineers with a research bend, who embed with very technical enterprise customers and train models against their workflows, and research engineers building the evaluation environments themselves. $130K to $250K base by level, with founding equity from 0.5% to 1% and higher for senior. In person in San Francisco, with flex for New York and senior US candidates who do the first months there.',
              "They hire strong systems engineers over any particular stack, and they are explicit that they want people joining for the upside. I can share the name once we're a step further along.",
            ] },
          ],
        },
        { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
      ],
      signoff: SIGNOFF,
    },
  },

  // ── Alcor Labs ─────────────────────────────────────────────────────────
  {
    key: 'alcor',
    company_id: COMPANY.alcor,
    client: {
      relationship: 'client',
      is_published: true,
      is_active: true,
      anon_alias: 'Seed physical-AI company, SF Bay Area',
      public_blurb:
        'Wearable AI copilot for industrial field technicians, live in eight countries, $5M seed led by A*. Four founding engineering seats, in person in the Bay Area.',
      contact_name: 'Elior Benarous',
      contact_email: 'elior@alcor-labs.com',
      channel: 'Email and Slack with Elior. Refery preps every candidate before the technical stage.',
      convo_stage: 'Client agreement v2.7-A signed 12 Aug 2026 at 10%. Search restarted 1 Sep with Gina’s engineering duo.',
      next_step: 'Keep the four seats moving; the founders collect offers fast.',
    },
    jobs: [
      { id: JOB.alcorAi, title: 'Founding AI Engineer (computer vision)', department: 'Engineering', location: 'SF Bay Area (Burlingame)', remote_policy: 'onsite', salary_min: 180000, salary_max: 240000, experience_years_min: 1, experience_years_max: 5, visa_requirement: 'us_authorized',
        description: 'Owns the AI core: agentic VLM, multimodal visual reasoning, evals, model orchestration, running on real hardware against real customer workflows. Priority is visual AI (detection, segmentation, reasoning over image and video, VLMs and VLAs) over general agentic AI. Applied agentic work plus real evals discipline. $180K to $240K base + 0.25% to 0.75% equity. Fully in person in the Bay Area.',
        requirements: ['Shipped multimodal or computer-vision systems to production and owned the model layer end to end', 'Evals discipline: ground-truth, trajectory and regression harnesses driving iteration', '1 to 5 years, bachelor’s roughly 2018 or later', 'Bay Area, fully in person'] },
      { id: JOB.alcorFs, title: 'Founding Full-Stack Engineer', department: 'Engineering', location: 'SF Bay Area (Burlingame)', remote_policy: 'onsite', salary_min: 180000, salary_max: 240000, experience_years_min: 2, experience_years_max: 5, visa_requirement: 'us_authorized',
        description: 'Owns the product layer around the AI core end to end: the real-time video and data pipeline from glasses to model under tight latency budgets and bad connectivity, plus backend APIs, the data layer, and the frontend and mobile client customers touch. True full-stack range including React and React Native with native bridges. $180K to $240K base + 0.25% to 0.75% equity.',
        requirements: ['True full-stack range including React / React Native with native bridges', 'Real-time or low-latency systems background: streaming platforms or hardware-constrained domains', '2 to 5 years, shipped scalable systems with real users, ideally early-stage', 'Bay Area, fully in person'] },
      { id: JOB.alcorFw, title: 'Founding Engineer, backend and firmware', department: 'Engineering', location: 'SF Bay Area (Burlingame)', remote_policy: 'onsite', salary_min: 150000, salary_max: 200000, experience_years_min: 1, experience_years_max: 4, visa_requirement: 'us_authorized',
        description: 'The systems seat closest to the hardware: real work on the glasses themselves, so genuine firmware experience is required. Flashing and adapting vendor firmware, embedded Linux or RTOS or device SDKs, evaluating camera and sensor hardware, defining specs to drive an ODM. Backend-leaning full-stack on a modern stack, comfortable close to the metal (C, C++, Rust), owning a real-time multimodal pipeline end to end. $150K to $200K base + 2% to 3% equity, flex higher for exceptional.',
        requirements: ['Genuine firmware experience: embedded Linux / RTOS or device SDKs, flashing and adapting vendor firmware', 'Comfortable close to the metal (C / C++ / Rust) and on a modern backend stack', '1 to 4 years, founding-engineer or intense-culture shipping experience (Tesla, SpaceX, Anduril, top YC)', 'Bay Area, fully in person'] },
      { id: JOB.alcorFde, title: 'Founding Forward-Deployed Engineer (technical)', department: 'Engineering', location: 'SF Bay Area (Burlingame)', remote_policy: 'onsite', salary_min: 160000, salary_max: 245000, experience_years_min: 1, experience_years_max: 5, visa_requirement: 'us_authorized',
        description: 'Embeds with very large industrial customers (50,000-employee scale) and brings the glasses live on the factory floor. Real software engineering plus last-layer integrations into whatever the customer runs: API, webhook and ETL work across ERP, CMMS, ServiceNow, SAP, ticketing, knowledge bases. Hands-on modern AI: has built agentic or RAG features themselves. Roughly 25% domestic travel. $160K to $245K base + 0.25% to 0.75% equity.',
        requirements: ['1 to 5 years of hands-on FDE, solutions or implementation engineering that ships code', 'Has built agentic or RAG features themselves; platform configuration alone does not count', 'Customer-facing, energised by industrial clients, roughly 25% domestic travel', 'Bay Area, fully in person'] },
    ],
    roles: {
      [JOB.alcorAi]: {
        priority: 'high', headline: 'Founding AI Engineer, computer vision', fee_percentage: 10,
        context: 'Four seats live in parallel. The shared signal: people who have shipped in hardware-constrained, computer-vision-heavy environments (drones, robotics, autonomous driving, real-time video). First wave works out of a shared hacker house in Burlingame for roughly six months, then a normal SF office as the team grows to about ten.',
        hard_requirements: ['Shipped multimodal or CV systems to production and owned the model layer end to end', 'Applied agentic work plus real evals discipline: ground-truth, trajectory and regression harnesses', '1 to 5 years, bachelor’s roughly 2018 or later', 'Bay Area, fully in person'],
        intake_notes: ['Priority is visual AI (detection, segmentation, VLMs / VLAs) over general agentic AI', '“Multimodal” meaning sensor fusion, audio or time series does not count here', 'Visa sponsored for candidates already in the US: O-1, TN, E-3, H-1B1, H-1B transfers, OPT and STEM OPT. No petitions from abroad', 'Default rhythm is roughly 9-9-6; exceptional senior talent can trade hours for expertise'],
        not_for: 'career academics, pretraining-only researchers, classical-CV-only vocabulary, or anyone who needs remote.',
        interview_steps: [{ title: 'Intro call with a co-founder', detail: 'Elior runs it personally' }, { title: 'Technical stage with both co-founders', detail: 'Live coding or an AI take-home' }, { title: 'On-site with the team', detail: 'See the product on real hardware' }],
        decision_days: null,
      },
      [JOB.alcorFs]: {
        priority: 'normal', headline: 'Founding Full-Stack Engineer', fee_percentage: 10,
        context: 'Owns everything around the AI core: glasses-to-model pipeline under latency and connectivity constraints, backend, data layer, and the client customers touch. Deep firmware not needed here; that is the systems seat.',
        hard_requirements: ['True full-stack range, including React / React Native with native bridges', 'Real-time or low-latency systems background: Twitch, Mux, Cloudflare, Agora, LiveKit, or hardware-constrained domains', '2 to 5 years, shipped scalable systems with real users, ideally early-stage', 'Bay Area, fully in person'],
        intake_notes: ['Backend-only specialists route to the firmware seat instead', 'Enough hardware exposure to build for wearables; deep firmware not needed', 'Visa sponsored for candidates already in the US'],
        not_for: 'single-layer specialists, legacy or enterprise-only backgrounds, big-tech-only with no builder signal, zero hardware exposure.',
        interview_steps: [{ title: 'Intro call with a co-founder', detail: null }, { title: 'Technical stage with both co-founders', detail: 'Live coding or an AI take-home' }, { title: 'On-site with the team', detail: null }],
        decision_days: null,
      },
      [JOB.alcorFw]: {
        priority: 'high', headline: 'Founding Engineer, backend and firmware', fee_percentage: 10,
        context: 'Highest equity and scarcest profile of the four. Real work on the glasses themselves, including evaluating camera and sensor hardware and driving an ODM, likely Shenzhen manufacturers. Not mechanical engineering: firmware and software agility.',
        hard_requirements: ['Genuine firmware experience: embedded Linux / RTOS or device SDKs, flashing and adapting vendor firmware', 'Comfortable close to the metal (C / C++ / Rust) and on a modern backend stack (AWS, GCP, Supabase, Railway)', 'Owns a real-time multimodal pipeline end to end', '1 to 4 years, more if exceptional'],
        intake_notes: ['Founding-engineer or early-startup shipping, or an intense-culture company: Tesla, SpaceX, Anduril, top YC', '2% to 3% equity, flex higher for exceptional', 'Visa sponsored for candidates already in the US'],
        not_for: 'pure web or app developers, pure AI researchers, mechanical engineers, or legacy and big-tech-only careers with no shipping.',
        interview_steps: [{ title: 'Intro call with a co-founder', detail: null }, { title: 'Technical stage with both co-founders', detail: null }, { title: 'On-site with the team', detail: null }],
        decision_days: null,
      },
      [JOB.alcorFde]: {
        priority: 'normal', headline: 'Founding Forward-Deployed Engineer, technical', fee_percentage: 10,
        context: 'Embeds with 50,000-employee industrial customers and brings the glasses live on the floor. Distyl and C3 are the ideal hunting grounds. Roughly 25% domestic travel.',
        hard_requirements: ['1 to 5 years of hands-on FDE, solutions or implementation engineering that ships code', 'Last-layer integrations into the customer’s stack: API, webhook, ETL across ERP, CMMS, ServiceNow, SAP', 'Has built agentic or RAG features themselves', 'Bay Area, fully in person'],
        intake_notes: ['Vendor-platform config alone (Foundry app config, for example) does not count', '3 to 4 years leans right for this seat', 'Customer role-play plus a messy-data exercise at the technical stage'],
        not_for: 'pre-sales or non-coding consulting, platform-config-only profiles, pure SWE with no customer exposure, or an FDE title recently veneered onto a non-deployment career.',
        interview_steps: [{ title: 'Intro call with a co-founder', detail: null }, { title: 'Technical stage', detail: 'Customer role-play plus a messy-data exercise' }, { title: 'On-site with the team', detail: null }],
        decision_days: null,
      },
    },
    brief: {
      kicker: 'Refery · Partner brief',
      title: 'Alcor Labs',
      subtitle: '4 founding engineering searches · SF Bay Area, in person',
      url: 'https://alcor-labs.com',
      confidential: CONFIDENTIAL,
      sections: [
        { id: 'company', heading: 'The company', summary: 'Wearable AI for industrial field technicians, live in eight countries six months in, and the earliest credible entry into physical-world AI a candidate will find.', blocks: [
          { kind: 'lede', text: 'Alcor Labs builds a **wearable AI copilot for industrial field technicians**: an agentic vision-language system running on Meta Ray-Ban-class smart glasses that guides blue-collar workers through hands-on electromechanical procedures in data centers, energy grid infrastructure, aerospace, defense and utilities.' },
          { kind: 'stats', items: [{ value: '$5M', label: 'seed, led by A*, Valor participating' }, { value: '8', label: 'countries with live deployments' }, { value: '2026', label: 'founded, early this year' }, { value: '4 → 10', label: 'roles now, team by next spring' }] },
          { kind: 'bullets', items: ['**The technical bet** is computer vision and agentic VLMs grounded on bespoke integrations with the legacy enterprise systems customers actually run (ServiceNow, SAP, Salesforce). Explicitly not another LLM wrapper.', '**They had a YC offer** and chose to raise independently instead.', '**The long-term direction is robotics.** The real-world industrial data the glasses collect is groundwork for automation.', '**Founders.** Elior Benarous, computer vision and physical AI research at Harvard and NASA, publications at NeurIPS and ICCV, runs every intro call personally. Gabriel Deo, MIT machine learning, quant researcher before founding. Best friends since childhood.'] },
        ] },
        { id: 'bar', heading: 'The bar', blocks: [{ kind: 'bar', groups: [
          { tone: 'must', heading: 'Non-negotiable', items: ['**Shipped, not studied.** Production systems with real users; owning something end to end.', '**Hardware-constrained or real-time depth.** Drones, robotics, AV, wearables, streaming, edge. Latency budgets and bad connectivity should feel like home.', '**Fully in person, Bay Area.** First wave works out of a shared hacker house in Burlingame for roughly six months, then a normal SF office. No remote, full stop.', '**Founder spirit.** Hunger, scrappiness, high agency, a genuine pull toward physical-world AI.', '**US-workable visa status.** Sponsorship is real but only for candidates already in the US.'] },
          { tone: 'nice', heading: 'Explicitly not required', items: ['Pedigree. They hire for hunger and mission alignment over brand names.', 'Long tenure. 1 to 2 years is the sweet spot for most seats.', 'Living in the house. Coming in office-style daily works.', 'Prior wearables experience. Adjacent hardware-constrained domains transfer fully.', 'Deep firmware, except for the systems seat.'] },
          { tone: 'no', heading: 'Will not clear', items: ['Remote or hybrid asks, even exceptional profiles.', 'LLM-trend chasers with no vision, hardware or systems depth.', 'Pure researchers with no shipped product ownership.', 'Big-tech-only with no builder signal; legacy enterprise, IT services and consulting DNA.', 'Visa cases needing a petition processed from abroad.'] },
        ] }] },
        { id: 'logistics', heading: 'Logistics', blocks: [{ kind: 'facts', rows: [
          { label: 'Location', value: 'SF Bay Area, fully onsite. Hacker house in Burlingame for roughly the first six months, then a normal SF office.' },
          { label: 'Visa', value: 'Sponsored across all four roles: O-1, TN, E-3, H-1B1, and H-1B transfers or change of status for candidates already in the US. F-1 OPT and STEM OPT fine. No petitions processed from abroad.' },
          { label: 'Compensation', value: 'USD. Bases per role. Equity 0.25% to 0.75% for three seats and 2% to 3% for the firmware seat. The cash and equity mix flexes to fit the candidate.' },
          { label: 'Tempo', value: 'High-intensity, high-ownership, in person; broadly a 9-9-6 rhythm. Exceptionally strong senior talent can trade hours for expertise.' },
          { label: 'Reporting', value: 'Directly to the two co-founders. First hires join a team of two.' },
          { label: 'Process', value: 'Intro call with a co-founder, technical stage with both (live coding or an AI take-home; for the FDE a customer role-play plus a messy-data exercise), then on-site with the team.' },
        ] }, { kind: 'paragraph', tone: 'note', text: 'Because sponsorship covers candidates already anywhere in the US, your reach is national: a strong profile in Austin, Seattle, Boston or NYC on an H-1B, OPT or O-1 track is fully in play if they will relocate.' }] },
        { id: 'pools', heading: 'Where the strongest profiles come from', blocks: [{ kind: 'cards', items: [
          { title: 'AR / wearables', body: 'Snap, Magic Leap, Vuzix, RealWear, Squint, XREAL, Brilliant Labs, Meta Reality Labs.' },
          { title: 'Real-time video / streaming', body: 'Mux, Twitch, Cloudflare, LiveKit, Agora, Daily, Vimeo.' },
          { title: 'Robotics / AV / CV', body: 'Skydio, Waymo, Cruise, Aurora, Nuro, Zoox, Wayve, Scale AI, Shield AI, Serve Robotics.' },
          { title: 'Applied AI / VLM startups', body: 'Roboflow, Runway, Pika, Decagon, MultiOn; frontier labs with shipping culture.' },
          { title: 'FDE culture (especially the FDE seat)', body: 'Palantir, Anduril, Applied Intuition, C3 AI, Distyl, Databricks, Cresta.' },
          { title: 'Skip these pools', body: 'Large banks, slow consulting and IT services, healthcare and biotech AI, pure consumer or social.' },
        ] }] },
        { id: 'screening', heading: 'Screening guide', blocks: [{ kind: 'questions', items: [
          { question: 'Walk me through a CV or multimodal system you shipped to production. What did you own end to end, and how did you know it worked?', looking_for: 'Real users, ownership of the model layer, unprompted mention of evals or regression harnesses.' },
          { question: 'Have you built for hardware-constrained or bad-connectivity environments? What broke, and what did you trade off?', looking_for: 'Fluency in latency budgets, on-device vs cloud routing, power and thermal constraints.' },
          { question: 'The first six months are an in-person founding team working out of a shared house in the Bay, on roughly a 9-9-6 rhythm. Honestly, how does that land for you?', looking_for: 'Genuine excitement, not reluctant acceptance.' },
          { question: 'FDE candidates: tell me about an integration you personally coded into a customer’s enterprise stack.', looking_for: 'Hands-on API, ETL or webhook code and self-built agentic or RAG features.' },
          { question: 'What is your current US work status?', looking_for: 'Citizen, green card, or already in the US on OPT, STEM OPT, H-1B, O-1, TN, E-3, H-1B1 track.' },
        ] }] },
        { id: 'blurb', heading: 'What to say to a candidate', blocks: [{ kind: 'blurb', label: 'Copy to adapt', note: 'The only text candidates may see. No company name, no investor names, no links.', paragraphs: [
          "I'm working with a seed-stage company in the SF Bay Area building wearable AI for industrial field work: computer vision that guides technicians through complex physical procedures in environments like data centers and energy infrastructure. They raised a $5M seed from a top Silicon Valley fund, are about six months in, and already have live deployments with very large enterprise customers. The long-term direction is robotics.",
          'They are making their first four engineering hires: an applied AI engineer (computer vision / VLMs), a full-stack engineer (real-time video and data pipelines), a systems engineer close to the hardware (firmware and embedded), and a technical forward-deployed engineer who embeds with enterprise customers. Bases run roughly $150K to $245K depending on the seat, with meaningful founding equity, up to 2 to 3% for the hardware seat. Visa sponsorship works for candidates already in the US.',
          "It is fully in person and deliberately intense: the founding team works together out of a shared house in the Bay for the first months before moving to a normal SF office. Both founders are technical, with serious computer vision research backgrounds, and they hire for hunger over pedigree, mostly 1 to 5 years of experience. I can share the company name once we're a step further along.",
        ] }] },
        { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
      ],
      signoff: SIGNOFF,
    },
  },

  // ── NewForm ────────────────────────────────────────────────────────────
  {
    key: 'newform',
    company_id: COMPANY.newform,
    client: {
      relationship: 'client',
      is_published: true,
      is_active: true,
      anon_alias: 'Bootstrapped creative-intelligence company, New York',
      public_blurb:
        'About 60 people, bootstrapped and profitable since day one, growing several hundred percent a year, making ads for some of the fastest-growing consumer and AI companies. Three Account Manager seats in Manhattan.',
      contact_name: 'Tom Psaras (Chief of Staff)',
      contact_email: 'tom@newform.com',
      channel: 'Slack with Tom. Feedback within one to two hours, never more than a day.',
      convo_stage: 'Client agreement v2.4 signed 7 Aug 2026 at 10%. First seat targeted around Labor Day, all three by October.',
      next_step: 'Keep New York AM candidates flowing; Kelly is in process.',
    },
    jobs: [],
    jobUpdates: [{ id: 'cba85cfb-5f25-4243-843d-609af3f1d207', title: 'Account Manager (posted as Growth Marketing Lead)', status: 'open', salary_min: 130000, salary_max: 175000, experience_years_min: 4, experience_years_max: 8 }],
    roles: {
      'cba85cfb-5f25-4243-843d-609af3f1d207': {
        priority: 'urgent', headline: 'Account Manager · 3 seats', fee_percentage: 10,
        context: 'Three seats. Own the client relationship end to end for a book of NewForm’s fastest-growing accounts, run a pod of 2 to 3 Forward Deployed Creatives who execute the creative for you, and grow the book. The bonus pays directly on client ad-spend expansion, so a sales and business development instinct is the single most valued trait. Not a creative role and not a farmer-AM seat. No equity at this level; the trade is cash upside, with bonus potential up to the size of the base.',
        hard_requirements: ['Client ownership, proven: personally owned a book of accounts end to end, with retention and expansion outcomes they can put numbers on', 'Sales and BD instinct: spots expansion opportunities and closes them', 'Paid social fluency: can speak CAC, ROAS, creative testing and media spend credibly', 'Startup tempo: five days a week in the Manhattan office', '4 to 8 years of experience'],
        intake_notes: ['Both backfill and growth: one AM just resigned to Amazon and client count is set to grow ~50% by year end', 'Tom (Chief of Staff) owns the process end to end and can commit without routing through the founders', '“People in this role have the opportunity to essentially make in bonus their base salary.” Strong performers clear $250K+ all in', 'Only market client names that appear on newform.com; some clients cannot be advertised', 'US work authorisation required. No sponsorship'],
        not_for: 'anyone optimising for a nine-to-five or remote, pure farmer AMs who have never grown an account, holding-company agency lifers who need process handed to them, or candidates who need equity to say yes.',
        interview_steps: [{ title: 'Screen with Tom Psaras, Chief of Staff', detail: 'Single point of contact, numbers-literate on the account P&L' }, { title: 'Founder conversations', detail: 'Hamza (CEO) and the co-founders' }, { title: 'Offer', detail: 'Feedback via Slack within one to two hours at every step' }],
        decision_days: 10,
      },
    },
    brief: {
      kicker: 'Refery · Partner brief',
      title: 'NewForm',
      subtitle: '3 × Account Manager · New York City, onsite',
      url: 'https://www.newform.com',
      confidential: CONFIDENTIAL,
      sections: [
        { id: 'company', heading: 'The company', summary: 'A bootstrapped, profitable creative-intelligence company growing several hundred percent a year, with marquee logos and a real moat.', blocks: [
          { kind: 'lede', text: 'NewForm is the creative intelligence company: a tech-enabled ad agency that produces human-made ads at scale, then runs every ad through **Framework**, its proprietary testing engine, to learn why winners win and compound that knowledge into higher ROI for clients.' },
          { kind: 'stats', items: [{ value: '$100M+', label: 'annual ad spend overseen' }, { value: '3,000+', label: 'ads shipped per month' }, { value: '$7M ARR', label: 'doubling YoY, two years running' }, { value: '$0', label: 'raised · bootstrapped and profitable' }] },
          { kind: 'bullets', items: ['**Clients** include Kalshi, ElevenLabs, Babbel, Acorns and Western Union, per NewForm’s own public posts. Marquee logos that make headlines weekly, which is a genuine part of the pitch.', '**Bootstrapped and profitable since day one.** Venture and M&A interest have come knocking. No runway questions, ever.', '**Roughly 60 people** in a new Manhattan office they are already outgrowing, onboarding new clients monthly.', '**The moat** is the hybrid model: full in-house production plus Framework, the AI-enabled performance layer. The nearest comparables are Tubescience and Narrative.'] },
        ] },
        { id: 'leadership', heading: 'Leadership', blocks: [{ kind: 'people', items: [
          { name: 'Hamza Alsamraee', role: 'Co-founder & CEO', note: 'Stanford math. Built Daily Math to 200k+ followers, wrote a viral calculus book at 16, previously co-founded Lightspeed-backed Faves.' },
          { name: 'Alec Velikanov', role: 'Co-founder & CTO', note: 'Ex-TextQL (Head of AI / COO) and AWS. Owns Framework and the engineering org.' },
          { name: 'Andrew Presser', role: 'Co-founder & COO', note: 'Ex-VC and lower-middle-market PE. Personally built NewForm’s outbound engine. Values hungry sellers who create pipeline.' },
          { name: 'Tom Psaras', role: 'Chief of Staff · runs this search', note: 'Ex-private equity and investment banking. Owns ops, HR, FP&A and special projects. Expect a sharp, numbers-literate screen on the account P&L side.' },
        ], footer: 'A founder team that hires on slope and hunger, not brand names. A candidate with a visible body of work and a growth story lands better than a polished resume with no edge.' }] },
        { id: 'bar', heading: 'The bar', blocks: [{ kind: 'bar', groups: [
          { tone: 'must', heading: 'Non-negotiable', items: ['**Client ownership, proven.** A book of accounts owned end to end, with retention and expansion numbers.', '**Sales and BD instinct.** The explicit gap in the current team. Their comp is built on it.', '**Paid social fluency.** CAC, ROAS, creative testing and media spend, credibly, with sophisticated growth teams.', '**Startup tempo.** Five days a week in NYC, and enjoys the grind.', '**4 to 8 years of experience.**'] },
          { tone: 'nice', heading: 'Explicitly not required', items: ['Agency background specifically. In-house growth, CSM or AM at adtech and martech, or client-facing roles at consumer startups all work.', 'Creative production skills. The FDC pod owns creative.', 'Brand-name pedigree. A scrappy operator with a growth story beats a polished logo collector.'] },
          { tone: 'no', heading: 'Will not clear', items: ['Anyone optimising for a nine-to-five or remote-first setup.', 'Pure farmer AMs who maintain relationships beautifully but have never grown one.', 'Holding-company agency lifers who need process handed to them.', 'Candidates who need equity to say yes. Comp at this level is cash plus bonus, full stop.'] },
        ] }] },
        { id: 'hm', heading: 'In the hiring manager’s words', blocks: [{ kind: 'cards', items: [
          { title: 'What is driving the hiring right now?', body: '“We are already looking to hire one or two, but we also just had one resign to go to Amazon. We think we could increase client count by 50% by the end of this year alone.” Read: funded, urgent headcount, not pipeline-building. First hire around Labor Day, three in seat by October.' },
          { title: 'Anything that has not worked in the past?', body: '“I can identify what’s missing: it’s just that sales aspect. We want people who are very hungry and have a sales and business development mindset to grow their accounts.” Read: the one gap he named twice is the growth instinct, so that is the screen.' },
          { title: 'How good is the money, really?', body: '“People in this role have the opportunity to essentially make in bonus their base salary. If they’re maxing out their bonus, you’re talking about 250 or north of 250,000 all in.” Read: lead with the all-in number for sales-minded candidates, and be upfront that there is no equity at this level.' },
          { title: 'What is it like day to day?', body: '“We are very much a startup environment. I’ve got a backwards hat on. Work hard but we play hard too. You will not expect a whole day to go by without hearing back from me.” Read: young, collegial, unapologetically onsite, with a 1 to 2 hour feedback loop.' },
        ] }] },
        { id: 'logistics', heading: 'Logistics', blocks: [{ kind: 'facts', rows: [
          { label: 'Location', value: 'New York City, Manhattan office. Onsite five days a week.' },
          { label: 'Seats and timing', value: 'Three Account Manager seats. First hire targeted around Labor Day, all three by October.' },
          { label: 'Compensation', value: '$130K to $175K base. Bonus tied to client ad-spend growth with potential to match the base, so a strong performer clears $250K+ all in.' },
          { label: 'Equity', value: 'None at this level. Be upfront; the cash upside is the trade.' },
          { label: 'Visa', value: 'US work authorisation required. No sponsorship.' },
          { label: 'Process', value: 'Tom runs it as the single point of contact. Feedback via Slack, typically within one to two hours, never more than a day.' },
        ] }] },
        { id: 'pools', heading: 'Where the strongest profiles come from', blocks: [{ kind: 'cards', items: [
          { title: 'Growth and creative agencies', body: 'AMs and account leads at performance shops who already run startup client books at speed.' },
          { title: 'Adtech and martech CS', body: 'CSMs and AMs in the Meta and TikTok ecosystem who own renewal and expansion revenue.' },
          { title: 'In-house growth at consumer startups', body: 'Growth and marketing managers who managed agencies from the client side and want the operator seat.' },
          { title: 'Ex-founders and early GTM', body: 'Founder-led sales or first-AM duty at a seed startup. High agency by default.' },
          { title: 'Media agency escapees', body: 'Rising stars at holding companies itching for pace and pay tied to performance. Screen hard for the self-starter gene.' },
          { title: 'NYC or NYC-bound', body: 'Onsite five days means NYC-based or genuinely committed to relocating fast.' },
        ] }] },
        { id: 'screening', heading: 'Screening guide', blocks: [{ kind: 'questions', items: [
          { question: 'Tell me about an account you grew. What was it worth when you took it over, what was it worth when you left, and what specifically did you do?', looking_for: 'Real numbers, a specific play, their fingerprints on the outcome. This is the whole role.' },
          { question: 'Walk me through how you would explain to a client why their winning ad stopped working.', looking_for: 'Fluency with creative fatigue, testing velocity, audience saturation.' },
          { question: 'Comp here is base plus a bonus tied directly to how much your clients grow their spend. No equity. How does that land?', looking_for: 'Eyes lighting up. Anyone pivoting to equity questions is likely the wrong profile.' },
          { question: 'This is five days a week in a Manhattan office, at a company growing several hundred percent a year. What draws you to that, honestly?', looking_for: 'Genuine energy for the environment, not resigned acceptance.' },
          { question: 'What is something you brought to a client before they asked for it?', looking_for: 'Proactive strategy. Reactive account service stories do not clear.' },
        ] }] },
        { id: 'blurb', heading: 'What to say to a candidate', blocks: [{ kind: 'blurb', label: 'Copy to adapt', note: 'Company name stays out until the go-sign. Adapt to the person, do not send raw.', paragraphs: [
          'A New York based creative and performance company, around 60 people, bootstrapped and profitable since day one, growing several hundred percent a year. They make ads for some of the fastest-growing consumer and AI companies in the world and pair the work with their own performance tech, so the client relationships are deep and long.',
          "They're hiring three Account Managers. You'd own the relationship for a book of these accounts end to end: leading the calls, setting the strategy, and growing the account, with a small creative pod executing underneath you so you stay out of production.",
          "They want 4 to 8 years of experience, real client ownership behind you, and a seller's instinct, because the bonus pays directly on how much your accounts grow. Base is $130k to $175k, and the bonus can realistically match the base, so strong performers clear $250k plus, all cash.",
          "New York, onsite five days, young energetic team, very fast feedback loops. It's a high-tempo environment and they're honest about that; it suits people who are hungry, not people looking for a soft landing. I can share the name once we're further along.",
        ] }] },
        { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
      ],
      signoff: SIGNOFF,
    },
  },

  // ── Augustus ───────────────────────────────────────────────────────────
  {
    key: 'augustus',
    company_id: COMPANY.augustus,
    client: {
      anon_alias: 'Series B fintech building a federally chartered US bank, New York',
      public_blurb:
        'A federally chartered US bank being built from scratch. $180M Series B at a $1bn valuation, led by Tiger Global. The people hired into New York now are the founding US team. Eight roles, all onsite in NYC.',
      convo_stage: '30-day trial since the 29 Jul intake call with Emily Gawlik (Head of People & Talent). WhatsApp group is the working channel. Fee not yet confirmed in writing: 10% shown as the platform default.',
      next_step: 'Confirm the fee in writing; send first candidates.',
    },
    jobs: [],
    jobUpdates: [
      { id: 'bc83b77a-723b-4ab8-8948-9e3b423198ed', title: 'Founding Account Manager', status: 'open' },
      { id: 'f432ef80-3224-41f0-9c94-6d0c1b7d5f1c', status: 'open' },
      { id: '56045266-1660-483e-b688-c55499dfc1a0', status: 'open', salary_min: 150000, salary_max: 200000 },
      { id: '8d4c0154-e338-411e-b27c-41fa0ac1c753', status: 'open' },
      { id: '1d7ffda7-153d-4bc0-b1ef-47ede214deb7', status: 'open', location: 'New York City', salary_min: 150000, salary_max: 250000 },
      { id: 'de566425-a8bc-4606-8ccd-6b30cf285ff1', status: 'open' },
      { id: '417050b3-8874-41a2-a553-f7f639f8575b', status: 'open' },
      { id: '59e6424c-1f7d-472d-afb3-2cda0aedcfa3', status: 'open' },
    ],
    roles: {
      'f432ef80-3224-41f0-9c94-6d0c1b7d5f1c': { priority: 'high', headline: 'US Founding Engineer', fee_percentage: 10,
        context: 'One of the first engineers on the ground in the new NYC office. A super IC in a small, elite team building the Programmable Bank: core banking systems spanning bare-metal central bank infrastructure and blockchain infrastructure. The band swings on profile and equity-versus-cash appetite: either a senior player-coach who anchors the US team, or an earlier-career engineer who is energised and rocking the office 12 hours a day. Berlin hub has 15 engineers; 5 US hires planned, this seat leads the wave.',
        hard_requirements: ['3+ years of hands-on software engineering, backend-focused', '1+ years in early-stage or small startup environments', 'Based in New York or willing to relocate; onsite every day'],
        intake_notes: ['$200K to $400K + equity; the band swings on the cash-versus-equity answer, so know it before submitting', 'Either a senior player-coach or an early-career engineer with outsized energy', 'Signals of excellence and having tried to build something since their teens are the founder pattern across every seat'],
        not_for: 'anyone who closes the laptop at 5pm sharp, waits for a spec, or wants to build another CRUD app.',
        interview_steps: [], decision_days: null },
      'bc83b77a-723b-4ab8-8948-9e3b423198ed': { priority: 'normal', headline: 'Founding Account Manager', fee_percentage: 10,
        context: 'The account management function does not exist yet; this hire builds it. Three workstreams: build account management itself, customer onboarding after signature, and customer success. Reports to the Head of Growth. A craftsman seat: excited to build the book personally for the next twelve months.',
        hard_requirements: ['Consultant, or chief of staff / founder’s associate at a fast-paced startup', 'Genuine, proven interest in GTM', 'Comfortable travelling globally: US, Europe, APAC, LatAm', 'Based in New York or willing to relocate'],
        intake_notes: ['Ten years of experience is too much: at that tenure the pattern is hiring two more people to do the actual job. Two-ish years with high agency beats a settled veteran', '$150K to $200K + variable; year-one upside largely equity-shaped'],
        not_for: 'someone who wants to orchestrate workstreams rather than own outcomes, or who struggles when the day goes sideways.',
        interview_steps: [], decision_days: null },
      '56045266-1660-483e-b688-c55499dfc1a0': { priority: 'normal', headline: 'CEO Office Associate', fee_percentage: 10,
        context: 'Works directly with the founders and leadership team on the most important topics: strategy, new opportunities, high-impact projects from idea to execution. The stated path forward is owning a P&L or product line as the company scales.',
        hard_requirements: ['2+ years in consulting, banking, or growth-stage companies', 'Bachelor’s or master’s from a top-tier university with excellent grades', 'Based in New York or willing to relocate'],
        intake_notes: ['One to three years of experience. Entry end lands near $150K; closer to three years lands near $200K, with significant equity on top'],
        not_for: 'anyone who needs a defined scope, prefers depth over breadth, or wants a 9-to-5.',
        interview_steps: [], decision_days: null },
      '8d4c0154-e338-411e-b27c-41fa0ac1c753': { priority: 'normal', headline: 'Business Operations (Graduate)', fee_percentage: 10,
        context: 'Runs one of the bank’s core operational domains day to day: customer, payment or fincrime operations. The thesis is a “dark bank” that runs mostly autonomously: run the queue by hand, learn where the process breaks, then ship the rules, flows and agents that make the work disappear.',
        hard_requirements: ['2 to 3 internships in high-growth startups, VC or consulting, and/or demonstrated initiative through side projects, student orgs, research or entrepreneurship', 'Has automated real work with AI tools: workflows actually in use, not experiments', 'Based in New York or willing to relocate'],
        intake_notes: ['Freshly out of university is fine. No need for a gilded internship record; the head-through-the-wall attitude is the filter', '$100K to $125K + equity; up to $150K for a stellar candidate'],
        not_for: 'anyone who thinks manual work is beneath them, needs a training program, or measures progress by title and headcount.',
        interview_steps: [], decision_days: null },
      '1d7ffda7-153d-4bc0-b1ef-47ede214deb7': { priority: 'normal', headline: 'Product Owner', fee_percentage: 10,
        context: 'Owns the Banking Experience domain: accounts, the API, the dashboard, IAM, and the end-to-end customer experience. Reports to the Head of Product and works closely with the CTO, with full autonomy on the team roadmap. NYC seat (the posting also allows Berlin).',
        hard_requirements: ['3+ years owning and building banking, fintech or developer-platform products end to end', 'Technical enough to spar on architecture with engineers: comfortable in API design discussions', 'Customer-facing work as part of the day to day'],
        intake_notes: ['Range flexes with seniority; the client quoted up to $250K on the call (JD posts $150K to $200K)'],
        not_for: 'anyone who needs clear scope and a settled product, or who thinks great product and fast shipping cannot coexist in a regulated environment.',
        interview_steps: [], decision_days: null },
      'de566425-a8bc-4606-8ccd-6b30cf285ff1': { priority: 'normal', headline: 'Talent Partner', fee_percentage: 10,
        context: 'Owns the pipeline that builds Augustus: every engineer, operator and leader who joins passes through this person first. Precision recruiting, then closing the best against competing offers. Reports to the Head of People & Talent.',
        hard_requirements: ['Exceptional English; German is a plus', 'A track record of sourcing and closing top talent, not just managing a process', 'Based in New York or willing to relocate'],
        intake_notes: ['Three to five years of experience is the sweet spot', '$150K to $180K + equity'],
        not_for: 'anyone who needs warm inbound to fill a pipeline, measures success in outreach volume, or sees recruiting as coordination work.',
        interview_steps: [], decision_days: null },
      '417050b3-8874-41a2-a553-f7f639f8575b': { priority: 'normal', headline: 'Operations Lead', fee_percentage: 10,
        context: 'Owns one of the bank’s core operational domains end to end, each run like a product team. Same “dark bank” thesis as the graduate seat, at the system-design level: SOPs, KPIs, tooling, automations and agents. Reports to the COO.',
        hard_requirements: ['3+ years building products or processes at a bank, fintech, payments or crypto company, or tier-1 consulting with regulated financial services exposure', 'Has shipped automations or agents running in production today', 'Based in New York or willing to relocate'],
        intake_notes: ['Room above the band for stellar people, but not a $200K ticket for someone fresh out of university', '$180K to $220K + equity'],
        not_for: 'anyone who measures impact by team size, prefers a mature playbook to a blank page, or has outgrown running the queue themselves.',
        interview_steps: [], decision_days: null },
      '59e6424c-1f7d-472d-afb3-2cda0aedcfa3': { priority: 'normal', headline: 'Partnerships Lead', fee_percentage: 10,
        context: 'The first salesperson in the New York office. An IC seat with maximum deal responsibility: discovery, qualifying, structuring commercials, closing. Customers are global financial institutions, cross-border companies, international banks and digital asset businesses. Roughly 50% travel.',
        hard_requirements: ['Extreme ambition and a track record of getting complex deals over the line', 'Outperforms in multi-stakeholder orgs with legal and compliance in the room', 'Bets on themselves: uncapped responsibility with no playbook', 'NYC onsite daily; roughly 50% travel'],
        intake_notes: ['$200K to $400K OTE + equity; comp flexes on seniority and profile', 'Senior GTM, the role behind the founder’s hiring post'],
        not_for: 'anyone whose pipeline has historically been inbound or handed to them, who wants a team to manage, or who does not want to travel and meet customers in person.',
        interview_steps: [], decision_days: null },
    },
    brief: {
      kicker: 'Refery · Partner brief',
      title: 'Augustus',
      subtitle: '8 searches · New York City, onsite',
      url: 'https://augustus.com',
      confidential: {
        heading: 'Before you read on',
        paragraphs: [
          'This brief is confidential and shared with Refery partners only. Please do not forward it, and do not share it with candidates.',
          'The company name stays with you for now. When approaching a candidate, use the anonymised blurb at the end, and do not send the JD links, since they name the company. If a candidate is excited, submit them on the search and Refery makes the warm introduction.',
        ],
      },
      sections: [
        { id: 'tldr', heading: 'In short', blocks: [
          { kind: 'lede', text: 'A federally chartered US bank being built from scratch. **$180M Series B at a $1bn valuation, led by Tiger Global.** The people hired into New York now are the founding US team of that bank.' },
          { kind: 'paragraph', tone: 'note', text: 'The engagement is live and the client reassesses after 30 days, so speed beats volume. Every US role is onsite in NYC, every day.' },
          { kind: 'roles', items: [
            { tag: 'Priority', title: 'US Founding Engineer', comp: '$200K to $400K + equity', scope: 'Engineering · NYC' },
            { title: 'Founding Account Manager', comp: '$150K to $200K + upside', scope: 'Revenue · NYC' },
            { title: 'CEO Office Associate', comp: '$150K to ~$200K + equity', scope: 'CEO Office · NYC' },
            { title: 'Business Operations (Graduate)', comp: '$100K to $125K + equity', scope: 'Operations · NYC' },
            { title: 'Product Owner', comp: '$150K to $250K', scope: 'Product · NYC' },
            { title: 'Talent Partner', comp: '$150K to $180K + equity', scope: 'CEO Office · NYC' },
            { title: 'Operations Lead', comp: '$180K to $220K + equity', scope: 'Operations · NYC' },
            { title: 'Partnerships Lead', comp: '$200K to $400K OTE + equity', scope: 'Revenue · NYC' },
          ] },
        ] },
        { id: 'company', heading: 'The company', blocks: [
          { kind: 'lede', text: 'Augustus is building the **Global Dollar Bank**: a modern, federally chartered clearing bank that gives international fintechs and banks direct access to US dollar accounts and payment rails, across Swift, ACH, SEPA and stablecoins. Their pitch: the dollar is the best product in the world, and its distribution is broken.' },
          { kind: 'bullets', items: ['Just raised a **$180M Series B at a $1bn valuation**, led by Tiger Global with Hummingbird, QED, and the founders of Nubank, Ramp, Circle and Deel. Earlier backers include Peter Thiel’s Valar Ventures and Creandum. $210M raised to date.', '**Conditional OCC approval for a US national bank charter**, one of a small group of companies to reach that status since 2010. Now preparing for bank go-live.', 'Regulated in Europe and live with euro and stablecoin clearing today. Already processing billions for market leaders like Kraken.', 'Founded in 2022 in Berlin, transitioning to an American company. Engineering hub in Berlin (15 engineers), NYC office being stood up now.', 'The CEO is a 2025 Thiel Fellow, 25 years old, set to become the youngest CEO of a federally chartered US bank in over 140 years once final approval lands.'] },
          { kind: 'callout', text: 'Almost nobody gets to build a federally chartered US bank from scratch, let alone with unicorn capital behind them. That is the pitch to your candidate.' },
        ] },
        { id: 'bar', heading: 'The bar', blocks: [
          { kind: 'paragraph', text: 'The same profile logic runs across every search. This is the filter the hiring manager described, plus the four traits Augustus itself hires against.' },
          { kind: 'bar', groups: [
            { tone: 'must', heading: 'Non-negotiable', items: ['**Signals of excellence.** Top grades, competitions won, founded something (even if it failed), fast promotions, killer references.', '**Trajectory.** Fast promotions, strong brands, and references of the “best person I have ever worked with” kind.', '**Bias to young and hungry.** They deliberately give early-career people outsized impact.', '**New York, in person.** Already there, or genuinely committed to relocating. Onsite every day.', '**The Augustus traits.** Relentless, sets their own bar, shapes the game without a playbook, reaches for systems before headcount.'] },
            { tone: 'nice', heading: 'Explicitly not required', items: ['Heavy seniority. The engineer seat can go junior or senior; the graduate seat needs no gilded internships.', 'A spotless linear resume. A failed startup reads as a positive signal.'] },
            { tone: 'no', heading: 'Will not clear', items: ['Job-hoppers: every other year for a $10K bump.', 'For the Account Manager seat: ten years of experience. Too settled, too likely to delegate.', 'Remote or hybrid seekers, or “open to discussing” relocation.'] },
          ] },
          { kind: 'callout', text: 'The founder pattern: exceptional at something young, tried to build since their teens (failed is fine), and urgency. The person who cannot wait, who moves before anyone asks. If your candidate has that hunger, send them.' },
        ] },
        { id: 'logistics', heading: 'Logistics', blocks: [{ kind: 'facts', rows: [
          { label: 'Location', value: 'New York City, onsite every day. Product Owner can also sit in Berlin.' },
          { label: 'Relocation', value: 'Support listed in every JD. Candidates elsewhere are in scope only if genuinely decided on moving.' },
          { label: 'Visa', value: 'JDs list visa support among benefits. Treat US work authorisation as the default and check with Refery before submitting a sponsorship case.' },
          { label: 'Compensation', value: 'Per role. USD base plus equity; employees are shareholders. Full medical, dental, vision and 401(k).' },
          { label: 'Reporting', value: 'Founding AM to the Head of Growth. Product Owner to the Head of Product. Operations Lead to the COO. Biz Ops (Graduate) to a domain Operations Lead. Talent Partner to the Head of People & Talent. CEO Office Associate to the founders’ office.' },
          { label: 'Channel', value: 'WhatsApp group with Emily Gawlik, Head of People & Talent. Send real candidates only, not calibration profiles.' },
        ] }] },
        { id: 'pools', heading: 'Where the strongest profiles come from', blocks: [{ kind: 'cards', items: [
          { title: 'New York first', body: 'Everything is onsite, so NYC-based candidates move fastest.' },
          { title: 'US fintech and infrastructure teams', body: 'People already inside regulated fintech, payments and banking infrastructure, especially early employees.' },
          { title: 'Founders and ex-founders', body: 'The excellence-signals profile maps onto people who have started something, including things that failed.' },
          { title: 'Consulting, banking and chief-of-staff alumni', body: 'For the CEO Office, Account Manager and Business Ops seats.' },
          { title: 'High-slope juniors', body: 'Your sharpest 1 to 3 year people are genuinely in play here, which is rare at these comp levels.' },
        ] }] },
        { id: 'screening', heading: 'Screening guide', blocks: [{ kind: 'questions', items: [
          { question: 'What is the strongest excellence signal in your background?', looking_for: 'Grades, competitions, founding something, fast promotions. A crisp answer within ten seconds.' },
          { question: 'What have you built zero-to-one, and what did you personally do versus direct?', looking_for: 'Craftsman test. Doing beats delegating in every one of these seats.' },
          { question: 'Are you in New York, or when exactly would you move?', looking_for: 'A date is an answer. “Open to discussing it” is not.' },
          { question: 'Walk me through your last few moves and why you made each.', looking_for: 'Screening out the every-other-year-for-$10K pattern.' },
          { question: 'Engineer seat: how do you weigh cash versus equity?', looking_for: 'The band swings from $200K to $400K on exactly this.' },
          { question: 'What have you automated with AI that you actually use?', looking_for: 'A hard requirement for Business Ops, a strong signal everywhere else.' },
        ] }] },
        { id: 'blurb', heading: 'What to say to a candidate', blocks: [{ kind: 'blurb', label: 'Copy to adapt', note: 'Until the client confirms open naming, describe the company exactly as written and do not send the JD links.', paragraphs: [
          'A fintech that just closed a major round from tier-one global investors to build a new, fully regulated bank for financial institutions. European-founded, engineering hub in Europe, and now standing up its New York office, which is effectively the founding US team.',
          'They are hiring their entire founding New York team, eight roles across engineering, GTM, operations, product, talent and the CEO office, from graduate seats ($100k plus equity) through a founding engineer ($200k to $400k depending on seniority and equity appetite) and senior GTM ($200k to $400k OTE). Significant equity throughout; employees are shareholders.',
          'They hire on signals of excellence rather than years: top grades, competitions won, things you have actually built, fast promotions. A failed startup counts in your favour. The founders are young and were exceptional early themselves, so early-career people get genuinely outsized impact here.',
          'New York City, in person, high tempo, genuinely zero-to-one. You would need to be in New York or truly ready to move there. I can share the name once we’re further along.',
        ] }] },
        { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
      ],
      signoff: SIGNOFF,
    },
  },

  // ── Judgment Labs ──────────────────────────────────────────────────────
  {
    key: 'judgment',
    company_id: COMPANY.judgment,
    client: {
      anon_alias: 'Series A AI agent evaluation and monitoring company, San Francisco',
      public_blurb:
        'Infrastructure for monitoring and improving AI agents in production. $30M+ raised across two rounds in five months, backed by Lightspeed, SV Angel and Valor. Five engineering and GTM seats, onsite in San Francisco.',
      convo_stage: 'Intake with Henry Xiao on 15 Jun 2026: fee agreed verbally at 14%, agreement to follow. Board re-checked 5 Sep 2026: five roles listed, all onsite SF.',
      next_step: 'Get the 14% agreement signed; re-engage Henry with new candidates.',
    },
    jobs: [],
    jobUpdates: [
      { id: 'b81bec9c-45c7-4f39-b3dc-9b37b42da857', title: 'Applied AI Engineer', status: 'open' },
      { id: '0f13d9a9-f0cb-40b4-b664-cd5973dc76a9', title: 'Backend/Infra Engineer', status: 'open', salary_min: 200000, salary_max: 300000 },
      { id: '92e41263-cb08-48a0-8a9c-48008c3ae5a5', title: 'Product Engineer, Full Stack', status: 'open', salary_min: 200000, salary_max: 300000 },
      { id: '3f7f3967-554d-44e6-b289-4cbf11eeac62', title: 'Product Engineer, Agent', status: 'open', salary_min: 200000, salary_max: 300000 },
      { id: 'e289b0cb-01fb-45c8-aa4e-b65b4b288f8c', title: 'Founding Account Executive', status: 'open' },
    ],
    roles: {
      'b81bec9c-45c7-4f39-b3dc-9b37b42da857': { priority: 'high', headline: 'Applied AI Engineer', fee_percentage: 14,
        context: 'Research engineers who build AI systems on real agent interaction data: understand how agents behave, evaluate them at scale, improve them through learning and feedback. Frontier methods in production, shipped immediately into the product.',
        hard_requirements: ['Applied ML or research engineering with real production data, not only papers', 'Strong software engineering; the research ships into the product', 'San Francisco, onsite'],
        intake_notes: ['Henry: “$200k to $300k depending on years of experience, willing to flex a bit higher for senior”', 'Strong preference for ex-founders; one ex-CTO was placed within a week', 'All roles are IC at this stage'],
        not_for: 'researchers who want to stay on a whiteboard, or anyone who needs a mature product to work on.',
        interview_steps: [], decision_days: null },
      '0f13d9a9-f0cb-40b4-b664-cd5973dc76a9': { priority: 'normal', headline: 'Backend/Infra Engineer', fee_percentage: 14,
        context: 'Owns the services and APIs that power the data layer: ingest, evaluate and serve agent telemetry at scale, hundreds of thousands of traces per second, ClickHouse tuning toward petabyte scale.',
        hard_requirements: ['6+ years building and operating high-throughput backend systems', 'Strong fundamentals in API design, data modelling and distributed systems under real load', 'Hands-on with OLAP / columnar databases (ClickHouse, Presto)', 'San Francisco, onsite'],
        intake_notes: ['$200K to $300K, flex higher for senior', 'Ex-founders preferred'],
        not_for: 'engineers who have only worked behind a platform team, or anyone looking to manage rather than build.',
        interview_steps: [], decision_days: null },
      '92e41263-cb08-48a0-8a9c-48008c3ae5a5': { priority: 'normal', headline: 'Product Engineer, Full Stack', fee_percentage: 14,
        context: 'Builds the product experiences that make the agent-learning loop legible, and the agents that run it. Owns problems end to end: talking to customers, defining what to build, building it, iterating.',
        hard_requirements: ['Full-stack product engineering with real users', 'Comfortable talking to customers and defining what to build', 'San Francisco, onsite'],
        intake_notes: ['$200K to $300K, flex higher for senior', 'High agency and ambitious bets; no specs handed down'],
        not_for: 'anyone who implements specs handed down, or who needs a designer and a PM before they start.',
        interview_steps: [], decision_days: null },
      '3f7f3967-554d-44e6-b289-4cbf11eeac62': { priority: 'normal', headline: 'Product Engineer, Agent', fee_percentage: 14,
        context: 'Shapes how the Judgment Agent runs large-scale investigations across thousands of production traces, and the verification platform: simulated environments for stateful agent evals, trajectory replay, monitors for unintended behaviour changes.',
        hard_requirements: ['Has built agent systems or evaluation tooling that shipped', 'Strong full-stack or backend engineering', 'San Francisco, onsite'],
        intake_notes: ['$200K to $300K, flex higher for senior', 'Ex-founders preferred'],
        not_for: 'prompt-only builders with nothing in production.',
        interview_steps: [], decision_days: null },
      'e289b0cb-01fb-45c8-aa4e-b65b4b288f8c': { priority: 'normal', headline: 'Founding Account Executive', fee_percentage: 14,
        context: 'Full-cycle AE who owns pipeline generation and closing, works with founders, engineers and FDEs to turn early traction into a repeatable motion, and builds the sales organisation rather than inheriting one. Competitive base, performance-based variable, meaningful equity.',
        hard_requirements: ['Creates outbound pipeline rather than relying on SDRs', 'Sells to technical buyers in a usage-based motion', 'San Francisco, five days in office'],
        intake_notes: ['They explicitly weight ownership and slope over years and title', 'Comp not posted: competitive base, variable and meaningful equity'],
        not_for: 'AEs who need an SDR team and an established playbook.',
        interview_steps: [], decision_days: null },
    },
    brief: {
      kicker: 'Refery · Partner brief',
      title: 'Judgment Labs',
      subtitle: '5 searches · San Francisco, onsite',
      url: 'https://www.judgmentlabs.ai',
      confidential: CONFIDENTIAL,
      sections: [
        { id: 'company', heading: 'The company', blocks: [
          { kind: 'lede', text: 'Judgment Labs builds **infrastructure for monitoring and improving AI agents in production**. Agents improve from experience: the tasks they attempt, the mistakes they make, the edge cases they hit. Judgment ingests everything an agent does, turns it into structured signals (failure modes, behaviours, rubrics, evals), and lets teams ship improvements validated against real production evidence.' },
          { kind: 'stats', items: [{ value: '$30M+', label: 'raised across two rounds in five months' }, { value: 'Lightspeed', label: 'with SV Angel, Valor, Nova Global and operator angels' }, { value: 'SF', label: 'onsite; a New York office is opening' }, { value: '5', label: 'seats live, four engineering and one GTM' }] },
          { kind: 'bullets', items: ['Hundreds of teams building autonomous agents rely on Judgment to understand how their systems behave post-deployment.', 'Henry Xiao runs the search and described the company as “one of the top startups”. He joined post-graduation and moves fast.', 'Strong preference for ex-founders and for people who take ambitious bets. One ex-CTO was placed within a week.'] },
        ] },
        { id: 'bar', heading: 'The bar', blocks: [{ kind: 'bar', groups: [
          { tone: 'must', heading: 'Non-negotiable', items: ['**Shipped, with real users.** Research that ships into the product, engineering that ran under load.', '**High agency.** Owns problems end to end, talks to customers, defines what to build.', '**San Francisco, onsite.**', '**US work authorisation.** H-1B transfers and OPT with 2.5+ years work; no fresh sponsorship.'] },
          { tone: 'nice', heading: 'Strong signal', items: ['Ex-founders.', 'Agent, evals or observability experience.', 'ClickHouse or OLAP depth for the infra seat.'] },
          { tone: 'no', heading: 'Will not clear', items: ['Anyone looking to manage rather than build; every seat is IC.', 'Big-company only with no startup ownership.', 'Remote.'] },
        ] }] },
        { id: 'logistics', heading: 'Logistics', blocks: [{ kind: 'facts', rows: [
          { label: 'Location', value: 'San Francisco, onsite. A New York office is opening for the first time.' },
          { label: 'Compensation', value: 'Engineering: $200K to $300K depending on experience, flex higher for senior, plus equity. Founding AE: competitive base, variable and meaningful equity.' },
          { label: 'Visa', value: 'No fresh sponsorship. H-1B transfers and OPT with 2.5+ years remaining work.' },
          { label: 'Process', value: 'Anonymised profile first, intro only on expressed interest. Henry moves quickly.' },
        ] }] },
        { id: 'blurb', heading: 'What to say to a candidate', blocks: [{ kind: 'blurb', label: 'Copy to adapt', note: 'Anonymous until Refery clears the name.', paragraphs: [
          "I'm working with a Series A company in San Francisco building the infrastructure that monitors and improves AI agents in production. $30M+ raised across two rounds in five months from a top-tier lead, hundreds of agent teams already on the platform, and a strong preference for ex-founders and people who take ambitious bets.",
          'Four engineering seats (applied AI, backend and infra, full-stack product, agent product) at $200K to $300K plus equity, and a founding Account Executive seat. Onsite in San Francisco, five days. I can share the name once we’re a step further along.',
        ] }] },
        { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'steps', items: SUBMIT_STEPS }] },
      ],
      signoff: SIGNOFF,
    },
  },

  // ── Hilbert's AI ───────────────────────────────────────────────────────
  {
    key: 'hilberts',
    company_id: COMPANY.hilberts,
    client: {
      anon_alias: 'Profitable a16z-backed AI growth company selling to the largest US retailers',
      public_blurb:
        'Growth infrastructure for the biggest retailers in the world: $28M Series A led by a16z, Walmart as flagship customer, profitable and past $10M ARR. Hiring US enterprise sellers who can close seven-figure deals with grocers, QSRs and big retail. Remote US.',
      contact_name: 'Gerard Espinet',
      contact_email: 'gerard@hilberts.ai',
      channel: 'Email with Gerard; brief issued 4 Aug 2026 after the intake call',
      convo_stage: 'Intake with Gerard on 4 Aug 2026. US field GTM is an always-on pipeline, not fixed headcount. Fee: 10% platform default shown; client agreement still to be signed (super admin only, never mention to partners).',
      next_step: 'Send calibration names to Gerard; get the agreement signed.',
    },
    jobs: [
      {
        id: JOB.hilbertGo,
        title: 'Growth Operator, Grocery / QSR / Retail',
        department: 'GTM',
        location: 'Remote US (New York, Atlanta, Chicago, LA preferred)',
        remote_policy: 'remote',
        salary_min: 190000,
        salary_max: 240000,
        experience_years_min: 5,
        experience_years_max: 10,
        visa_requirement: 'us_authorized',
        job_post_url: null,
        description:
          'The operator ready to switch sides. Ex-head of ecommerce, digital, growth or loyalty at exactly the companies Hilbert sells to: grocers, QSRs, home improvement, fashion retail. Done with corporate life, wants to prove they can close, and can pitch the problem better than any career seller because they lived it. Same terms as the enterprise seller seat: ~$240K base and ~$480K OTE at the NYC benchmark on a 50/50 split, roughly 20% lower in lower-cost hubs, variable uncapped at 5% of closed revenue. Remote US with heavy customer travel; New York, Atlanta, Chicago and LA preferred.',
        requirements: [
          'Ran ecommerce, digital, growth or loyalty inside a grocer, QSR or big retailer',
          'A live network: people at those companies who take your call this month',
          'Five to ten years of relevant operating or selling',
          'Road-warrior tempo and US work authorisation',
        ],
      },
    ],
    jobUpdates: [
      {
        id: 'f4871bea-42a6-4548-b100-c2dfe5071d42',
        title: 'Field GTM / Enterprise Sales',
        status: 'open',
        location: 'Remote US (New York, Atlanta, Chicago, LA preferred)',
        remote_policy: 'remote',
        salary_min: 190000,
        salary_max: 240000,
        experience_years_min: 5,
        experience_years_max: 10,
        description:
          'Senior enterprise AE with named, current relationships at grocers, QSRs and big retail, who can produce five real meetings in the first weeks and walk into a room with a grocer’s CEO, CTO and CMO and close a seven-figure deal. The sale is data, alignment and plumbing, not a demo. ~$240K base and ~$480K OTE at the NYC benchmark on a 50/50 split, roughly 20% lower in lower-cost hubs, variable uncapped at 5% of closed revenue. Remote US with heavy customer travel; New York, Atlanta, Chicago and LA preferred. Reports into the incoming Head of GTM for the US.',
      },
    ],
    roles: {
      'f4871bea-42a6-4548-b100-c2dfe5071d42': {
        priority: 'urgent', headline: 'Field GTM / Enterprise Sales', fee_percentage: 10,
        context:
          'An always-on pipeline, not a fixed headcount. The variable is uncapped at 5% of closed revenue, so the right person here earns more than almost any role on our board: close $20M in enterprise contracts and take home $1M in variable. Seven-to-eight figure deals have already been closed. Speed and named retail logos beat everything else. Expectation: cover your own salary within the first three months.',
        hard_requirements: [
          'Retail depth, provable by logo: “I sold to Kroger, HEB, Target” or “I ran ecommerce at a major grocer”. Generic B2B pedigree does not cut it',
          'A live network: people who take their call this month. The company has been burned by overstated rolodexes and tests this early',
          'Five to ten years of relevant selling or operating. Senior enough for C-level credibility, hungry enough to individually contribute',
          'Comfort with a technical, non-demo sale to the CEO, CTO and CMO in one room',
          'Road-warrior tempo: told at 5pm about a customer meeting tomorrow night in Las Vegas, they head to the airport',
        ],
        intake_notes: [
          'Two archetypes: the seller with a live retail book, or the operator ready to switch sides. Ex-operators and retail-practice consulting alumni are explicitly in scope; a sales title today is not required',
          'Remote-first for field sales. New York, Atlanta, Chicago and LA are the preferred hubs; great sellers elsewhere in the US will be considered',
          'NYC benchmark ~$240K base, ~$480K OTE on a 50/50 split, roughly 20% lower in lower-cost hubs. Uncapped 5% of closed revenue',
          'Reports into the incoming Head of GTM for the US. US work authorisation required',
          'Very senior door-openers with exceptional C-level retail relationships can be worth a conversation, sometimes as consulting. Flag them to Refery rather than pitching the role',
        ],
        not_for:
          'generic enterprise sellers whose retail exposure is “I have sold to everyone”, demo-led product sellers who need a playbook handed to them, networks that turn out to be ten meetings spread over a year, or seniority whose first instinct is to build a team before closing anything.',
        interview_steps: [], decision_days: null,
      },
      [JOB.hilbertGo]: {
        priority: 'urgent', headline: 'Growth Operator, Grocery / QSR / Retail', fee_percentage: 10,
        context:
          'Same terms and same pipeline as the enterprise seller seat, for the other archetype: an ex-head of ecommerce, digital, growth or loyalty at exactly the companies Hilbert sells to, done with corporate life and ready to prove they can close. Their most recent European commercial hire is the template: ran grocery and new verticals at a major food delivery platform, having been on the retailer side before. The bet is that an operator can learn to sell.',
        hard_requirements: [
          'Ran ecommerce, digital, growth or loyalty inside a grocer, QSR, home improvement, sports or fashion retailer',
          'A live network at those companies: people who take their call this month',
          'Five to ten years of relevant operating experience',
          'Wants to individually contribute and chase uncapped upside, not direct a team',
        ],
        intake_notes: [
          'Loyalty-and-personalisation operators are especially strong: they are the buyer persona and can sell it with total credibility',
          'Remote US; New York, Atlanta, Chicago and LA preferred. Heavy customer travel',
          '~$240K base, ~$480K OTE at the NYC benchmark; roughly 20% lower elsewhere. Uncapped 5% of closed revenue',
          'Consulting alumni from McKinsey, Bain or BCG retail practices who went commercial are in scope',
        ],
        not_for: 'anyone who needs a process to slot into, or whose first move would be hiring a team under them.',
        interview_steps: [], decision_days: null,
      },
    },
    brief: {
      kicker: 'Refery · Partner brief',
      title: 'Hilbert’s AI',
      subtitle: 'US Field GTM, multiple seats · Remote US',
      url: 'https://www.hilberts.ai',
      confidential: {
        heading: 'Before you read on',
        paragraphs: [
          'This brief is confidential and shared with Refery partners only. Please do not forward it, and do not share it with candidates.',
          'The company name stays with you for now. When approaching a candidate, use the anonymised positioning at the end, and do not send the job board links, since they name the company. We will message everyone on the search the moment the client clears open naming.',
        ],
      },
      sections: [
        { id: 'tldr', heading: 'In short', blocks: [
          { kind: 'lede', text: 'A profitable AI company selling growth infrastructure to the biggest retailers in the world. **$28M Series A led by a16z, Walmart as flagship customer, past $10M ARR.** They are hiring US enterprise sellers who can walk into a room with a grocer’s CEO and close seven-figure deals.' },
          { kind: 'paragraph', tone: 'note', text: 'This is an always-on pipeline, not a fixed headcount. The variable is uncapped at 5% of closed revenue, so the right person here earns more than almost any role on our board. Speed and named retail logos beat everything else.' },
          { kind: 'roles', items: [
            { tag: 'Priority', title: 'Field GTM / Enterprise Sales', scope: 'Remote US', comp: '~$240K base · ~$480K OTE · uncapped' },
            { tag: 'Priority', title: 'Growth Operator, Grocery / QSR / Retail', scope: 'Remote US', comp: 'same archetype, same terms' },
            { title: 'GTM / Enterprise Revenue Leader', scope: 'SF hybrid · secondary, flag names to Refery', secondary: true },
            { title: 'Director of Sales', scope: 'SF hybrid · secondary, flag names to Refery', secondary: true },
            { title: 'Marketing and Growth roles (6)', scope: 'SF · exceptional only', secondary: true },
            { title: 'Fintech GTM, US', scope: 'Opening soon · flag names now', secondary: true },
          ] },
        ] },
        { id: 'company', heading: 'The company', blocks: [
          { kind: 'lede', text: 'Hilbert builds the growth engine that big consumer companies wish they had internally: it cleans and structures their growth data, layers a proprietary metric system on top, and then runs AI agents that surface opportunities, take micro-actions, and continuously test across the customer lifecycle.' },
          { kind: 'stats', items: [{ value: '$28M', label: 'Series A led by a16z (April 2026), after a $17M seed also led by a16z' }, { value: 'Walmart', label: 'flagship customer, with FreshDirect, Blank Street and Levain' }, { value: '$10M+', label: 'ARR, and profitable' }, { value: '50 → 95', label: 'people today, by year end' }] },
          { kind: 'bullets', items: ['**Roughly 80 percent machine learning, 20 percent LLM.** The sale is data, alignment and plumbing, not a flashy demo. A prospect buys because someone credible explained what broken growth infrastructure is costing them.', '**Enterprise contracts run seven to eight figures** on land-and-expand; mid-market ACVs sit around $150K.', '**Profitable and past $10M ARR.** This hiring is funded by revenue, not runway, which is rare at this stage and worth saying to candidates.', '**Founded by the team that built and scaled growth at Getir.** HQ San Francisco, engineering in Istanbul, commercial hub in Barcelona. Commercial hiring is the single top priority.', 'They are beating legacy marketing clouds with billion-dollar sales orgs, while AI-native companies choose them too. Once Hilbert maps a customer’s data and deploys agents, it becomes infrastructure nobody wants to rip out.'] },
          { kind: 'callout', text: 'Category read: growth tooling is consolidating from point solutions into infrastructure, and Hilbert is the a16z bet on who owns that layer for physical retail.' },
        ] },
        { id: 'who', heading: 'Who they actually hire', blocks: [
          { kind: 'paragraph', text: 'The engineering core is the Getir network out of Istanbul. The commercial side is operators turned sellers: MBAs and ex-marketplace people, several ex-Getir, with a “Launcher” culture where one person opens an entire market. Their own hiring language: ex-founders who want to build again, operators who realised they are closers.' },
          { kind: 'cards', items: [
            { title: 'Archetype A · The seller with a live retail book', body: 'Senior enterprise AE with named, current relationships at grocers, QSRs and big retail. Can produce five real meetings in the first weeks. The relationships must be warm enough that the relationship itself opens the door.' },
            { title: 'Archetype B · The operator ready to switch sides', body: 'Ex-head of ecommerce, digital, growth or loyalty at exactly the companies Hilbert sells to. Done with corporate life, wants to prove they can close, and can pitch the problem better than any career seller because they lived it.' },
          ] },
        ] },
        { id: 'bar', heading: 'The bar', blocks: [{ kind: 'bar', groups: [
          { tone: 'must', heading: 'Non-negotiable', items: ['**Retail depth, provable by logo.** “I sold to Kroger, HEB, Target” or “I ran ecommerce at a major grocer”. Generic B2B pedigree does not cut it.', '**A live network.** People who take their call this month. The company has been burned by overstated rolodexes and tests this early.', '**Five to ten years** of relevant selling or operating. Senior enough for C-level credibility, hungry enough to individually contribute.', '**Comfort with a technical, non-demo sale.** The pitch lands in one room with the CEO, CTO and CMO.', '**Road-warrior tempo.** Told at 5pm about a customer meeting tomorrow night in Las Vegas, they head to the airport.'] },
          { tone: 'nice', heading: 'Explicitly not required', items: ['A sales title today. Ex-operators and consulting alumni (McKinsey, Bain, BCG retail practices) are explicitly in scope.', 'Bay Area location. Remote-first for field sales; New York, Atlanta, Chicago and LA are the preferred hubs.', 'SaaS or martech product background. Industry understanding beats software-sales pedigree here.'] },
          { tone: 'no', heading: 'Will not clear', items: ['Generic enterprise sellers whose retail exposure is “I have sold to everyone”.', 'Demo-led product sellers who need marketing, process and a playbook handed to them.', 'Networks that turn out to be ten meetings spread over a year.', 'Seniority that wants to direct rather than do.'] },
        ] }, { kind: 'paragraph', tone: 'note', text: 'One case-by-case exception: very senior door-openers with genuinely exceptional C-level retail relationships can be worth a conversation, sometimes structured as consulting rather than full-time. If you know one, flag them on the search rather than pitching the role directly.' }] },
        { id: 'comp', heading: 'Comp and the economics', blocks: [{ kind: 'facts', rows: [
          { label: 'Location', value: 'Remote US. NYC, Atlanta, Chicago, LA preferred. SF is HQ. Heavy customer travel.' },
          { label: 'Base / OTE', value: 'NYC benchmark ~$240K base, ~$480K OTE on a 50/50 split. Roughly 20% lower in lower-cost hubs.' },
          { label: 'Variable', value: 'Uncapped. 5% of closed revenue. Seven-to-eight figure deals have already been closed.' },
          { label: 'Reporting', value: 'Into the incoming Head of GTM for the US.' },
          { label: 'Visa', value: 'US work authorisation required.' },
          { label: 'Expectation', value: 'Cover your own salary within the first three months.' },
        ] }, { kind: 'callout', text: 'The pitch to a candidate, in one line of maths: close $20M in enterprise contracts, take home $1M in variable, uncapped. One eight-figure retailer deal can do that alone.' }] },
        { id: 'pools', heading: 'Where the strongest profiles are', blocks: [{ kind: 'cards', items: [
          { title: 'Retail-data and martech vendors selling into grocers and QSRs', body: 'Enterprise AEs and client partners at dunnhumby, 84.51°, Eagle Eye, Bloomreach, NielsenIQ, Circana, Crisp, Swiftly, and the Salesforce and Adobe retail verticals. The 84.51° client-partner bench is the purest version.' },
          { title: 'Delivery and marketplace enterprise teams', body: 'DoorDash and Instacart enterprise AEs, especially CPG and merchant-side, know exactly the buyers Hilbert needs.' },
          { title: 'Ex-operators from the buy side', body: 'Heads and directors of ecommerce, digital, growth and loyalty at grocers, QSR groups, home improvement, sports and fashion retailers. The loyalty-and-personalisation people are especially strong.' },
          { title: 'Consulting alumni with retail practices who went commercial', body: 'The dream reference profile combined consulting, retail operating experience, and large digital sales to retailers.' },
          { title: 'US-based only for now', body: 'The US is the fast market; Europe follows.' },
        ] }] },
        { id: 'screening', heading: 'Screening guide', blocks: [{ kind: 'paragraph', text: 'Five questions that separate the pool. If a candidate clears three convincingly, send them.' }, { kind: 'questions', items: [
          { question: 'Which retail organisations have you personally sold to or worked inside, and who there would take your call this month?', looking_for: 'Named logos and live relationships. Vague verticals are a no.' },
          { question: 'Walk me through a deal that required real technical alignment across data or engineering teams, where a demo alone could not sell it.', looking_for: 'Comfort with an infrastructure-first, multi-stakeholder sale.' },
          { question: 'What would your first 90 days of pipeline look like here?', looking_for: 'A concrete plan with names. The expectation is covering your own salary inside the first quarter.' },
          { question: 'Tell me about the largest contract you have closed. How was it structured?', looking_for: 'Six figures minimum, ideally seven, ideally land-and-expand.' },
          { question: 'You find out at 5pm that a target CEO can meet tomorrow evening across the country. What do you do?', looking_for: 'The only right answer involves an airport.' },
        ] }] },
        { id: 'blurb', heading: 'What to say to a candidate', blocks: [{ kind: 'blurb', label: 'Copy to adapt', note: 'Until the client clears open naming, describe the company exactly as written. Adapt to the person, do not send raw.', paragraphs: [
          'A San Francisco AI company backed by one of the top Silicon Valley funds, selling growth infrastructure to some of the largest retailers in the world. Already profitable, past eight figures in ARR, and closing seven-to-eight figure enterprise contracts.',
          'They are hiring senior enterprise sellers for the US field team. Remote, with New York, Atlanta, Chicago and LA preferred. The sale is complex and technical, pitched to CEOs, CTOs and CMOs of major retail organisations, and the mandate is to open and close, hands-on.',
          'They want one of two profiles: an enterprise seller with live relationships at grocers, QSRs and big retail, or an ex-operator from those companies (head of ecommerce, digital, growth) ready to switch sides and sell.',
          'Compensation around $200-240k base depending on location, roughly double at target on a 50/50 split, and the variable is uncapped at 5 percent of closed revenue. Seven-figure deals are already closing, so top performers can earn far past OTE.',
          'The operating tempo is real: heavy travel, high ownership, immediate-impact expectations. Built for people who want to sell large contracts and be paid accordingly, not for anyone looking for a process to slot into. I can share the name once we’re further along.',
        ] }] },
        { id: 'submit', heading: 'How to submit', blocks: [{ kind: 'paragraph', text: 'Which logos they have sold to or worked at is the line that matters. This is an always-on pipeline and the company moves fast on people who show immediate signal.' }, { kind: 'steps', items: SUBMIT_STEPS }] },
      ],
      signoff: SIGNOFF,
    },
  },
]

// ── apply ────────────────────────────────────────────────────────────────────

async function must(label, promise) {
  const { error, data } = await promise
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

for (const c of clients) {
  console.log(`\n== ${c.key} ==`)

  // client_companies row: insert for the three new clients, update the rest.
  const { data: existing } = await supabase.from('client_companies').select('company_id').eq('company_id', c.company_id).maybeSingle()
  const clientRow = { company_id: c.company_id, ...c.client }
  console.log(existing ? 'update client' : 'insert client', Object.keys(c.client).join(', '))
  if (!DRY) {
    if (existing) await must('client update', supabase.from('client_companies').update(c.client).eq('company_id', c.company_id))
    else await must('client insert', supabase.from('client_companies').insert(clientRow))
  }

  // new jobs
  for (const j of c.jobs) {
    console.log('upsert job', j.title)
    if (!DRY) {
      await must(`job ${j.title}`, supabase.from('jobs').upsert(
        { ...j, company_id: c.company_id, user_id: LILY, created_by_user_id: LILY, status: 'open', internal_deal_type: 'partnership', company_name: undefined, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      ))
    }
  }

  // job updates (titles to match the board, reopen, bands)
  for (const u of c.jobUpdates ?? []) {
    const { id, ...patch } = u
    console.log('update job', id.slice(0, 8), JSON.stringify(patch))
    if (!DRY) await must(`job update ${id}`, supabase.from('jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id))
  }

  // partner_roles
  for (const [jobId, r] of Object.entries(c.roles)) {
    console.log('upsert role', jobId.slice(0, 8), r.headline, `${r.fee_percentage}%`, r.priority)
    if (!DRY) {
      await must(`role ${jobId}`, supabase.from('partner_roles').upsert(
        {
          job_id: jobId,
          company_id: c.company_id,
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'job_id' },
      ))
    }
  }

  // company brief
  const { data: brief } = await supabase.from('partner_briefs').select('id, version').eq('company_id', c.company_id).is('job_id', null).maybeSingle()
  console.log(brief ? `replace brief v${brief.version}` : 'insert brief', `${c.brief.sections.length} sections`)
  if (!DRY) {
    const row = {
      company_id: c.company_id,
      job_id: null,
      title: `${c.brief.title} · Partner brief`,
      status: 'published',
      content: c.brief,
      published_at: new Date().toISOString(),
      created_by: LILY,
      updated_at: new Date().toISOString(),
    }
    if (brief) await must('brief update', supabase.from('partner_briefs').update({ ...row, version: (brief.version ?? 1) + 1 }).eq('id', brief.id))
    else await must('brief insert', supabase.from('partner_briefs').insert(row))
  }
}

console.log(DRY ? '\nDry run. Nothing written.' : '\nDone.')
