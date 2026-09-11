# The Sourcing desk: an internal Juicebox for Refery

Proposal, 11 September 2026; built 12 September after review (section 10). Mock-ups: the design canvas "Refery Sourcing" (9 artboards, two pages): https://claude.ai/code/artifact/11652868-9175-4c94-b128-69b698314ac3. People in the mock-ups are fictional (Priya Natarajan, Tomás Ferreira, Noor Haddad and the rest); the search followed through every screen is the live Alcor Labs founding full-stack seat, with its real brief, band and location.

## 0. The short version

Build it. Not because Juicebox and Pin are bad (they are good, and they are cheap by the standards of the category), but because roughly seventy percent of what they sell already exists in this codebase, the data we would pay them for is already paid for through Apollo, and the one thing they cannot do is read Alcor's founder call, the hiring-manager brief, the two search questions and the five people Lily passed on last week before deciding who to write to.

What it costs to run, per month, on top of what Refery pays today: **about $25 to $60.** Sending is $0 (Google Workspace mailboxes through the Gmail API, which is what Juicebox, Pin, Gem and Dover all do underneath). Discovery is $0 (Apollo people search costs no credits, GitHub is free, the bench is ours). Reading a found profile is 1 Apollo credit, and the plan already includes 4,000 a month, of which 0 were used this cycle. The models are $20 to $35 a month at ten live searches. The same ten searches on Juicebox Growth with one agent are $557 a month, on Pin Professional about $270 plus credit packs.

What it costs to build: three phases, the first of which reuses the follow-up engine, the Gmail client and the outreach tables that already run founder outbound, and is usable on Alcor within a week.

The one decision that changes the shape of the work: **whether refery.io and getrefery.com sit in the same Google Workspace organisation.** If they do, one admin step (a service account with domain-wide delegation) covers every mailbox we will ever add, with no Google verification, no CASA assessment and no consent screens. If they are two tenants, the same step is done twice. Either way it is free. Section 4.5 explains.

## 1. What we have, checked on 11 September

Read from the database, Apollo and the code, not from memory.

**Searches.** 11 live seats at 6 clients: Alcor Labs (4), Arx Labs (2), Hilbert's AI (2), Livo (2, Barcelona, EUR), NewForm (1). Every one carries structured musts, a "not for", context text and a salary band in `partner_roles_v`; 10 of the 11 have a hiring-manager brief in `hm_briefs`; 5 search questions have been asked and answered; 14 call recaps exist. `hm_brief_answers` is empty, so the one-tap answers on the brief page have not been used yet.

**People we already know.** 355 candidates, all embedded (`candidates.embedding`, text-embedding-3-small, 1536 dims), 329 with an email, 239 with a LinkedIn URL. The bench matcher (`lib/desk/bench.ts`) already retrieves the nearest 40 for a seat and has a model read them against the brief. This is the "our bench" column in the mock-ups; it is done.

**Sending.** `lib/google.ts` sends and drafts through the Gmail API for one mailbox, lily@refery.io, using an OAuth refresh token stored in `desk_settings` (scopes compose, send, readonly; connected 6 September; health-checked nightly). It already finds an existing thread, sets In-Reply-To and References, encodes headers, reads thread messages and detects bounces (`lib/desk/signals.ts`). The follow-up engine (`lib/desk/followups.ts`) runs every 30 minutes from pg_cron, checks "did the thing we were waiting for happen" before every timer, sends formulaic follow-ups itself and escalates the rest to a Slack thread. `lib/founder-outbound.ts` is, in miniature, a sequencer: batch card in Slack, :+1: sends, day 4 and day 9 follow-ups in the same thread, dead after 21 days, every send a row in `outreach_threads` and `outreach_messages` (454 threads, 455 messages so far). The `/outreach` hub renders those tables.

**Models.** `lib/desk/model.ts` routes four jobs (panel, bench, classify, draft) through approved chains with a shared cost ledger (`brain_ai_usage`). September to date: **$17.78** across 529 calls, $15.83 of it the desk. Reply classification (`classifyReply`) already exists and is used by the follow-up engine.

**Apollo.** The team plan has **4,000 lead credits a month, 0 consumed this cycle** (cycle resets 10 October), waterfall email and phone enrichment switched on, and 800,000 AI credits unused. Three Gmail mailboxes are already linked for Apollo sequences: **lily@refery.io, lily@getrefery.com and kim@refery.io** (kim@refery.io, not kim@getrefery.com). No sequence has ever been created. A test search against the Alcor full-stack seat (software and full-stack engineers at Twitch, Mux, LiveKit, Daily, Agora and 100ms, in the Bay Area, 2 to 8 years) returned **52 people, every one with an email on file**, for 0 credits. What the search returns is first name, masked last name, title and employer; the full profile with employment history, LinkedIn URL and email is one credit on `people/match`, charged only on success.

**Specter.** Already paid, MCP connected. `get_person_profile` gives LinkedIn-shaped experience and education; `get_person_email` resolves an address; `get_person_talent_signals` says who recently moved or is open. Its natural-language people search ignores company names and has no bulk endpoint (from earlier work), so it is an enrichment source here, not a discovery one.

**What does not exist.** A second mailbox in our own sender; a per-search target profile that reads more than the job row; any external discovery of people we do not already know; a sequence editor; a board; a replies inbox; a do-not-contact list; per-mailbox caps and ramps.

## 2. What Juicebox and Pin actually are

