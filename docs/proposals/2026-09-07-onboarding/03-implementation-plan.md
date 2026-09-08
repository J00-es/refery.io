# Implementation plan, v0.1 (proposed)

Ordered by what blocks trust, then by what makes the first useful action work. Each item has an acceptance criterion that can be checked by a query, a test, or a screenshot. Nothing here has been started. No production record, automation, or deployment is touched by this document.

Findings marked "verified" were checked on 7 September against the working tree of `refery-gh` and read-only queries on project `ofujlvuejuvhpzemjaic`. Local source is not proof of the deployed commit.

## P0. Trustworthy state and safe access

### P0-1. Reconcile identity and history before any backlog contact

Verified: 86 applications are `new`; 9 of them belong to people who already hold active accounts (Jenil Thakker, Fabio Araujo, Aloise, David Hanley, Simran Hundal, Fabien Le Pichon, Veronica Li, Abhishek Garg, Keana Alabre); 1 rejected applicant (Fongyen Lin) is an active, working recruiter; Keana Alabre appears to hold two accounts under different addresses. Applications and users are joined only by exact email in `scripts/partner-state.sql`.

Found while merging Keana on 7 September: `candidates.user_id` and `users_admin.user_id` cascade on `auth.users` delete, while `owner_user_id` and `uploaded_by_user_id` do not. The August account move changed `owner_user_id` only, so 12 candidates still pointed at the old login and would have been deleted with it. Any merge must repoint every `auth.users` reference (a dynamic scan over `pg_constraint`) inside one transaction before the delete, and the merge tool must refuse if any reference remains outside `users_admin` and `auth.identities`.

Work: a `partner_identities` table (person id, verified emails, LinkedIn URL as a hint only, source, verified_by, verified_at) and a one-off reconciliation script that proposes links for Lily to confirm on `/admin/partners`. Applications get `person_id` and a terminal status `already_partner`.

Acceptance:
- A query for applications marked `new` whose email or confirmed alias matches an active account returns 0.
- Every application row has exactly one of: `new`, `in_review`, `clarification`, `approved`, `no_match`, `declined`, `paused`, `already_partner`, `invalid`.
- Manual contact history (sent mail, calls) is preserved as events, not overwritten.

### P0-2. Close the anonymous access surface

Verified: `partner_state_v` is owned by `postgres`, runs with definer semantics (no `security_invoker`), and grants `SELECT` to `anon` and `authenticated`. `nudges` has row-level security disabled, no policies, and full grants to `anon`. Eight further tables have RLS off with anonymous `SELECT`: `_imp0810`, `tmp_cand_job_match`, `tmp_target_companies`, `tmp_track3`, `urgent_roles_top500`, `tmp_gap_companies`, `substack_gap_final`, and `nudges`. No extraction or mutation was attempted.

Work: revoke `anon`/`authenticated` on the internal view and the listed tables; enable RLS on `nudges` with service-role-only access; move `tmp_*` and import tables out of `public` or drop them; add a nightly advisor check that fails on any `public` relation readable by `anon` without a policy.

Acceptance:
- `select relname from pg_class ... where relkind in ('r','v') and anon has select and not relrowsecurity` returns only relations on an explicit allowlist.
- `get_advisors` security report shows no "RLS disabled in public" and no "security definer view" findings for these relations.
- The partner-facing app still loads Searches, Pipeline and Candidates for a beta and a non-beta test account.

### P0-3. Make the knowledge path real

Verified: `lib/call-recap.ts` reads `.claude/skills/recap-email/SKILL.md` and requests knowledge scope `call-recap` through `loadBrainContext`. The two active documents in `brain_knowledge_documents` carry scopes `general`, `refery-inbox`, `chief-of-staff` only. So every recap since the scope was introduced ran with an empty commercial context, and the prompt's "quote the reference, never recall" rule therefore removes numbers rather than sourcing them. `docs/brain/refery-commercial-terms.md` is marked Draft. There are no `agreement_acceptances` on version 2.1; live acceptances are on 1.2.0 and 2.0.

Work: validate the commercial document line by line against `lib/agreements.ts` and the two acceptance versions in use; publish it through the Brain sync (Drive document, `status = active`, `agent_scopes` including `call-recap`); make `loadBrainContext` log which document ids and versions it returned; make the recap Slack card print "Terms: <title> v<version>, <n> chunks" or "Terms: none".

