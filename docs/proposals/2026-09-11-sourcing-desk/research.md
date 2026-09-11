# Research notes for the Sourcing desk proposal

Collected 11 September 2026 in three passes: (1) Juicebox and Pin, (2) the wider field and the outbound-sales sequencers, (3) data sources, sending infrastructure and model costs. Prices drift; every figure carries its source. Where two sources disagree the note says so.

---

## Pass 1: Juicebox (PeopleGPT) and Pin

Evidence: both vendors' own docs (docs.juicebox.ai has 268 pages; docs.pin.com about 45), pricing pages, trust centres, Product Hunt, Capterra, comparison blogs (Herohunt, Noon, MindHunt, SkillScouter) and each vendor's attack pieces on the other. G2 blocked fetches.

### Juicebox

**Company.** YC S22, founders David Paffenholz (CEO) and Ishan Gupta. PeopleGPT search shipped late 2023. $30M Series A (Sequoia, Sep 2025) at $10M+ ARR / 2,500 customers; $80M Series B at $850M valuation (DST, 10 Mar 2026), "tripled ARR since Series A", 5,000 customers, ~65 staff. Self-serve, no sales team until recently.

**Workflow.** Container = Project, auto-filled from the ATS job when names match. Inside: Search, Agent, Shortlist, Sequences, Insights, Intake. Search is defined by natural-language prompt (recommended), "similar profiles" from a LinkedIn URL, JD upload, boolean, or manual filters. The prompt is parsed into two objects: Filters (hard requirements that remove: location, titles, companies with an "Ask AI" smart field, industries, skills OR by default with a pin for AND, education, languages, years min or max, funding stage and investors, developer data, security clearance, Power Filters, "Likely to Switch", contact availability, ATS presence) and Criteria (plain-English ranking instructions, re-orderable; non-matching candidates sink; every profile gets a per-criterion verdict: Good Match, Potential Fit, Not a Match, with evidence snippets). Results: Classic list, Table, Insights; up to 5,000 profiles evaluated per search. Shortlist: table or kanban, eight default statuses (Not Contacted, Email Sent, InMail Sent, Interested, Interviewing, Hired, Rejected, Not Interested), notes, tags, hiring-manager review (Pending, Approved, Not a Fit, Skipped), Smart Report PDF. Outreach: select on shortlist, Add to Sequence, choose email preference (personal, professional, or personal-with-fallback), preview every rendered email, send. Enrolment blockers: already in an active sequence, no email, missing variable. Warnings: contacted in last 90 days, shortlisted in another project. Reply handling: any reply stops the sequence for that person; the user labels Interested or Not Interested; the platform auto-drafts a reply. ATS: Business only, 100+ connectors via Merge and Kombo. Agents at $199 per agent per month: calibrate on ~3 consecutive approvals, daily lead target, outreach mode, auto-pause after 4 idle days. Intake records HM calls with a bot. MCP server (mcp.juicebox.ai/v1) on paid plans.

**Data.** "800M+ profiles, 30+ data sources" compiled by unnamed partners; 200M with contact data. Email finding is a bought waterfall: ContactOut and RocketReach, then Kickbox verification. Badges: verified, unknown, low deliverability. Refresh after 30 days. Guarantee: 95% deliverability on verified emails if revealed within 48 h and sent through Juicebox, shortfall refunded in credits. No published find rate; third parties report bounces outside North America and Western Europe and 70 to 80% overlap with LinkedIn results.

**Pricing (repriced 21 July 2026).** Free: 5 one-off credits. Starter $119/mo or $99 annual: 1 seat, 500 credits/mo, 500 export credits, 1 mailbox. Growth $199/mo or $179 annual per seat, up to 5 seats: 1,500 credits per seat, 3 mailboxes per seat. Business custom, annual only: unlimited credits, 2,250 export credits per seat, 6 mailboxes per seat. Agent add-on $199 per agent per month, no annual discount, unlimited credits. Credit = 1 per email (personal or professional), 3 per phone, 1 export per profile; charged only on success; no rollover. Free trial is usage-based: 5 searches, 65 profile views, 5 credits. Gated to Business: ATS, HM seats, network sourcing, SSO, analytics.

