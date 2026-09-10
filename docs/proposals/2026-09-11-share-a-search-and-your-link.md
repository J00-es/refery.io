# Share a search with a candidate, and a scout's own link

Proposal, 11 September 2026. Mock-ups: the design canvas "Share a Search and Your Link" (17 artboards, three pages): https://claude.ai/code/artifact/9c550d9c-720c-48da-8145-aecc2a5a27d1. Nothing here is built. People in the mock-ups are fictional (Maya Okafor, Daniel Reyes); the search is the live Arx Labs seat, as it would render.

## 0. What is true today (checked in the code and the database)

- The role page (`app/(dashboard)/searches/[companyId]/roles/[jobId]/page.tsx`) never renders the JD text. `jobs.description` is loaded and dropped. There is no share or copy-link control on the page; the only copy control is the candidate blurb's `CopyButton`.
- `jobs.description` is the only long JD column, and it holds two different things: the raw posting for ingested rows, and a 4 to 6 sentence rewrite for clients onboarded through `/admin/onboard` (`lib/client-onboarding/run.ts:266` overwrites it). For onboarded clients the original is only recoverable from `job_post_url`, and 5 of the 11 live searches have no URL at all.
- Every live JD names the company in its first line ("About Arcanum Labs (Arx Labs)", "NewForm is the creative intelligence company... Kalshi, ElevenLabs"). Interview steps name founders ("Intro call with Rehan"). So "the full original JD, anonymised" is not a rendering choice; it needs a candidate version drafted once and approved.
- The anonymised company identity already exists and is already approved: `client_companies.anon_alias` and `public_blurb` (6 of 7 published clients have both), rendered by `anonLabel()` in `lib/partners.ts` and on the consent page `/c/<token>`.
- Partner-only fields that must never reach a candidate: `partner_roles.intake_notes`, `not_for`, `context`, every fee and payout column, `jobs.hiring_manager_*`, `jobs.recruiter_notes`, `jobs.job_post_url`, the "posted as" title. The partner agreement (`lib/agreements.ts`, confidentiality section) already forbids sharing the URL or the name; a candidate page is the compliant thing to send instead.
- Public pages exist for every other audience (`/b/<slug>` founder brief, `/c/<token>` consent, `/apply` and `/me/<token>` for candidates, `/go/<slug>` campaigns) but none for "here is the role". The best models to copy are `lib/hm-brief.ts` (7-char slug, 31-letter alphabet without confusable characters, `findPublishedBrief` returning nothing for draft, revoked and unknown alike, `hm_brief_events` telemetry, rotate-to-revoke) and `components/hm/brief-link-controls.tsx` (the copy, open, rotate panel).
- There is no per-person referral code anywhere. `/apply?from=<slug>` carries a campaign, not a person, and `createSelfSubmission` hard-codes the owner to Lily. No scout-facing email fires when a candidate arrives; the only "your person moved" mail is the Sunday digest and the desk's referrer outcome.
- There is no `blocked` flag on candidates. The block store is `candidate_human_decisions` (kind `contact`, value `do_not_contact`), read by `evaluateEligibility` in `lib/engine/policy.ts`, which is what stops matching, desk cards and emails.
- Two small existing bugs this touches: `intake_source = 'self'` has no label on the candidate page (`INTAKE_LABELS`), and the `lib/types.ts` union does not include `'self'`.
- Numbers: 11 live searches, all with description, hard requirements, intake notes and a not-for line; 7 with interview steps. 30 active scouts, 56 active recruiters. 0 self-submissions so far. Turnstile keys are optional and the check fails open when unset.

## 1. Share a search with a candidate

### 1.1 What it is

One button on the role page, "Share with a candidate", opens a panel with a short link: `refery.xyz/j/k7m2x4q`. Anyone can open it without signing in. It shows the search the way a candidate should see it: the headline, the anonymised company line and blurb, the facts (city, on-site, seniority, salary band, equity signal, visa signal), the full JD in a candidate version, what they are looking for (the hard requirements), a curated "Good to know" list, how they interview, and one call to action: "I'm interested". The company's name comes with the first conversation, and the page says so.

A partner's copy of the link carries their code (`?via=gq3kx`), so a person who taps "I'm interested" lands in that partner's Candidates as theirs (section 2). Without a code the person is a self-submission owned by Lily, exactly as `/apply` works today.