Acceptance:
- `select title from brain_knowledge_documents where status='active' and 'call-recap' = any(agent_scopes)` returns the commercial document.
- A dry run of the recap cron against a fixture transcript that mentions the split produces "70%" with a source line, and one that never mentions money produces no figure.
- The recap card for the next real call shows the terms version.

### P0-4. Server-owned admission and constrained sign-up

Verified: `app/api/auth/sign-up/route.ts` inserts `role: role || 'viewer'` from the request body using the admin client. Status is `pending`, so activation still needs a human, but the role is client-chosen. `app/api/slack/events/route.ts` verifies the Slack signature and then acts on any non-bot `event.user`; there is no reviewer allowlist.

Work: whitelist `scout` and `recruiter` at sign-up; store a separate `requested_role`; add `admission_decisions` (application id, decision, decided_by, decided_at, template id sent, delivery id); check `event.user` against a reviewer list read from `desk_settings` before any state change; keep the 24-hour rule as an overdue task plus template P, never as an automatic decision.

Acceptance:
- Posting `role: "super_admin"` or `role: "admin"` to sign-up creates a `scout`/`recruiter`-only row or is rejected.
- A reaction from a non-reviewer Slack user changes nothing and gets a thread reply saying so.
- Every status change on an application has one `admission_decisions` row with a human decider.
- An application untouched for 24 hours produces a task on `/admin/partners` and at most one P email; its status is still `in_review`.

### P0-5. Agreement, access and activation are separate, visible states

Verified: Ajmal was told on 2 September he could begin and hit the agreement gate on 3 September; the 6 September email says it was fixed. `partner_state_v` computes `signed_idle` from `agreement_acceptances` matched by email, so an acceptance under a different address reads as unsigned.

Work: an `access_check` function returning `{account, partner_terms, submission_terms, searches_access, firm_membership}` with a reason for each false; shown on the partner's Start page and on Lily's desk; a repair action for the known sync failure.

Acceptance:
- A partner who accepted terms under an alias email shows `partner_terms: true` after reconciliation.
- A partner with `status = active` and no Searches access sees "Searches access: not yet, Lily has been told" rather than an empty page.
- The desk lists every active partner whose `access_check` has any false value under "Needs a Refery fix".

## P1. The first useful action works

### P1-1. Decide what happens with the beta gate

Verified: `DESK_BETA_ONLY = true` in `lib/partners.ts`; 28 of 75 external partners are beta; 47 are not. No proposal email has gone to a non-beta user because current assignment holders are all beta.

Options for Lily: (a) open Searches to every active partner who has accepted partner terms; (b) keep the gate and make proposals only to beta users, with a "read-only preview" state for others. Recommendation: (a) once P0-2 and P0-5 are done, because the alternative is proposing work people cannot see.

Acceptance: no proposal row is created for a user whose `access_check.searches_access` is false; the code path refuses rather than silently emailing.

### P1-2. Application success page says what it is

Verified: the marketing form's success state (`refery-web-checkout/app/join-as-scout/page.tsx`) says "Application received. Thanks, {firstName}." and nothing about the next step. Sonam asked on the 31 August call whether she had to sign up again.

Work: copy to "Application received. If approved, you'll get a link to create your partner account." Duplicate state says "You've already applied" and, if an account exists, links to login.

Acceptance: screenshot of both states at 390px; the duplicate path detects an active account by verified identity, not exact email only.

### P1-3. Preferences captured once, with provenance

Verified: cities, profile types, archetypes, stages, network tier, pool size and sample URLs live on `scout_applications`; nothing carries them to `users_admin` at sign-up.

Work: `partner_preferences` (person id, own location, network cities, functions, stages, relationship types, capacity, source: application|signup|call|edit, updated_by, updated_at). Sign-up prefills from the application and asks the person to confirm. Sample URLs stay as private drafts and never become submissions.

Acceptance:
- After sign-up from an approved application, preferences exist with `source = application` and a confirmation timestamp.
- A sample URL on an application creates no `candidates` row and no outreach.
- A firm member's preferences do not overwrite the firm's.

### P1-4. One strong first search, or an honest no-match

Work: a matcher that scores live searches with open capacity against preferences and returns at most one primary and one optional secondary with a reason; a `no_match` outcome that writes template F and a `paused_until` on the person; recommendation and assignment are distinct rows (`search_recommendations` before `search_assignments`).

