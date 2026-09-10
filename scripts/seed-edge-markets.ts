/**
 * EDGE Markets: company row, client record, the agreement link at
 * refery.xyz/agreement/edge-markets (10% introductions or 15% search for standard IC
 * hires, 20% minimum for leadership), and the hiring-manager brief at
 * refery.xyz/b/edge-markets-p4w7ncq.
 *
 * Written from the call with Adam Neff on 10 September 2026 (Granola
 * 4efe934c-b26a-4f90-8b10-ed7771f5385f) and public sources: edgemarkets.io,
 * the Series A release (8 June 2026), AlleyWatch, CNBC. Intro via Bartek
 * Kunowski, Adam's Tuenti colleague.
 *
 * Voice: docs/proposals/2026-09-07-onboarding/01-voice-spec.md. Short. The
 * pricing lives on the sign page, not here.
 *
 * Idempotent: finds the company by name, reuses an open agreement link that
 * already offers the plans, upserts the brief on slug and bumps its version.
 *
 *   npx tsx scripts/seed-edge-markets.ts          # apply
 *   npx tsx scripts/seed-edge-markets.ts --dry    # print the plan only
 *   npx tsx scripts/check-brief-content.ts scripts/seed-edge-markets.ts
 */

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { issueClientAgreementLink } from '../lib/agreement-links'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    }),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry')

const LILY = '864aa3a4-f9e0-49c6-a35a-7ca02ffe04a7'
const COMPANY_NAME = 'EDGE Markets'
const SLUG = 'edge-markets-p4w7ncq'
const FEE_OPTIONS = [10, 15]
const RECOMMENDED_FEE = 15
const LEADERSHIP_FEE = 20
const SHORT_SLUG = 'edge-markets'
const PAGE_NOTES = {
  from_lily:
    "Adam, I'd lean towards **15% Search** for these senior engineering hires, so we can actively approach people with the fintech background you're after. Happy to start with **10% Introductions** too.",
  leadership: 'Your VP of Engineering search: 20%.',
}