**Quality claims and complaints.** Claims: "3x replies", "5x faster shortlists", example analytics 55% open / 30% click / 16% reply / 10% interested; personal emails +40% replies; final step sent on behalf of a founder +50%; 3 to 5 steps capture 95% of replies; steps 2 to 3 days apart; send 9 to 12 local time. An arXiv study (2504.02463, 48 queries, 8 recruiters) ranked Juicebox above LinkedIn Recruiter. Complaints: Product Hunt 3.5/5; a Business buyer "shocked" ATS and HM seats were not included; stale titles and employers; bounces outside NA and EU; email is the only automated channel; AI ranks juniors for senior roles; costs stack across seats and agents; LinkedIn suspension reports tied to heavy extension use (from Pin's comparison posts, partisan).

**Mailbox limits.** Gmail, Outlook or IMAP via OAuth (Nylas); SOBO mailboxes. Daily cap per mailbox: floor 20, default 100, self-serve up to 200, Business admin up to 500; fixed 120-second interval. Docs: warm new domains 4 to 6 weeks from 20 a day, new mailboxes 2 to 3 weeks; bounce under 3%, complaints under 0.1%; turn tracking off on new domains. No built-in warm-up.

**Models and stack.** Trust centre lists Anthropic and OpenAI as model providers, Braintrust and Humanloop for evals, Algolia for search, Supabase for database and auth, Nylas for mailboxes, Twilio and SendGrid for transactional mail, Deepgram and Recall for Intake transcription.

### Pin

**Company.** Love Thy Recruiting, Inc. Founder Steven Lu (built Interseller, sold to Greenhouse). Out of stealth Dec 2024 with $3M seed led by Expa. 600+ customers within 40 days; "20,000+ users, 1,800+ orgs" in the May 2026 study; ~24 staff; SOC 2 Type 2. Kanban CRM launched May 2026.

**Workflow.** Container = Job (company, title, JD text with location and hard requirements written in: "Pin is only as good as you instruct it"). Search by filter panel (titles, skills AND, location with 50-mile radius, years, companies or company presets, seniority, industry, department, tenure; any criterion can be Required; paste a résumé to seed skills) or AI Chat (paste a JD or one-liner, refine conversationally, bulk-disposition by fit score, voice input; English only, one search per job, no protected-class filters). Results: one card at a time with a numeric Fit Score (0 to 100 on marketing, 1 to 10 in agent docs), AI reasoning and criteria matches; accept or decline each; after ~10 decisions Pin proposes "smart refinements". Keyboard: J/K, Enter, D decline, O outreach, F shortlist, R comment, U undo. Manual adds: CSV, LinkedIn URLs, Chrome extension on a profile, 1st-degree network via CSV export. Sequence per job: Email (automatic), Email (manual queue), manual task, call or voicemail drop, text message (opens the computer's messaging app); LinkedIn steps are tasks with copy-to-clipboard, no automated connection requests or InMail (ToS). Marketing defaults: Day 1 email, Day 3 LinkedIn, Day 5 or 6 email, Day 8 or 9 SMS, Day 12 email. Settings: send days and time blocks, US holiday pause, open and click tracking toggles, threading per step (Reply to Email locks the subject, or New Email Thread), email lookup preference (Personal only, Personal first, Work only, Work first; fires on enrol), missing-email fallback, no attachments. Reply handling: any reply marks the person Responded team-wide and halts automation permanently; automations for interested (auto-schedule), not interested (archive), unresponsive (nudge). Inbox buckets: Needs Attention, Interested, Not Interested, Unresponsive, Archived. AI scheduling reads the thread and the calendar and proposes a slot. Outreach error queue with 7 types: previously messaged (180-day lookback), missing email, previously unsubscribed, bounced, found in ATS, company preference blocked, in another sequence. Pipeline stages Sourcing, Applied, Outreach, Interviewing, Inbox, Archived, Hired. AI Agent (Professional+): ~5 calibration cards, fit threshold, route to shortlist or outreach, daily cap 10 to 100. ATS via Kombo, push candidate only. MCP (mcp.pin.com/mcp, paid, beta): create_job, modify_search, get_candidates, accept and reject; create_job and modify_search burn a credit.

**Data.** "850M+ profiles, 100% coverage in North America and Europe, dozens of data providers"; 1 credit per email, 1 per phone (needs an email attempt first), charged on success; no providers named; no find-rate published. Reviewers note inaccurate scraped phones and emails and weak boolean.

**Pricing (Sep 2026).** Free: 1 seat, 5 credits a week, 1 job, 3 searches a day, 50 reviewed candidates a week, email-only sequences. Solo $99/mo annual only: 500 credits, 1 mailbox, multichannel, scheduling. Professional $135/user/mo annual ($179 monthly): 1,000 credits per seat, 5 mailboxes per user, agents, shared inbox. Business custom (Herohunt: $225 annual, 2,000 credits per user): unlimited, premium ATS, SSO and SCIM $150/mo each. Credit packs: "$50 per 500" on the pricing page, "250 for $50" in the docs; assume $0.10 to $0.20. No rollover. Older prices ($100/$149/$249) still circulate and are stale.

**Quality claims.** 5M-message study (May 2026): AI-drafted cold email 4.97% reply (4M+ sends), open 56.7%; AI LinkedIn messages 16.9%; hand-written first email 12.59% (5K); reply by step 5.5 / 5.4 / 4.2 / 3.3 / 2.9%, under 1.7% after step 6; 800 to 1,200 characters best; 45% of drafts human-reviewed. Marketing pages: "15% median reply", "9% interview rate", "97.8% inbox deliverability", "26% reply" on the agent page, "48% response across email and SMS" in an April 2026 release, 83 to 84% HM acceptance of shortlists. G2 4.8/5 on 27 reviews; Capterra 5.0 on 2.

**Mailbox limits.** Own Gmail or Microsoft 365 via OAuth (Workspace admins must allowlist the Pin app). Send interval 2, 5 or 10 minutes per mailbox; docs recommend at most 300 a day per address; no warm-up service in the docs despite marketing claims of "own sending infrastructure, warmed domains, inbox rotation".

**Models and stack.** Subprocessors: Anthropic, OpenAI, Google Gemini through OpenRouter; Langfuse for tracing; Unipile for messaging access; Kombo for ATS; Loops for transactional mail; AWS. Steven Lu told VentureBeat "we've built our own foundational models to read every resume"; assume an in-house ranking model plus frontier LLMs for reasoning, drafting (calibrated on five sample messages from your sent folder), chat and scheduling.

### What both do that a home-built tool must copy

1. Two-layer search: hard filters that remove, natural-language criteria that rank, per-criterion verdict and evidence on every card.
2. Decision-first review: one card at a time, keyboard-driven, learning from ~10 decisions.
3. Reveal-on-demand contacts billed per success, verification state visible, personal-vs-work preference with fallback.
4. Sequence = steps with relative delays, per-step sender, thread vs new thread, variables plus one AI-personalised sentence, preview before enrol, test send.
5. Stop-on-reply that is global, plus pre-enrol collision checks (in another sequence, contacted in 90 or 180 days, bounced, unsubscribed, in ATS) split into errors and warnings.
6. Reply triage buckets that write back to status, with an auto-drafted reply.
7. Mailbox hygiene: own Gmail or Outlook via OAuth, 100 to 300 a day cap, 2-minute spacing, tracking off on new domains, SOBO from a founder.
8. Agent loop: calibrate on 3 to 5 approvals, daily cap as a ceiling, route to shortlist or outreach, pause on inactivity, one-line rejection reasons.
9. Statuses as a small fixed vocabulary, admin-editable extras, HM review pass.
10. ATS push on triggers with an undo window.

### What they charge vs what it costs them

Contact credits: Juicebox Starter $99 / 500 = $0.20 per credit, Growth $0.12; Pin Solo $0.20, Professional $0.135, packs $0.10 to $0.20. Both charge only on success and both are middlemen (Juicebox names ContactOut, RocketReach, Kickbox). Public list prices for those APIs are in the low tens of cents per success, so gross margin on the credit line is roughly 30 to 60% and the subscription is the profit. Search is unlimited on every paid tier at both, which says the re-ranking cost per query is small enough to bundle. Sending is the user's own mailbox at both. Juicebox at ~$30M ARR / 5,000 customers is about $6K ACV.

Sources: juicebox.ai/pricing, docs.juicebox.ai (search, filters, criteria, email-outreach, add-profiles, sequence-tracking, email-integrations, email-deliverability, contact-data, all-about-credits, juicebox-agents, shortlist-profiles, profile-status, hiring-managers, ats-integrations, juicebox-mcp, intake), trust.juicebox.ai, techcrunch.com (Series A), businesswire.com (Series B), ycombinator.com/companies/juicebox, usagepricing.com (July 2026 change), noon.ai, herohunt.ai, mindhuntai.com, skillscouter.com, producthunt.com, arxiv.org/html/2504.02463v1; pin.com/pricing, pin.com/features (ai-sourcing, automated-outreach, ai-recruiting-agent), docs.pin.com (searches, shortcuts, ai-chat, creating-a-new-job, sequence, email-threads, email-lookup-preferences, email-sending-limits, connect-additional-email-accounts, custom-tasks, outreach-error-preferences, conversations, calendar-preferences, ai-agent, understanding-lookup-credits, free-mode, billing, ats-and-crm-integrations, pin-mcp), trust.pin.com, pin.com/blog (ai-vs-human-recruiting-outreach-study, sourcing-benchmarks-report, recruiting-outreach-benchmark-report, linkedin-inmail-automation), venturebeat.com, capterra.com, herohunt.ai/blog/pin-pricing-2026.

---

## Pass 2: the wider field and the outbound-sales sequencers

### Recruiting players

**Dover.** Paste a JD link; Dover parses it, shows a shortlist from "200M+ profiles", auto-drafts a personalised email per candidate, "Full Auto" emails "100+ candidates a week" and surfaces only interested replies. Data: LinkedIn (extension) plus own index; built-in Find Email; no email means the candidate cannot be sourced. Sends from the user's authorised address. ATS $0, Premium $199/mo; Autopilot free for new users. No published reply rates.

**Gem.** Talent CRM plus sequences; extension on LinkedIn; admins cap sends per day and per minute per sender. Gmail via official Google APIs with OAuth (Send and Read scopes), Outlook via Nylas; aliases and SOBO. List from $99/user/mo (Essentials) and $270/mo (Startups, 500 AI sourcing credits); Vendr median annual contract $24,900. 2026 report: 6.2M sequences and 15.5M messages in 2025; 4-step sequences get 2x replies and a 68% higher interested rate than one email; first email 58% of replies, follow-ups 42%; sourced applicants 5x to 8x more likely to be hired than inbound.

**hireEZ.** 800M to 1B+ index, AI match, sequences over email, SMS and LinkedIn tasks; "EZ Agent" since March 2025. Contact credits 100 per user per month on Startups, ~4,000 org-wide on Professional; vendor claims 85% contact-finding, users report bounce rates up to 30%. ~$169 to $250+ per user per month; Vendr median $13,000 a year. One case study: 18.1% reply.

**SeekOut.** 1B+ profiles (LinkedIn, GitHub, Stack Overflow, patents, publications); 2026 agentic sourcing from a JD; MCP integration; managed "Spot" service. Recruit Lite $2,150/yr; Essentials $3,000 to $6,000 per seat per year; Professional $5,000 to $9,000; Enterprise $8,000 to $15,000+.

**Paraform.** Marketplace: ~10,000 vetted recruiters pick roles; AI matches a recruiter's existing pool to open roles. Success fee 20 to 25% of first-year base, recruiter keeps 80%, 90-day replacement. $40M Series B March 2026. No outreach engine.

**Mercor.** Inbound supply: candidates upload a CV and sit a ~20-minute AI video interview; vector match against JDs; ~35% take rate on hourly, ~30% on perm; ~$2B gross run rate June 2026. No cold email.

**Wellfound (Reach, Autopilot).** Unlimited sourcing agents on 10M+ opted-in candidates plus 500M+ external profiles; multi-stage templates with follow-ups; sends "from your real email". Free (20 reveals, 3 agents); Starter $135/mo (250 reveals); Growth $199 (1,000 reveals, ATS); Recruit $250 per seat; Autopilot $500 per role per month plus 10% placement fee. Opted-in candidates reply at a 50% higher rate than external ones.

**Fetcher.** AI picks from ~500M profiles, Fetcher's team reviews, email-only drips; hard cap 500 (Growth) or 1,000 (Amplify) sourced candidates a year. $379/mo annual ($499 monthly); Amplify $649. One case: 29% response; Pin says typical headhunting response is 5 to 8%.

**Findem.** Attribute search over 1B+ people; Sourcing Copilot; "Intelligent Job Posts" as autonomous sourcing agents; sequences with Gmail and Outlook connectors. ~$6,000 per seat per year; deployments $25k to $100k+.

**Moonhub.** Absorbed by a larger company; was $5k per month per search.

**SourceWhale.** Extension captures LinkedIn, GitHub, Stack Overflow profiles; waterfall across ~30 providers; email, LinkedIn, SMS, WhatsApp, call tasks; native dialler. $200 to $290 per user per month; ~$11,604 average contract.

**Metaview.** AI Sourcing from a JD, intake call or lookalike, weighted against past hires; Outreach launched February 2026 email-only, March added manual LinkedIn, call and SMS steps; drafter pulls role brief, ATS record and interview history; auto-pause on any reply, a Calendly booking or a scheduled interview. Sourcing Free (100 profiles), Pro $100/user/mo (200 profiles), Max $300 unlimited; sending free; enrichment 500 credits per workspace per month, 3 per email, 10 per phone.

**Perfect (GoPerfect).** Semantic search across 800M+ profiles, explainable 1 to 5 Match Card, unique message per candidate, multichannel with follow-ups, Autopilot; 9 ATS integrations; $23M raised. $250 per open role per month, ~2-seat annual minimum. Claims 55% "candidate acceptance" vs 29% industry.

**Apriora (Alex).** AI interviewer only; $10k to $35k a year.

**2025 to 2026 seed crop.** Perfectly (YC W26): agent "Paul" does sourcing, outreach, screening into Slack; success fee only. Dex (London): $5.3M seed April 2026; conversational talent agent; candidates opt in; 20 to 30% fee. OpenJobs AI ("Mira"): sources, drafts JD, outreach, scheduling. Tezi ("Max"): $9M; 750M profiles; per role or per hire. HeroHunt.ai: $149/mo (3 roles), $249 (10), $499 (20). Contrario: GNN matching, ~25% fee. Ten US AI-recruiting startups raised $656M between July 2025 and July 2026.

### Outbound-sales sequencers

| Tool | Cheapest tier | Mailboxes and limits | Connection | Warm-up | Unified inbox | Reply detection |
|---|---|---|---|---|---|---|
| Instantly | Growth $47/mo ($37.60 annual): 5,000 emails, 1,000 contacts | Unlimited mailboxes; Hypergrowth $97: 125k emails | OAuth Google and Microsoft, SMTP/IMAP | Unlimited, included | Unibox from Hypergrowth | Reply, bounce, OOO tags; auto-stop |
| Smartlead | Base $39/mo ($32.50 annual) | Unlimited mailboxes and warm-up | OAuth + SMTP/IMAP | Unlimited | Master Inbox on all plans | Auto-categorises, stops, bounce handling |
| lemlist | Email Pro $79/user/mo ($63 annual) | 3 senders per user; extra $9 | OAuth, SMTP | lemwarm included; 3 to 4 weeks before live | Yes | Stop on reply; OOO |
| Saleshandy | $34/mo | Unlimited accounts | OAuth + SMTP | Unlimited via TrulyInbox | Yes | Reply, bounce, OOO |
| Reply.io | $49/user/mo annual: 1,000 contacts, 5,000 emails | Unlimited under fair use | OAuth + SMTP | Included | Yes | Yes |
| Apollo sequences | Free basic; paid from ~$49/user | Default 50 emails per mailbox per day, 100 per domain | OAuth | Built-in warm-up removed; points to MailReach or lemwarm | Yes | Open and reply tracking, rotation |
| GMass | $29.95/mo | Gmail caps (500 / 2,000) | Inside Gmail | None | Inside Gmail | Auto follow-ups stop on reply; bounce suppression |
| Mailmeteor | $4.99/user/mo; Pro $24.99 for sequences | Gmail caps | Gmail add-on | Paid plans | No | Weak |
| Woodpecker | $29/mo: 500 prospects, 6,000 emails | Per slot | SMTP/IMAP + OAuth | Per slot | Yes | Stops follow-ups on reply |

Open source and self-hosted: Warmbly (Apache 2.0; OAuth Gmail and M365, warm-up pools, branching sequences, business-hour windows, unified inbox classifying positive, OOO, unsubscribe, bounce; free cloud tier to 10 mailboxes). cold-cli (MIT, 18 stars; Gmail API via OAuth, YAML sequences, threaded follow-ups, reply detection via In-Reply-To then thread id, bounces via X-Failed-Recipients, global unsubscribe list, 90 to 140 second random gaps, per-account caps and windows, per-lead time zone). Mautic (PHP, campaign builder, community-maintained since late 2024). Twenty CRM (issue #20939 "email sequencer like Apollo" marked Done May 2026, unverified in product). listmonk (newsletters, no drips). Plunk (own SMTP, not Gmail identity). gtm-mcp (Apollo search, classify, sequences, push to Smartlead).

### What the best-in-class tools agree on

- Google's hard limits: 2,000 messages per day paid Workspace (500 on trial), 3,000 unique recipients. The practical cold cap is reputation: new mailbox 10 to 30 a day, warmed 30 to 50, ceiling 50 to 100. MailReach ramp: 20, 30, 45, 60. Apollo hard-codes 50 per mailbox and 100 per domain. Recruiting-specific guidance (Noon): a few dozen a day per mailbox, ramp over three to four weeks.
- Warm-up: 4-week minimum by the vendors' own guides; Instantly says private pools place 20 to 30% better than public ones; Apollo dropped its own warm-up. Compliance floor: SPF, DKIM, DMARC; spam complaints under 0.3% (Google mitigates after 7 days under); one-click unsubscribe for marketing mail at 5,000+ a day; enforcement ramped November 2025.
- Spacing: 120 to 300 seconds between sends, randomised; business hours in the lead's time zone. Instantly: stable patterns yield 15 to 20% more replies.
- Threading: steps 1 to 3 in the same thread (In-Reply-To, References, "Re:"), break the thread at step 4+; same-thread follow-ups report ~92% open because they bump the thread. Caveat: if message 1 went to spam the follow-up is invisible.
- Stop-on-reply: any inbound halts (Metaview: any inbound, not keyword-filtered; also pauses on a Calendly booking). OOO by phrase matching, treated as not-a-reply, follow-ups paused to the return date. Bounces via DSN or X-Failed-Recipients; keep bounce rate under 2 to 3%.
- Sequence length: 3 to 4 emails over 2 to 3 weeks. Pin: message 1 = 43.8% of replies, 2 = 33.7%, 3 = 15.7%, 4 = 4.5%; three touches capture 93%. Gem: 4-step 2x. Noon (844k sequences): day 0, 3 to 4, 7 to 8, 12 to 14; steps 2 to 4 carry 55% of replies.
- Personalisation: first-name token 5.13% vs 2.61% (Pin); recruiter-written 6.31% vs automated 4.96% (Pin); GMass: personalised 2x; lemlist: research-based openings 4 to 8% vs 1 to 2%, ~120-word emails book 52% vs 20% for 300 words; Pin's recruiting optimum 150 to 199 words, 5 to 6 word subject; Gem 2026: sequence length matters more than personalisation.
- Reply benchmarks: Pin email 4.96 to 6.31%, LinkedIn 17.08%, engineering 4.64%, PM 9.94%, email + LinkedIn two-step 45.8% vs 19.7% email-only; best days Thu and Wed; median reply in 4 hours, 75% within 24 h. Fetcher 5 to 8% typical; hireEZ case 18.1%; Instantly platform average 3.43%, top quartile 5.5%; lemlist "above 5% good, above 8% excellent"; under 3% signals deliverability or targeting failure.
- Email find rates: only hireEZ publishes one (85%, contradicted by 30% bounce reports). No vendor publishes a verified-deliverable rate for personal emails.
- Sending identity: recruiting tools send from the recruiter's own connected Gmail or Outlook via OAuth; sales tools scale by adding cheap mailboxes on secondary domains; the sales side converges on 30 to 50 cold a day per warmed mailbox.

Sources: dover.com, help.dover.com, noon.ai, help.gem.com, gem.com (security, 2026 benchmarks), pin.com/blog (gem-pricing, hireez-pricing, seekout-pricing, fetcher-pricing, findem-pricing, pin-vs-sourcewhale, recruiting-outreach-benchmark-report), paraform.com, frontlines.io, herohunt.ai (Mercor, Moonhub, Tezi, best-autonomous-ai-recruiters-2026), reach.wellfound.com, hireinsouth.com, syncgtm.com, mindhuntai.com, metaview.ai, goperfect.com, staffingindustry.com, ycombinator.com/companies/perfectly, fortune.com (Dex), hrtechnologyinsights.com, secondtalent.com, cleanlist.ai (Instantly), instantly.ai/cold-email-benchmark-report-2026, emelia.io, astragtm.io, enrich.so, lagrowthmachine.com, scaledmail.com, knowledge.apollo.io, coldemailpick.com, gmass.co, mailmeteor.com, saleshandy.com, warmbly.com, github.com/andersmyrmel/cold-cli, github.com/twentyhq/twenty/issues/20939, mailflowauthority.com, listmonk.app, starlog.is, mailreach.co, puzzleinbox.com, mailivery.io, support.google.com/a/answer/14229414, allegrow.co, reviewmyemails.com, whali.co.uk, help.hunter.io, lemlist.com.

---

## Pass 3: data sources, sending infrastructure, model costs

### Headline conclusions

1. Discovery is nearly free on what is already paid for: Apollo `mixed_people/api_search` costs 0 credits and returns up to 50,000 records per query (last names obfuscated, no emails), GitHub user search is free (30 requests a minute), OpenAlex gives $1 a day free, Exa gives $10 a month free credit. Pay-per-profile sources (PDL $0.28, Coresignal $0.20 at the cheapest tier, Enrichlayer $0.02 to $0.10) only make sense for gaps.
2. Email finding is the real variable cost, not the LLM: $0.005 to $0.05 per found work email depending on tool, 40 to 70% find rate on tech candidates. Personal emails cost 2 to 3 credits and are legally the riskier channel for UK and EU candidates.
3. Sending from Workspace is $0 marginal. `gmail.send` is a sensitive scope, not restricted; an Internal-user-type OAuth app or a service account with domain-wide delegation inside your own Workspace needs no Google verification and no CASA. Both domains can sit in one Workspace tenant as a primary plus a secondary domain or domain alias.
4. LLM layer for 10 searches, 300 candidates each, 3-step sequences: roughly $8 a month on GPT-5 mini, $25 on Claude Haiku 4.5, under $2 on GPT-5 nano or Gemini 2.5 Flash-Lite; halve with batch APIs. Embedding 100k profiles is $1.60 on text-embedding-3-small and $0 on Voyage (200M free tokens).
5. No open-source project does "source candidates + sequence from Gmail" end to end. Closest: OpenOutreach (2,967 stars, single-send) and Twenty CRM (56,599 stars, sequencer unverified). Assemble, do not adopt.

### A. Candidate discovery

**Apollo.** Plans (annual / monthly per user): Basic $49 / $59; Professional $79 / $99; Organization $119 / $149 (min 3 seats). Unified credit pool since late 2025. Credit overage not published; users report $0.03 to $0.10. `mixed_people/api_search`: 0 credits, no emails or phones, last name obfuscated on every plan, 100 per page, 500 pages, 50,000 display cap, 600 calls an hour on free. `people/match`: accepts LinkedIn URL, name + domain, email or id; 1 credit only if demographics or email found; +8 for a mobile; nothing on `match_confidence: none`; `reveal_personal_emails` exists but Apollo will not reveal personal emails for people in GDPR regions. Free tier dropped from 10,000 to 100 email credits a month for non-corporate signups; credits no longer roll over.

**People Data Labs.** $98/mo for 350 credits = $0.28 per record; $0.224 annual. Free 100 credits a month with emails obfuscated.

**Coresignal.** Mini $49/mo (2,500 credits), Starter $199 (12,000), Pro $499 (35,000), up to Elite $5,000 (10M); employee record 10 to 20 credits; $0.196 per profile on Mini down to $0.005 on Elite. **Crustdata.** Credit-based, $ per credit not published; person search 0.03 credits per result; enrich 1 credit base plus add-ons. **Enrichlayer** (ex-Proxycurl, which LinkedIn sued in January 2025 and which shut down 4 July 2025). Starter $588/yr for 35,000 credits ($0.0168); PAYG $10 for 100; person profile 1 to 3 credits; search 3 per result; work email 3.

**Web search for x-ray.** Exa $7 per 1,000 requests, $10 a month free; Websets Core $49/mo for 8,000 credits (10 per result), explicitly sold for candidate sourcing. Brave Search $5 per 1,000, free tier killed February 2026. Google Custom Search JSON API closed to new customers, existing users cut off 1 January 2027. SerpAPI $10 to $25 per 1,000 (Google sued SerpApi December 2025). Serper.dev $1 per 1,000 at the $50 pack, 2,500 free credits, no card. DataForSEO $0.60 to $2 per 1,000. X-ray (`site:linkedin.com/in`) still works because ~85% of profiles are public; run it through Serper or Exa. Budget: 3,000 queries a month = $3 on Serper.

**Free engineering and research sources.** GitHub Search API: free, 30 requests a minute authenticated on users and repositories, 1,000 results per query, qualifiers location, language, followers, repos; commit-email lookup yields ~30 to 40% emails. OpenAlex: API keys since 13 February 2026, $1 a day free per key. Google Scholar: no API.

**LinkedIn paid products.** Sales Navigator Core US$119.99/mo or $1,079.88/yr (50 InMail, 2,500 visible leads per search); Advanced $159.99/mo; Recruiter Lite $170/mo or $1,680/yr (30 InMail). Scraping position: hiQ v. LinkedIn settled December 2022 with a $500,000 judgment against hiQ and an injunction; LinkedIn v. Proxycurl (January 2025) closed the company by July 2025; LinkedIn's help page prohibits any extension that scrapes or automates, User Agreement §8.2 dated 3 November 2025; March 2026 transparency report claims 23.5M automated sessions flagged in one quarter. Scraping your own account through an extension is a contract breach with account loss as the sanction. Phantombuster $69 to $439/mo; Evaboot $39 to $139; TexAu retired its LinkedIn automations.

**Free or near-free.** Wellfound: employer-side only, agencies historically refused. YC Work at a Startup: founders only. Crunchbase: free API tier removed. Company team pages and speaker lists: $0 with a crawler; Exa contents at $1 per 1,000 pages.

### B. Work-email finding

Two independent benchmarks: Anymail Finder (5,000 US/UK/FR/DE B2B contacts, June 2026) and Dropcontact (20,000 contacts, live-sent, February 2026); both vendors rank themselves first.

| Tool | Entry price | $ per credit | Success-only? | Anymail coverage / accuracy | Dropcontact find / bounce | Personal emails? |
|---|---|---|---|---|---|---|
| Apollo `people/match` | included | ~$0.025 to $0.05 | Yes | 68.1% / 91.3% | not tested | Only via `reveal_personal_emails`, never for GDPR regions |
| Specter | needs a paid platform seat; prices not published; 200 trial credits; misses never cost a credit | unknown | Yes | not tested | not tested | unknown |
| Hunter | €49/mo 2,000 credits | €0.0245 | No | 57.6% / 86.1% | 38.9% / 11.2% | No |
| Snov.io | $29 to $39/mo 1,000 | $0.039 | 1 per found | 46.1% / 75.3% | not tested | No |
| Prospeo | $49/mo 1,000; free 100/mo | $0.039 | No (bulk deducts regardless) | 45.2% / 92.5% | not tested | No |
| Findymail | $99/mo 5,000 finder + 5,000 verifier | ~$0.02 | Yes; under 5% bounce guarantee | 70.9% / 95.6% | 42.5% / 1.1% | No |
| Icypeas | Basic $19/mo 1,000; Premium $39/4,000; Advanced $89/10,000 | $0.019 to $0.005; credits never expire | Yes | 49.0% / 99.1% | 33.9% / 1.0% | No |
| LeadMagic | $49.99/mo 2,000 | $0.025 to $0.0085 | Yes | not tested | 26.9% / 10.6% | Yes: Personal Email Finder, 2 credits, input LinkedIn URL, free if none |
| Datagma | $39/mo 1,000 | $0.039 to $0.012 | 1 per email, 30 per mobile | not tested | 48.9% / 10.6% | Has personal fields |
| Dropcontact | €79/mo 500 | €0.158 | Yes | 69.4% / 93.1% | 55.9% / 0.9% (own test) | No; EU servers |
| FullEnrich (waterfall) | €55/mo 1,000 | €0.055 work; personal 3 credits; mobile 10 | Yes | 87.1% / 95.7% | 57.0% / 3.6% | Yes, 3 credits |
| BetterContact (waterfall) | $15/mo 200; $49/mo 1,000+ | $0.075 to $0.049 | Yes; no charge for catch-alls | not tested | 41.9% / 4.7% | not stated |
| Clay | $134/mo (24,000 credits a year) | $0.13 to $0.50 per email | Yes | not tested | not tested | via providers |
| Persana | $68/mo | ~$0.034 | Yes | not tested | not tested | via providers |
| Anymail Finder | $149/mo 5,000 | $0.03 | Yes | 86.4% / 98.9% (own) | 55.4% / 15.8% (Dropcontact's test) | No |

Recommended waterfall: Apollo `people/match` (paid, no charge on miss), then Icypeas, then LeadMagic (also personal), FullEnrich only for high-value seats. Blended ~$0.02 to $0.03 per found email; find rate 65 to 80% on senior US/UK tech people, lower in DACH and France.

Personal emails and law: UK PECR + UK GDPR make no B2B/B2C distinction for individuals; a personal Gmail is personal data of an individual subscriber; legitimate interest with a recorded assessment, opt-out in every message, no excessive volume; PECR fine ceiling since February 2026 £17.5M or 4% of turnover. EU: Germany and Austria effectively opt-in for individuals; work-address outreach about a role is easier under Art. 6(1)(f). US: CAN-SPAM opt-out; a job-opportunity email is arguably not commercial; comply anyway (real From, working opt-out honoured within 10 days). Canada: CASL opt-in; CRTC says most recruitment messages are not CEMs; fines up to C$10M. Deliverability: complaints from personal Gmail recipients count toward Google's 0.3% threshold; Workspace and M365 recipients do not.

Pattern-guess and SMTP verify: Reacher `check-if-email-exists` (Rust, 9,574 stars, AGPL or €699/mo commercial; needs port 25, blocked on Vercel). AfterShip `email-verifier` (Go, 1,616 stars, MIT, active): syntax, MX, SMTP, disposable, role, catch-all flag; the right licence. Truemail (Ruby, dormant). Reality: Google Workspace and M365 answer catch-all to cold probes, so verifiers return "risky" for a large share of startup domains; commercial verifiers still mark 10 to 20% of tech-startup domains unknown. Practical: guess the pattern from Apollo or Hunter, run AfterShip, treat catch-all as "send once, watch for bounce".

### C. Sending from Google Workspace

**Limits.** 2,000 messages per user per day (1,500 mail merge, 500 trial, raised after $100 cumulative payment); Gmail API 500 recipients per message; 3,000 unique recipients a day, 2,000 external; SMTP relay 10,000 per account per day (transactional, not cold). Practical cold ceilings (mailreach.co, outboundsystem.com, howmanycoldemailsperday.com): new mailbox or domain 10 to 20 a day, ramp over 2 to 3 weeks; warmed 30 to 50, most operators at 30 to 40.

**Google's sender requirements** (support.google.com/a/answer/14229414). Bulk sender = close to 5,000 messages or more to personal Gmail accounts in 24 hours across the primary domain and subdomains; once flagged, permanent. The guidelines apply to mail sent to personal Gmail accounts. Below 5,000 a day: SPF or DKIM, valid PTR, spam rate under 0.1%. Enforcement since November 2025 is rejection, not deferral. One-click unsubscribe (RFC 8058) is required only for bulk senders' marketing mail; adding List-Unsubscribe headers to 1:1 mail signals bulk. SPF, DKIM and DMARC (p=none passes alignment) on both domains regardless; Workspace does DKIM.

**OAuth scopes and CASA.** Gmail scopes page: `gmail.send` and `gmail.compose` are sensitive; `gmail.readonly`, `gmail.metadata`, `gmail.modify`, `mail.google.com` are restricted. CASA is required for an External app in production requesting restricted scopes that moves user data through a third-party server: Tier 2 (self-scan reviewed by a lab, TAC Security $540 to $1,800 a year) or Tier 3 (~$4,500 a year), renewed every 12 months. Not required: (1) Internal user type, "all users within your organization can access; verification is not required", project in the same Workspace-owned organisation, restricted scopes included; (2) service account with domain-wide delegation authorised in Admin console → Security → API controls, impersonates any user, no consent screen, no verification (the restricted-scope page lists "used only by people in your Workspace or Cloud Identity organization" as exempt); (3) Testing status (100 users, tokens expire every 7 days, unusable for production); (4) personal use. Multiple domains: one Workspace account holds up to 600 domains; a domain alias is free and gives every user an extra address; a secondary domain creates separate licensed users; either way one organisation, so one Internal app or one delegated service account covers both. If getrefery.com is a separate tenant, an Internal app cannot serve it; delegate the same service-account client ID in the second tenant's Admin console, or go External and pay verification plus CASA. Scope minimisation: `gmail.send` to send, `gmail.readonly` (or `gmail.metadata`) for replies and bounces.

**Reply detection, threading, bounces, OOO, unsubscribes.** Push via `users.watch` + Cloud Pub/Sub: watch expires after 7 days, renew daily; Pub/Sub free tier 10 GiB a month; push endpoint can be a Vercel route. Polling `history.list(startHistoryId)` every few minutes from pg_cron: Gmail API quota 1.2 billion units a day per project; polling four mailboxes every 2 minutes is free and has no GCP dependency. Threading: set `threadId` on `messages.send` and `In-Reply-To` and `References` to the first message's `Message-ID`, and keep the same Subject; all three or Gmail starts a new thread. Bounces: From mailer-daemon@googlemail.com, `Return-Path: <>`, `Diagnostic-Code:` in the delivery-status part, original Message-ID in the attached headers. OOO: `Auto-Submitted: auto-replied|auto-generated` (RFC 3834), `Precedence: bulk|auto_reply`, `X-Autoreply`, `X-Auto-Response-Suppress`; fall back to subject patterns. Unsubscribes: a "reply STOP" line, a regex on inbound, a `do_not_contact` flag. Cost: $0.

**Warm-up.** Instantly $30 to $37/mo and Smartlead $33 to $39/mo bundle unlimited warm-up; Mailreach $25 per mailbox; Warmup Inbox $15 to $19; Lemwarm $29 to $49; Warmbox $19 to $29. Google has no written clause on warm-up; in late 2022 to early 2023 it revoked Gmail API access from warm-up senders (GMass shut warm-up 31 January 2023; Growbots' Warmbots dropped Gmail 31 May 2023) as artificial engagement against API policy; vendors moved to SMTP/IMAP. 2025 to 2026 deliverability writers describe warm-up networks as neutral to negative for Gmail-to-Gmail reputation. Cheapest credible approach: no paid warm-up; ramp real mail 10 to 40 a day over three weeks; let refery.io carry getrefery.com for a month.

**Tracking.** Gmail proxies images, Apple Mail pre-fetches, Gmail hides images on risky mail; opens are noise; pixel domains are a spam signal; Instantly and Allegrow recommend disabling open tracking on cold mail. Click tracking works but a rewritten link on a tracking domain is another signal; use a plain link to the `/j/<slug>` page and log the visit server-side.

### D. Model costs (prices as of September 2026)

Per 1M tokens (input / output; batch 50% off):

| Model | Input | Output | Cached input |
|---|---|---|---|
| Claude Haiku 4.5 | $1.00 | $5.00 | $0.10 |
| Claude Sonnet 5 | $2.00 | $10.00 | $0.20 (a September increase to $3/$15 was cancelled) |
| GPT-5 mini | $0.25 | $2.00 | $0.025 |
| GPT-5 nano | $0.05 | $0.40 | $0.005 |
| GPT-5.6 Luna | $0.20 | $1.20 | $0.02 |
| Gemini 2.5 Flash-Lite | $0.10 | $0.40 | |
| Gemini 3.7 Flash (intro to 31 Dec 2026) | $0.75 | $3.75 | $0.075 |

Embeddings: text-embedding-3-small $0.02/M, text-embedding-3-large $0.13/M; voyage-4-lite $0.02/M with the first 200M tokens free; Gemini Embedding 2 $0.20/M; local bge-small or nomic-embed-text $0.

Assumptions: profile ~800 tokens; scoring call = 1,200-token cached rubric + role + 800-token profile in, 250 out; first-email draft 1,500 in, 200 out; follow-up 800 in, 100 out.

Embed 100k profiles (80M tokens): text-embedding-3-small $1.60; text-embedding-3-large $10.40; voyage-4-lite $0 inside the free 200M. The pgvector index (228 MB HNSW exceeding 224 MB shared_buffers, from earlier work) matters more than the bill; 100k × 1,536 dims is another ~600 MB; use 512 dims.

Score 500 profiles against one role: Haiku 4.5 $1.63 ($1.09 cached, $0.55 batch); GPT-5 mini $0.50 / $0.37 / $0.19; GPT-5 nano $0.10; Gemini 2.5 Flash-Lite $0.15; Gemini 3.7 Flash $1.22.

Draft 500 personalised first emails: Haiku 4.5 $1.25; Sonnet 5 $2.50; GPT-5 mini $0.39; GPT-5.6 Luna $0.27; GPT-5 nano $0.08; Gemini 2.5 Flash-Lite $0.12.

Monthly, 10 searches × 300 = 3,000 candidates scored, all sent a 3-step sequence (3,000 first emails + 6,000 follow-ups), embeddings for 3,000 profiles + 10 JDs: all Haiku $25 ($13 batch); Haiku scoring + Sonnet 5 step-1 drafts + Haiku follow-ups $33 ($16 batch); all GPT-5 mini $8 ($4); all GPT-5 nano $1.60; all Gemini 2.5 Flash-Lite $2.40. Realistic mixed plan $20 to $30 a month, $10 to $15 with batch. Compare data: 3,000 × 70% find rate × $0.025 ≈ $52 a month of email credits if none were included; the LLM is not the cost driver.

### E. Open-source projects

| Project | Stars | Last push | What it does | Fit |
|---|---|---|---|---|
| eracle/OpenOutreach | 2,967 | 2026-09-07 | GPLv3 CLI: ICP → BetterContact finder → LLM fit → one email from your mailbox over SMTP with daily caps; no sequences, no reply detection | Closest in spirit; steal the send-guard and pacing |
| twentyhq/twenty | 56,599 | 2026-09-11 | Open CRM with Gmail and Calendar sync; sequencer issue #20939 marked Done May 2026, unconfirmed | Heavy; check the changelog |
| mautic/mautic | 10,490 | 2026-09-11 | Marketing automation with campaign builder, IMAP reply monitor | Wrong deliverability profile for 1:1 mail |
| erxes/erxes | 4,078 | 2026-09-11 | XOS suite | Too broad |
| opencats/OpenCATS | 743 | 2026-09-11 | PHP ATS, no outreach | No |
| knadh/listmonk | 23,370 | 2026-09-06 | Newsletters | Bulk, not sequences |
| reacherhq/check-if-email-exists | 9,574 | 2026-03-17 | Verifier, AGPL or €699/mo | See B |
| AfterShip/email-verifier | 1,616 | 2026-09-11 | Go verifier, MIT | Use this |
| growthenginenowoslawski/coldoutboundskills | 701 | 2026-08-18 | Claude Code skills for campaigns | Pattern reference |
| impecablemee/gtm-mcp | 67 | 2026-04-20 | Apollo search → classify → sequences → Smartlead | Right shape, paid sender |
| shravangithub/ai-recruiting-sourcing-pipeline | 2 | 2026-08-03 | n8n: x-ray, LLM ranking, enrichment, approved outreach | Tiny; literally this pipeline |

Verdict: nothing to adopt wholesale. The build is (a) discovery adapters, (b) a pg_cron email waterfall with a verifier, (c) the Gmail sender already in `lib/desk` extended with threaded follow-ups and a reply, bounce and OOO classifier on `history.list`, (d) structured-output scoring and drafting on a cheap model, batched overnight.

### Uncertainties

Crustdata and Specter do not publish $ per credit; Apollo's per-plan API limits beyond the documented 600 an hour are behind a login, and which endpoints a given key can hit should be tested, not assumed; Sales Navigator Core is $119.99 on LinkedIn's page but $99 in some guides; Twenty's sequencer status is unconfirmed; Findymail shows a single $99 plan while reviews cite a $49 tier; the "warm-up ban" is an API-access enforcement story reported by vendors, not a written Google policy.

Sources: apollo.io/pricing, docs.apollo.io (people-api-search, people-enrichment, api-pricing), warmly.ai, cleanlist.ai (PDL), coresignal.com/pricing, docs.crustdata.com, enrichlayer.com/pricing, linkedapi.io, exa.ai/pricing, exa.ai/docs/websets, implicator.ai (Brave), cloro.dev (Google CSE shutdown), searchcans.com (SerpAPI), coldiq.com (Serper, Prospeo), docs.github.com/en/rest/search, blog.openalex.org, business.linkedin.com (Sales Navigator), 100hires.com, pin.com/blog/linkedin-recruiter-pricing-2026, linkedin.com/help/linkedin/answer/a1341387, proskauer.com (hiQ), emelia.io (Phantombuster), derrick-app.com (Evaboot), texau.com, hireinsouth.com (Wellfound), ycombinator.com/jobs/ats, dev.to (Crunchbase), hunter.io/pricing, icypeas.com/pricing, leadmagic.io (pricing, personal-email-finder docs), bettercontact.rocks, fullenrich.com, dropcontact.com (pricing, benchmark), findymail.com, saleshandy.com (Snov), gtmarena.ai (Datagma), warmly.ai (Clay), pipeline.zoominfo.com (Persana), api.tryspecter.com/api-ref/plans, anymailfinder.com benchmark, leadistry.co.uk, puzzleinbox.com (PECR), crtc.gc.ca, help.reacher.email, github.com/reacherhq/check-if-email-exists, github.com/AfterShip/email-verifier, mailvalid.io, knowledge.workspace.google.com (sending limits, multiple domains, alias and secondary domains), support.google.com/a/answer/14229414, gmass.co, mailreach.co, developers.google.com (gmail scopes, oauth2 production readiness, restricted-scope verification, gmail push, threads), deepstrike.io (CASA), cli.nylas.com (DWD), cloud.google.com/pubsub/pricing, arp242.net (autoreply), smartlead.ai (warm-up costs), growbots.com (Google and warm-up), instantly.ai (tracking pixels), platform.claude.com pricing, developers.openai.com pricing, ai.google.dev pricing, docs.voyageai.com pricing, github.com/eracle/OpenOutreach, github.com/twentyhq/twenty/issues/20939, github.com/mautic/mautic, github.com/opencats/OpenCATS.
