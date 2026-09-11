# Write to a candidate from the portal

Proposal, 11 September 2026. Mock-ups: the design canvas "Write to a Candidate" (17 artboards, four pages): https://claude.ai/code/artifact/f073a8bc-0f38-49a7-9045-4ad5dbd76735. Nothing here is built. People in the mock-ups are fictional (Maya Okafor, Daniel Reyes); the search is the live Livo seat, as it would render.

## 0. What happened, and what the partner meant

On 10 September at 22:31 UTC the desk emailed a partner (a solo recruiter on a Gmail address, joined 31 August, 3 candidates, 2 submissions, 18 search assignments) the "warm intro request" for one of his two Livo submissions. The email carries the intro kit: the candidate's email, a forwardable three-line intro, a pre-filled `mailto:` link, and a single-use "have Lily reach out" link. At 06:06 the next morning he opened the candidate's page, at 06:21 he moved the person from "intro asked" to "intro sent" himself, and at 08:24 he wrote to Lily: "is there any way we can send an email directly from the portal ... for example if we have to send some intro emails or acknowledgement emails to the candidates".

So the request is two concrete things, both of which he has already done by hand this week:

1. **The intro email.** Lily asks partners for a warm intro. Today the partner leaves the portal, opens Gmail, pastes, sends, comes back, and marks the stage. He wants the button on the page.
2. **The acknowledgement email.** "You are in, here is what happens next." Today the candidate hears nothing from anyone after a partner adds them.

Checked in the database on 11 September:

- 85 candidates were added by 24 partners in the last 30 days. 82 have an email on file. **One** of them received any email from Refery. 55 of the 85 have "told the candidate" still unanswered.
- The candidate hears from Refery exactly once in a partner's flow: the consent ask (`lib/candidate-consent.ts`). It is sent from `Refery <hello@refery.io>` with reply-to Lily, and the wording is fixed. **Zero** partners have ever triggered it (0 rows in `candidate_consents`).
- At "interview", "passed" and "hired", the partner receives an email that says "please let {first} know today" and the candidate receives nothing (`lib/client-delivery.ts:458-462`). The partner does that by hand, outside the product, untracked.
- The intro kit's one-tap "have Lily reach out" link: 5 sent, 0 used.
- 81 active partners (staff and test accounts excluded); 27 signed in during the last 14 days; 47 on their own domain, 33 on Gmail addresses, 1 on another consumer mailbox.
- Volume: 13 desk emails through Gmail and 4 through the Resend queue in 30 days. Resend's free tier is 3,000 a month and 100 a day.
- There is no compose surface anywhere in the product. `components/email-composer.tsx` exists and is imported by nothing.

## 1. What to build

One composer, on the candidate's record, that sends in the partner's name through the mail service Refery already uses. No mailbox to connect, no new service, no model call.

### 1.1 The composer

A right-side sheet, the same shape as "Why them?" (header, scrolling body, footer with one primary button). It opens from:

- a "Write to {first}" pill in the candidate page header, whenever an email is on file;
- "Send the intro" as the first button of the existing intro block (`components/candidates/partner-intro-buttons.tsx`), in place of the `mailto:` link, while the person is at "intro asked";
- "Let {first} know" on the success card after adding a CV, when "told them" is yes;
- the pitch composer's consent step, where "Ask them in one tap" opens this composer on the "Put you forward" moment;
- a "Tell {first}" button in the interview, passed and hired emails the partner already receives, and the same link on the submission row and the pipeline card.

