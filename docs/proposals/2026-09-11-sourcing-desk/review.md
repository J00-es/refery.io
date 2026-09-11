# Review of the sourcing mock-ups

Lily's review, 11 September 2026, of the eight Flow screens and the Slack approval card in the design canvas. The build (section 10 of the proposal) follows this review where it differs from the mock-ups.

## Recommendation

Keep this product direction and visual structure. Build it inside the existing Refery application. Its strongest elements are the hiring-manager profile, a compact candidate review drawer, visible conversation stages, centralized mailbox controls, and a Slack decision summary.

Before implementation, correct the candidate evidence rules, establish a real contact-data budget, and reconcile sending capacity with the desired volume. At 15+ searches and 3,000 newly contacted candidates per month, the current proposal does not yet demonstrate either enough contact supply or enough mailbox capacity.

If "3,000 candidates" means people discovered or evaluated, with a smaller number contacted, the economics and capacity requirements are materially easier. Keep those two targets separate in the product.

## What to preserve

- A role profile synthesized from the brief, hiring-manager call, answers, and feedback, with visible sources.
- Separate must-haves, preferences, exclusions, and unresolved questions.
- One candidate drawer containing evidence, caveats, and the exact proposed email.
- Keyboard review, batch decisions, and a concise Slack summary.
- Gmail sending, conversation ownership, shared mailbox caps, and central suppression.
- Plain emails without open-tracking pixels or rewritten links.
- Pause controls and visible explanations for blocked work.

## 1. Make the evidence rules stronger than the prose

Kenji is marked Ready despite thin React evidence and no native work found. Email verification must not turn unresolved fit into approval. Luca is rejected because he is in Seattle; his willingness to relocate is not shown. Record location and relocation willingness separately.

For every requirement, display: supported, contradicted, or unknown; the supporting source and date; and whether the requirement is mandatory or preferred. Keep fit, contact validity, relationship restrictions, and approval as separate fields. "Ready" should require the relevant checks to pass.

Calibrate each new role using a small mixed set. Store specific reasons. Two rejected candidates from large technology companies should not silently become a universal exclusion of that background.

When the hiring manager changes the brief, create a new version and show the substantive changes. Preserve explicit overrides with their authors and reasons.

The Priya email makes a very specific claim about a technical implementation. Production must link that claim to actual supporting evidence before using it. If the evidence is missing, use a simple truthful opening about relevant experience.

## 2. Replace the implied free data supply with a measured funnel

Apollo People API Search costs zero credits and does not return email addresses. Enrichment is separate and costs credits. Test the actual account before forecasting. Included credits still consume a finite resource.

Reading 120 profiles to obtain 27 ready candidates is 22.5%; 4,000 enrichments would give about 900 ready people, and 3,000 ready would need about 13,333. Enrichment cannot be budgeted as one lookup per person eventually contacted.

Remove the GitHub commit-email harvesting and the automatic bounce fallback to those addresses. Public visibility is not an outreach permission.

## 3. Correct the capacity model

Three fully ramped mailboxes at 50 a day over 22 weekdays is 3,300 sends a month, about 1,950 first emails in a Tuesday to Thursday window. Two messages per person supports at most 1,650 people; three, 1,100. Do not solve this by raising limits. Show an honest forecast. Aliases share the underlying account's capacity. Kim's address is kim@getrefery.com, not kim@refery.io. Start with an initial email and one follow-up.

## 4. Automate after calibration without creating a permanent review job

Modes: learning (review the role definition and initial decisions), approved batches (approve an exact inspectable set), automatic within rules (with a random audit sample and an exceptions queue). Slack and the app control the same decision record. Bind approval to the exact batch, candidate IDs, draft versions, sender and brief version. Duplicate reaction events must not duplicate sending.

## 5. Keep communications predictable

Domain-wide delegation needs configuration evidence. One shared outbox and contact history across roles and mailboxes; stable sender identity for the whole conversation; stop on a reply, including one sent through ordinary Gmail; pause when reply sync is stale or credentials fail; reconcile a timed-out send before retrying; central opt-out and relationship checks immediately before sending; separate controls for pausing discovery and pausing outbound; reply processing continues when the AI budget is exhausted.

"Not interested" and opt-out messages: stop, without another email. A request to reconnect later is a dated task. Out of office: pause and recheck. Do not switch to an unverified personal address after a bounce. Replace "no unsubscribe footer" with a clear opt-out and the required identity details. DMARC changes follow alignment evidence. Remove the $1,000 referral promise unless a confirmed programme applies.

## 6. The most useful cost-saving design

One reusable candidate evidence record, evaluated against relevant roles; a versioned approved brief; search existing candidates first; several discovery routes; inexpensive broad screening, then evidence only where needed; facts with provenance reused across searches; a stronger model only for hard assessment; contact details bought only for qualified people, stopping at the budget; send from the existing authorised Gmail with one follow-up initially. The 355-person bench does not need a hard "nearest 40" cutoff; combine structured filters and semantic retrieval. Show remaining funded capacity and defer work when it runs out; never substitute weaker candidates or fabricated evidence to hit a volume target.

## Build order and proof required

Versioned role profile, evidence-based review, reused candidate records, visible spend and capacity forecast first. Reuse the existing Gmail machinery before adding sequences. Slack actions and conditional autonomy once the underlying decisions and sending are reliable. Pilot on three representative searches and record discovery yield, hiring-manager acceptance, missed good candidates, contact coverage, lookup expense including failures, review minutes, positive replies and interviews. Before full release, demonstrate correct handling of changed briefs, duplicate workers, repeated Slack events, manual Gmail replies, opt-outs, wrong-person reports, revoked access, exhausted budgets, and a timeout after Gmail has already accepted a message.
