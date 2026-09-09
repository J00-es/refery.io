# Invitation link, refery.io, and candidate self-submission

Proposal, 9 September 2026. Mockups: the design canvas "Invitation Link and Candidate Self-Submission" (23 artboards, four pages). Nothing in part 3 is built; part 1 shipped today as commit 6d4f459.

## 1. The invitation link speaks as Lily

Shipped 9 September. The campaign page at `/go/[slug]` now opens with "An invitation from Refery" and "Lily invited you to join Refery." The who-are-you step says "match you to the invitation" and "if the invitation was addressed to you". The sender field on `/admin/campaigns` is labelled "Sent by (internal, never shown on the page)", defaults to Lily, and is only written into `decided_by` for the record. Any channel can carry the same link: a scheduled DM, a cold email, a post, a signature.

## 2. refery.io instead of refery.xyz

What is true today:

- refery.io is the marketing site: Vercel project `refery-web` (Next.js 14, repo J00-es/refery-web, empty `next.config.mjs`). Domains: refery.io, www.refery.io.
- refery.xyz is the app: Vercel project `v0-hr-tool-with-ai-recruiter`, same team.
- DNS for refery.io is at Namecheap (registrar-servers.com nameservers), not Vercel.
- The app has no Google or LinkedIn OAuth, so a domain move touches no third-party consoles.
- refery.io/candidates links its "Apply" and "Get matched" buttons to refery.io/apply, which returns 404.

Recommendation, two steps:

1. **Redirects on refery.io, about an hour.** Add `redirects()` to the marketing site's `next.config.mjs`: `/go/:slug` to `https://refery.xyz/go/:slug`, `/join` to `https://refery.xyz/go/join`, `/apply` to the candidate page. Shared links carry refery.io; the address bar changes after the click. Nothing on refery.xyz breaks.
2. **The app on app.refery.io, half a day.** Add the domain to the app project on Vercel; one CNAME at Namecheap (`app` to `cname.vercel-dns.com`); add app.refery.io to the Supabase Auth site URL and redirect list; set the public app URL variable (every email, Slack, invitation and consent link is built from it); keep refery.xyz as an alias. Then refery.io/apply redirects to app.refery.io/apply and the candidate-facing pages read as refery.io.

Not recommended now: serving the app at refery.io/ itself. That means merging two codebases or proxying auth, uploads and API routes through the marketing site. Weeks, for a small gain over app.refery.io.

The candidate page lives in the app, not the marketing site: the CV parser, blob store, panel, consent page and design system are all there. The marketing site only redirects.

## 3. Candidate self-submission

### 3.1 What it is

A second, quieter door on the invitation link and a standalone page at refery.io/apply: a person open to a move shares a CV (PDF) and answers about twelve questions in three steps. They get a receipt the same minute. A candidate row is created exactly as a scout upload creates one, owned by Lily, with `intake_source = 'self'`. The panel reads it within a minute and the card lands in #refery-desk with the byline "shared their own CV at refery.io/apply · self-submission" and a "They say" block with their answers. Lily's five reactions and the emails they send are unchanged.

### 3.2 Principles

- Second door, second weight. On the invitation page the candidate card sits below the who-are-you step, on the well colour, no border emphasis.
- Same desk, one more byline. No parallel pipeline: same card, reactions, emails, bench, delivery.
- Preferences before anything. The facts the panel and matcher use (visa, base, city, relocation, setting, start) are chips, written to the columns that already exist.
- Heard either way. Two working days on the receipt; a pending note at 48 hours if undecided; never silence.
- Nothing shared without a yes. No company names on the page or in emails. A forward needs the person's tap on the existing one-tap consent page (`/c/[token]`), with Lily as the requester.
- No AI in the loop beyond what a scout upload already triggers: one CV extraction and one panel read, on the existing budget ledger. Gates before the parser keep junk from costing anything.

### 3.3 The screens (canvas page 2)