Inside: the moment chips, To (from the record, read-only), From (fixed: "{Partner name} via Refery <partners@refery.io>", replies to the partner's own address), a Cc toggle for Lily (on for "Meet Lily", off otherwise), subject, body, one line saying what will move on send, "Send", and a text link "Open in Gmail instead" that carries the same draft into a Gmail compose URL for anyone who wants their own Sent folder.

### 1.2 Seven moments

Plain-text templates with merge fields, in code next to Lily's own (`lib/voice/partner-templates.ts`), covered by the same render test. The partner edits every word. Voice is the partner's: first person, short, no Refery jargon.

| Moment | Opens from | What moves on send | Only if |
|---|---|---|---|
| Received your CV | After adding a person; the page | "told the candidate" becomes yes | Always |
| Put you forward | The submit flow's consent step | Consent requested; the one-tap buttons answer it as today | Email on file; not already in play at the same client |
| Meet Lily | The intro block, the Next step, Lily's intro-request email | intro requested to intro sent, source desk, partner as actor; referrer nudges cancelled | Stage is intro requested |
| They want to meet you | The interview email, submission row, pipeline card | Nothing; the client's booking link is the call to action | Submission is client_interview |
| Not this time | The passed email, submission row | Nothing | Submission is declined |
| Congratulations | The hired email | Nothing | Submission is placed |
| Blank | Anywhere | Nothing | Always |

Merge fields: `{first}`, `{partner_first}`, `{search_headline}`, `{company_or_alias}` (the alias until consent, the name after), `{city}`, `{booking_link}`, `{start_date}`, `{signature}`. Never available: fee, payout, the bar, intake notes, hiring-manager names, the posting URL.

"Received your CV" has no company field at all. "Put you forward" is the existing consent note rewritten in the partner's voice, with the same `/c/<token>` one-tap buttons; it replaces the hardcoded note from `hello@refery.io`.

### 1.3 How it sends, and why from a Refery address

Refery sends through Resend, `From: {Partner name} via Refery <partners@refery.io>`, `Reply-To: {partner's address}, m-{7 chars}@in.refery.io`. refery.io already sends from `hello@` and `agreements@` with SPF and DKIM, so a new mailbox name on the same domain needs no DNS change. Because the mail is signed for refery.io, Gmail shows no "via" warning label; the words "via Refery" are in the display name on purpose. Mail claiming to be from the partner's own domain but sent by Resend would fail alignment and land in spam. This is Postmark's own guidance for sending on behalf of users and what Pin sells as a feature.

The candidate taps Reply. Their mail client fills in both Reply-To addresses. The reply reaches the partner's inbox directly, and the copy addressed to the thread alias hits the Resend receiving webhook that already ingests emailed CVs (`app/api/inbound/resume/route.ts`), which files it on the candidate's record. Every message ends with one footer line: "Sent by {Partner name} through Refery. Replies go to {first name}. Prefer no email from Refery? Stop here." plus a `List-Unsubscribe` header.

### 1.4 Rules and stops

| When | What | Only if | Stops when |
|---|---|---|---|
| Partner taps Send | Ledger row first (`candidate_emails`, kind `partner_<moment>`, `sent_by_user_id`), then Resend with an idempotency key; timeline line; the moment's stage move | Partner owns the candidate or has a submission on them; email on file; no do-not-contact decision; no bounce; not opted out; no client name before consent | Any check fails: the composer says which, nothing sent |
| Client name before consent | Composer inserts the alias; typing the real name shows an amber line and blocks Send | `consent_status` is not agreed | Consent on file, or the moment is interview or later |
| Rate | One message per candidate per 24 hours, 30 per partner per day | Replies to a candidate's reply are exempt | Lily lifts a limit per partner |
| Candidate replies | Copy on the record, direction in; "replied" chip; the person joins Needs you; nothing to Slack | The reply carries the thread alias | A reply sent only to the partner is invisible to Refery, and that is fine |
| Bounce | Resend bounce webhook marks the address; composer refuses it and asks for another | Hard bounce | New address saved |
| Candidate says stop | Footer link sets a contact decision (`do_not_contact`, provenance candidate); matching, desk mail and partner mail all stop through `evaluateEligibility` | One tap, no login | Lily revokes with a reason |

Deliberately not built: sequences, scheduled sends, open tracking, a shared inbox, automatic receipts on upload, model-written text. Nothing is sent automatically, ever.

### 1.5 Who hears what

Policy unchanged. No new Slack message of any kind: Lily reads the candidate record, and the intro send moves the stage she waits for. No new Refery email to partners: replies already reach their inbox; the only new thing they receive is a button inside emails they already get. The Sunday digest gains one line (messages sent, replies received) and the recap card one number.

### 1.6 Data, cost, build

- `candidate_emails`: add `sent_by_user_id`, `direction` (out, in), `provider`, `provider_id`, `reply_to`, `thread_alias`; new kinds `partner_received`, `partner_consent`, `partner_intro`, `partner_interview`, `partner_pass`, `partner_hired`, `partner_blank`.
- `users_admin`: `signature`, `messages_per_day`.
- `candidate_contact_state` (new, small): `candidate_id`, `bounced_at`, `bounced_email`, `opted_out_at`.
- `lib/voice/partner-templates.ts` and its test.
- Resend: `partners@refery.io` on the verified domain; `in.refery.io` already receives; add `email.bounced` and `email.complained` to the existing webhook.
- Cost: nothing new. About 100 emails a month today against a free tier of 3,000 a month and 100 a day; inbound is included. No model. A polish pass on drafts would cost under a tenth of a cent each and is left out on purpose.

Build order: P0 the composer with Meet Lily and Received your CV (1.5 days); P1 the other doors, the consent rewrite, the Tell-{first} buttons, the signature, Open in Gmail (1 day); P2 replies, bounces, opt-out, limits, digest line (1 day). About three and a half days.

## 2. The five ways to send, compared

| Option | Sender the candidate sees | Cost to Refery | Logged | Gate | Verdict |
|---|---|---|---|---|---|
| Relay through Refery (above) | "Name via Refery" <partners@refery.io>, replies to the partner | Nothing new | Sent, replied, bounced | None | **Build this** |
| Open in Gmail or Outlook with the draft filled | Partner's own address | Nothing | Only "Mark as sent" | None | Keep as the secondary link in every composer |
| Connect the partner's Gmail, send-only | Partner's own address, in their Sent folder | No fee: `gmail.send` is a "sensitive" scope, so a Google review (privacy page, demo video, 3 to 5 working days); reading replies would add `gmail.readonly`, a "restricted" scope with a paid yearly security assessment (about $540 and up) | Sent; replies only with the restricted scope | 100 users until the review passes; Gmail only | Later, if partners ask, send-only |
| Connect Outlook (Microsoft Graph) | Own address | No fee; publisher verification plus admin consent per tenant | Yes | Tenant admins | Later, with Gmail |
| A paid mailbox API (Nylas, Unipile) | Own address | Monthly fee per connected account | Yes | None | No |

## 3. An MCP for partners

The desk MCP (`refery.xyz/api/mcp`, shipped 11 September) already has the protocol, journal, redaction rule and write switches. A partner server is the same code with a key per person and eight verbs scoped to one book: `my_candidates`, `candidate_status`, `my_searches`, `search_brief`, `draft_message`, `send_message` (confirm: true), `submit_candidate`, `confirm_search`. Per call it costs Refery nothing: the partner's own assistant pays for the model. Build is about a day; claude.ai custom connectors would need OAuth, two more days. The real cost is support time.

Recommendation: not now. The 9 September Operating Review said a partner server only if firms ask, and this request was for the page, not for an assistant. The composer answers it; the MCP is a second door to the same room, and 0 of the 5 one-tap links sent this month were tapped. Build it the week a firm asks. The canvas shows what it would feel like and the card that would sit on `/start`.

## 4. The market

Every serious tool does one of two things: sends from the user's own mailbox through Google or Microsoft and pays the reviews (Paraform, Gem, Juicebox, Greenhouse, Lever, Ashby, Recruit CRM), or sends from its own authenticated domain with the user as Reply-To (Pin; Postmark's published guidance). Marketplaces closest to Refery split the same way: Paraform connects Gmail (read, compose and send, Gmail only, no Outlook) and makes consent platform-owned (candidate and recruiter both get a confirmation on submission; no consent, no review); Wellfound keeps messaging in-app with a template dropdown; BountyJobs and RecruitiFi have no recruiter-to-candidate channel at all; Cord shows each recruiter's response rate to deter ghosting. Lever's "limited sync" (send-only, replies stay in your inbox) shows that shape is accepted. Zoho and Greenhouse both log mail sent elsewhere through a BCC address, accepted only from verified sender addresses and matched on the candidate's email.

