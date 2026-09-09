/**
 * The Hilbert's AI hiring-manager brief at refery.xyz/b/hilberts-ai-m4kq7xw,
 * for the two urgent US field seats only.
 *
 * Written from Lily's intake call with Gerard Espinet (3 Aug 2026, Granola),
 * the published partner brief, hilberts.ai, the a16z announcement (15 Apr
 * 2026), Axios and Dealroom coverage of the Series A, and Specter. Sources in
 * docs/clients/hilberts-ai-2026-09-09.md. The agreement button points at the
 * open client-agreement link issued on 9 Sep 2026 (v2.8, 10%, expires 9 Oct).
 *
 * Voice: docs/proposals/2026-09-07-onboarding/01-voice-spec.md.
 *
 *   node scripts/seed-hilberts-hm-brief.mjs          # apply
 *   node scripts/seed-hilberts-hm-brief.mjs --dry    # print the plan only
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
const COMPANY_ID = '63d57f07-4bff-4250-809a-3a7ca7b9b0b8'
const SLUG = 'hilberts-ai-m4kq7xw'
const AGREEMENT_URL = 'https://refery.xyz/sign/client-agreement/0032c42689e8ed2479b3025ad3ad1125ff65499600cf18059a12dce56ed9216e'

export const content = {
  kicker: 'Refery · 9 September 2026',
  title: "Hilbert's AI",
  subtitle: 'Field GTM / Enterprise Sales · Growth Operator, Grocery / QSR / Retail · Remote US',
  url: 'https://www.hilberts.ai',
  confidential: {
    heading: 'Before we start',
    paragraphs: [
      'Gerard, this is how I pitch Hilbert and what I screen for on the two urgent US seats, so we work from the same page. Skim the headers, open what matters, correct me anywhere: every section takes a note and it reaches me straight away :)',
      'Your part is short, four things in the list on this page. Both seats are already live with our partners.',
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
            "**Agree the terms.** 10% of first-year base, fully contingent, no retainer, one free replacement if the hire leaves within 90 days, invoiced 30 days after start. One document for every search. Anyone with signing authority at Hilbert can sign, no account needed.",
            '**Connect on Slack.** Type your email below and I invite you to a private channel with me. One thread for profiles, your yes or no, and scheduling; nothing sits in WhatsApp or an inbox.',
            '**Correct this brief.** A line under any section is plenty. Four short questions at the end.',
            '**Then the shortlist.** Partners are already sourcing against this bar. The first profiles are as much calibration as shortlist, so a yes or no on each within a day or two, with a reason, is what makes the next batch sharper.',
          ],
        },
        { kind: 'cta', label: 'Sign the client agreement', url: AGREEMENT_URL, note: 'Two minutes. Terms as above.' },
        {
          kind: 'invite',
          prompt: 'Connect on Slack: type your email and I invite you, or a teammate, to a private channel with me.',
          note: 'One address at a time. You get the invitation from Slack by email.',
          placeholder: 'you@hilberts.ai',
          button: 'Invite me to Slack',
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
        { kind: 'callout', text: 'Why speed: a seller with a live grocery book is talking to two or three companies at once. The hiring managers who land them reply almost live and get the first call booked within days. You have done 150+ US interviews yourself, so you know this better than I do.' },
      ],
    },
    {
      id: 'company',
      nav: 'Company',
      heading: 'Hilbert, as I pitch it',
      summary: 'a16z-backed growth infrastructure for the largest retailers: $28M Series A, Walmart, FreshDirect, Blank Street, Erewhon, Levain.',
      blocks: [
        {
          kind: 'lede',
          text: 'Hilbert is **the growth engine big consumer companies wish they had in-house**: it structures a retailer’s growth data, then runs AI agents that find the opportunities and act on them across acquisition, retention and monetisation. Founded by the team that built Getir’s growth function across nine countries. San Francisco, with engineering in Istanbul and the commercial hub in Barcelona.',
        },
        {
          kind: 'stats',
          items: [
            { label: 'Series A led by a16z, April 2026', value: '$28M' },
            { label: 'Named in your press: Walmart, FreshDirect, Blank Street, Levain; on your site: Erewhon', value: 'Retail' },
            { label: 'People, per Specter this month; you said 50 to 95 by year end', value: '~56' },
            { label: 'Of closed revenue, uncapped. The line that sells the seat', value: '5%' },
          ],
        },
        {
          kind: 'bullets',
          items: [
            '**The sale is data, alignment and plumbing, not a demo.** Roughly 80% machine learning, 20% LLM, in your words. A prospect buys because someone credible explained what broken growth infrastructure is costing them, in one room with the CEO, CTO and CMO.',
            '**Enterprise contracts run seven to eight figures** on land-and-expand; mid-market sits around $150K. Once Hilbert maps the data and deploys agents, it becomes infrastructure nobody wants to rip out.',
            '**Profitable and past $10M ARR, as you told me on 3 August.** Nothing public says so, so I use it only anonymised ("profitable, eight figures in ARR") until you say otherwise. Same for the $17M seed you mentioned: Specter shows a pre-seed from Asylum Ventures and ScaleX in May 2025 and the a16z round, nothing in between.',
            '**Backers I name:** Andreessen Horowitz, Asylum Ventures, ScaleX Ventures.',
          ],
        },
      ],
    },
    {
      id: 'team',
      nav: 'Team',
      heading: 'The team, as I present it',
      summary: 'Naz on growth, Ceyda on operations, Cenk and Ozgur as co-founders, you on US go-to-market. Correct me if a role is wrong.',
      blocks: [
        {
          kind: 'people',
          items: [
            { name: 'Nazli Tan', role: 'Co-founder and CEO', note: 'Built Getir’s growth function from scratch and scaled it across nine countries, per a16z.' },
            { name: 'Ceyda Erten', role: 'Co-founder and Chief Strategy Officer', note: 'The operational backbone, in a16z’s words. Ex-Getir growth.' },
            { name: 'Cenk Batman and Ozgur Akaoglu', role: 'Co-founders', note: 'Named in the Series A coverage; I say little about them until you tell me what to say.' },
            { name: 'Gerard Espinet', role: 'US go-to-market', linkedin: 'https://www.linkedin.com/in/gerardespinet/', note: 'You run the hiring for these seats. I assume both report into the incoming Head of GTM for the US and into you until then. Say if not.' },
          ],
          footer: 'Engineering is the Getir network out of Istanbul. The commercial side is operators turned sellers, with a "Launcher" culture where one person opens a market.',
        },
      ],
    },
    {
      id: 'roles',
      nav: 'Roles',
      heading: 'The two urgent seats',
      summary: 'One pipeline, two archetypes: the seller with a live retail book, and the operator ready to switch sides. Same terms.',
      blocks: [
        {
          kind: 'roles',
          items: [
            {
              tag: 'Urgent · always-on pipeline',
              title: 'Field GTM / Enterprise Sales',
              scope: 'Remote US · New York, Atlanta, Chicago, LA preferred · heavy travel',
              points: [
                'Opens and closes seven-to-eight figure contracts with grocers, QSRs and big retail, hands-on, no team underneath.',
                'Sells a technical, non-demo product to the CEO, CTO and CMO in one room.',
                'Expected to cover their own salary within the first three months.',
              ],
              want: '**I screen for:** retail depth provable by logo, a network that takes their call this month, five to ten years selling or operating, and the airport reflex.',
              exclude: 'I filter out: "I have sold to everyone" retail exposure, demo-led sellers who need a playbook, networks that are ten meetings over a year, and anyone whose first move is hiring a team.',
              comp: '~$240K base, ~$480K OTE at the NYC benchmark, roughly 20% lower elsewhere; 5% of closed revenue, uncapped',
            },
            {
              tag: 'Urgent · same terms, same pipeline',
              title: 'Growth Operator, Grocery / QSR / Retail',
              scope: 'Remote US · New York, Atlanta, Chicago, LA preferred · heavy travel',
              points: [
                'An ex-head of ecommerce, digital, growth or loyalty at exactly the companies Hilbert sells to, done with corporate life, ready to prove they can close.',
                'Pitches the problem better than any career seller because they lived it. Your European commercial hire is the template.',
                'Loyalty-and-personalisation operators are the buyer persona and the strongest version of this profile.',
              ],
              want: '**I screen for:** ran ecommerce, digital, growth or loyalty inside a grocer, QSR, home improvement, sports or fashion retailer; a live network there; five to ten years; wants to individually contribute for uncapped upside.',
              exclude: 'I filter out: anyone who needs a process to slot into, or whose first move would be a team under them. Consulting alumni from McKinsey, Bain or BCG retail practices who went commercial stay in scope.',
              comp: 'As above',
            },
          ],
        },
        { kind: 'paragraph', tone: 'note', text: 'Both seats are public on your Ashby board, so I ask every candidate whether they already applied before I introduce them. Very senior door-openers with exceptional C-level retail relationships I flag to you separately, sometimes as a consulting conversation.' },
      ],
    },
    {
      id: 'bar',
      nav: 'The bar',
      heading: 'The bar',
      summary: 'Named logos, a live network, five to ten years, a technical sale, the airport reflex.',
      blocks: [
        {
          kind: 'bar',
          groups: [
            {
              tone: 'must',
              heading: 'Non-negotiable',
              items: [
                '**Retail depth, provable by logo.** "I sold to Kroger, HEB, Target" or "I ran ecommerce at a major grocer".',
                '**A live network.** People who take their call this month. You have been burned by overstated rolodexes; I test this on the first call.',
                '**Five to ten years** of relevant selling or operating. Senior enough for C-level credibility, hungry enough to individually contribute.',
                '**Comfort with a technical, non-demo sale** to the CEO, CTO and CMO together.',
                '**Road-warrior tempo.** Told at 5pm about a customer meeting tomorrow night in Las Vegas, they head to the airport.',
              ],
            },
            {
              tone: 'nice',
              heading: 'Not required',
              items: [
                'A sales title today. Ex-operators and retail-practice consulting alumni are explicitly in scope.',
                'Bay Area location. Remote-first for field sales.',
                'SaaS or martech pedigree. Industry understanding beats software-sales background here.',
              ],
            },
            {
              tone: 'no',
              heading: 'I will filter out',
              items: [
                'Generic enterprise sellers whose retail exposure is "I have sold to everyone".',
                'Demo-led product sellers who need marketing, process and a playbook handed to them.',
                'Networks that turn out to be ten meetings spread over a year.',
                'Seniority that wants to direct rather than do.',
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
      summary: 'Remote US, dollars, 50/50 split, uncapped variable, US work authorisation. Process and reporting line still to confirm.',
      blocks: [
        {
          kind: 'facts',
          rows: [
            { label: 'Location', value: 'Remote US. New York, Atlanta, Chicago and LA preferred; SF is HQ. Heavy customer travel.' },
            { label: 'Base / OTE', value: 'NYC benchmark ~$240K base, ~$480K OTE on a 50/50 split. Roughly 20% lower in lower-cost hubs, in your words.' },
            { label: 'Variable', value: 'Uncapped, 5% of closed revenue. Seven-to-eight figure deals already closed.' },
            { label: 'Reporting', value: 'Into the incoming Head of GTM for the US, per our call. Until they start, I assume you. First question below.' },
            { label: 'Work permit', value: 'US work authorisation required. No sponsorship, unless you say otherwise.' },
            { label: 'Process', value: 'You have run 150+ US interviews yourself; the steps and who sits in them are not yet written down. Candidates ask on the first call.' },
            { label: 'Expectation', value: 'Cover your own salary within the first three months.' },
          ],
        },
        { kind: 'callout', text: 'The pitch to a candidate, in one line of maths: close $20M in enterprise contracts, take home $1M in variable, uncapped. One eight-figure retailer deal can do that alone.' },
      ],
    },
    {
      id: 'blurb',
      nav: 'Blurb',
      heading: 'What candidates see',
      summary: 'The anonymised blurb, word for word. Nothing in it identifies Hilbert.',
      blocks: [
        {
          kind: 'blurb',
          label: 'Candidate blurb',
          note: 'Anonymous until your go-sign',
          paragraphs: [
            'A San Francisco AI company backed by one of the top Silicon Valley funds, selling growth infrastructure to some of the largest retailers in the world. Already profitable, past eight figures in ARR, and closing seven-to-eight figure enterprise contracts.',
            'They are hiring senior enterprise sellers for the US field team. Remote, with New York, Atlanta, Chicago and LA preferred. The sale is complex and technical, pitched to CEOs, CTOs and CMOs of major retail organisations, and the mandate is to open and close, hands-on.',
            'They want one of two profiles: an enterprise seller with live relationships at grocers, QSRs and big retail, or an ex-operator from those companies, a head of ecommerce, digital or growth, ready to switch sides and sell.',
            'Compensation around $200K to $240K base depending on location, roughly double at target on a 50/50 split, and the variable is uncapped at 5% of closed revenue. Seven-figure deals are already closing, so top performers earn far past OTE.',
            'Heavy travel, high ownership, immediate-impact expectations. Built for people who want to sell large contracts and be paid accordingly, not for anyone looking for a process to slot into. I can share the name once we are a step further along.',
          ],
        },
        { kind: 'paragraph', tone: 'note', text: 'Say the word and I name Hilbert openly. The a16z round is public and both seats are on your Ashby board, so the anonymity buys less than it costs.' },
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
            { ask: 'Process and reporting: who interviews, in what order, and how fast from intro to offer. Has the Head of GTM for the US started?', why: 'Candidates ask on the first call, and it decides who I copy on each intro.' },
            { ask: 'May I name Hilbert openly, or keep it anonymous until you approve each intro?' },
            { ask: 'The numbers: may I quote "profitable, $10M+ ARR" and the $17M seed to candidates, or keep both anonymised?', why: 'Nothing public confirms either, so today I only use the soft version.' },
            { ask: 'Comp flex: how far below the NYC benchmark for Atlanta or Chicago, and any flex above $240K for an exceptional seller?' },
          ],
        },
      ],
    },
  ],
  signoff: {
    name: 'Lily',
    lines: ['Founding Partner, Refery · [lily@refery.io](mailto:lily@refery.io)', 'Anything to correct, write it under the section. It reaches me straight away.'],
    reminder: "Confidential · prepared for Hilbert's AI and Gerard",
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
        title: "Hilbert's AI",
        status: 'published',
        content,
        recipient_name: 'Gerard Espinet',
        ribbon_note: "Prepared for Hilbert's AI by Refery · please don't forward",
        published_at: now,
        created_by: LILY,
      })
      if (error) throw new Error(error.message)
    }
  }
  console.log(DRY ? 'Dry run. Nothing written.' : `Done. https://refery.xyz/b/${SLUG}`)
}
