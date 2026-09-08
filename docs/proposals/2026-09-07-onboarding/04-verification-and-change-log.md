# Review verification and change log

7 September 2026. Every review finding was checked against the working tree and read-only queries. Database figures are snapshots taken during the check.

## 1. Findings checked

| Review finding | Result | Evidence |
|---|---|---|
| 109 applications: 86 new, 18 in conversation, 5 rejected | Confirmed | `scout_applications` grouped by status |
| 9 new rows match active accounts by exact email | Confirmed | Join on lower-trimmed email; names listed in the plan, P0-1 |
| 1 rejected applicant is an active recruiter | Confirmed | Fongyen Lin, account since 17 August, state working |
| 75 external partner accounts, 81 including internal | Confirmed | 6 rows on refery.io and 10kventures.co |
| 26 signed_idle, 18 working, 12 lapsed, 9 offered, 5 took, 5 unsigned | Confirmed | `partner_state_v`; these are the view's labels |
| 215 proposed rows, all created 6 September, 187 with older proposed_at, all expiring 20 September | Confirmed | `search_assignments` |
| Only 3 partners have a linked call | Confirmed | `last_call_at` matches `call_recaps.person_email` by exact email only |
| "Zero placements ever" unsupported | Partly. No `candidates` row is hired or placed, `role_submissions` holds 3 rows, all declined. The 19 August transcript has Lily, not Luke, telling Luke "last month I think we did six". Platform data and the spoken claim are unreconciled. | Transcript `6152fd91` |
| "Calls do not convert" unsupported | Agreed. Withdrawn. | |
| Recap runtime loads the repository recap skill, requests scope `call-recap`, no active document has it | Confirmed | `lib/call-recap.ts` `loadSkill`; `brain_knowledge_documents` active rows carry `general`, `refery-inbox`, `chief-of-staff` |
| Commercial document is Draft | Confirmed | `docs/brain/refery-commercial-terms.md` header |
| No 2.1 acceptances | Confirmed | Versions in use: scout 1.2.0 and 2.0, recruiter 1.2.0 and 2.0, scout_partner 1.0.0, partner_submission 1.0 |
| Installed `refery-voice` skill says scouts get 50% | Could not verify. No file named refery-voice or post-call-recap exists under `~/.claude` or in either repository, and no local skill says 50%. If these are claude.ai project skills, they are outside this machine. Every local source says 70%. | Filesystem search |
| Anonymous SELECT on `partner_state_v`, definer semantics | Confirmed, and worse: `anon` also holds INSERT/UPDATE/DELETE grants on the view, and eight further public tables have RLS off with anonymous SELECT | `information_schema.role_table_grants`, `pg_class` |
| `nudges` RLS disabled with anonymous grants | Confirmed | No policies |
| Sign-up writes a client-chosen role with the admin client | Confirmed | `app/api/auth/sign-up/route.ts` |
| Slack handler has no reviewer authorisation beyond the signature | Confirmed | `app/api/slack/events/route.ts` |
| Searches gated to beta; 47 of 75 external partners outside | Confirmed | `DESK_BETA_ONLY`, `users_admin.is_beta` |
| Proposal upsert resets earlier answers; expiry sweep is weekly while copy says seven days | Confirmed | `search-assignments/route.ts`, `cron/weekly-digest/route.ts` |
| Nudge budget reads only the firm nudge ledger | Confirmed | `lib/nudges.ts` `claim`; only five firm nudges write to it |
| Submission recorded before the claim, claim result unchecked | Confirmed | `partners/submissions/route.ts` discards `recordClaim`'s return |
| Firm search visibility follows direct user assignments only | Confirmed | `resolvePartnerAccess` filters `search_assignments` by `user_id` |
| Firm tables empty | Confirmed | 0 orgs, 0 members, 0 invites |
| Mark's third sample URL is his own profile | Confirmed | Slack thread |
| Sonam asked whether she had to sign up again | Not re-read. Accepted from the review; the success page copy confirms the gap exists | `join-as-scout/page.tsx` success state |
| The mockup's "sent, reply within three minutes" was a contradiction | Agreed | |
| Paraform's call comes after login, not before | Agreed. My first message overstated this. | |

Disagreements with the review, stated plainly:

- The review says the intake card uses a "pseudo-precise score". The existing card is rule-based with reasons ("SF/NY network, shared 3 candidates, top 1%"), which is the right shape. The 86/100 was my mockup's invention, and it is gone. I am keeping the reason list.
- The review says explicit buttons beat four emoji. Agreed for the new decisions, but Lily's stated preference is to keep deciding from Slack with a reaction, and the existing bot already seeds `+1`/`-1`. The revised card keeps reactions as the gesture and names each one in the card text, so the four meanings are explicit without a modal.
- The review calls Luke's transcript "a spoken claim of six placements". The claim is Lily's, in answer to Luke's question. Same evidential weight, different speaker.

## 2. Change log against the first proposal

Kept:
- Self-serve explanation in the product, with a short written page as the first-class path.
- Lily decides admission from Slack in one gesture.
- Preferences captured once and used to suggest a first search.
- Plain-text emails from lily@refery.io.
- Sunday digest as the only scheduled partner email.