Numbers worth keeping: 58% of candidates expect to hear back within a week (Greenhouse 2022; CareerPlug 2025 puts the measured median at 6.7 days); CandE award winners decide in 3 to 5 days; Gem reports some customers seeing 3 to 4 times the replies when a named person sends on behalf of another. No published study compares "own mailbox" against "platform domain with Reply-To" for candidate replies, so the relay is the cheap first step, measured on the record, before anyone pays for Gmail.

## 5. Open decisions for Lily

1. The sender name. "Maya Okafor via Refery" is the proposal. The alternative, "Maya Okafor (Refery)", reads as if she works here.
2. Whether replies are copied to the record at all (the second Reply-To). Without it Refery never sees a reply and the "replied" chip does not exist. With it, partners and Lily both see the thread on the page, and the footer says so.
3. The daily limits (30 per partner, 1 per candidate) and whether Lily wants to lift them per partner from `/admin/partners`.
4. Whether "Received your CV" should also be offered on the bulk upload result screen, one tap per person.
5. Whether to answer the partner now with the plan or wait for P0. A short reply is in section 6.

## 6. A reply to the partner

Subject or Slack, Lily's voice, no em dashes:

> Thanks for asking, and yes. We are adding a "Write to {first name}" button on every candidate page. It sends in your name (the candidate sees "you via Refery"), replies land in your own inbox, and a copy sits on their Refery page so we both see where things stand. Two templates first: the warm intro Lily asks you for, and a "you are in, here is what happens next" note for people you add. Interview, pass and offer notes follow. Nothing goes out unless you press Send. I will ping you the day it is live.

## 7. What is true today, for whoever builds it