Both were read from their own docs (Juicebox has 268 doc pages, Pin about 45), their pricing pages, trust centres and third-party reviews. The full research notes are in the appendix; this is the part that matters for us.

| | Juicebox (PeopleGPT) | Pin |
|---|---|---|
| Company | YC S22, $80M Series B at $850M (March 2026), ~5,000 customers, ~65 staff | Founded by Steven Lu (Interseller, sold to Greenhouse), $3M seed, ~24 staff, "20,000 users" |
| Data | "800M+ profiles, 30+ sources" bought from partners; 200M with contact data | "850M+ profiles, dozens of providers"; providers unnamed |
| Email finding | A bought waterfall: ContactOut, RocketReach, then Kickbox verification. 95% deliverability guarantee on verified emails, paid back in credits | Not disclosed; no waterfall vendor in the subprocessor list |
| Search | Natural-language prompt parsed into hard filters (remove) plus ranked criteria (sink); per-criterion verdict with an evidence snippet on every card | JD or chat parsed into filters with a "Required" toggle; one card at a time with a 0 to 100 fit score and bullet reasons; keyboard J/K/D/F/O; "smart refinements" after ten decisions |
| Outreach | Your Gmail or Outlook via Nylas; steps with relative delays, per-step sender, same thread or new, `{*AI command*}` for one personalised sentence; preview every email before enrol | Your Gmail or Microsoft 365 via OAuth; email automatic, LinkedIn and SMS as manual tasks; 2, 5 or 10 minute spacing; personal-first or work-first address preference |
| Reply handling | Any reply stops the sequence; user labels Interested or Not | Any reply stops every sequence for that person, team-wide; buckets Needs attention, Interested, Not interested, Unresponsive; AI proposes a meeting time from your calendar |
| Mailbox caps | Floor 20, default 100, up to 500 a day; fixed 120 seconds between sends; warm new domains 4 to 6 weeks from 20 a day; tracking off on new domains | Docs recommend at most 300 a day per address; no warm-up service despite the marketing |
| Agent | $199 per agent per month: calibrate on three approvals, daily lead target, pause after four idle days | Included in Professional: calibrate on five cards, fit threshold, daily cap 10 to 100 |
| Price | Starter $119/mo (500 credits, 1 mailbox); Growth $199/seat (1,500 credits, 3 mailboxes); Business custom | Free; Solo $99/mo annual only (500 credits); Professional $135/user (1,000 credits, 5 mailboxes); credit packs $50 |
| Credit | 1 per email found, 3 per phone, 1 per export; charged only on success | 1 per email, 1 per phone; charged only on success; packs work out at $0.10 to $0.20 |
| Models | Anthropic and OpenAI (trust centre); Supabase for the database; Braintrust and Humanloop for evals | Anthropic, OpenAI and Gemini through OpenRouter; Langfuse; an in-house résumé-reading model |
| Quality they claim | "3x replies"; example card 55% open, 16% reply, 10% interested; personal emails +40% replies; 3 to 5 steps capture 95% of replies | 5M-message study: AI-drafted email 4.97% reply, hand-written first email 12.59%, LinkedIn 16.9%; reply by step 5.5 / 5.4 / 4.2 / 3.3 / 2.9% |
| What people complain about | ATS and hiring-manager seats gated to Business; stale titles; bounces outside North America and Europe; juniors ranked for senior roles; costs stack across seats and agents | Scraped phones and emails sometimes wrong; boolean weak; every number self-reported; LinkedIn steps are manual |

Three things to take from the table.

First, **the sending is our own mailbox at both.** Neither runs sending infrastructure for you; they connect your Gmail and enforce a cap. That layer costs them nothing and costs us nothing.

Second, **the data is bought and resold.** Juicebox names ContactOut and RocketReach; both charge only on success, which means they are middlemen on the credit line. A credit is $0.12 to $0.20 at their prices; the underlying finders are $0.005 to $0.05 (section 5). We already have one of the underlying sources.

Third, **the intelligence is the same models we use**, prompted with the same three inputs: a description of the role, a profile, and a rubric. Pin's own study says the human-written first email got two and a half times the replies of the AI-drafted one. That is the argument for Lily's voice and one specific line per person, which is what `lib/voice` is for.

### The rest of the field, in one paragraph each

**Dover** made its Sourcing Autopilot free for new users: paste a JD, it drafts one email per candidate, "Full Auto" sends 100+ a week from your connected mailbox and shows you only the people who replied interested. **Gem** ($99 to $270 a seat) is the incumbent sequencer for in-house teams; its 2026 report on 15.5M messages says a four-step sequence gets twice the replies of one email and that step 1 gets 58% of replies, the follow-ups 42%. **Metaview** shipped Outreach in February 2026 at $100 a user: sequences drafted from the role brief, the ATS record and interview history; auto-pause on any inbound or a Calendly booking; 3 credits per email found. **Perfect** is $250 per open role, no seats, and claims a 55% "acceptance" rate. **Wellfound** sells sourcing agents on its opted-in pool plus 500M external profiles, and reports its own candidates reply 50% more than cold external ones. **hireEZ, SeekOut, Findem** are $6,000 to $15,000 a seat a year and sales-gated. **Fetcher** caps you at 500 sourced candidates a year for $379 a month. **Paraform and Mercor** are marketplaces, not tools. The 2026 seed crop (Perfectly, OpenJobs, Tezi, HeroHunt, Dex) all sell the same loop: read the role, rank a bought index, send from your mailbox, hand you the replies.