Acceptance:
- An approved partner in Zurich with no matching search receives F, no proposal row, and appears under "Needs suitable work" on the desk.
- The matcher never returns a search whose live capacity is zero.
- "Signed, never given a search" on the Monday digest is replaced by "approved, no suitable search" with the demand gap named.

### P1-5. Calibration without a formal submission

Work: on a search page, three separate actions: "Save someone privately" (draft, no protection, no outreach), "Ask for a fit check" (Lily or the panel reads a draft under the partner's own data permission and answers in the thread; no claim), "Introduce" (consent confirmed, submission terms shown once, claim attempted). Fictional example allowed on the fit check.

Acceptance:
- A draft creates no `role_submissions` row and no claim.
- A fit check answer arrives within the panel target and is visible in Pipeline as "checked, not submitted".
- The claim result is checked; if `recordClaim` returns `ok: false` the partner sees "received, attribution pending" and the desk gets a fix task. Verified today: the route calls `recordClaim` and discards its return value.

## P2. Communications are coordinated

### P2-1. One communications ledger

Verified: the 72-hour budget in `lib/nudges.ts` reads only the `nudges` table, and only firm nudges write to it; intake replies, proposals, activation, digests, desk emails and Gmail sends do not. `search_assignments` records a proposal, not a delivered email.

Work: `communications` (person id, channel, template id, voice version, job, supporting state snapshot, intended_at, queued_at, sent_at, provider message id, delivery status, error, reply_detected_at, stop_reason). Every sender writes to it. The budget reads it.

Acceptance:
- Sending H and G to the same person on the same day is refused by the budget with a logged reason.
- A failed provider send leaves `delivery status = failed` and a retry task; the retry uses the provider idempotency key and cannot double-send.
- Lily's desk shows queued, sent, failed as three different words.

### P2-2. Reminders are eligibility checks, not schedules

Work: G at 3 and 10 days, I on the partner's own check-in date, N after G twice. Each run evaluates live state, the ledger, the reply detector, local time, and the essential-versus-optional policy. Any reply cancels the pending reminder before classification.

Acceptance:
- A reply at 04:00 cancels a 09:00 reminder without any classifier having run.
- A person with a support flag receives no reminder.
- A recruiter who accepted a search with "check in on Friday" gets I on Friday, a scout never gets I.

### P2-3. Queued, not "sent and editable"

Work: lane decisions queue the email for 3 minutes with a visible cancellation window in the Slack thread; the thread then shows "sent" with the provider id, or "failed" with the error and a retry button. Sent messages are never described as reversible.

Acceptance: the Slack thread for a decision shows exactly one terminal delivery line.

## P3. Searches are recommended and maintained correctly

Verified: the proposal `POST` upserts on `(job_id, user_id)` and resets `declined_at`, `declined_reason`, `status`, so re-proposing over a `working` or `declined` row rewrites the partner's earlier answer; expiry is a weekly sweep in the digest cron while the email says seven days; all 215 current proposals expire on 20 September, 187 of them carrying `proposed_at` dates older than their 6 September creation, because they were imported from emailed briefs.

Work: proposal history table; `POST` refuses to overwrite a non-expired answer unless `reason` is given and creates a new event; capacity held at acceptance with an atomic check; expiry evaluated at read and action time with the sweep as cleanup only; hide/pause/decline preserve rows.

Acceptance:
- Re-proposing a declined search creates a second history row and leaves the first decline visible.
- Two partners accepting the last slot within a second: one succeeds, one sees the alternative.
- A partner accepting at 08:59 on expiry day is `working`, never swept.
- "Never assigned" on the desk is computed from history, not from current rows.

## P4. Candidate and firm trust

Work: states `draft`, `permission_requested`, `submitted`, `claim_confirmed`, `reviewing`, `not_a_match`, `introduced`, `client_interviewing`, `offer`, `hired`, `withdrawn`, `duplicate`; protection text appears only at `claim_confirmed`; the partner chooses the contact handoff (they forward, or Lily reaches out); firm search visibility follows `search_assignments.firm_id` as well as `user_id` (verified: `resolvePartnerAccess` reads `user_id` only); removing a member removes access the same minute.

Acceptance:
- A candidate whose consent is not confirmed is never emailed by the desk.
- A firm member sees a search assigned to the firm; a removed member sees nothing on next request.
- Test candidates (owner on an internal domain, or flagged) never appear in partner-facing statuses or emails. Verified: Dhaval received "Ashwin is on the bench" about a test record on 6 September.

## Journeys to test before any cohort

1. Existing partner still marked new (Keana, two addresses).
2. Approved applicant whose account uses a different email than the application.
3. Approved applicant with no matching search.
4. Invitation link opened after expiry.
5. Agreement accepted, access still false (the Ajmal case).
6. Application with only a sample URL, including a self-link.
7. Submission without candidate consent.
8. Claim fails after the submission row is written.
9. Duplicate claim by a second partner.
10. Firm invite accepted, then the member removed.
11. Accepted search paused, then a new proposal on the same role.
12. Last slot taken while a second partner is reading the brief.
13. Reply arrives 5 minutes before a scheduled reminder.
14. Provider failure on send, then retry.
15. Acceptance at the moment of expiry.
16. Partner waiting on an overdue Refery or client review.

## What to measure

Primary: qualified, permitted introductions per activated partner; time to first useful feedback; interviews, offers, starts, day-90 completions, paid placements; Lily's minutes per activated partner and per useful introduction (from calendar events tagged by purpose, not by title match).

Supporting: application to meaningful response time; time waiting on Lily's decision; account and agreement completion with access failures counted separately; searches offered, viewed, accepted, declined, paused with reasons; failed sends; unwanted reminder replies; duplicate or attribution disputes.

Not primary: checklist completion, email opens.

## Rollout

Cohort one: applicants who arrive after P0-1 and P0-4 are live, small enough to read every thread, split by contribution mode. Independent start and assisted start are both offered inside the cohort; compare by acquisition source and mode. No historical backlog contact until reconciliation is signed off by Lily on the desk.

Voice release: run the sixteen journeys under the old templates and the new ones, judge on factual accuracy, state accuracy, relevance, tone, clear next action, phone readability. Zero invented states or terms is the bar. Keep three human-approved examples and three known bad ones beside the spec.

## P1-6. Outbound invitations (added 7 September)

Verified: the Outreach hub (`outreach_threads`, `outreach_messages`, thread statuses including `replied_positive` and `meeting_booked`) and `prospect_recruiters` with an outreach status already exist; LinkedIn campaigns run through Aimfox. An outbound reply today gets a cal.com link and never touches `scout_applications`.

Work: two kinds of link. A personal single-use `/invite/{token}` for Lily's own email replies (S). A universal `/join/{campaign}` for Marj's mass, scheduled LinkedIn DMs, with an `outbound_campaigns` table (slug, search id, approved summary version, channel, sender, audience synced from Aimfox as name plus normalised LinkedIn URL, active from, active to) and a who-are-you step (name, email, LinkedIn URL) on the page. A submission that matches the audience by normalised LinkedIn URL, or by email where the audience has one, creates the application row as `approved`, `source = outbound`, `campaign = slug`; a submission that does not match creates a normal `in_review` application with the campaign recorded, sends A, and the Slack card says "came via {slug} link, not on the list"; account creation from the page prefills name and email and auto-approves; an "Invite" action on the prospect row and a Slack slash command that both generate the link and copy the S text; reply classification in the hub creates a "send S" task for positive and question replies; T is drafted in the thread at day 5, never sent automatically; the partner record keeps source, channel, campaign and first-touch date.

Acceptance:
- A campaign link submission whose LinkedIn URL matches the audience is approved without a Slack card; one that does not match creates an in-review application and a card naming the link.
- The same person submitting the campaign form twice produces one application row.
- Opening a valid personal token twice: the second open shows "already used" or "log in", and no second application row exists.
- An expired token creates nothing and shows the reissue message.
- A token whose search closed shows the next approved urgent search or the honest closed state; it never shows a client name before the terms are accepted.
- After account creation from an invitation, `access_check` passes, the picked search is the suggested one on Start, and the partner row carries `source = outbound` with the campaign.
- No invitation can be generated for a person who is already a partner, an open applicant, or on the do-not-contact list.
- The anonymised summary on the page is the approved version for that search; a search without an approved preview cannot be attached to an invitation.

Also applied from Lily's decisions: the submission path accepts a CV PDF only (upload or forward to candidates@refery.io); LinkedIn URLs on applications are stored as context and never create candidates.