export function buildContent(agreementUrl: string) {
  return {
    kicker: 'Refery · 10 September 2026',
    title: 'EDGE Markets',
    subtitle: 'Senior software engineers, remote in Spain · Growth engineer · VP Engineering',
    url: 'https://edgemarkets.io',
    confidential: {
      heading: 'Before we start',
      paragraphs: [
        'Adam, this is how I will pitch EDGE and what I will screen for, before your JDs land. Correct me anywhere: a note under any section reaches me straight away :)',
      ],
    },
    sections: [
      {
        id: 'start',
        nav: 'How we start',
        heading: 'How we start',
        open: true,
        summary: 'Sign, connect on Slack, send the JDs. Then I go.',
        blocks: [
          {
            kind: 'steps',
            items: [
              '**Sign the agreement.** Two minutes, no account. Through your agency for now; we swap in EDGE when it pays directly.',
              '**Connect on Slack.** Type your email below and the invitation comes from Slack.',
              '**Send me the JDs.** I brief partners the same day. First profiles within days.',
            ],
          },
          { kind: 'cta', label: 'Sign the agreement', url: agreementUrl, note: 'Two options on the page; 15% Search is suggested.' },
          {
            kind: 'invite',
            prompt: 'Connect on Slack',
            placeholder: 'adam@edgemarkets.io',
            button: 'Invite me',
          },
          {
            kind: 'choice',
            key: 'candidate_delivery',
            prompt: 'Where do I send candidates?',
            options: [
              { value: 'slack', label: 'Slack' },
              { value: 'email', label: 'Email' },
              { value: 'platform', label: 'Refery platform' },
            ],
          },
        ],
      },
      {
        id: 'company',
        nav: 'Company',
        heading: 'EDGE, as I will pitch it',
        summary: 'Banking and settlement for prediction markets and gaming. $2B+ processed, live on Kalshi, $29.2M Series A led by CoinFund.',
        blocks: [
          {
            kind: 'lede',
            text: 'A Visa debit account for bettors and traders (Boost), a payment rail operators plug into (Connect), and settlement for market makers across CFTC exchanges (Pro). Real money, real time, regulated. New York, remote, revenue from day one.',
          },
          {
            kind: 'stats',
            items: [
              { value: '$2B+', label: 'Processed through Boost since March 2025' },
              { value: '$46.4M', label: 'Raised. You said 30 to 40; which do I use?' },
              { value: '4x', label: 'Headcount in a year, 50 to 100 people' },
            ],
          },
          {
            kind: 'paragraph',
            tone: 'note',
            text: 'Backers I name: CoinFund, Indicator, Mantis, StepStone, Bullpen. Nothing internal reaches a candidate before you approve it.',
          },
        ],
      },
      {
        id: 'team',
        nav: 'Team',
        heading: 'The team',
        summary: 'Seni CEO, Andy CTO and official hiring manager, you day to day.',
        blocks: [
          {
            kind: 'people',
            items: [
              { name: 'Seni Thomas', role: 'Founder and CEO', note: 'The public voice. Candidates will read the CNBC piece.' },
              { name: 'Andy Carra', role: 'CTO', note: 'Official hiring manager for engineering.' },
              { name: 'Adam Neff', role: 'Chief Product Officer', note: 'My contact. Tuenti with Bartek, then Ledge and Wendi. The Spain team sits under your agency today.' },
            ],
          },
        ],
      },
      {
        id: 'roles',
        nav: 'Roles',
        heading: 'The roles, before the JDs',
        summary: '5 to 10 senior engineers, remote Spain, offers now. Growth engineer live. VP Engineering if you hand it over.',
        blocks: [
          {
            kind: 'roles',
            items: [
              {
                tag: 'Live · offers now',
                title: 'Senior Software Engineer · 5 to 10 seats',
                scope: 'Remote, anywhere in Spain · reports to the CTO',
                points: ['Core of a regulated money product: accounts, cards, payment rails, real-time settlement.'],
                want: '**I screen for:** 6+ years, one real chapter at a fintech, neobank, payments or trading company, comfortable with money that moves in real time.',
                exclude: 'I filter out: no financial-services depth, needs an office, outside Spain.',
                comp: 'Base: from your JDs.',
              },
              {
                tag: 'Live · JD in hand',
                title: 'Growth Engineer',
                scope: 'Remote · US candidates in process, open to Europe',
                points: ['The experiments behind Boost: funnels, referral, onboarding, instrumentation.'],
                want: '**I screen for:** 4+ years full-stack with a growth remit, reads the numbers. Consumer fintech or gaming a plus.',
                comp: 'Base: from your JD.',
              },
              {
                tag: 'You have candidates · say if you want us on it',
                title: 'VP Engineering',
                scope: 'Runs the tech org · reports to the CTO',
                points: ['Scales a remote team across Spain and the US through the next twelve months of hiring.'],
                want: '**If you hand it over, I screen for:** 3+ years leading 15+ engineers, one scaling chapter at a money product, remote leadership done well.',
                secondary: true,
              },
            ],
          },
        ],
      },
      {
        id: 'bar',
        nav: 'The bar',
        heading: 'The bar',
        summary: 'Senior, fintech depth, remote in Spain. Gaming background is a bonus, not a filter.',
        blocks: [
          {
            kind: 'bar',
            groups: [
              { tone: 'must', heading: 'Non-negotiable', items: ['Payments, banking, brokerage, trading or a neobank on the CV.', '6+ years, systems owned end to end.', 'In Spain, anywhere.'] },
              { tone: 'nice', heading: 'Not required', items: ['Gaming or betting background.', 'Spanish.', 'A specific stack. Tell me yours.'] },
              { tone: 'no', heading: 'Filtered out', items: ['Fintech only as a client project.', 'Needs an office.', 'Contract-only careers.'] },
            ],
          },
        ],
      },
      {
        id: 'comp',
        nav: 'Compensation',
        heading: 'Compensation',
        summary: 'Pending your JDs.',
        blocks: [
          {
            kind: 'callout',
            text: 'Waiting on you. You asked where your pay sits against the market. Send the JDs and two current salaries, and I benchmark each seat here.',
          },
        ],
      },
      {
        id: 'logistics',
        nav: 'Logistics',
        heading: 'Logistics',
        summary: 'Remote Spain, Spanish entity, euros. Process to confirm.',
        blocks: [
          {
            kind: 'facts',
            rows: [
              { label: 'Location', value: 'Remote, anywhere in Spain. Your team is already in Galicia and the south.' },
              { label: 'Employment', value: 'Employees of the Spanish entity you are setting up. Until then, contractor through your agency; tell me which to say.' },
              { label: 'Reporting', value: 'Andy on paper, you day to day.' },
              { label: 'Process', value: 'To confirm: the steps, who sits in them, days from intro to offer.' },
            ],
          },
        ],
      },
      {
        id: 'blurb',
        nav: 'Blurb',
        heading: 'What candidates see',
        summary: 'Anonymous until your go-sign.',
        blocks: [
          {
            kind: 'blurb',
            label: 'Candidate blurb',
            note: 'Anonymous until your go-sign',
            paragraphs: [
              "I'm working with a New York fintech building the banking and settlement layer for prediction markets and regulated gaming: a debit programme that processed $2 billion in its first year, a payment rail live on the largest prediction exchange, Series A closed in June, headcount quadrupled in a year.",
              'They are hiring five to ten senior software engineers, fully remote anywhere in Spain and employed locally, with offers going out now. The filter is real financial-services depth. Base in euros at the top of the Spanish market, equity on top.',
            ],
          },
          { kind: 'paragraph', tone: 'note', text: 'Say the word and I name EDGE openly.' },
        ],
      },
      {
        id: 'confirm',
        nav: 'Questions',
        heading: 'Three quick questions',
        open: true,
        summary: 'One line each.',
        blocks: [
          {
            kind: 'checklist',
            items: [
              { ask: 'JDs and two current salaries, any format.', why: 'Unlocks the benchmark and the bands I quote.' },
              { ask: 'VP Engineering: in-house, or with us?', why: 'Decides whether it is on the desk, and at the leadership plan.' },
              { ask: 'May I name EDGE openly?' },
            ],
          },
        ],
      },
    ],
    signoff: {
      name: 'Lily',
      lines: ['Founding Partner, Refery · [lily@refery.io](mailto:lily@refery.io)', 'Anything to correct, write it under the section. It reaches me straight away.'],
      reminder: 'Confidential · prepared for EDGE Markets',
    },
  }
}