### 1.2 Principles

- One page per search, published by Lily once. Partners do not write candidate pages; they share the one Lily approved.
- The original JD is kept untouched and never shown. The candidate version is drafted from it by a rule pass (strip the company name, aliases, founder and HM names, customers named only in the JD, URLs, the "posted as" title) and one model pass that rewrites in the posting's own words with "the company" in place of the name and flags every kept proper noun. Lily reads the flags, edits, publishes. About $0.01 per search, once; no model call on any page view.
- Nothing partner-only crosses over. Not the fee, the payout, the bar (`not_for`), the intake notes verbatim, HM quotes, hunting grounds, the URL, the posted title, partner counts.
- "Good to know" is opt-in per line. Lines are drafted from the intake notes, all off by default; Lily ticks what a candidate may read (equity range, visa rules, office rhythm). Quotes and hunting grounds are never offered.
- Re-identification is the real risk, not the name. "a16z-backed, Walmart flagship, past $10M ARR" is one search away from Hilbert's. The alias and blurb are what Lily already approved for unassigned partners; the editor flags kept proper nouns so she decides per search whether candidates get the same alias or a plainer one.
- Not indexed, not listed. `robots: noindex`, no sitemap, no `/j` index. The link is private in the sense the founder brief is: anyone with it can open it, nobody finds it.
- The link dies with the search. Closed, filled, unpublished or rotated all show the same "This search has closed" page with the share-your-CV door under the same partner code.

### 1.3 Screens (canvas page 1)

1. **Role page** (artboard 1): the new button sits between "Ask a question" and "Submit a candidate". Panel: what the page is (two lines), the link with the partner's code, gold Copy link, "See what they see", "Open", and the partner's own opens count. Before Lily publishes, partners see the button greyed as "Candidate page: being prepared" and Lily sees "Review candidate page". Unassigned partners see no button.
2. **Candidate page, desktop and phone** (artboards 2, 3): "Maya Okafor shared this with you through Refery" when a code is present; priority chip; headline; alias line; blurb; fact chips; an "I'm interested" card above the fold; the role; what they are looking for; good to know; how they interview (names removed); a closing card with "I'm interested" and "Not for me, but I know someone"; the footer says who shared it and that it is not indexed.
3. **I'm interested** (artboard 4): CV, name, email, LinkedIn (optional), where you are now, US work authorisation, base you would move for, one optional line, the 24-month consent line naming who sees the profile. Same vocabulary as `/apply` (`lib/apply/options.ts`) so nothing is ever asked twice. Short on purpose: the desk needs a CV, a way to reach them, authorisation and a base; the partner answers the rest in the pitch, and the person can complete preferences later on their private page.
4. **Editor** (artboard 5), a tab on Manage role: the candidate version with removed text struck through and changed text in amber; the "Good to know" list with checkboxes; interview steps with what changed; the "On the page" toggles (company line, blurb, salary band, equity, visa, priority, decision days; the never-list is a locked-off row); the link with Copy and Rotate; the original JD with View and Paste. Publish, Preview, and a "Draft, not live" chip.
5. **Closed** (artboard 6).

### 1.4 Data

- `candidate_pages` (new): `job_id` pk, `slug` (7 chars, unique, no company part), `status` draft | published | revoked, `jd_text`, `good_to_know text[]`, `interview_steps jsonb`, `show_salary`, `show_equity`, `draft_flags jsonb`, `version`, `published_at`, `revoked_at`.
- `candidate_page_events` (new): `slug`, `via_code`, `kind` view | interested | submitted, `session_id`, `ip_hash`, `country`, `device`, `created_at`. Same shape as `hm_brief_events`.
- `jobs.description_original` and `jobs.description_source` (posting | onboarding | pasted). Captured at onboarding from `job_post_url`, or pasted by Lily. Never overwritten.

### 1.5 Rules