Revised:
- Three "lanes" became three separate decisions: how they contribute (introduce, recruit, firm, bring companies), admission (in review, approved, clarification, no matching demand, declined, paused, already a partner), and support (independent, written help, calibration call, partnership conversation).
- "Call after first graded submission" rule withdrawn. A call is offered when it has a purpose: calibration on a named search, firm setup, partnership, or an unresolved question. It can come before any submission.
- 24-hour auto-lane withdrawn. An untouched application becomes an overdue task and, once, an honest pending note.
- "Two or three searches on day one" became one strong match, an optional second, or an honest no-match.
- Headline numbers corrected: 86 marked new with reconciliation pending, 75 external partners, 26 by the view's definition, 215 outstanding rows including imports, calls and placements unmeasured.
- Every email rewritten against the voice specification; "check it before you ask me", "people worth meeting", "top 0.1%", "bar is high", "lanes", "bench", "off-bar" removed.
- Slack card: existing relationship and prior decision shown first; samples deduplicated and self-links flagged; "would propose" shown as a recommendation with its reason; queued, sent, failed as three states.
- Pass email now offered to Lily as a decision, never automatic; spam and test rows are marked invalid silently.
- Mobile: application receipt separated from account creation; video optional; one first search; blocked-access and no-match screens added; save, fit check and introduce separated; consent asked at the introduce step; pipeline statuses in plain words; the "nothing needed from you" example moved under progress updates.
- Lily's desk organised by who can unblock: Lily, Refery, suitable work, partner, client; a demand view added; "reversible" replaced with what can be cancelled, revoked, restored, and what cannot.
- Implementation order now starts with identity reconciliation, anonymous access, knowledge path, server-owned admission, and the beta gate.

Rejected from the review:
- Replacing reactions with buttons as the only gesture (kept reactions, made their meaning explicit).
- Treating the existing rule-based priority as a score to remove (kept, with unknowns added).

Rejected from my first proposal:
- 20/50/30 lane proportions. Invented.
- "Signed, never given a search reads zero" as a target. The right target is "approved, no suitable search" named with the demand gap.
- The 4-minute video as a checklist step.
- "You own this intro for 24 months" on the submit button. Appears only after a confirmed claim.
- "We do not send marketing" on the notifications page. Unsupported.

## 3. Decisions that need Lily

1. Beta gate: open Searches to every partner who has accepted partner terms once P0-2 and P0-5 are done, or keep the gate and restrict proposals to beta users?
2. The pass email: send it on every decline (recommended), or keep silence for the obvious spam and only send it when the applicant is a real person?
3. The 24-hour pending note (template P): send it automatically once, or only create the internal task?
4. Which of the two Keana accounts is the main one, and whether the eight other "new but active" rows should be closed as already-partner without a message.
5. Whether the `refery-voice` and `post-call-recap` skills exist in the claude.ai project, so their commercial figures can be removed.
6. The placement count. What was hired through Refery to date, so the platform can record it and the recap prompt can stop guessing.
7. Whether an anonymised preview of one live search may be shown before the agreement, and which searches are approved for that.

## 4. Decisions taken on 7 September (Lily)

1. Beta gate: open Searches to every partner who has accepted the partner terms, once the anonymous-access and access-check work (P0-2, P0-5) is done.
2. Pass note: sent to real people on every decline. Spam and test rows stay silent, marked invalid.
3. Pending note (P): sent automatically, once, at 48 hours.
4. Keana Alabre: three accounts exist. `keanarecruiting@gmail.com` (joined 1 August, 36 candidates) is the main one; on 2 August Lily moved her candidates there at Keana's request and Keana confirmed by email. `keana@copatible.com` and `keanaalabre@gmail.com` (both 23 July, recruiter 1.2.0 accepted, zero candidates owned, zero assignments) were deleted on 7 September on Lily's instruction. Before deletion, 12 of the 36 candidates still carried the copatible login in `candidates.user_id` and `uploaded_by_user_id` from the August move, and `candidates.user_id` cascades on auth-user delete, so they were repointed to the main account first. The two acceptance rows were kept with `user_id` set null. The 6 July application was closed as onboarded with a note. Result: one account, 36 candidates, one application row.
5. The `refery-voice` and `post-call-recap` skills exist in the claude.ai project. They are outside this machine; their commercial figures should be replaced with a pointer to the voice specification once it is adopted.
6. Placements to date: none. Lily confirmed on 7 September that no placement has been made. Internal information: no partner-facing page, email, brief or DM may state or imply a placement count, and the recap prompt must never produce one. The internal desk shows the figure as internal only.
7. Pre-agreement preview: allowed for urgent searches only, anonymised so the client cannot be identified. Rules in the email kit, Part 4.

Two further rules from Lily: candidates enter Refery only as a CV PDF, never as a LinkedIn URL; and every subject carries the recipient's full name, `[Refery] Full name | context`.

Outbound was added as its own flow (canvas page 1, templates Q to U, plan P1-6). LinkedIn DMs are sent by Marj through Aimfox as mass, scheduled messages, so the DM carries one universal campaign link (for example refery.xyz/join/sf-engineering) in place of today's calendar link. The page asks who they are; a match against the campaign audience (normalised LinkedIn URL) goes straight to account setup, already approved with the campaign recorded; no match goes into normal review with a Slack card that names the link. Aimfox does support per-lead custom variables, so a personal link per DM is possible later if wanted, but the design does not depend on it. Marj answers page-level questions in the thread (R2); terms, client and partnership questions go to Lily. Lily is out of the default path and keeps two doors: the prospect can book her from the invitation page or the Start page, and she can send U from her desk to anyone she wants to meet. The current DM's "400+ scouts and 200+ startups" is flagged: the database shows 75 external partner accounts, so the figures need a truthful wording or removal.
