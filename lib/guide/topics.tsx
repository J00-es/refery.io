import type { GuideLaunch, GuidePath, GuideSection } from '@/lib/guide/types'
import type { ReactNode } from 'react'
import { Avatar, Btn, Card, Chip, Field, Flow, Frame, H, Journey, Pill, Row, SheetMock, Stage, Tile } from '@/components/guide/mocks'

/**
 * The guide's content. Partner-facing only: nothing here describes the desk,
 * the admin pages or what Lily does behind a card. Button labels are quoted
 * exactly as they appear on the screen, in **bold**. Every person is made up:
 * Maya Okafor is the partner; Daniel Reyes, Priya Natarajan and Tomás Ferreira
 * are her candidates; clients appear as their aliases, the way a candidate
 * sees them.
 */

const MAYA = 'Maya Okafor <maya@okafor.co>'
const LILY = 'Lily Joo <lily@refery.io>'
const REFERY = 'Refery <hello@refery.io>'

// ── visuals ─────────────────────────────────────────────────────────────────

function ProposedCardMock() {
  return (
    <Frame title="refery.xyz/searches">
      <Card>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">Proposed to you</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p className="text-[15px] font-semibold text-[#161613]">Founding Account Executive</p>
          <Chip tone="warn">Urgent</Chip>
        </div>
        <p className="mt-0.5 text-[12px] text-[#6E6E68]">Series B fintech · New York · on-site · 2 of your candidates match</p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[20px] font-semibold text-[#1F3A2F]">$21,000</span>
          <span className="text-[11.5px] text-[#6E6E68]">to you on placement · 15% of $180k–220k base · you keep 70%</span>
        </div>
        <div className="mt-2">
          <Stage active={0} />
        </div>
        <p className="mt-3 text-[12px] text-[#2A2A26]">
          <span className="font-semibold">Why you: </span>your New York fintech network sits right on this one.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Btn>I’ll work this</Btn>
          <Btn kind="quiet">Not for me</Btn>
          <span className="text-[11px] text-[#9C9C95]">Proposed 2 days ago · 5 days to answer</span>
        </div>
      </Card>
    </Frame>
  )
}

function RolePageMock() {
  return (
    <Frame title="refery.xyz/searches/…/roles/…">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="value">You are working this search</Chip>
        <Chip tone="warn">Urgent</Chip>
        <Chip>New York</Chip>
        <Chip>On-site</Chip>
      </div>
      <p className="mt-2 text-[17px] font-semibold text-[#161613]">Founding Account Executive</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Btn kind="quiet">Client brief</Btn>
        <Btn kind="quiet">Ask a question</Btn>
        <Btn kind="quiet">Share with a candidate</Btn>
        <Btn>Submit a candidate</Btn>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Card>
          <p className="text-[18px] font-semibold text-[#1F3A2F]">$21,000</p>
          <p className="text-[11px] text-[#6E6E68]">to you on placement</p>
        </Card>
        <Card>
          <p className="text-[18px] font-semibold text-[#161613]">~14 days</p>
          <p className="text-[11px] text-[#6E6E68]">from first call to a decision</p>
        </Card>
        <Card>
          <Stage active={1} />
          <p className="mt-1 text-[11px] text-[#6E6E68]">still open for candidates</p>
        </Card>
      </div>
      <Card className="mt-2">
        <H sub="Hard requirements, from the JD">The bar for this seat</H>
        <ul className="mt-1.5 list-disc pl-4 text-[11.5px] text-[#2A2A26]">
          <li>Closed six-figure deals into banks or brokers, as the first or second seller</li>
          <li>In New York, or moving there</li>
        </ul>
        <p className="mt-1.5 text-[11.5px] text-[#2A2A26]">
          <span className="font-semibold">Not for: </span>enterprise sellers who have only worked with a full SDR team behind them.
        </p>
      </Card>
    </Frame>
  )
}

function OnRequestMock() {
  return (
    <Frame title="refery.xyz/searches">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[13.5px] font-semibold text-[#161613]">Senior Full-Stack Engineer</p>
            <p className="text-[11.5px] text-[#6E6E68]">🔒 healthcare marketplace, Barcelona · $8,400 to you</p>
          </div>
          <Btn kind="quiet">Request access</Btn>
        </div>
        <div className="mt-2 rounded-[10px] border border-[#E4E3DC] bg-[#FAF9F5] p-2.5">
          <p className="text-[12px] font-semibold text-[#161613]">Ask to be put on this search</p>
          <p className="text-[11px] text-[#6E6E68]">Lily reads every request the same day. A line on why you is what gets it approved.</p>
          <Field placeholder="e.g. I have three senior backend people who'd fit this one." />
          <div className="mt-2 flex gap-2">
            <Btn>Send request</Btn>
            <Btn kind="quiet">Cancel</Btn>
          </div>
        </div>
      </Card>
    </Frame>
  )
}

function CandidatesListMock() {
  return (
    <Frame title="refery.xyz/candidates">
      <div className="mb-2 flex flex-wrap gap-1">
        <Pill>Everyone 41</Pill>
        <Pill on>Needs you 2</Pill>
        <Pill>In review 3</Pill>
        <Pill>Intro sent 2</Pill>
        <Pill>Warm 4</Pill>
        <Pill>Kept for future searches 28</Pill>
      </div>
      <Card className="p-0">
        <Row initials="DR" name="Daniel Reyes" line="Senior Full-Stack Engineer · Glovo" right="Make the intro →" grade="A-" />
        <Row initials="PN" name="Priya Natarajan" line="Founding AE · Vanta" right="Read the reply →" grade="A" tone="amber" chip={<Chip tone="value">replied</Chip>} />
        <Row initials="TF" name="Tomás Ferreira" line="Staff Engineer · Ramp" right="Call booked Thu" grade="A-" tone="grey" chip={<Chip tone="value">via your link</Chip>} />
      </Card>
    </Frame>
  )
}

function ThreeFactsMock() {
  return (
    <Frame title="refery.xyz/candidates/new">
      <Card>
        <div className="flex items-center justify-between">
          <H>Three things founders ask first</H>
          <span className="text-[11px] text-[#6E6E68]">
            Match readiness <span className="font-semibold text-[#161613]">45%</span>
          </span>
        </div>
        <p className="mt-2 text-[11.5px] font-medium text-[#2A2A26]">Work authorisation in the US</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Pill on>US citizen or green card</Pill>
          <Pill>H-1B, transfer needed</Pill>
          <Pill>OPT or STEM OPT</Pill>
          <Pill>Needs new sponsorship</Pill>
          <Pill>Not US based, no US visa</Pill>
        </div>
        <p className="mt-2 text-[11.5px] font-medium text-[#2A2A26]">Where they will work</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Pill>SF Bay Area</Pill>
          <Pill on>New York</Pill>
          <Pill>Other US hub</Pill>
          <Pill>UK or Europe</Pill>
          <Pill>Elsewhere</Pill>
        </div>
        <p className="mt-2 text-[11.5px] font-medium text-[#2A2A26]">Base salary they are targeting</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Pill>Under $120k</Pill>
          <Pill>$120 to 160k</Pill>
          <Pill on>$160 to 200k</Pill>
          <Pill>$200 to 250k</Pill>
          <Pill>$250k+</Pill>
        </div>
        <p className="mt-2 text-[11.5px] font-medium text-[#2A2A26]">Have you told them you are sharing their profile?</p>
        <div className="mt-1 flex gap-1">
          <Pill on>Yes, they know</Pill>
          <Pill>Not yet</Pill>
        </div>
      </Card>
    </Frame>
  )
}

function CandidatePageMock() {
  return (
    <Frame title="refery.xyz/candidates/…">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex gap-2.5">
          <Avatar initials="DR" />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[16px] font-semibold text-[#161613]">Daniel Reyes</p>
              <Chip tone="value">A-</Chip>
            </div>
            <p className="text-[11.5px] text-[#6E6E68]">Senior Full-Stack Engineer · Glovo · 8 years · Barcelona</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Btn>Write to Daniel</Btn>
          <Btn kind="quiet">Résumé</Btn>
          <Btn kind="quiet">Edit</Btn>
        </div>
      </div>
      <Card className="mt-2.5">
        <div className="flex items-center justify-between">
          <H sub="We've asked whoever referred them for a warm introduction.">Intro asked</H>
          <Btn kind="quiet">Change ⌄</Btn>
        </div>
        <div className="mt-2">
          <Journey active={2} />
        </div>
      </Card>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px]">
        <Card>
          <H>Panel and desk</H>
          <p className="mt-1 text-[12px] text-[#2A2A26]">
            <span className="text-[18px] font-bold">A-</span> <span className="font-semibold">strong, the intro bar</span>
          </p>
          <p className="mt-1 text-[11.5px] text-[#2A2A26]">Senior full-stack, TypeScript and React with Node, spec-driven AI-assisted delivery in ecommerce.</p>
          <div className="mt-2 rounded-[10px] border border-[#1F3A2F]/30 bg-[#E7EDE9] p-2.5">
            <p className="text-[12px] font-semibold text-[#1F3A2F]">Lily asked you for a warm intro</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Btn>Send the intro</Btn>
              <Btn kind="quiet">Have Lily reach out</Btn>
              <Btn kind="quiet">I made the intro elsewhere</Btn>
            </div>
          </div>
        </Card>
        <Card>
          <H>At a glance</H>
          <dl className="mt-1.5 grid grid-cols-[70px_1fr] gap-y-1 text-[11px]">
            <dt className="text-[#9C9C95]">Email</dt>
            <dd className="text-[#1F3A2F]">daniel.reyes@…</dd>
            <dt className="text-[#9C9C95]">Work auth.</dt>
            <dd>EU citizen</dd>
            <dt className="text-[#9C9C95]">Added</dt>
            <dd>today</dd>
          </dl>
        </Card>
      </div>
    </Frame>
  )
}

function SubmitFlowMock() {
  return (
    <Flow>
      <Frame title="1 · Choose from your candidates">
        <p className="text-[11px] text-[#6E6E68]">3 submission slots left on this role.</p>
        <Card className="mt-2 p-0">
          <div className="flex items-center gap-2 border-b border-[#E9E8E1] px-2.5 py-2">
            <span className="grid h-4 w-4 place-items-center rounded border border-[#1F3A2F] bg-[#1F3A2F] text-[10px] text-white">✓</span>
            <Avatar initials="DR" />
            <span className="text-[12.5px] font-semibold">Daniel Reyes</span>
          </div>
          <div className="flex items-center gap-2 border-b border-[#E9E8E1] px-2.5 py-2 opacity-60">
            <span className="h-4 w-4 rounded border border-[#D2D1C7]" />
            <Avatar initials="PN" tone="amber" />
            <span className="text-[12.5px]">Priya Natarajan</span>
            <span className="ml-auto text-[10.5px] text-[#9C9C95]">Already yours on this role</span>
          </div>
        </Card>
        <div className="mt-2 flex justify-end">
          <Btn>Write the reasons (1)</Btn>
        </div>
      </Frame>
      <Frame title="2 · Why them?">
        <Field label="Why they fit · optional" value="Eight years full-stack, most recently at Glovo. Led the headless replacement of a legacy stack across four storefronts. Ships fast on a small team." tall />
        <div className="mt-2">
          <Field label="How do you know them? · optional" value="I managed him for two years at Glovo." />
        </div>
        <p className="mt-2 text-[11.5px] font-medium text-[#2A2A26]">Their consent</p>
        <div className="mt-1 rounded-[10px] bg-[#FAF9F5] p-2.5">
          <div className="flex flex-wrap gap-1.5">
            <Btn>Ask them in one tap</Btn>
            <Btn kind="quiet">They already said yes</Btn>
          </div>
          <p className="mt-1.5 text-[11px] text-[#6E6E68]">We email daniel.reyes@… a short note in your name. The company stays unnamed, and their tap is their consent and the start of your protection on them.</p>
        </div>
        <p className="mt-2 text-[10.5px] text-[#9C9C95]">By submitting you confirm that you can introduce this person to Refery now, and that as far as you know they have not applied to or been contacted by this company another way.</p>
        <div className="mt-2 flex justify-end">
          <Btn>Submit 1 candidate</Btn>
        </div>
      </Frame>
    </Flow>
  )
}

function ConsentPageMock() {
  return (
    <Frame title="refery.xyz/c/… (what Daniel sees, no login)" phone>
      <p className="text-[10.5px] text-[#9C9C95]">Private · for Daniel</p>
      <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#9C9C95]">A quick yes or no</p>
      <p className="mt-1 text-[16px] font-semibold leading-snug text-[#161613]">Maya Okafor would like to put you forward for a role</p>
      <p className="mt-2 text-[12px] text-[#2A2A26]">
        <span className="font-semibold">Senior Full-Stack Engineer</span> at a healthcare marketplace, Barcelona. Nothing about you is shared with the company until you say so, and the company name comes with the first conversation.
      </p>
      <div className="mt-3 flex gap-2">
        <Btn small={false}>Yes, go ahead</Btn>
        <Btn kind="quiet" small={false}>Not now</Btn>
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-[#6E6E68]">Your tap is recorded with the date so nobody can claim to represent you without your say.</p>
    </Frame>
  )
}

function PipelineMock() {
  const col = (name: string, blurb: string, cards: { n: string; l: string; b?: ReactNode }[]) => (
    <div className="min-w-[150px] flex-1">
      <p className="text-[11.5px] font-semibold text-[#161613]">
        {name} <span className="font-normal text-[#9C9C95]">{cards.length}</span>
      </p>
      <p className="text-[10px] leading-snug text-[#9C9C95]">{blurb}</p>
      <div className="mt-1.5 space-y-1.5">
        {cards.map(c => (
          <Card key={c.n} className="p-2">
            <p className="text-[11.5px] font-semibold">{c.n}</p>
            <p className="text-[10px] text-[#6E6E68]">{c.l}</p>
            {c.b && <div className="mt-1">{c.b}</div>}
          </Card>
        ))}
        {!cards.length && <p className="rounded-[10px] border border-dashed border-[#E4E3DC] p-2 text-center text-[10px] text-[#9C9C95]">Nothing here</p>}
      </div>
    </div>
  )
  return (
    <Frame title="refery.xyz/searches/pipeline">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {col('Submitted', 'With the Refery team for review.', [{ n: 'Daniel Reyes', l: 'Senior Full-Stack · healthcare marketplace', b: <Chip tone="warn">Add work authorisation</Chip> }])}
        {col('Shortlisted', 'We agree. Being packaged for the client.', [])}
        {col('Sent to client', 'In front of the hiring manager.', [{ n: 'Tomás Ferreira', l: 'Staff Engineer · Series B fintech' }])}
        {col('Interviewing', "In the company's own process.", [{ n: 'Priya Natarajan', l: 'Founding AE · Series B fintech', b: <Chip tone="value">HM: strong yes</Chip> }])}
        {col('Offer', 'An offer is on the table.', [])}
        {col('Placed', 'Hired. Your payout is on its way.', [])}
      </div>
    </Frame>
  )
}

function YourLinkMock() {
  return (
    <Frame title="refery.xyz/start">
      <Card>
        <H sub="Send it to anyone you would put your name behind. They share a CV in two minutes and land here as yours.">Your link</H>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="flex-1 rounded-[10px] border border-[#D2D1C7] bg-white px-2.5 py-1.5 font-mono text-[12px]">refery.xyz/r/maya-okafor</span>
          <Btn kind="gold">Copy link</Btn>
          <Btn kind="quiet">Copy a message</Btn>
        </div>
        <div className="mt-2 grid grid-cols-3 border-t border-[#E4E3DC] pt-2 text-center">
          <div>
            <p className="text-[16px] font-semibold">12</p>
            <p className="text-[10px] text-[#9C9C95]">opened</p>
          </div>
          <div>
            <p className="text-[16px] font-semibold">3</p>
            <p className="text-[10px] text-[#9C9C95]">came through</p>
          </div>
          <div>
            <p className="text-[16px] font-semibold text-[#8A6A1F]">1</p>
            <p className="text-[10px] text-[#9C9C95]">waiting for your yes</p>
          </div>
        </div>
      </Card>
    </Frame>
  )
}

function NeedsYouMock() {
  return (
    <Frame title="refery.xyz/searches">
      <div className="grid gap-1.5">
        <Tile>1 search is proposed to you. Confirm the ones you will work. Review</Tile>
        <Tile>Daniel Reyes is missing work authorisation. The client will ask. Add</Tile>
        <Tile tone="green">New read from the hiring manager on Priya Natarajan: strong yes. Read</Tile>
      </div>
    </Frame>
  )
}

function PrefsMock() {
  return (
    <Frame title="refery.xyz/start">
      <Card>
        <H sub="Never more than one optional email in three days.">How we reach you</H>
        <div className="mt-2 divide-y divide-[#E9E8E1]">
          {[
            ['Something needs you', 'An intro to forward, a question from a client. Same day.', true],
            ['A search suggested for you', 'When a new search matches what you told us. A few a month at most.', true],
            ['Your people moved', 'Sent to a client, interview booked, offer. As it happens.', true],
            ['Sunday recap', 'Your searches, your people, anything waiting on you.', true],
            ['Setup reminders', 'Two at most, only while a step is yours to finish.', false],
          ].map(([t, s, on]) => (
            <div key={String(t)} className="flex items-center justify-between gap-3 py-1.5">
              <div>
                <p className="text-[12px] font-semibold">{t}</p>
                <p className="text-[10.5px] text-[#6E6E68]">{s}</p>
              </div>
              <span className={`relative h-5 w-9 shrink-0 rounded-full ${on ? 'bg-[#1F3A2F]' : 'bg-[#E4E3DC]'}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${on ? 'right-0.5' : 'left-0.5'}`} />
              </span>
            </div>
          ))}
        </div>
      </Card>
    </Frame>
  )
}

function ShareSearchMock() {
  return (
    <Flow>
      <Frame title="Share with a candidate">
        <Card>
          <H sub="The company is not named; the name comes with the first conversation. Nothing from the intake call, the fee or the bar is on it.">The candidate version of this search</H>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Btn kind="gold">Copy link</Btn>
            <Btn kind="quiet">See what they see</Btn>
            <Btn kind="quiet">Open</Btn>
          </div>
          <p className="mt-2 text-[11px] text-[#6E6E68]">
            Your link carries your code, so anyone who taps “I’m interested” lands in your Candidates as yours. Opens so far: <b>7</b>.
          </p>
        </Card>
      </Frame>
      <Frame title="refery.xyz/j/… (what the candidate sees)" phone>
        <p className="text-[10.5px] text-[#9C9C95]">Shared by Maya</p>
        <Chip tone="value">Hiring now</Chip>
        <p className="mt-1.5 text-[15px] font-semibold leading-snug">Founding Account Executive</p>
        <p className="text-[11.5px] text-[#6E6E68]">Series B fintech · New York · on-site · $180k–220k base</p>
        <Card className="mt-2">
          <p className="text-[12.5px] font-semibold">Sound like you?</p>
          <p className="text-[10.5px] text-[#6E6E68]">Two minutes. Maya hears the same minute. Nothing goes to the company until you say so.</p>
          <div className="mt-1.5">
            <Btn>I’m interested</Btn>
          </div>
        </Card>
      </Frame>
    </Flow>
  )
}

function FirmMock() {
  return (
    <Frame title="refery.xyz/firm/members">
      <p className="text-[12px] text-[#2A2A26]">
        Partner Terms accepted for <b>Okafor Search Ltd</b>. Everyone below works under it.
      </p>
      <Card className="mt-2 p-0">
        <Row initials="MO" name="Maya Okafor" line="Accepted 6 Sep" right="" chip={<Chip tone="value">Firm admin</Chip>} />
        <Row initials="JB" name="Jonah Bassett" line="Accepted 8 Sep" right="" chip={<Chip>Recruiter</Chip>} tone="grey" />
        <Row initials="AK" name="Amira Khan" line="Invited · expires in 12 days" right="" chip={<Chip tone="warn">Pending</Chip>} tone="amber" />
      </Card>
      <Card className="mt-2">
        <H sub="They accept short access terms of their own, then they are in. No separate approval needed.">Invite a colleague</H>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <Field placeholder="colleague@yourfirm.com" />
          <Pill on>Recruiter</Pill>
          <Pill>Firm admin</Pill>
          <Pill>Coordinator</Pill>
        </div>
      </Card>
    </Frame>
  )
}

// ── the topics ──────────────────────────────────────────────────────────────

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'start',
    title: 'Start here',
    lede: 'Your account, what we need from you once, and how we reach you.',
    topics: [
      {
        id: 'your-account',
        title: 'What does Start show me, and what do the checks mean?',
        summary: 'Start is your first page. It shows whether your account, partner terms and searches are connected, one search suggested for you if one fits, and the settings only you can answer.',
        where: { label: 'Start', href: '/start' },
        steps: [
          { do: 'Open **Start**. The header says “you’re set up” when every check passes, or names the one thing that is not connected yet.', then: 'Account, Partner terms and Searches are the three checks. A failing one is ours to fix; you get an email when it is done.' },
          { do: 'Read the card under it. A search **Suggested for you** appears only when what you told us about your network lines up with a live search.', then: 'Nothing is expected of you until you press **I’ll work this**.' },
          { do: 'Below that: **Where your people are**, **How we reach you**, **Your link**, and two more ways to earn.' },
        ],
        rules: ['While a check is failing you can still read your searches and save people privately; introducing someone waits for the fix, and no reminder is sent to you meanwhile.', 'A plain “no search fits your network yet” is honest, not a rejection: we re-check every week against new searches.'],
        keywords: ['start page', 'setup', 'account check', 'partner terms', 'approved'],
      },
      {
        id: 'where-your-people-are',
        title: 'How do I tell Refery where my network is?',
        summary: 'A one-minute form on Start. It is how a search gets suggested to you, so the more precise it is, the better the suggestion.',
        where: { label: 'Start › Where your people are', href: '/start' },
        steps: [
          { do: 'On Start, find **Where your people are** and press **Change**.' },
          { do: 'Pick every city where the people you know are, what they do, and the company stages they have worked at. Most searches are San Francisco or New York, on-site.', then: 'At least one city and one kind of people are needed.' },
          { do: 'Say how you know them: hired or managed, worked together, friends or a community, or you recruit professionally.' },
          { do: 'Press **Confirm and find me a search**.', then: 'The matcher runs at once. One search appears above if it fits; otherwise Start says so and we re-check weekly.' },
        ],
        keywords: ['preferences', 'cities', 'functions', 'stages', 'network', 'suggest a search', 'matcher'],
      },
      {
        id: 'how-we-reach-you',
        title: 'Which emails will I get, and can I turn some off?',
        summary: 'Confirmations and decisions on your people are always sent. Everything else is a toggle on Start, and we never send more than one optional email in three days.',
        where: { label: 'Start › How we reach you', href: '/start' },
        visual: <PrefsMock />,
        steps: [
          { do: 'On Start, open **How we reach you**.' },
          { do: 'Switch each row on or off: **Something needs you**, **A search suggested for you**, **Your people moved**, **Sunday recap**, **Setup reminders**.', then: 'It saves as you go; the line under the row says “Saved”.' },
          { do: 'Add a number under **WhatsApp** if you want “something needs you” there too. Leave it empty to keep it off.' },
        ],
        rules: ['Emails to you come from lily@refery.io or hello@refery.io. Replying to any of them reaches Lily.', 'Every subject starts with “[Refery] Your name |” so a thread is findable later.'],
        keywords: ['notifications', 'whatsapp', 'toggle', 'unsubscribe', 'sunday recap', 'email settings'],
        related: ['sunday-recap'],
      },
      {
        id: 'slack',
        title: 'How do I ask Lily a quick question?',
        summary: 'Three doors, all reaching Lily: reply to any email, ask on the search page (the answer is added for everyone on it), or a private Slack room in your own workspace.',
        where: { label: 'Slack with Lily', href: '/slack' },
        steps: [
          { do: 'For a question about one search, use **Ask a question** on that search: Lily replies inside a day and you get an email when she does.' },
          { do: 'For everything else, open refery.xyz/slack, enter the email your account is under and press **Invite me to Slack**.', then: 'A Slack Connect invitation arrives; you accept it and land in a private room with Lily, inside your own Slack.' },
          { do: 'Or take fifteen minutes with her: cal.com/refery-lily/15.' },
        ],
        rules: ['Candidates always go through the platform, never through Slack or email, so ownership and grading are on the record.'],
        keywords: ['slack', 'contact', 'help', 'call', 'book', 'question'],
        related: ['ask-a-question'],
      },
    ],
  },
  {
    id: 'searches',
    title: 'Searches',
    lede: 'One search is one role at a client we are retained by, with a brief behind it and a person reading what you submit.',
    topics: [
      {
        id: 'what-is-a-search',
        title: 'What is a search, and what do the three buckets on Searches mean?',
        summary: 'Searches has three blocks: searches proposed to you, searches you are working (grouped by client), and searches open to you on request. The client name and brief unlock once you are on any search at that client.',
        where: { label: 'Searches', href: '/searches' },
        visual: <NeedsYouMock />,
        steps: [
          { do: 'The **Needs you** tiles at the top are the only things waiting on you: a proposal to answer, a work-authorisation gap, a new read from a hiring manager.' },
          { do: '**Proposed to you**: we put you on a search when your bench fits it. Say yes only where you have real supply.' },
          { do: '**Working**: the searches you said yes to, grouped by client, with **Client brief** and **Submit a candidate** on each.' },
          { do: '**Open to you, on request**: real, live searches at clients you are not on yet. The company shows as an alias until you are.' },
        ],
        rules: ['You are never shown how many other partners are on a search. The stage strip tells you what matters: whether it is still open and how far along it is.'],
        keywords: ['searches page', 'buckets', 'working', 'on request', 'needs you', 'this week'],
      },
      {
        id: 'proposed-search',
        title: 'Refery proposed a search to me. What do I do?',
        summary: 'Read the bar and the brief, then answer in one tap. It is a suggestion, not an assignment. Unanswered, it lapses after seven days and the search goes back to “on request”.',
        where: { label: 'Searches › Proposed to you', href: '/searches' },
        visual: <ProposedCardMock />,
        steps: [
          { do: 'Open the card. The line **Why you** says why we thought of you; the figure is what you earn on a placement and how it is worked out.' },
          { do: 'Press **I’ll work this** to take it.', then: 'The card reads “You are working this search” and the search moves into your Working list.' },
          { do: 'Or press **Not for me**, say why in one line, and press **Send and decline**.', then: 'It stays open to you on request. The line tells us where to look next.' },
        ],
        then: ['You also get the same proposal by email, subject “[Refery] Your name | Role at Client, worth a look?”, with an **Open the search** button.'],
        rules: ['Seven days to answer. The card shows “expires today” on the last one.'],
        emails: [
          {
            to: 'You',
            from: REFERY,
            subject: '[Refery] Maya Okafor | Founding Account Executive at a Series B fintech, worth a look?',
            body: 'A search suggested for you, Maya.\n\nFounding Account Executive at a Series B fintech, New York. $21,000 to you on a placement (15% of $180k–220k base · you keep 70%).\n\nWhy you: your New York fintech network sits right on this one.\n\nRead the brief and the hiring manager’s own words, then say in one tap whether you will work on it. It is a suggestion, not an assignment: nothing is expected until you say yes. If it is not your focus, one line on why tells us where to look next.\n\n[Open the search]',
          },
        ],
        keywords: ['proposal', 'proposed', 'confirm', 'decline', 'i will work this', 'not for me', 'expires'],
        related: ['what-is-a-search', 'role-page'],
      },
      {
        id: 'role-page',
        title: 'What is on a search page, and what do the figures mean?',
        summary: 'Everything you need before approaching anyone: the bar, the logistics, two screening questions, a blurb you can send, how they interview, and your own submissions on it.',
        where: { label: 'Searches › a search', href: '/searches' },
        visual: <RolePageMock />,
        steps: [
          { do: 'The three figures: **your payout** on placement with the formula under it, **decision days** from first call to a decision, and the **stage strip**.' },
          { do: '**The bar for this seat**: hard requirements from the JD, what the hiring manager said on the intake call, and **Not for**, the profiles that will not clear.' },
          { do: '**Two questions to ask before you submit**, each with what the client is looking for in the answer.' },
          { do: '**What to say to a candidate**: press **Copy** and adapt it. It never names the company.' },
          { do: '**How they interview**: the steps and the typical decision time. Refery relays the read after each step.' },
        ],
        rules: [
          'The stage strip: Sourcing (nobody in front of the client yet, send as soon as you have conviction), Shortlisting, Client interviewing (still open), Offer out (send only someone exceptional now), Filled (closed; anyone you submitted stays yours).',
          'The payout line reads, for example, “15% of $180k–220k base · you keep 70%”. Where a search has a fixed figure it says “Agreed for this search”.',
        ],
        keywords: ['payout', 'fee', 'decision days', 'stage strip', 'bar', 'hard requirements', 'not for', 'logistics', 'how they interview', 'what to say to a candidate'],
        related: ['submit-a-candidate', 'ask-a-question'],
      },
      {
        id: 'client-brief',
        title: 'Where is the client brief, and what can I share from it?',
        summary: 'Every client you are on has one brief shared by all its searches: who they hire, who they do not, in the hiring manager’s own words, plus a blurb that is safe to send.',
        where: { label: 'Searches › a client › Client brief', href: '/searches' },
        steps: [
          { do: 'From a search, press **Client brief**. The masthead says which of the client’s searches you are on.' },
          { do: 'Read the TL;DR, **Who clears the bar** and **Who will not clear** before you approach anyone.' },
          { do: 'Use **Copy blurb** for the version that is safe to send cold. It names nothing that identifies the company.' },
          { do: 'Before you submit, ask the one check: has the person already applied to or been contacted by this company another way? Only fresh introductions are attributable.' },
        ],
        rules: ['The company name stays with you. Do not send links that name the company. Once a candidate is in, share the founders and the brief freely.'],
        keywords: ['brief', 'client', 'blurb', 'confidential', 'copy blurb', 'who clears the bar'],
      },
      {
        id: 'request-access',
        title: 'How do I get on a search I am not on yet?',
        summary: 'Searches open to you on request show as an alias with a lock. Ask, and say what supply you have. Lily reads every request the same day.',
        where: { label: 'Searches › Open to you, on request', href: '/searches' },
        visual: <OnRequestMock />,
        steps: [
          { do: 'Press **Request access** on the search.' },
          { do: 'Write one line on why you, for example the people you have who fit, and press **Send request**.', then: 'The button reads “Access requested”.' },
        ],
        then: ['Approved: an email “You are on {client}” with **Open the client**; the name, brief and every live search there open up.', 'Not this time: an email saying so. That is about coverage, not about you; other searches stay open to you on request.'],
        keywords: ['request access', 'locked', 'on request', 'ask to be put on', 'unlock'],
      },
      {
        id: 'ask-a-question',
        title: 'How do I ask about fit, comp or process on a search?',
        summary: 'Ask on the search and the answer is added for everyone working it. Lily replies inside a day and you get an email when she does. Nobody but Refery sees who asked.',
        where: { label: 'A search › Questions and answers', href: '/searches' },
        steps: [
          { do: 'Press **Ask a question** on the search page.' },
          { do: 'Type the question (ten characters or more) and press **Send**.', then: 'It shows as “Waiting on Refery” under Questions and answers.' },
        ],
        emails: [
          {
            to: 'You',
            from: REFERY,
            subject: 'Answered: your question on Founding Account Executive at a Series B fintech',
            body: 'Your question is answered, Maya.\n\nYou asked: Would they consider someone strong on enterprise deals but light on early-stage selling?\n\nRefery: Yes, if they have closed without an SDR team behind them at least once. The founder cares about that more than logo size.\n\n[Open the search]\n\nThe answer is now on the search for every partner working it. Nobody but Refery sees who asked.',
          },
        ],
        keywords: ['question', 'q&a', 'answer', 'fit', 'comp', 'process'],
      },
      {
        id: 'share-a-search',
        title: 'Can I send a candidate the role without naming the company?',
        summary: 'Yes. Every live search has a candidate version at a short link, refery.xyz/j/…, that anyone can open without signing in. The company is not named; nothing from the intake call, the fee or the bar is on it.',
        where: { label: 'A search › Share with a candidate', href: '/searches' },
        since: '2026-09-11',
        visual: <ShareSearchMock />,
        steps: [
          { do: 'On the search, press **Share with a candidate**.' },
          { do: 'Press **Copy link** and send it however you like. **See what they see** shows you the page first.', then: 'Your copy carries your code, so anyone who taps “I’m interested” lands in your Candidates as yours.' },
          { do: 'Back on the panel you see how many times your link was opened.' },
        ],
        then: ['The person shares a CV and answers four questions in two minutes. You get one email and they appear in your Candidates, waiting for your confirmation.', 'When the search closes, the page says so and still offers the person a way to share a CV with you.'],
        rules: ['If the button reads “Candidate page: being prepared”, the candidate version is not ready yet. It appears without you doing anything.'],
        keywords: ['share', 'candidate page', 'j link', 'anonymised', 'send the role', 'jd', 'job description'],
        related: ['your-link'],
      },
    ],
  },
  {
    id: 'candidates',
    title: 'Your candidates',
    lede: 'Everyone you have introduced or who came through your link, what we did with them, and what is waiting on you.',
    topics: [
      {
        id: 'who-to-introduce',
        title: 'Who should I introduce?',
        summary: 'People you would personally vouch for, with or without a specific role in mind. We review every profile and match strong candidates across current and future searches. Quality over volume: one exceptional profile beats a batch of maybes.',
        where: { label: 'Candidates › Who to introduce', href: '/candidates' },
        rules: [
          'A strong fit: hands-on builders and sellers, usually 2 to 5 years in, individual contributors; ex-founders, founding-team members or early startup operators with zero-to-one ownership; engineering (founding, AI/ML, full-stack, backend, DevOps, forward-deployed) and GTM (founding GTM, founding AE, technical B2B or enterprise sales, account management); in the role’s city or ready to relocate, mostly San Francisco and New York, on-site.',
          'Not right now: big-company-only backgrounds with no startup experience; people who mainly want to manage; remote-only; anyone who needs new visa sponsorship. An H-1B transfer may work; OPT only with at least 2.5 years remaining.',
          'Ask them first. Nobody contacts a candidate until you say so.',
        ],
        keywords: ['fit', 'profile', 'who', 'visa', 'sponsorship', 'remote', 'ic', 'founding engineer'],
      },
      {
        id: 'add-a-cv',
        title: 'How do I add someone?',
        summary: 'A PDF CV does most of the work. We read it end to end, show you what we extracted, then ask the three things every founder asks first.',
        where: { label: 'Candidates › Add candidate', href: '/candidates/new' },
        visual: <ThreeFactsMock />,
        steps: [
          { do: 'On Candidates press **Add candidate** (or **Bulk upload** for several PDFs at once).' },
          { do: 'Drop the PDF. Check **Extracted Information**: name, email, phone, location, current role, work authorisation, LinkedIn.', then: '“Not found” means the CV did not say it; you can fill it in on the profile afterwards.' },
          { do: 'Answer **Three things founders ask first**: US work authorisation, where they will work, the base they are targeting, and whether you have told them you are sharing their profile. Skip anything you do not know.' },
          { do: 'Press **Create Candidate**.', then: 'Their page opens. The panel reads the CV within the minute and a grade appears. If the person is already on Refery you are offered their existing profile instead.' },
        ],
        then: ['A card offers **Let {first} know**: a short note in your words saying they are in and what happens next. It is a button, never automatic.', 'Two ways in: this page, or email the PDF to lily@refery.io copying candidates@refery.io and it lands in your list automatically.'],
        rules: ['Every live seat needs the work-authorisation answer before the person can be matched; “match readiness” on the form shows what is still missing.', 'An email address on the CV is what lets you write to them from Refery later.'],
        keywords: ['upload', 'cv', 'resume', 'pdf', 'bulk', 'three facts', 'work authorisation', 'told them', 'create candidate', 'email a cv'],
        related: ['write-to-candidate', 'journey-stages'],
      },
      {
        id: 'journey-stages',
        title: 'What do the stages on a candidate’s page mean?',
        summary: 'The strip at the top of every profile shows where the person is with Refery, from Uploaded to Warm. Each stage has one line under it saying what is happening and who it is waiting on.',
        where: { label: 'A candidate’s page', href: '/candidates' },
        visual: <CandidatePageMock />,
        rules: [
          'Uploaded: they’re in, we’re reading the résumé. In review: the panel has read them, waiting on Lily’s next step. Intro asked: we’ve asked you for a warm introduction. Intro sent: we’ve written to them, waiting for them to book. Call booked: a call with our talent committee is on the calendar. Warm: we’ve met them and vouch for them; we’re matching them to open roles.',
          'Closed stages: Not a fit (the reason is on the profile), Gone quiet (worth another try if you know them), and Kept for future searches (strong, nothing live fits today; you hear first when a search opens).',
          'Under the strip, **Panel and desk** shows the grade, the reasons, and a dated timeline of everything that happened. **Change** lets you move the stage yourself when you know better.',
        ],
        keywords: ['journey', 'stage', 'uploaded', 'in review', 'intro asked', 'intro sent', 'call booked', 'warm', 'bench', 'not a fit', 'grade', 'panel'],
        related: ['needs-you', 'send-the-intro'],
      },
      {
        id: 'needs-you',
        title: 'What is “Needs you” on the Candidates page?',
        summary: 'One tab that holds only the people waiting on you: an introduction to make, a reply to read, someone who came through your link to confirm, or someone who went quiet. The row says the next action.',
        where: { label: 'Candidates › Needs you', href: '/candidates?filter=needs_you' },
        visual: <CandidatesListMock />,
        rules: [
          'Row actions: **Confirm** (came through your link), **Read the reply** (they answered a message you sent), **Make the intro** (Lily asked for one), **Nudge them** (intro sent a week ago, nothing back), **Re-engage** (gone quiet).',
          'The other tabs are the same people grouped by stage: In review, Intro sent, Call booked, Warm, Kept for future searches, On hold, Not a fit. Empty tabs hide themselves.',
        ],
        keywords: ['needs you', 'next action', 'tabs', 'filter', 'make the intro', 'nudge', 'confirm'],
      },
      {
        id: 'your-link',
        title: 'What is my link, and what happens when someone uses it?',
        summary: 'refery.xyz/r/your-code. Send it to anyone you would put your name behind. They share a CV in two minutes and land in your Candidates as yours, once you confirm it was you who sent them.',
        where: { label: 'Start › Your link', href: '/start' },
        since: '2026-09-11',
        visual: <YourLinkMock />,
        steps: [
          { do: 'On Start (or **Your link** on Candidates), press **Copy link**. **Copy a message** gives you two lines to paste into a DM.' },
          { do: 'Press **Personalise** to make it your name. Old links keep working.' },
          { do: 'When someone comes through, you get one email with two buttons: **Yes, I referred {first}** or **Not from me**. The same two choices sit on their page and on their row.', then: 'Yes: they are yours; add how you know them and Lily reads them against every live search. Not from me: they never reach your list and nothing is credited.' },
        ],
        then: ['The person gets a receipt from lily@refery.io the same minute and a private link to update, pause or delete their profile.', 'Day 3 without your answer: one reminder. Day 7: Lily reads them anyway and holds the introduction open for you.', 'Someone already on Refery before your link: you are told, and it is not credited.'],
        rules: ['Two “not from me” answers in a week, or a burst of arrivals, swap your link for a fresh one automatically and you are emailed the new one. **Get a fresh link** does the same on demand.'],
        emails: [
          {
            to: 'You',
            subject: '[Refery] Maya Okafor | Tomás Ferreira came through your link',
            body: 'Hi Maya,\n\nTomás Ferreira just shared a CV through your link (refery.xyz/r/maya-okafor), from San Francisco.\n\nWas this you? One tap either way.\n\nYes, I referred Tomás: [link]\nNot from me: [link]\n\nIf yes, add a line on how you know Tomás and why, and I read them against every live search. If not, they never reach your list and nothing is credited to you.\n\nTomás’s page: refery.xyz/candidates/…\n\nBest,\nLily',
          },
          {
            to: 'The candidate',
            subject: '[Refery] Tomás Ferreira | Your profile is in',
            body: 'Hi Tomás,\n\nThanks for sharing your CV with Refery, through Maya Okafor :)\n\nMaya confirms the introduction, and I read every profile myself. You’ll hear from me within two working days, either way: a short call if a live search fits, or a note that I’m keeping you in mind.\n\nMaya and I are the only people who see your profile. Nothing about you goes to a company until you say yes to that specific role.\n\nYour private profile, to update what you’re looking for, pause, or delete: refery.xyz/me/…\n\nBest,\nLily',
          },
        ],
        keywords: ['your link', 'referral link', 'r code', 'personalise', 'not from me', 'confirm', 'copy a message', 'fresh link'],
        related: ['share-a-search', 'needs-you'],
      },
    ],
  },
  {
    id: 'submit',
    title: 'Putting someone forward',
    lede: 'From “I know someone for this” to a confirmed, timestamped submission that is yours.',
    topics: [
      {
        id: 'submit-a-candidate',
        title: 'How do I submit someone to a search?',
        summary: 'Two screens: choose from your candidates, then say why. Nothing on the second screen is required; a line on why and the four things every client asks get a candidate read faster.',
        where: { label: 'A search › Submit a candidate', href: '/searches' },
        visual: <SubmitFlowMock />,
        steps: [
          { do: 'On a search you are working, press **Submit a candidate** (or tick people under **Your matched candidates** and press **Submit … officially**).' },
          { do: 'Tick the people. The sheet says how many submission slots are left on the role. Someone new? **Add them from a PDF CV** and they appear here.', then: 'Press **Write the reasons**.' },
          { do: 'On **Why them?** write why they fit and how you know them, pick their US work authorisation, current and target base, and whether you have spoken to them about this search. Anything the record already knows is filled in.' },
          { do: 'Cover their consent: **Ask them in one tap** or **They already said yes**.' },
          { do: 'Press **Submit**.', then: '“Refery reviews next; the stage moves on this page.” A card goes to Lily the same minute.' },
        ],
        then: ['Within two working days you hear either way, with the reason.', 'The submission shows under **Your submissions** on the search and on your **Pipeline** with its stage.', 'If you were only proposed to this search, submitting confirms you on it.'],
        rules: [
          'What counts as a submission: the CV, a way to reach them, a note on why, and our confirmation with a timestamp. A name alone does not start your protection.',
          'The cap: each search has a number of slots in play at once. Withdrawn or not-moving-forward frees a slot.',
          'Already in play: if another partner submitted the same person to this client first, you are told so, without names, and can still submit them elsewhere.',
          'By submitting you confirm you can introduce this person to Refery now, and that as far as you know they have not applied to or been contacted by this company another way.',
          'The first time you submit, one screen shows the Submission Terms. Once.',
        ],
        keywords: ['submit', 'submission', 'why them', 'pitch', 'slots', 'cap', 'already in play', 'attestation', 'matched candidates', 'submission terms'],
        related: ['consent', 'pipeline'],
      },
      {
        id: 'consent',
        title: 'How does “Ask them in one tap” work, and what does the candidate see?',
        summary: 'We email the person a short note in your name, from “you via Refery”, asking whether we may put them forward. The company stays an alias. Their tap is their consent, dated, and the start of your protection on them.',
        where: { label: 'Why them? › Their consent', href: '/searches' },
        since: '2026-09-08',
        visual: <ConsentPageMock />,
        steps: [
          { do: 'On **Why them?**, press **Ask them in one tap**. It needs an email on their profile.', then: 'On submit, the note goes out as “Maya Okafor via Refery”, replies to your own address.' },
          { do: 'Or press **They already said yes** when you have their permission already.', then: 'Recorded against the submission in your name, dated now. Their own tap is the stronger record if you can get it.' },
        ],
        then: ['They tap **Yes, go ahead** or **Not now** on a private page with no login. You get an email either way, the same minute.', 'Yes moves the submission on and marks them “spoken to, interested”. Not now leaves the submission as declined by the candidate; no need to chase.'],
        emails: [
          {
            to: 'Your candidate',
            from: 'Maya Okafor via Refery <partners@refery.io>',
            subject: 'A role I would like to put you forward for',
            body: 'Hi Daniel,\n\nThere is a Senior Full-Stack Engineer role at a healthcare marketplace in Barcelona that fits what you told me.\n\nMay I share your profile with them through Refery? The company’s name is revealed when you say yes. Nothing is shared with them before then.\n\nChoose ‘yes’ or ‘not now’ here:\nrefery.xyz/c/…\n\nEither choice comes back to me.\n\nMaya',
          },
          {
            to: 'You',
            from: 'Lily at Refery <hello@refery.io>',
            subject: '[Refery] Daniel | said yes',
            body: 'Hi Maya,\n\nDaniel said yes to being put forward for Senior Full-Stack Engineer. That tap is their consent and the start of your protection on them with this client.\n\nBest,\nLily',
          },
        ],
        keywords: ['consent', 'permission', 'ask them', 'one tap', 'yes go ahead', 'not now', 'gdpr', 'said yes'],
        related: ['submit-a-candidate', 'write-to-candidate'],
      },
      {
        id: 'protection',
        title: 'Is a candidate I submitted mine, and for how long?',
        summary: 'A confirmed, timestamped submission is yours with that client, in any role, under the Submission Terms. First confirmed submission wins; our timestamps settle it.',
        where: { label: 'Partner terms', href: '/partner-terms' },
        rules: [
          'Your protection starts when we confirm and timestamp the submission, not when you save a name.',
          'It covers hires at that client in any role, on any team, for the period in the Submission Terms (24 months at the time of writing).',
          'Relationships you had before joining are yours and carved out. Tell us and we note it.',
          'Client names, roles, pay and team detail are confidential. Describe a role in general terms to a candidate; name the company only once they are in.',
        ],
        keywords: ['ownership', 'protection', '24 months', 'attribution', 'timestamp', 'first submission wins', 'confidential', 'terms'],
        related: ['submit-a-candidate'],
      },
    ],
  },
  {
    id: 'write',
    title: 'Writing to your candidate',
    lede: 'Since 11 September you can email your own candidates from their page, in your name, without leaving Refery.',
    topics: [
      {
        id: 'write-to-candidate',
        title: 'How do I email a candidate from Refery?',
        summary: 'Press **Write to {first}** on their page. Seven ready drafts, every word editable, sent as “Your name via Refery”. Replies land in your own inbox; a copy sits on their page so we both see where things stand.',
        where: { label: 'A candidate’s page › Write to …', href: '/candidates' },
        since: '2026-09-11',
        visual: (
          <SheetMock
            first="Daniel"
            moment="Received your CV"
            subject="You are on Refery, here is what happens next"
            body={'Hi Daniel,\n\nI’ve added your CV to Refery, the network I use to introduce people to early-stage teams. Nothing goes to any company until you say yes to that specific conversation, and I will only come back to you when something is worth your time.\n\nIf anything in your CV should change, reply to this email.\n\nMaya\nMaya Okafor · Okafor Search'}
            effect='On send: "told the candidate" becomes yes. Nothing else moves.'
          />
        ),
        steps: [
          { do: 'Open the person’s page and press **Write to {first}**. It needs an email on their profile.' },
          { do: 'Pick the moment at the top: **Received your CV**, **Put you forward**, **Meet Lily**, **They want to meet you**, **Not this time**, **Congratulations**, or **Blank**. Greyed ones are not possible yet; hover to see why.', then: 'The draft fills with what the record knows: the search, the alias or the company name, the booking link, dates.' },
          { do: 'Edit anything. Tick **Cc Lily** when you want her on it (it is on by default for the intro).' },
          { do: 'Press **Send**.', then: 'The line above the button says what moves. The email appears in the page’s Activity and “Where we are”.' },
          { do: 'Prefer your own mail app? **Open in Gmail instead** carries the same draft into Gmail.' },
        ],
        then: ['The candidate sees “Maya Okafor via Refery” as the sender and your address as the reply-to. Every message ends with one line saying it was sent through Refery and a link to stop.', 'A reply lands in your inbox and, when the reply also reaches Refery, on their page as a “replied” chip under Needs you.'],
        rules: [
          'One message per person per day, unless they reply. Thirty a day in total.',
          'Name the company only after the person has agreed to be put forward. Until then the draft carries the alias, and Send stops you if the name slips in.',
          'A bounced address or a person who tapped “stop” cannot be written to; the composer tells you.',
          'Save a signature once under **Profile**; it signs every message.',
        ],
        emails: [
          {
            to: 'Your candidate (what they receive)',
            from: 'Maya Okafor via Refery <partners@refery.io>',
            subject: 'You are on Refery, here is what happens next',
            body: 'Hi Daniel,\n\nI’ve added your CV to Refery, the network I use to introduce people to early-stage teams. Nothing goes to any company until you say yes to that specific conversation, and I will only come back to you when something is worth your time.\n\nIf anything in your CV should change, reply to this email.\n\nMaya\nMaya Okafor · Okafor Search\n\n--\nSent by Maya Okafor through Refery. Replies go to Maya. Prefer no email from Refery? refery.xyz/stop/…',
          },
        ],
        keywords: ['write', 'email', 'message', 'compose', 'moments', 'received your cv', 'signature', 'gmail', 'via refery', 'reply', 'stop'],
        related: ['send-the-intro', 'tell-them', 'consent'],
      },
      {
        id: 'send-the-intro',
        title: 'Lily asked me for a warm intro. What is the fastest way?',
        summary: 'One email with the two of them on it. **Send the intro** on the person’s page sends it from Refery in your name with Lily in copy and her booking link, and moves the person to Intro sent the moment it goes.',
        where: { label: 'A candidate’s page › Lily asked you for a warm intro', href: '/candidates?filter=needs_you' },
        since: '2026-09-11',
        visual: (
          <SheetMock
            first="Daniel"
            moment="Meet Lily"
            cc="Lily Joo <lily@refery.io>"
            subject="Intro: Daniel <> Lily Joo (Refery)"
            body={'Daniel, meet Lily from Refery. Lily is working on the Senior Full-Stack Engineer search.\n\nLily, meet Daniel. I’ll let you two take it from here.\n\nDaniel, the quickest way in is fifteen minutes with Lily whenever suits you: https://cal.com/refery-lily/15\n\nMaya'}
            effect="On send: Daniel moves to Intro sent, Lily gets her copy and follows up. Nothing else."
          />
        ),
        steps: [
          { do: 'You get an email “[Refery] Full name | warm intro request” saying why the person looks strong and which searches fit. The person shows under **Needs you** with “Make the intro”.' },
          { do: 'On their page, press **Send the intro**. Check the draft, press **Send**.', then: 'Lily is in copy; the person moves to **Intro sent**; Lily writes to them with a booking link and follows up from there. Nothing more for you to do.' },
          { do: 'Or press **Have Lily reach out** and she writes to them herself, saying it came from you. Or **I made the intro elsewhere** if you already sent one from your own inbox.' },
        ],
        then: ['Lily takes it from the reply: a call gets booked, a recap comes back to you, and the stage moves on the page.', 'If nothing is done, a gentle nudge comes on day 3 and day 7, in the same thread.'],
        emails: [
          {
            to: 'You',
            subject: '[Refery] Daniel Reyes | warm intro request',
            body: 'Hi Maya,\n\nThanks for sending Daniel! I went through his profile and he looks strong. What stood out is the spec-driven, AI-assisted delivery on a small team, and real full-stack range.\n\nI would like to put him forward for Senior Full-Stack Engineer at a healthcare marketplace in Barcelona.\n\nWould you mind making a warm email intro so I can set up a quick call with him? :)\n\nEverything you need for the intro:\n- Send it from Refery in one click, in your name, with me in copy: refery.xyz/candidates/…?write=intro\n- Daniel: daniel.reyes@… · LinkedIn · Daniel’s page in Refery\n- Or forward this to Daniel with me in copy, or write your own: "Daniel, meet Lily from Refery. Lily is working on the Senior Full-Stack Engineer search. Lily, meet Daniel. I’ll let you two take it from here. Daniel, the quickest way in is fifteen minutes with Lily whenever suits you: cal.com/refery-lily/15"\n- Or have me reach out, saying it came from you: refery.xyz/intro/…\n\nBest,\nLily',
          },
        ],
        keywords: ['intro', 'warm intro', 'introduction', 'send the intro', 'have lily reach out', 'meet lily', 'intro sent', 'booking link'],
        related: ['write-to-candidate', 'journey-stages'],
      },
      {
        id: 'tell-them',
        title: 'The client said interview, passed, or hired. How do I tell my candidate?',
        summary: 'Each of those emails to you has a link that opens a draft in your words: the booking link and their steps on an interview, the reason on a pass, the start date on a hire. One press, edit, send.',
        where: { label: 'Your submissions › Tell …', href: '/searches/pipeline' },
        since: '2026-09-11',
        steps: [
          { do: 'Open the link in the email (“Tell {first} from Refery…”), or press **Tell {first}** next to the submission on the search page.', then: 'The composer opens on the right moment: **They want to meet you**, **Not this time** or **Congratulations**.' },
          { do: 'Read, edit, **Send**.' },
        ],
        rules: ['On an interview, the draft carries the client’s booking link when the client gave one. When there is none, it says Lily is setting up the first call: she makes the introduction to the hiring manager, you do not have to.', 'A pass comes with the client’s reason in your words. Send it the same day; a line from you lands better than silence.'],
        keywords: ['interview', 'tell', 'not moving forward', 'passed', 'hired', 'congratulations', 'booking link', 'they want to meet you'],
        related: ['write-to-candidate', 'outcomes'],
      },
    ],
  },
  {
    id: 'pipeline',
    title: 'Pipeline and outcomes',
    lede: 'Everyone you have put forward, exactly where they are, and what you hear at each step.',
    topics: [
      {
        id: 'pipeline',
        title: 'What do the Pipeline columns mean?',
        summary: 'Six columns, one per stage of a submission. When something moves, the note that explains it moves with it. Closed ones sit under the board with their reason.',
        where: { label: 'Pipeline', href: '/searches/pipeline' },
        visual: <PipelineMock />,
        rules: [
          'Submitted: with the Refery team for review. Shortlisted: we agree, being packaged for the client. Sent to client: in front of the hiring manager. Interviewing: in the company’s own process. Offer: an offer is on the table. Placed: hired, your payout is on its way.',
          'One badge per card, in this order: the hiring manager’s read (strong no, no, yes, strong yes), then “Add work authorisation” if it is missing, then the latest note from Refery.',
          'Not moving forward always comes with a reason, on the card and in your email. Withdrawn is a submission you pulled back yourself, from the search page.',
        ],
        keywords: ['pipeline', 'columns', 'submitted', 'shortlisted', 'sent to client', 'interviewing', 'offer', 'placed', 'hm read', 'withdraw'],
        related: ['outcomes'],
      },
      {
        id: 'outcomes',
        title: 'What do I hear when a client decides, and when?',
        summary: 'The same minute a client says interview, passed or hired, you get an email with what they said. Passed always carries the reason. Interviews carry the booking link when the client gave one.',
        where: { label: 'Pipeline', href: '/searches/pipeline' },
        since: '2026-09-08',
        emails: [
          {
            to: 'You',
            from: 'Lily at Refery <hello@refery.io>',
            subject: '[Refery] Priya Natarajan | a Series B fintech wants to interview',
            body: 'Hi Maya,\n\nGood news: the client wants to interview Priya Natarajan for Founding Account Executive.\n\nTheir booking link is cal.com/…. Send it to Priya with the company name and the brief; I am on the thread if anything is needed.\n\nTell Priya from Refery, with the link and their steps already filled in: refery.xyz/candidates/…?write=interview\n\nThe search shows Interviewing from now.\n\nBest,\nLily',
          },
          {
            to: 'You',
            from: 'Lily at Refery <hello@refery.io>',
            subject: '[Refery] Tomás Ferreira | a Series B fintech passed',
            body: 'Hi Maya,\n\nThe client passed on Tomás Ferreira for Staff Engineer. Their reason: they went with someone who has run a platform team before.\n\nPlease let Tomás know today; a line from you lands better than silence. A draft in your words is ready here: refery.xyz/candidates/…?write=pass\n\nTomás stays on your bench for other searches.\n\nBest,\nLily',
          },
        ],
        rules: ['A client who parks someone (“later”) does not trigger an email; the card says “parked by them” and the nudge clock keeps running on our side.', 'Once a candidate is in the client’s process, the company name is theirs to know; share the founders and the brief freely.'],
        keywords: ['interview', 'passed', 'reason', 'decision', 'hiring manager', 'email', 'client said'],
        related: ['tell-them', 'payout'],
      },
      {
        id: 'payout',
        title: 'How much do I earn, and when is it paid?',
        summary: 'Every search shows your payout before you work it: usually 70% of the client fee, which is a percentage of first-year base or a fixed amount. The exact terms are in your Partner Terms.',
        where: { label: 'Partner terms', href: '/partner-terms' },
        rules: [
          'The figure on the search is the money: for example “$21,000 to you on placement · 15% of $180k–220k base · you keep 70%”. Where a search has a fixed payout it says “Agreed for this search”.',
          'Paid once the person has passed 90 days in the job and the client has paid us, within 14 business days of both. Nothing upfront on either side, and never a clawback.',
          'If the person leaves inside the 90 days, we run a free replacement search for the client; nothing is paid or owed on that placement.',
          'On a hire, your email carries the start date, your payout and the dates the clocks land on; the submission row shows them too.',
        ],
        emails: [
          {
            to: 'You',
            from: 'Lily at Refery <hello@refery.io>',
            subject: '[Refery] Priya Natarajan | hired at a Series B fintech',
            body: 'Hi Maya,\n\nThe client confirmed it: Priya Natarajan accepted the Founding Account Executive offer and starts on 12 October 2026.\n\nYour payout on this one is $21,000. It is paid within 14 business days after Priya completes 90 days, so by 30 January 2027, once the client has paid. If Priya leaves before 10 January 2027 we run a replacement search for the client and nothing is paid or owed on this one.\n\nA congratulations note to Priya, in your words, is ready here: refery.xyz/candidates/…?write=hired\n\nThank you. This is the whole point.\n\nBest,\nLily',
          },
        ],
        keywords: ['payout', 'paid', 'money', 'fee', '70%', '90 days', 'guarantee', 'replacement', 'invoice', 'earn'],
        related: ['role-page', 'earn-more'],
      },
      {
        id: 'sunday-recap',
        title: 'What is the Sunday recap?',
        summary: 'One email a week while you are on at least one search: what moved, what needs you, your searches with their stage, and your link’s numbers. Only about your own work, and only if there is something to say.',
        where: { label: 'Start › How we reach you', href: '/start' },
        emails: [
          {
            to: 'You',
            from: REFERY,
            subject: 'Your week on Refery: 2 of your candidates moved',
            body: 'Your week on Refery, Maya.\n\nWhat moved\nPriya Natarajan is interviewing at a Series B fintech. HM read: strong yes.\nTomás Ferreira is not moving forward at a Series B fintech. Reason: they went with someone who has run a platform team before.\n\nNeeds you\nDaniel Reyes is waiting on a warm introduction from you.\n\nYour searches\nFounding Account Executive · Series B fintech · Client interviewing\n\nYour link\nOpened 12 times this week. 3 people came through, 2 confirmed by you, 1 still waiting for your yes.\n\n[Open your searches]  [Reply to Lily]',
          },
        ],
        keywords: ['sunday', 'recap', 'digest', 'weekly', 'what moved'],
        related: ['how-we-reach-you'],
      },
    ],
  },
  {
    id: 'firm',
    title: 'Working as a firm',
    lede: 'One signature for the company, colleagues on short access terms, and the firm gets paid.',
    topics: [
      {
        id: 'firm-account',
        title: 'How does a firm account work?',
        summary: 'One authorised person signs for the firm, colleagues accept short access terms covering their own use, and the firm holds the submissions and gets paid. You do not have to be the boss to set it up.',
        where: { label: 'Firm', href: '/firm' },
        since: '2026-09-06',
        visual: <FirmMock />,
        steps: [
          { do: 'Open **Firm** (or **Work as a firm** on Profile). Add the firm’s name, the registered legal entity and where it is registered.' },
          { do: 'If you can sign for the company, accept the terms. If not, name the person who can; we email them and they sign without needing an account.' },
          { do: 'Every firm is looked at by hand, usually the same day. You are emailed when it is done.' },
          { do: 'Press **Invite a colleague**, add their email and pick a role: **Recruiter** (sees and submits across the firm), **Firm admin** (also invites and removes), **Coordinator** (only the candidates assigned to them, cannot submit).', then: 'They accept short access terms of their own and they are in. No separate approval.' },
        ],
        rules: ['The firm is paid, always. How that is split internally is between the firm and its people.', 'Existing client relationships stay yours: declare them and they are excluded.', 'When someone leaves, a firm admin removes them and their access ends at once; the firm keeps every submission and every claim.'],
        keywords: ['firm', 'team', 'colleagues', 'invite', 'roles', 'coordinator', 'sign', 'legal entity'],
      },
    ],
  },
  {
    id: 'earn',
    title: 'Earning more',
    lede: 'Two more ways to earn, both on top of what you earn on a placement, and neither needs a search to be open.',
    topics: [
      {
        id: 'earn-more',
        title: 'Can I earn from introducing a company or another recruiter?',
        summary: 'Yes, both. Introduce a founder who is hiring and earn 10% of the fee on every hire there for 24 months from the introduction. Bring in a recruiter or scout and earn $1,000 a hire they close that lasts 90 days, up to $20,000 per person you introduce.',
        where: { label: 'Start › Two more ways to earn', href: '/start' },
        steps: [
          { do: 'On Start, under **Two more ways to earn**, press **Write the intro** on either row.', then: 'A pre-filled email opens with hello@refery.io in copy, so the introduction is on the record.' },
          { do: 'Send it. First confirmed introduction wins; our timestamps settle it.' },
        ],
        rules: ['The recruiter bonus counts once they have made a real submission within 30 days of joining.', 'Bonuses stack with your own placement payout when you also sourced the person hired.', 'The full clause is section 9 of your Partner Terms.'],
        keywords: ['referral bonus', 'introduce a company', 'bring a partner', '10%', '$1,000', 'earn more', 'founder'],
        related: ['payout'],
      },
    ],
  },
  {
    id: 'rules',
    title: 'The rules that protect you',
    lede: 'Short, and the same on every search.',
    topics: [
      {
        id: 'confidentiality',
        title: 'What can I tell a candidate about a client, and when?',
        summary: 'Describe the role in general terms (“a Series B fintech in New York”) and use the candidate version of the search or the blurb. Name the company only once the person is in and has agreed to be put forward.',
        rules: [
          'Never send a link that names the company, the intake notes, the fee or the bar. The candidate page (**Share with a candidate**) is the safe thing to send.',
          'Once a candidate has said yes and is with the client, share the founders and the brief freely.',
          'Everything inside Refery is confidential: company names, roles, hiring managers, pay and team detail. Many clients are in stealth.',
        ],
        keywords: ['confidential', 'company name', 'stealth', 'what can i say', 'blurb', 'nda'],
        related: ['share-a-search', 'client-brief'],
      },
      {
        id: 'response-times',
        title: 'How fast does Refery come back to me?',
        summary: 'Two working days on a submission, either way, with the reason. Inside a day on a question. The same day on a request for access. The same minute on a client decision.',
        rules: ['If a search is not for you, one line on why is all we ask; it tells us where to look next.', 'Nothing here needs a minimum volume, hours or exclusivity. Introduce someone when someone comes to mind.'],
        keywords: ['response time', 'how long', 'two working days', 'sla', 'feedback'],
      },
    ],
  },
]

export const GUIDE_PATHS: GuidePath[] = [
  { title: 'New here: your first week', topicIds: ['your-account', 'where-your-people-are', 'who-to-introduce', 'add-a-cv', 'submit-a-candidate'] },
  { title: 'I have someone ready', topicIds: ['add-a-cv', 'role-page', 'submit-a-candidate', 'consent', 'write-to-candidate'] },
  { title: 'Something moved. What now?', topicIds: ['needs-you', 'send-the-intro', 'pipeline', 'tell-them', 'payout'] },
]

export const GUIDE_LAUNCHES: GuideLaunch[] = [
  { date: '2026-09-11', title: 'Write to a candidate', text: 'Email your own candidates from their page, in your name, with seven ready drafts. Replies come back to your inbox and their page.', topicId: 'write-to-candidate' },
  { date: '2026-09-11', title: 'Send the intro', text: 'The warm intro Lily asks for, sent from the page with her in copy and her booking link. The person moves to Intro sent by itself.', topicId: 'send-the-intro' },
  { date: '2026-09-11', title: 'Your link', text: 'refery.xyz/r/your-code. Anyone who shares a CV through it lands in your Candidates as yours, once you confirm.', topicId: 'your-link' },
  { date: '2026-09-11', title: 'Share a search with a candidate', text: 'A candidate-safe page for every live search, at a short link that carries your code.', topicId: 'share-a-search' },
  { date: '2026-09-08', title: 'Client decisions on your pipeline', text: 'Interview, passed with a reason, and hired now reach you the same minute, by email and on the card.', topicId: 'outcomes' },
  { date: '2026-09-08', title: 'Consent in one tap', text: 'Ask a candidate whether we may put them forward; their tap is dated and the company stays an alias.', topicId: 'consent' },
  { date: '2026-09-07', title: 'Searches open to every partner', text: 'Proposals, the brief, the bar, questions and the pipeline board, for everyone on partner terms.', topicId: 'what-is-a-search' },
  { date: '2026-09-06', title: 'Firm accounts', text: 'One signature for the company, colleagues on short access terms, the firm gets paid.', topicId: 'firm-account' },
]