1. **Landing** (`/apply`): "Tell us once. Hear from us only when something fits." Three promises: nothing shared without your yes; you hear either way; nudged, not spammed. "Share my CV". "Already with us? Update what you're looking for" (sends a fresh private link by email).
2. **Step 1, CV**: drop zone, PDF only, 10 MB. After the parse: name, email, LinkedIn (optional), where you are now, prefilled to confirm.
3. **Step 2, what you want**: Right now I am (Actively looking / Open to the right thing / Not now, keep me for later). Where you'd work (SF Bay Area, New York, Other US hub, Remote US, UK or Europe, Elsewhere). Relocate (Yes / No / Depends). In the office (On-site is fine / Hybrid / Remote only). US work authorisation (the five options in `lib/desk/facts.ts`). Base you'd move for (the five bands). Current base (optional). Earliest start (Now / In a month / Three months or more).
4. **Step 3**: Stages (Seed / A / B / Later). Companies never to show me to (optional). Anything we should know (optional, 280). Explicit, unticked consent: keep for 24 months, share only after my yes to that role, pause or delete any time. "Send my profile".
5. **Done**: "Your profile is in." Review date. What happens next in three lines. Exception states: already on file (nothing created twice, update link emailed); not a CV (nothing kept).
6. **Private profile** (`/me/[token]`): status, shared-with-a-company count, kept-until date, what you told us (edit), CV (replace), pause, delete.
7. **A search fits**: the existing one-tap page, Lily as the asker.

### 3.4 Every message (canvas page 3)

Subjects follow `[Refery] Full name | context`, plain text from lily@refery.io, queued through the communications ledger.

- **CS1 receipt** (essential, minute 0): "[Refery] {Full name} | Your profile is in". Review date two working days out; nothing shared without your yes; the private link.
- **CS1-dup**: "[Refery] {Full name} | Your profile, already with us". Never names the owner.
- **CS2 intro now** (existing, panel-drafted): "[Refery] {First} / Lily | 15 min this week?".
- **CS3 keeping you in mind** (existing): "[Refery] {First} / Lily | keeping you in mind".
- **CS4 a candid note** (existing): "[Refery] {First} / Lily | a candid note".
- **CS5 may I put you forward?** (new, rule-driven after Lily reacts on a seat card): "[Refery] {Full name} | a search that fits, may I put you forward?" with the one-tap link. One per person per 72 hours on the optional budget.
- **CS6 still open?** (new, every six months while kept in mind and untouched): three one-tap answers. 24-month lapse pauses the profile.

Slack: the decision card gains the byline and the "They say" block; #refery-desk-feed gets one line for duplicates, non-CVs, blocked bursts, pending notes, pauses, deletions and consent taps.

### 3.5 Rules and stops (canvas page 4)

| When | What | Only if | Stops when |
|---|---|---|---|
| Minute 0 | Gate, store, parse, duplicate check, create, CS1 | Turnstile and honeypot pass; PDF ≤ 10 MB; reads as a résumé; consent ticked | Duplicate: CS1-dup. Not a résumé: nothing kept |
| Minute 1 | Panel read, card | Insert trigger, as today | Budget deferred: retried |
| 48 hours | Pending note, card overdue | No reaction | Any reaction |
| A seat goes live | Bench re-match; Lily reacts; CS5 | Kept in mind, not paused, consent valid, not on their never-list | Their no; a pause; a yes |
| Every 6 months | CS6 | No activity in 90 days | Any tap; conversation; paused; deleted |
| 24 months | Consent lapses, profile paused, last CS6 | Never renewed | A renewal tap restarts the clock |
| Delete | CV and answers removed within 30 days, dated record stays | Their tap | Conversation open: Lily told first |

Gates before the parser: Cloudflare Turnstile, honeypot, one submission per email per 30 days, five per address per hour, PDF only, the existing `looksLikeResume` check. Disposable domains flagged, never blocked.

Privacy, matching refery.io/candidates: never public, never listed, shared only after a dated yes per role, never-list honoured by rule, pause same minute, delete within 30 days, 24-month retention with explicit unticked consent and a six-month check-in. A self-submitted person is owned by Lily; no partner attribution is created.

### 3.6 Data

`candidates` (existing, written by the form): `intake_source = 'self'` (new allowed value; the check constraint today allows referred, sourced, calibration, inbound, unknown); owner columns on Lily's account as inbound CVs do; `visa_status`, `salary_expectation_min/max`, `current_base`, `location`, `allowed_locations`, `relocation_ok`, `remote_preference`, `allowed_stages`; same blob bucket, parser and embedding.