// The checker imports `content`; the URL is filled in at seed time.
export const content = buildContent('https://refery.xyz/sign/client-agreement/placeholder')

async function main() {
  // 1. Company
  let { data: company } = await db.from('companies').select('id, name').eq('name', COMPANY_NAME).maybeSingle()
  if (!company) {
    console.log('insert company', COMPANY_NAME)
    if (!DRY) {
      const { data, error } = await db
        .from('companies')
        .insert({
          name: COMPANY_NAME,
          website: 'https://edgemarkets.io',
          description:
            'Financial infrastructure for trading and gaming: EDGE Boost (Visa debit account for bettors and traders, $2B+ processed), EDGE Connect (payment rail live on Kalshi) and EDGE Pro (settlement for market makers across CFTC-regulated exchanges).',
          industry: 'Fintech',
          stage: 'Series A',
          location: 'New York, remote',
          employee_count: '50-100',
          funding_raised: '$46.4M',
          last_funding_date: '2026-06-08',
          last_funding_amount_usd: 29200000,
          last_funding_type: 'Series A',
          top_investors: 'CoinFund, Indicator Ventures, Mantis VC, StepStone Group, Bullpen Capital',
          linkedin_url: 'https://www.linkedin.com/company/edge-markets',
          source: 'intro',
          created_by_user_id: LILY,
        })
        .select('id, name')
        .single()
      if (error || !data) throw new Error(`company insert: ${error?.message}`)
      company = data
    } else {
      company = { id: 'dry-run', name: COMPANY_NAME }
    }
  } else {
    // The row that was already there came from a 2026-05 Crunchbase import
    // (San Diego, 1 to 10 people, $26M): stale on every field we quote.
    console.log('company exists, refreshing facts', company.id)
    if (!DRY) {
      const { error } = await db
        .from('companies')
        .update({
          website: 'https://edgemarkets.io',
          description:
            'Financial infrastructure for trading and gaming: EDGE Boost (Visa debit account for bettors and traders, $2B+ processed), EDGE Connect (payment rail live on Kalshi) and EDGE Pro (settlement for market makers across CFTC-regulated exchanges).',
          industry: 'Fintech',
          stage: 'series-a',
          location: 'New York, remote',
          employee_count: '51-100',
          funding_raised: '$46.4M',
          last_funding_date: '2026-06-08',
          last_funding_amount_usd: 29200000,
          last_funding_type: 'Series A',
          top_investors: 'CoinFund, Indicator Ventures, Mantis VC, StepStone Group, Bullpen Capital',
          updated_at: new Date().toISOString(),
        })
        .eq('id', company.id)
      if (error) throw new Error(`company update: ${error.message}`)
    }
  }

  // 2. Client record
  const { data: client } = await db.from('client_companies').select('company_id').eq('company_id', company.id).maybeSingle()
  if (!client) {
    console.log('insert client_companies row')
    if (!DRY) {
      const { error } = await db.from('client_companies').insert({
        company_id: company.id,
        relationship: 'client',
        contact_name: 'Adam Neff',
        channel: 'Intro from Bartek Kunowski (Tuenti colleague). Call 10 Sep 2026. Adam prefers Slack over email; Slack Connect invite via the brief.',
        convo_stage:
          'Call 10 Sep 2026: VP Engineering (they have candidates) plus 5 to 10 senior IC engineers over 12 months, remote in Spain, offers now. Growth engineer JD live. Agreement link offers 10/15/20 with 15 recommended; Adam will sign through his agency for now. JDs and salary numbers pending.',
        candidate_delivery: null,
      })
      if (error) throw new Error(`client_companies insert: ${error.message}`)
    }
  } else {
    console.log('client_companies row exists')
  }

  // 3. Agreement link with the plan choice
  let agreementUrl = 'https://refery.xyz/sign/client-agreement/placeholder'
  const { data: openLink } = await db
    .from('client_agreement_links')
    .select('id, token, fee_options, short_slug, status, expires_at')
    .eq('company_id', company.id)
    .in('status', ['sent', 'viewed'])
    .not('fee_options', 'is', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (openLink) {
    agreementUrl = openLink.short_slug ? `https://refery.xyz/agreement/${openLink.short_slug}` : `https://refery.xyz/sign/client-agreement/${openLink.token}`
    console.log('agreement link exists', agreementUrl, 'options', openLink.fee_options)
  } else if (!DRY) {
    const link = await issueClientAgreementLink(db, {
      companyId: company.id,
      companyName: company.name,
      feePercent: RECOMMENDED_FEE,
      feeOptions: FEE_OPTIONS,
      leadershipFeePercent: LEADERSHIP_FEE,
      shortSlug: SHORT_SLUG,
      pageNotes: PAGE_NOTES,
      // Adam signs through his agency for now, so the entity is his to name.
      entityEditable: true,
      recipientName: 'Adam Neff',
      recipientEmail: null,
      createdBy: LILY,
    })
    agreementUrl = link.url
    console.log('issued agreement link', link.url, 'expires', link.expiresAt)
  } else {
    console.log('would issue agreement link at', RECOMMENDED_FEE, 'with options', FEE_OPTIONS)
  }

  // 4. Brief
  const briefContent = buildContent(agreementUrl)
  const { data: existing } = await db.from('hm_briefs').select('id, version').eq('slug', SLUG).maybeSingle()
  const blocks = briefContent.sections.reduce((n, s) => n + s.blocks.length, 0)
  console.log(existing ? `update brief v${existing.version} → v${existing.version + 1}` : 'insert brief', SLUG, `${briefContent.sections.length} sections, ${blocks} blocks`)
  if (!DRY) {
    const now = new Date().toISOString()
    if (existing) {
      const { error } = await db.from('hm_briefs').update({ content: briefContent, version: existing.version + 1, status: 'published', updated_at: now }).eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db.from('hm_briefs').insert({
        company_id: company.id,
        slug: SLUG,
        title: 'EDGE Markets',
        status: 'published',
        content: briefContent,
        recipient_name: 'Adam Neff',
        ribbon_note: "Prepared for EDGE Markets by Refery · please don't forward",
        published_at: now,
        created_by: LILY,
      })
      if (error) throw new Error(error.message)
    }
  }
  console.log(DRY ? 'Dry run. Nothing written.' : `Done.\n  brief:     https://refery.xyz/b/${SLUG}\n  agreement: ${agreementUrl}\n  company:   https://refery.xyz/companies/${company.id}`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