| When | What | Only if | Stops when |
|---|---|---|---|
| Search goes live | Draft the candidate version and the good-to-know lines | An original JD is on file; otherwise Lily is asked to paste one | Lily leaves it off |
| Lily publishes | Slug minted, page live, button on for every assigned partner | Client card published with alias and blurb | Search closes; unpublish; rotate |
| Partner copies the link | Their code appended; opens counted per code, shown only to them and in the weekly pulse | Partner is on the search (working or proposed) | Unassigned partners see no button |
| Someone taps "I'm interested" | Section 2 flow, with `job_id` attached | Gates pass | Duplicate or not a CV |
| Search closes or fills | Page shows closed with the share-CV door | | Reopening revives the same slug |

## 2. A scout's own link

### 2.1 What it is

Every active scout and recruiter has one code and one link: `refery.xyz/r/gq3kx`. It lives on `/start` (a "Your link" card above "Two more ways to earn"), behind a "Your link" button in the Candidates header, and inside the share panel on every search. "Copy link" and "Copy a message" (a two-line note they can paste into a DM).

A person who opens it sees "Maya Okafor invited you to Refery", three promises, and the existing `/apply` flow: CV, then what they are looking for, then roles. One line differs: the consent says Maya and Refery see the profile. Every gate stays (honeypot, five per hour per IP, Turnstile, PDF only, looks-like-a-CV, duplicate check).

On submit, the candidate row is created as the scout's (`user_id`, `owner_user_id`, `uploaded_by_user_id` all the scout, `intake_source = 'referred'`) with a `referrals` row in `pending`. The panel reads the CV at once so the grade is ready. The person gets a receipt (RL1). The scout gets one email (RS1) with two buttons.

### 2.2 The scout's two answers

"Yes, I referred Daniel", plus two optional lines: how do you know Daniel (the strong version) and why him, and for what. The same two questions the pitch composer asks, so they pre-fill the pitch and are never written twice. On yes: `referrals` confirmed, the grade appears, the desk card posts to #refery-desk with the byline "via Maya's link, confirmed" and her note, the person gets RL2, and ownership stands (the 24-month partner-vs-partner window starts at submit, as today).

"Not from me": the person is off the scout's list, nothing is credited, the row's owner is cleared to Lily, and a contact decision `disowned_referral` goes into `candidate_human_decisions`, which the eligibility engine already reads: no matching, no desk card, no emails. Lily gets one feed line with :+1: to rescue a real person as a self-submission. Untouched, the CV is deleted after 30 days and the person gets one line (RL3) pointing at `refery.xyz/apply`. The scout gets a 3-minute undo, the same window the desk gives Lily's decisions.

The same two actions live in three places behind one function: the email buttons (single-use 30-day tokens, like "Have Lily reach out"), a banner at the top of the candidate's page, and the row in the Candidates list. An unconfirmed arrival sits in the existing "Needs you" bucket with the next action "confirm". No new tab. A "via your link" chip stays on the row after confirmation.

### 2.3 Abuse and the block

- Two "not from me" answers on one code inside 7 days, or five arrivals in an hour, rotate the code without asking. The scout gets RS4 ("we gave you a fresh link"), Lily gets an alert. Old links show the closed page.
- A scout can rotate their own code any time from the "Not yours" screen or the Your link card.
- Duplicates: an email or LinkedIn match against anyone already on Refery creates nothing. The person gets the existing "already with us" email; the scout gets RS3: "Daniel was already on Refery before your link, so this one is not credited." Never says who has them, the same rule as the submit-time 409.

### 2.4 Timers (reminders only, never decisions)

| Day | What | Only if | Stops when |
|---|---|---|---|
| 0 | RL1 to the person, RS1 to the scout | Row created | |
| 3 | RS2 reminder to the scout | No answer; optional budget free; prefs allow | Any tap |
| 7 | Feed line to Lily; the desk card posts flagged "unconfirmed by Maya"; Lily decides on the person as usual | No answer | Any tap |
| 30 (after disown) | CV deleted, RL3 | Lily did not rescue | :+1: |

### 2.5 Data

- `referrals` (new): `id`, `candidate_id`, `referrer_user_id`, `code`, `source` link | jd, `job_id`, `status` pending | confirmed | disowned | duplicate | escalated, `relationship`, `why`, `token`, `token_expires_at`, `confirmed_at`, `disowned_at`, `reminded_at`, `escalated_at`, `ip_hash`, `user_agent`, `created_at`.
- `users_admin.share_code` (5 chars from the brief-slug alphabet, unique) and `share_code_rotated_at`. No photo column: initials, as everywhere.
- `candidate_human_decisions`: kind `contact`, value `disowned_referral`.
- `submission_claims`: unchanged.