`candidate_profiles` (new, RLS on, no policies): `candidate_id`, `token` (32 hex, unique), `looking` (looking / open / later), `start_by`, `never_companies text[]`, `notes`, `consent_at`, `consent_version`, `consent_until`, `checkin_sent_at`, `paused_at`, `deleted_at`, `source` (apply / go), `source_campaign`.

### 3.7 Research summary

- Applications under 5 minutes complete at 12.47%, over 15 minutes at 3.61% (Pin, 2026). Ours: three steps, about twelve answers, the CV does the typing.
- 53% of job seekers were ghosted by an employer in the past year, up from 38%; 59% call silence the biggest problem (Criteria Corp 2026 via Pin). Ours: heard either way in two working days.
- Talent-pool retention under GDPR: explicit, separate, unticked consent; 12 to 24 months; renewed (Recruitee, LeadGrid, Yena 2026). Ours: 24 months, six-month check-in, delete within 30 days.
- Talent-community practice: minimal fields, résumé parsing, segment on what you use (Gem, Rally). Ours: exactly the fields the panel and matcher read.
- Mercor: résumé then a 15 to 30 minute AI video interview as the gate. We take the résumé-first structure and leave the interview gate. Paraform (ParaAI): passive matching driven by preference accuracy (comp, location, industry, role). We take preferences as the substrate. Wellfound: public "open to" profiles. We take the status, not the publicity. Welcome to the Jungle (Otta): preferences before jobs, visa and location first-class. We take that order. LinkedIn Open to Work: recruiter-only visibility. We go further: nobody sees the profile but Lily until a yes.

Sources: pin.com/blog/application-length-drop-off-study, pin.com/blog/candidate-ghosting, pin.com/blog/employer-ghosting-index, recruitee.com/blog/gdpr-in-recruitment, leadgrid.io/blog/talent-pool-retention-period-gdpr, yena.ai/blog/gdpr-candidate-data-retention-recruitment-2026, gem.com/blog/best-practices-for-your-talent-community, rallyrecruitmentmarketing.com (2025), skillora.ai/blog/mercor-ai-interview, vervecopilot.com (Mercor onboarding), paraform.com/help/article/para-ai-matches, paraform.com/blog/passive-placements, wellfound.com, pageflows.com (Otta onboarding).

### 3.8 Build plan

- **P0, day 1, the spine.** Migration (`intake_source` allows self; `candidate_profiles`). `POST /api/apply` with the gates, blob upload, existing parser and résumé check, duplicate check, insert with the answers on the panel's columns, CS1 queued as essential. Card byline and "They say" block; feed lines. Acceptance: a PDF at /apply produces a card in #refery-desk within two minutes with grade, seats and the person's answers; CS1 in their inbox; a second submission with the same email creates nothing and sends CS1-dup.
- **P1, day 2, the screens.** `/apply` (landing and three steps) with the partner sign-up components; `/me/[token]`; the second-door card on `/go/[slug]` carrying the slug; refery.io redirects. Acceptance: the path works on a phone in under four minutes without a login; every promise on refery.io/candidates is true of the page.
- **P2, day 3, kept in mind.** CS5 through the one-tap page with Lily as requester, never-list and pause checked at send time; CS6 on the daily cron; the 48-hour pending note; delete. Acceptance: a paused profile is never suggested; a deleted one is gone from every reader; CS6 sends once and stops on any tap.
- **P3, half a day.** app.refery.io.

Not in the plan: candidate logins or dashboards, a public job list, AI interviews or visible scoring, merging the marketing site, any change to partner attribution.

### 3.9 Decisions for Lily

1. Domain: redirects now, app.refery.io next?
2. Candidate page in the app, reached as refery.io/apply? (Recommended.)
3. Ask for current base as an optional field? (Recommended.)
4. Retention 24 months, six-month check-in, delete within 30 days?
5. refery.io/candidates promises a "Talent Committee call" for everyone and cites "200+ companies" and "$200K to $350K". The flow makes the call conditional on a fit; the page copy should follow, and the figures need confirming.