- The two timelines on the candidate page are `components/candidate-activity-log.tsx` (reads `candidate_activity_log`, `email_sent` is already a loggable type) and the "Where we are" block in `components/candidates/desk-assessment.tsx` (reads `candidate_emails`). A sent message must land in both.
- `candidate_emails` already has `kind, to_email, cc_emails, subject, body, sent_by, sent_at, error, meta`; the Gmail path fills `gmail_thread_id`. Resend-sent mail today stores no message id and is never threaded.
- `lib/comms.ts` is the queued Resend path with the 72-hour optional budget and a dedupe key; every partner-triggered email today (`requestConsent`, client-delivery notices) bypasses it. The new route should write its ledger row first and send with an idempotency key, as `lib/comms.ts` does.
- Journey moves that come from a partner action must set `journey_stage_source = 'desk'` and go through `lib/desk` so timers and the Slack thread stay in step (`docs/candidate-desk.md`).
- The block store is `candidate_human_decisions` kind `contact`, read by `evaluateEligibility` in `lib/engine/policy.ts`. The opt-out link writes there; `requestConsent` does not consult it today and should.
- `lib/mcp/*` exists on `main` (branch `desk-mcp`, merged 11 September); it is not on `engine-release-1`.
- `RESEND_API_KEY` lives only on Vercel; local runs report "not sent".
- Nav for partners is Start, Candidates, Searches, Pipeline; `/dashboard` redirects them to `/candidates`. `/profile` has no settings beyond name and LinkedIn; the notification toggles live on `/start`.

## 8. Built, 11 September 2026

Lily said "build, and go live" the same day, and added one thing: the "Meet Lily" draft carries her booking link (cal.com/refery-lily/15).

What shipped, all on `main`:

- `lib/messages/templates.ts`: the seven moments, in the partner's voice, with `tests/messages/templates.test.ts` (every moment renders empty and full, never a brace, never signed by Lily).
- `lib/messages/index.ts`: context and rules (`messageContext`), drafting (`draftFor`), sending (`sendPartnerMessage`: ledger row first, Resend with an idempotency key, footer with the stop link, `List-Unsubscribe`, the moment's one side effect), reply capture (`captureReply`), bounces and complaints (`recordBounce`), the stop link (`stopContact`), and the unread-reply helpers for the list.
- `POST/GET /api/candidates/[id]/messages`, `/stop/<token>` with `POST /api/stop/<token>`.
- `components/candidates/message-composer.tsx`: the sheet. Opens from the "Write to {first}" pill in the candidate header (owner or Lily, when an email is on file), from "Send the intro" in the intro block (replacing the mailto link, which stays as a small text link), from the "Let {first} know" card right after an add (`?added=1`), and from `?write=<moment>` links in the interview, passed and hired emails and the "Tell {first}" link on the submission row.
- The consent ask (`requestConsent`) now sends through the composer's "Put you forward" moment: "Name via Refery", Reply-To the partner, same one-tap page.
- The inbound Resend webhook files replies carrying a thread alias and records `email.bounced` / `email.complained`.
- `/profile` gains an email signature; `/api/profile` accepts it.
- Migration `partner_messages` applied to production: `candidate_emails` gains `sent_by_user_id, direction, provider, provider_id, reply_to, thread_alias, read_at`; `users_admin` gains `signature, messages_per_day`; new `candidate_contact_state`.
- The candidates list shows a "replied" chip and files an unread reply under Needs you ("Read the reply"); opening the page marks it read. The "Where we are" timeline shows replies to the owner and Lily.

Two settings only Lily can flip, both outside the repo:

1. `MESSAGES_INBOUND_DOMAIN` on Vercel: the domain Resend receives on (the one the CV forward goes to). Until it is set, Reply-To is the partner alone and replies are not copied to the record; everything else works.
2. In the Resend dashboard, add `email.bounced` and `email.complained` to the webhook that already posts to `/api/inbound/resume`. Until then, bounces are not recorded.

Not built, on purpose: the pipeline card link (the submission row and the emails cover it), the Sunday digest line, any model pass, the partner MCP.

## 9. Same day, three more things

- **Phone.** The composer is the full-width sheet on a phone (chips wrap, sticky Send, 44 px targets), checked at 390 px on the live site.
- **The interview note when there is no booking link.** Most clients have no booking link on file, and Lily makes the introduction between candidate and hiring manager herself. When the client has no link, the "They want to meet you" draft says Lily is setting up the first call, and the line under Send says so. When Lily adds a booking link to the client, the draft carries it.
- **The guide, `/guide`.** Every partner-facing feature per topic, with a search box (`/` focuses it), three "start here" paths, a dated "launched recently" list, and mock-ups of the live screens and the emails with fictional people. Content in `lib/guide/topics.tsx`, mock primitives in `components/guide/mocks.tsx`, page shell in `components/guide/guide-client.tsx`. "Guide" is in the nav for partners and the super admin; the old "How it works" buttons on Searches and Pipeline and the link on /slack point at it. Nothing about the desk or admin pages is in it.