### What every one of them does, and this must copy

1. Two layers of matching: hard filters that remove people, ranked criteria that sink them, with the reason and the evidence visible on every card. Nobody trusts a score they cannot see the working of.
2. One-card-at-a-time review with keyboard keys, and the tool learning from the first ten decisions.
3. Contacts revealed on demand and paid only on success, with the verification state visible, and a personal-first or work-first preference.
4. Sequences as steps with relative delays, per-step sender, same-thread or new-thread, a merge field plus one personalised sentence, and a preview of every rendered email before anyone is enrolled.
5. Stop-on-reply that is global to the person, plus collision checks before enrolment: already in a sequence, written to in the last 90 or 180 days, bounced, unsubscribed, already in the ATS.
6. Reply buckets (Interested, Not interested, Needs attention, Unresponsive) that write back to the person's status, and a drafted reply ready to send.
7. Mailbox hygiene defaults: own mailbox over OAuth, a daily cap, minutes between sends, tracking off, sending as a founder for the last step.
8. Statuses as a small fixed vocabulary.

Every one of these is in the mock-ups.

## 3. What to build

A **Sourcing** tab in the app, super-admin only, one level below Searches. It reads the live seats it already knows and adds, per seat, five tabs: Profile, Pool, Sequence, Board, Replies. Above the seats sit two pages: Mailboxes and the all-search Replies inbox. Decisions that send email happen in Slack, as every other desk decision does.

### 3.1 The screens (canvas page "Flow")