## 3. Who hears what

Policy unchanged: Lily gets a reaction card only when she must act, a feed line when she only needs to know, an alert only for breakage. Partners get essential mail the same minute and everything else on Sunday. Candidates hear either way. No email to anyone per page view.

| Event | Candidate | Scout or partner | Lily | Client |
|---|---|---|---|---|
| Candidate page opened | nothing | count in the share panel | weekly pulse aggregate | nothing |
| Interested tap with a code, or CV at /r/code | RL1 receipt | RS1, two buttons | nothing until confirmed | nothing |
| Interested tap without a code | CS1 (existing) | nothing | as any self-submission | nothing |
| Scout confirms | RL2 | nothing | desk card with byline and note | nothing |
| Scout disowns | RL3 after 30 days if not rescued | confirmation screen; RS4 on auto-rotate | feed line with :+1: rescue | nothing |
| Duplicate | CS1-dup (existing) | RS3 | feed line (existing) | nothing |
| Gates fail | page says so, nothing kept | nothing | nothing | nothing |
| Day 3 unconfirmed | nothing | RS2 | nothing | nothing |
| Day 7 unconfirmed | nothing | nothing | feed line; card posts flagged | nothing |
| Abuse signal | nothing | RS4 | alert | nothing |
| Search closes | closed page | Sunday digest line | nothing | nothing |
| Candidate version drafted | nothing | button "being prepared" | desk card, :+1: publish, :pencil2: edit on the page | nothing |
| Published | nothing | button on, no email | nothing | optional line in the HM brief |
| Sunday digest | | new "Your link" section: opens, arrivals, confirmed, waiting | recap card (existing) | |

New templates, all plain text from lily@refery.io, subject "[Refery] Full name | context", through `lib/comms.ts`: RL1 (CS1 plus a referrer line), RL2, RL3, RS1, RS2, RS3, RS4. Seven emails, one optional. Drafts of RS1, RS2 and RL1 are on the canvas.

Deliberately not sent: per-view pings, "someone opened your link" pushes, a client notice on every interested tap, a Lily card on arrival.

## 4. Build order

- **P0, the spine, one day.** Migration. `share_code` minted for every active partner. `/r/<code>` as `/apply` with the referrer named; `referrals` row; RL1 and RS1; confirm and disown as one function behind the email token and the page banner; the Candidates row and chip. Done when a CV at `/r/gq3kx` lands as Maya's, unconfirmed; her tap in the email confirms it and the desk card posts with her note.
- **P1, the candidate page, a day and a half.** `description_original` captured (fetch from `job_post_url`; paste box). Draft pass on go-live. Editor on Manage role. `/j/<slug>` page, closed state, events. Share panel with `?via`. "I'm interested" writing a `referrals` row with `job_id`. Done when Lily publishes the Arx page in under five minutes of editing, a scout copies a link, and an interested tap creates a referral with the search attached.
- **P2, timers and safety, half a day.** RS2, day-7 escalation, RS3, auto-rotate, RL3, the 30-day purge, the Sunday digest section, the pulse line. Done when a disowned person is never matched or mailed, a rotated code shows the closed page, and the digest lists opens and arrivals.
- **P3, loose ends, half a day.** The "self" label; the types union; Turnstile keys on Vercel; `/go/join` cards link to candidate pages instead of summaries; recruiter email C reuses the page; the templates test covers the seven emails.

## 5. Things not asked for that matter