| # | Artboard | What it is for |
|---|---|---|
| 1 | Sourcing home | Every live search on one page: whether the profile is approved, the funnel (found, fit, written to, replied, interested), the next thing that will happen, and a switch that stops sending without losing anything. Four figures at the top; the fourth is the month's cost. |
| 2 | Target profile | The seat as the model understood it, from every source we hold: one paragraph on who they really want, then must-haves, strong signals, not-for and how to open the email, each fact tagged with where it came from (brief, founder call, HM answer, search question, Lily's own rejections). A rail lists what was read and when. "Ask the client" drafts the two questions the sources do not settle and posts them to #refery-search-questions as today. Nothing is searched until Lily approves. |
| 3 | Pool | Everyone found for the seat: fit grade A, B or C with one line of why, where they came from (Apollo, GitHub, bench, a partner), email state, status. Bulk actions: add to sequence, hold, not a fit. "Not a fit" asks for a reason and the next run learns from it. |
| 4 | One person | The drawer: why them (three bullets that quote the profile), watch for, career, the exact first email as it will send with the personalised line highlighted, and the five checks that run before enrolment. |
| 5 | Sequence | Three steps with days, the first step's subject and hook as merge fields, follow-ups as replies in the same thread; which mailboxes send it, when, what stops it, which address to use, and the promise of plain text and no tracking. |
| 6 | Board | Where every person is: to send, step 1, 2, 3, replied, interested, not now, bounced; last thing that happened, next thing that will; pause per person or per search. |
| 7 | Replies | Every answer across every search, read once by the model and sorted by what it needs from Lily. Interested gets a booking link and a desk card; questions get a drafted answer; wrong person gets an apology; not-now gets a reminder date; the formulaic ones are listed as handled. |
| 8 | Mailboxes | Each mailbox with today's sends against its cap, 30-day reply and bounce rates, its ramp; the sending rules written out; SPF, DKIM and DMARC per domain checked nightly. |

Canvas page "Slack": the slate card in #refery-desk. "27 people ready to write to" with three named, and reactions :one: send all, :two: send the A's only, :eyes: I will pick on the page, :x: hold. The page is for looking; the reaction is for deciding.

### 3.2 What is deliberately not there

- No LinkedIn automation. Connection requests, InMails and DMs are against LinkedIn's terms whether a tool does them or an extension does; Pin makes them manual tasks and says so. If a person should be reached on LinkedIn, the board can say "message on LinkedIn" as a task for Lily, later.
- No open pixels, no rewritten links, no unsubscribe footer. Gmail proxies images so opens are noise, tracking domains are a spam signal, and List-Unsubscribe headers on twenty hand-written emails a day tell filters they are bulk. Interest is measured by replies and by visits to the `/j/<slug>` page, which we already log.
- No warm-up network. Google revoked Gmail API access from the warm-up senders in 2023 for exactly this; the vendors moved to SMTP and the traffic is bots writing to bots. Real replies warm a mailbox.
- No scraping of anyone's LinkedIn. A pasted LinkedIn URL or a Sales Navigator CSV export can be imported by hand; the tool never drives a browser.
- No auto-send without a decision. The agent loop that Juicebox and Pin sell (calibrate on five, then send a daily quota) is a switch on the sequence, off by default, and only ever after the first slate on a seat has been approved by hand.

## 4. How it works

### 4.1 The target profile

One model call per seat, rebuilt whenever a source changes, with Lily's edits kept on top. Inputs, all of which exist today:

- the job row: title, headline, musts (`hard_requirements`), `not_for`, `context`, band, location, remote policy, visa, years;
- the hiring-manager brief (`hm_briefs.content`) and any one-tap answers (`hm_brief_answers`);
- search questions and their published answers (`search_questions`);
- the founder call transcript when Granola recorded one (`call_recaps`, transcript via the Granola API);
- the client's Slack thread in #refery-desk;
- every decision Lily has made on that seat: `match_assessments` verdicts, `not a fit` reasons from the pool, panel rejections;
- what got replies on similar seats (from the board, once there is history).

Output, structured: `who` (a paragraph), `musts[]`, `signals[]`, `not_for[]`, `titles[]`, `lookalike_employers[]`, `keywords[]`, `locations[]`, `years`, `open_with` (how to write the first line), `questions[]` for the client, each item carrying `sources[]`. The lookalike employers and titles become Apollo filters; the paragraph becomes the embedding query for the bench; the musts and not-for become the scoring rubric. Model: the `draft` chain (Opus or Sonnet), about $0.10 a seat.

### 4.2 Discovery

Adapters, each returning the same shape (`name, title, employer, location, links, source, source_id`), run when the profile is approved and again on "Find more":

| Source | What it gives | Cost | Notes |
|---|---|---|---|
| Our bench | 355 people, nearest 40 by embedding, eligibility policy applied | $0 | Already built (`lib/desk/bench.ts`); consent already asked |
| Apollo `mixed_people/api_search` | Title, employer, location, years, "has email" flag; up to 50,000 per query; filters for employer domains, titles, person location, years of experience, time in role, keywords | 0 credits | This is the workhorse. Test query for Alcor: 52 people, all with an email |
| GitHub search API | Users by location, language, followers; contributors to named repos (livekit, pion, mediasoup, hls.js for Alcor); commit emails when public | $0, 30 requests a minute | Engineers only, and the best source of the "public work" signal founders ask for |
| Specter talent signals | People who recently left a lookalike, or turned open | included | Enrichment and timing, not bulk discovery |
| Serper x-ray (optional) | `site:linkedin.com/in "senior backend" "London"` through a Google SERP proxy | $1 per 1,000 queries, 2,500 free | For non-engineering seats (Hilbert's retail sellers) where Apollo's title filters are coarse. Legally grey (it scrapes Google, not LinkedIn) |
| Hand | A LinkedIn URL, a CSV, a partner's suggestion | $0 | Resolved through Apollo `people/match` by URL |

Not used: People Data Labs ($0.28 a record), Coresignal ($0.20), Enrichlayer (Proxycurl's successor after LinkedIn's lawsuit closed it), Exa Websets ($49 a month for 800 results). Any of them can be a sixth adapter later if a seat needs it.

### 4.3 Reading a person

Apollo's search result is a name, a title and an employer. To grade someone the model needs their history, so the top N from discovery (by filter strength and, for the bench, similarity) are enriched with `people/match`: employment history with dates, education, LinkedIn URL, email with verification status. One credit each, only when found, out of the 4,000 a month already paid for. For engineers, the GitHub profile is fetched free. For the top A's, Specter's profile adds skills and education where Apollo is thin.

Email waterfall, in this order, stopping at the first hit: Apollo (included, work email; `reveal_personal_emails` is blocked by Apollo for people in GDPR regions), GitHub commit email (free, usually personal), Specter `get_person_email` (included), then optionally Icypeas ($19 a month for 1,000, 99.1% accuracy in an independent benchmark, credits never expire) for the gaps. Addresses from a pattern guess are marked "Guessed" and verified with the AfterShip verifier (MIT, Go) from a $5 VPS since Vercel blocks port 25; Google Workspace domains answer catch-all so a "Guessed" address is sent once and watched for a bounce rather than paid to verify.

Address preference is a sequence setting: personal first, then work (a candidate reads a recruiter at home; Juicebox reports 40% more replies to personal addresses), except never a work address at a client of ours and never anyone on the never list.

### 4.4 Grading and drafting

One structured call per person on the `classify` chain (Haiku 4.5 today; GPT-5 mini or Gemini Flash-Lite are a third of the price if the ledger ever matters): the rubric from the profile, the enriched record, and the seat's rejection history; out comes `grade` (A, B, C), `why[]` (three bullets that quote the record), `watch_for`, `hook` (the one true sentence about this person that opens the email), `hook_subject`. About 2,000 tokens in, 250 out: **$0.003 a person on Haiku, $1 for a pool of 300.**

The first email is Lily's template for the seat with `{hook}` and `{hook_subject}` filled per person, drafted on the `draft` chain in her voice (`lib/voice` conventions: short, first person, comp in the open, an ask for fifteen minutes, no CV, "I will tell you straight"). Follow-ups are templates with merge fields only; the second step carries one fact about the company, the third the referral line. Every rendered email is visible in the drawer before enrolment.

Learning: a "not a fit" with a reason is stored against the seat and fed into the next grading run's rubric as an exclusion example, which is what Pin's "smart refinements after ten decisions" is.

### 4.5 Sending

`lib/google.ts` becomes multi-mailbox: a `mailboxes` table (address, display name, signs-as, daily cap, ramp start, status, tenant) and a credential per mailbox. Two ways to get the credential, both free:

**A. Service account with domain-wide delegation (recommended).** The Workspace admin creates one service account, authorises its client ID in Admin console → Security → API controls → Domain-wide delegation for the scopes `gmail.send`, `gmail.readonly` (or `gmail.metadata`), and the app impersonates any user in the organisation. No consent screen, no Google verification, no CASA, no refresh tokens that expire, and adding kim@getrefery.com later is a row in the table. Google's own rule: apps used only inside your Workspace organisation are exempt from restricted-scope verification. If getrefery.com is a secondary domain or a domain alias of the refery.io Workspace (one organisation can hold 600 domains), one delegation covers both; if it is a separate tenant, the same client ID is delegated in that tenant's Admin console too. `gmail.send` is a sensitive scope and `gmail.readonly` a restricted one; neither matters when the app never leaves the organisation.

**B. Per-user OAuth, as today.** `/api/admin/google/connect` already does it for lily@refery.io. It works for a handful of mailboxes, but the OAuth app has to be Internal (same organisation) or it needs verification and, for the readonly scope, a CASA assessment ($540 to $4,500 a year). Keep it as the fallback for a mailbox outside any Workspace we control, such as lily@10kventures.co.

Rules, all in code and shown on the Mailboxes page:

- Cap per mailbox: new mailbox 10 a day, plus 5 each weekday, ceiling 50. Google's limit is 2,000; every deliverability source in 2026 puts the safe cold ceiling at 30 to 50, and Apollo hard-codes 50 per mailbox and 100 per domain. Three mailboxes at 40 is 120 a day, 2,400 a month, which covers ten searches of 300 with a three-step sequence spread across the month.
- Desk emails, recaps and founder outbound count against the same cap, so the sequencer sees one number per mailbox.
- First emails Tuesday to Thursday 8:30 to 11:00 in the recipient's time zone; follow-ups any weekday; 2 to 5 minutes of jitter between sends; never on a US or Spanish public holiday.
- Follow-ups are sent with the first message's `threadId`, `In-Reply-To` and `References` and the same subject, which is the only way Gmail keeps them in one thread.
- Round-robin across the mailboxes a sequence turns on; a person's whole sequence stays on the mailbox that sent step 1; Kim's mailbox only sends Kim's sequences.
- Bounce rate over 3% in a week pauses the mailbox and posts to #refery-alerts; reply rate under 5% after 60 sends on a seat pauses the seat and asks Lily to look at the profile.
- SPF, DKIM and DMARC on both domains checked nightly with a DNS lookup. getrefery.com is at DMARC p=none in the mock-up because that is the usual state of a newer domain; it should move to quarantine once the ramp is done.

### 4.6 Replies

A pg_cron job every five minutes calls `history.list` per mailbox from the last history id (Gmail API quota is 1.2 billion units a day; this is free). Push through Cloud Pub/Sub `users.watch` is the alternative and is also free at our scale, but polling has no GCP dependency and the existing follow-up engine already reads threads this way. Each new inbound message is matched to a sequence run by thread id, then:

- any message from the person stops their sequence everywhere, and `classifyReply` (exists) sorts it: interested, question, not now, not interested, wrong person, do not contact;
- `Auto-Submitted`, `Precedence: bulk` or `X-Auto-Response-Suppress` headers, or an "out of office" subject, mark an auto-reply: the run pauses until the return date the model reads from the body, then continues;
- mailer-daemon and delivery-status messages mark a bounce and try the next address in the waterfall once;
- "stop", "unsubscribe", "do not contact" put the person on the never list for every search, with a one-line acknowledgement;
- interested creates the candidate on the desk exactly as an inbound CV does today (card in #refery-desk, consent, journey), sends the booking link, and the follow-up engine takes over;
- questions get a drafted answer from the brief, held for Lily unless it is a fact the brief states;
- not now sets a reminder date and thanks them.

Every reply also lands in the mailbox it was sent from; nothing is hidden from Gmail.

### 4.7 Status and control

The pages in section 3 are read-mostly; every write is one of a dozen verbs (approve profile, add to sequence, hold, not a fit, pause person, pause seat, pause mailbox, send draft, add to desk, change date, never contact, resume) recorded with an actor, mirrored into the seat's Slack thread, and exposed on the desk MCP (`refery.xyz/api/mcp`) behind the same write switches as today.

### 4.8 Data

New tables, all with `vf.touch_updated_at()`:

- `sourcing_profiles` (job_id, spec jsonb, sources jsonb, version, approved_at, approved_by, edits jsonb)
- `sourced_people` (canonical person: name, links, emails jsonb with status and source, employer, title, location, history jsonb, github jsonb, apollo_id, specter_id, first_seen_via)
- `sourcing_pool` (job_id × person_id: grade, why, watch_for, hook, hook_subject, status, reason, decided_by, decided_at)
- `sequences` (job_id, name, steps jsonb, mailbox_ids, window, address_preference, autopilot boolean)
- `sequence_runs` (sequence_id, person_id, mailbox_id, address_used, step, state, thread_id, next_at, stopped_reason)
- `sequence_events` (run_id, kind: sent, replied, bounced, ooo, paused, resumed, stopped; gmail_message_id, classification, payload)
- `mailboxes` (address, display_name, signs_as, tenant, credential_ref, daily_cap, ramp_started_at, status)
- `do_not_contact` (email, person_id, reason, source, created_at)

Every send also writes `outreach_threads` and `outreach_messages` as founder outbound does, so the existing `/outreach` hub and the pulse feed see it without changes. A person who replies interested becomes a `candidates` row with `intake_source = 'sourced'` and keeps the `sourced_people` link.

## 5. What it costs

### 5.1 Running it

Ten live searches, 300 people found each, 120 read, 40 written to with three steps: 3,000 people found, 1,200 enriched, 400 sequences, 1,200 emails a month.

| Line | Us | Note |
|---|---|---|
| Sending | $0 | Gmail API on Workspace mailboxes already paid for |
| Discovery: Apollo search, GitHub, bench | $0 | 0 credits, free API, ours |
| Reading profiles: Apollo `people/match` | $0 up to 4,000 a month | included in the current plan; 1,200 used in this scenario |
| Email gaps: Icypeas | $0 to $19 | optional, only for people Apollo, GitHub and Specter cannot resolve |
| Serper x-ray | $0 to $3 | optional, non-engineering seats |
| Models: profile, grading, drafts, reply reading | $12 to $35 | $1 per 300 graded on Haiku; step-1 drafts on Sonnet 5 ≈ $2.50 per 500; batch API halves it |
| Verifier VPS | $0 to $5 | only if we verify guessed addresses ourselves |
| **Total, marginal** | **$12 to $62 a month** | Supabase, Vercel, Apollo and Specter unchanged |

Compared with buying, for the same two people and ten searches:

| | Monthly | What you get |
|---|---|---|
| Juicebox Growth, 2 seats + 1 agent | $557 ($179 × 2 annual + $199) | 3,000 credits, 6 mailboxes, unlimited search; no ATS, no HM seats without Business |
| Juicebox Business | custom, annual only | everything |
| Pin Professional, 2 seats | $270 annual, plus $50 packs | 2,000 credits, 10 mailboxes, agents |
| Gem Startups | $270 | 500 AI sourcing credits |
| Metaview Pro, 2 seats | $200 | 400 profiles a month, 500 enrichment credits (3 per email) |
| Dover Autopilot | $0 | one JD, one mailbox, no control over who or what |
| This proposal | $12 to $62 | reads Refery's own record of the client; feeds the desk directly |

None of the bought tools read the founder call, the HM brief or Lily's rejections, and none write into the desk. Dover free is the honest alternative if the only goal were volume on one seat.

### 5.2 Building it

| Phase | What ships | Reuses | Effort |
|---|---|---|---|
| 1. Send and see (week 1) | `mailboxes` table and delegated credentials; sequencer on the follow-up engine; Sequence, Board and Mailboxes pages; the slate card; the reply poller with existing classification; do-not-contact list. Fed by hand-picked people (paste LinkedIn URLs, the bench). Used on Alcor full-stack the same week. | `lib/google.ts`, `lib/desk/followups.ts`, `lib/desk/signals.ts`, `lib/founder-outbound.ts`, `lib/batches.ts`, outreach tables | 4 to 5 days |
| 2. Find and read (week 2) | Target profile builder with sources; Apollo, GitHub and bench adapters; enrichment and email waterfall; grading; Pool and Person pages; "not a fit" learning. | `lib/desk/bench.ts`, `lib/desk/model.ts`, ledger, `lib/hm-brief.ts`, Granola client | 5 to 6 days |
| 3. Replies and polish (week 3) | Replies inbox with drafted answers; interested → desk candidate; booking link; OOO date parsing; per-seat auto-pause rules; Specter and Serper adapters; MCP verbs; guide topic. | `lib/desk/intro.ts`, `lib/candidate-consent.ts`, desk MCP | 3 to 4 days |

Phase 1 alone replaces the Apollo sequencer nobody has switched on and gives founder outbound a board.

## 6. Quality: what decides it and how we will know

Three things decide whether this finds the right people and gets replies, in this order.

**1. The profile.** Juicebox's reviewers complain that it ranks juniors for senior roles; that is a rubric problem, not a data problem. Our rubric is built from more than a JD. The test: on the five people Lily passed on for Alcor last week, the grader must give a C with a reason that matches hers. That is the acceptance test for phase 2, and it costs a cent to run.

**2. The record.** Apollo gives title, employer, dates and location, which is enough to answer "worked at a real-time company for three years" and not enough to answer "wrote a React Native bridge". GitHub answers the second for engineers; Specter fills in skills and education; for GTM seats (Hilbert's retail sellers) the employer and title are most of the signal anyway. Honest limit: for design, research and non-technical seats, expect more B's and fewer A's until a person is read by hand.

**3. The email.** Pin's 5M-message study: AI-drafted first emails 4.97% replies, recruiter-written 12.59%, three touches capture 93% of replies, 800 to 1,200 characters best. Gem: four steps double replies. Juicebox: personal addresses +40%, a founder sending the last step +50%. Refery's own founder outbound has run for a week; the desk emails to candidates get replies in the teens. Targets for the first month: **reply rate 12% or better on engineering seats, 8% on GTM, bounce under 2%**, and the seat auto-pauses at 5% after 60 sends so a bad profile cannot burn a mailbox.

Measured on the board, per seat and per mailbox, with nothing to buy: sends, replies, interested, calls booked, submitted to the client, and where the A's came from.

## 7. Law and deliverability, briefly

- **US** (Alcor, Arx, Hilbert's, NewForm): CAN-SPAM is opt-out. A one-to-one email about a role from a real person with a real address, which honours "please stop", complies. No footer needed; a "reply STOP" line is optional and cheap.
- **Spain and the UK** (Livo, and any European seat): GDPR legitimate interest for a targeted approach about a specific role at a work address, with a recorded assessment and a one-line "I found you through X; reply and I will not write again" in the email. Personal addresses for EU people are the riskier channel and Apollo will not return them anyway; the sequence for Livo defaults to work-first. Since February 2026 the UK PECR fine ceiling is £17.5M, so this is not a place to be clever.
- **Canada**: CASL is opt-in; the CRTC says most recruitment messages are not commercial, but the sequence should not run to Canadian personal addresses until someone has read the guidance.
- **Google's sender rules** apply in full only to bulk senders (5,000 a day to Gmail addresses). We will send a hundred. SPF, DKIM and DMARC on both domains, a spam rate under 0.1%, and no tracking are the whole list.
- **LinkedIn**: nothing here touches it.

## 8. Decisions for Lily

1. **One Workspace or two?** Is getrefery.com a domain in the refery.io Workspace organisation, or its own tenant? This decides whether the delegation step happens once or twice. (Either is fine; consolidating is cheaper long term.)
2. **Delegated service account, or connect each mailbox by hand?** The proposal says delegation. It needs ten minutes of admin-console work by whoever owns the Workspace.
3. **Who signs.** Lily's searches from Lily's two addresses; Kim's from kim@refery.io only. Should Kim's mailbox ever carry Lily's sequences under Lily's name? The mock-up says no.
4. **Personal addresses for US candidates.** Personal-first (more replies, what Juicebox and Pin default to) or work-first (cleaner)? The mock-up says personal first, never at a client.
5. **Caps.** 50 a day per warmed mailbox and 10 a day to start, or lower.
6. **The referral line in step 3** ("$1k thank-you on a hire"): keep, or leave the last step plain.
7. **Approval.** Every slate approved in Slack (the proposal), or autopilot after the first approved slate on a seat.
8. **Icypeas.** Spend $19 a month on the email gaps, or live with "no email" on the ten percent Apollo, GitHub and Specter cannot resolve.
9. **Apollo's own sequencer.** Three mailboxes are already linked there. The proposal does not use it (no control over drafting, no link to the desk), but it is a zero-cost fallback if phase 1 slips.

## Appendix: research notes

Full notes from the three research passes are kept with this proposal at `docs/proposals/2026-09-11-sourcing-desk/research.md`. Prices were checked on 11 September 2026 and will drift.

**Juicebox**: pricing https://juicebox.ai/pricing (repriced 21 July 2026); docs on contact data https://docs.juicebox.ai/contact-data.md (ContactOut, RocketReach, Kickbox; 95% guarantee); email deliverability https://docs.juicebox.ai/email-deliverability.md (caps, 120-second spacing); agents https://docs.juicebox.ai/juicebox-agents; trust centre https://trust.juicebox.ai/ (Anthropic, OpenAI, Supabase, Nylas); Series B https://www.businesswire.com/news/home/20260310781820/en/.

**Pin**: pricing https://www.pin.com/pricing/; sequence docs https://docs.pin.com/create-and-customize-outreach-sequence; sending limits https://docs.pin.com/email-sending-limits; lookup preferences https://docs.pin.com/email-lookup-preferences; outreach errors https://docs.pin.com/set-outreach-error-preferences; 5M-message study https://www.pin.com/blog/ai-vs-human-recruiting-outreach-study/; benchmark report https://www.pin.com/blog/recruiting-outreach-benchmark-report/; subprocessors https://trust.pin.com/?tab=subprocessors.

**Field**: Dover https://www.dover.com/blog/dover-autopilot-better-than-ever-and-free-for-new-users; Gem 2026 benchmarks https://www.gem.com/blog/key-takeaways-from-the-2026-recruiting-benchmarks-report; Metaview Outreach https://www.metaview.ai/resources/blog/metaview-outreach; Wellfound Reach https://reach.wellfound.com/; Instantly 2026 benchmark https://instantly.ai/cold-email-benchmark-report-2026.

**Infrastructure**: Apollo people search https://docs.apollo.io/reference/people-api-search and enrichment https://docs.apollo.io/reference/people-enrichment; Gmail scopes https://developers.google.com/workspace/gmail/api/auth/scopes; OAuth production readiness https://developers.google.com/identity/protocols/oauth2/production-readiness/overview; domain-wide delegation https://support.google.com/a/answer/162106; multiple domains https://knowledge.workspace.google.com/admin/domains/faq-for-multiple-domains; Workspace sending limits https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace; Google sender guidelines https://support.google.com/a/answer/14229414; Gmail push https://developers.google.com/workspace/gmail/api/guides/push; threads https://developers.google.com/gmail/api/guides/threads; Icypeas https://www.icypeas.com/pricing; email finder benchmark https://anymailfinder.com/blog/best-email-finder-tools and https://www.dropcontact.com/email-finder-benchmark; AfterShip verifier https://github.com/AfterShip/email-verifier; Serper https://coldiq.com/blog/serper-pricing; GitHub search https://docs.github.com/en/rest/search/search; LinkedIn prohibited software https://www.linkedin.com/help/linkedin/answer/a1341387; UK PECR https://puzzleinbox.com/blog/cold-email-uk-pecr-2026; CASL https://crtc.gc.ca/eng/com500/faq500.htm; model prices https://platform.claude.com/docs/en/about-claude/pricing, https://developers.openai.com/api/docs/pricing, https://ai.google.dev/gemini-api/docs/pricing.

## 10. What was built on 12 September, and what the review changed

Lily's review of the mock-ups (kept in this folder as `review.md`) changed the design in six places before anything was written, and the build follows the reviewed design, not the mock-ups where they differ.

**Live at refery.xyz/sourcing, super admin only.** Everyone else gets a 404, on the pages and on the API. The nav entry is `superAdminOnly`.

### 10.1 What the review changed

| Review point | What the build does |
|---|---|
| Evidence rules stronger than prose | Every requirement on the profile is `must` or `prefer` with its sources. Every graded person carries a verdict per requirement: supported, contradicted or unknown, with the record line it rests on. Fit, contact, relationship and decision are four separate columns on `sourcing_pool`; "ready" is computed from all four (`isReady`) and never stored as a shortcut. A mandatory requirement contradicted is `not_fit` regardless of what the model said. |
| Location and relocation are different facts | `sourcing_people.relocation` is unknown, willing or unwilling, set by hand on the pool row; the grader is told that "elsewhere with relocation unknown" is a near miss with the location verdict unknown, not a rejection. Changing it re-grades the row. |
| The hook must rest on evidence | The grader returns `hook` and `hook_evidence`; the evidence line must be found in the record (60% of its words) or the hook is dropped and the email opens with a plain line that is true of anyone found. The pool page shows which it was. |
| Versioned brief with visible changes | `sourcing_briefs` is one row per version; a rebuild diffs against the approved version field by field; Lily's edits are overrides with author, time and reason, applied on top of every later version. Rejections with reasons are fed to the builder as individual facts, with the instruction that two people from big companies do not make a rule. |
| Contact supply is measured, not assumed | Apollo search is free and produces stubs; a cheap screen (twenty stubs a call) decides who is worth a credit; `people/match` is one credit on success, every lookup written to `sourcing_lookups`; a monthly cap (`desk_settings.sourcing_apollo_monthly_cap`, default 1,000) stops enrichment. The home page shows credits used, lookups made and how many found someone. Nothing enriches from the cron; "Read the pool" is a button with a confirmation that says the cost. |
| No GitHub email harvesting | Removed. GitHub is not used at all in the build; the evidence record comes from Apollo, the bench (a CV the person gave us) or Lily by hand. No bounce falls back to another address on its own. |
| Capacity model | `sourcing_mailboxes` carries a starting cap, a ramp of five per weekday to a ceiling, and `reserved_other` for sends made outside the desk. The Mailboxes page and the home page show today's room and a monthly forecast that counts every send, first emails only on send days, and the steps per person. Default sequence is two steps, not three. Kim's mailbox is entered as kim@getrefery.com when it is added; an alias is entered as its account. |
| Modes and exact approval | `sourcing_sequences.mode` is learning or batches (auto exists as a value and is disabled in the UI). A batch freezes person, mailbox, address and rendered drafts under a hash; approving on the page or with :+1: on the Slack card calls the same `approveBatch`, which claims the row once (a second click or a Slack retry finds it approved and queues nothing). The Slack card lists every person; `3 skip` on the thread removes a line before approval. |
| Communications | One outbox and contact history (`sourcing_runs`, `sourcing_events`); a run stays on the mailbox that sent step 1; any reply stops the run, including one Lily sends by hand from Gmail (detected as our own message the desk did not send); a mailbox whose sync fails or is stale over two hours stops sending; a send that times out is reconciled by searching the mailbox before any retry; the never list and the relationship checks run again in the second before each send; sending and discovery pause separately (sequence `sending` off vs simply not pressing Find or Read); reply processing does not need model budget (a classification failure leaves the run stopped as "other"). "Not interested" and "do not contact" are honoured with silence; "not now" with a date becomes a `revisit` event; out of office pauses until the return date. |
| Opt-out and identity | The default first email carries "reply no thanks and I will not write again"; a "do not contact" reply lands on the never list for every search. No List-Unsubscribe header, no tracking, plain text. The $1,000 referral line is not in the default sequence; the optional third step Lily can add says "I would be glad of the name" and promises nothing. |
| Reusable evidence record | `sourcing_people` is one row per human, found again by Apollo id, LinkedIn URL or candidate id across every search; enrichment happens once and `enrichment_credits` says what it cost. |

### 10.2 Setup Lily still has to do

1. **APOLLO_API_KEY** in Vercel: a team master key from Apollo settings. Without it "Find people" still reads the bench and reports the Apollo error in its note; "Read the pool" does nothing.
2. **Mailboxes.** lily@refery.io is on the list already with the desk's own token, cap 20 a day rising to 50, 10 a day kept for recaps and desk mail. Adding lily@getrefery.com and kim@getrefery.com needs one of: `GOOGLE_SERVICE_ACCOUNT_JSON` in Vercel plus domain-wide delegation of that service account's client id in each Workspace organisation for the scopes gmail.send and gmail.readonly; or a refresh token per mailbox from the existing Google connect flow. The Mailboxes page says which is configured and "Test" proves a credential before it is used.
3. **Pilot on three searches** as the review asked: build, read, approve the profile; find people; read the pool; mark ready; propose a batch; approve it. Watch the Board and Replies pages and the mailbox stats for a week before adding mailboxes or raising caps.

### 10.3 Not built yet

- Automatic mode with an audit sample and an exceptions queue.
- Writing sends into the `/outreach` hub tables (the desk's own tables are the record for now).
- Creating a desk candidate from an interested reply (the reply is posted to #refery-desk with a link; the candidate is added by hand).
- Specter and Serper as discovery sources; the pool is Apollo, the bench and by hand.
- A calibration set per role (the grader learns from "not a fit" reasons on the next brief rebuild, not from a held-out shortlist).