1. **Keep the original JD from today.** Onboarding overwrites it and nothing keeps a copy. `description_original` is a one-line change to `run.ts` plus a paste box, and it makes both "full JD" and "re-draft" possible. Worth doing even if nothing else here is built.
2. **The posted title and the URL identify the company.** NewForm's seat is posted as "Growth Marketing Lead"; a search on that title finds them. Neither the posted title nor the apply URL ever appears on a candidate page, and the page says the name comes with the first conversation.
3. **Tell the person who sees their CV.** The `/apply` consent says a company sees it only after a yes. On a referral page the scout also sees it; the consent line says so. Not saying it would be the one thing on the page that is not true.
4. **"Block" should park, not delete.** Deleting a real person who was merely disowned by mistake is unrecoverable; parking through the decision ledger blocks everything the same minute and lets Lily rescue with one reaction.
5. **Turnstile fails open today.** The keys are optional in the code; set them on Vercel before a scout link goes out, or the five-per-hour limit is the only gate.
6. **The candidate page is the missing preview everywhere.** The general outreach link shows a summary; recruiter email C reuses an approved preview; the founder brief's "what candidates see" is nothing. All three can point at `/j/<slug>` instead of maintaining their own copy.
7. **Firms.** Each recruiter in a firm has their own code; credit is per person, the claim is per firm, as the addendum already says.
8. **Never show a scout the grade before they stand behind the person.** The read runs on arrival so it is ready, but the number is theirs only after "yes".
9. **A scout's link should not double as a scout-recruitment link yet.** "Bring in a recruiter" stays the mailto flow on `/start`; two doors on one link confuse the person opening it.

## 6. Decisions for Lily

1. Candidate pages are noindex and unlisted (recommended), or indexable?
2. Salary band on the page by default (recommended: on, since the posting already shows it; off for Refery-only mandates until ticked)?
3. Lily approves every candidate page before it goes live (recommended), or auto-publish on go-live with a 24-hour edit window?
4. "I'm interested" stays short, CV plus six answers (recommended), or asks the full `/apply` set?
5. "Not from me" parks the person and Lily can rescue (recommended), or deletes outright?
6. The disowned person is told after 30 days with a pointer to `/apply` (recommended), or hears nothing?
7. RS3 wording tells the scout the person was already on Refery (recommended, matches the 409), or says only "not credited"?
8. The desk card waits for the scout's confirmation and escalates on day 7 (recommended), or posts on arrival flagged "unconfirmed"?
9. Codes are five random characters (recommended), or first names with a number?
10. Should the HM brief carry a "what candidates see" link to the page, so the client has seen the anonymised version?

## 7. Built, 11 September 2026

Lily approved the same day with three changes: candidate pages go live on their own (a conservative draft she reviews and edits live, no per-page approval), partners may personalise their code (unique, editable later, the old code keeps working), and every new page must hold the light look in dark mode and work on phones.

What shipped, on `main`:

- Migration `candidate_pages_and_referral_links` (applied): `candidate_pages`, `candidate_page_events`, `share_codes`, `referrals`, `jobs.description_original` and `description_source`.
- `lib/candidate-pages.ts`: the rule pass, one model pass (openai/gpt-5.6-sol through the paid ledger, Sonnet fallback, rule-only fallback when neither answers), auto-publish on go-live (`PATCH /api/partners/roles/[jobId]` with `is_live`, and `publishRun`), the self-healing cron `/api/cron/candidate-pages`, editing, rotate, events.
- `/j/[slug]` with the "I'm interested" form (`/api/j/[slug]/interested`), the view beacon, the closed state. The role page carries "Share with a candidate" with the partner's code on the link, and admins a "Candidate page" editor.
- `lib/share-codes.ts`: minted five-character codes, `claimCode` for a chosen one (reserved words, uniqueness, three free suggestions on a clash), retire on rename, revoke on rotate. `/r/[code]` is `/apply` with the referrer named. "Your link" card on Start and button in the Candidates header.
- `lib/referrals.ts`: pending → confirmed / disowned / escalated / duplicate; the desk card is held while pending (panel cron) and released on confirm or day 7; day-3 reminder; disown parks through `candidate_human_decisions` with a three-minute undo, two disowns a week or five arrivals an hour rotate the code; 30-day purge with RL3; Lily can rescue from the candidate page. One-tap email actions at `/rf/[token]`; the same two answers on the candidate page banner and in the list ("Needs you" bucket, "via your link" chip).
- Templates RL1 to RL3 and RS1 to RS4 in `lib/voice/templates.ts`, covered by `tests/voice/templates.test.ts`. The Sunday digest gains a "Your link" section. `/go/<slug>` cards link to the live candidate page. `intake_source = 'self'` now has a label. `color-scheme: light` on `:root`.

Decisions taken by default, per Lily's "all good": noindex pages, salary band on, short interested form, park rather than delete, tell the disowned person after 30 days, RS3 says the person was already on Refery, the card waits for the partner, minted codes are five characters.
