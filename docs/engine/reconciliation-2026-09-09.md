# Reconciliation dry run, 2026-09-09

Read-only. Nothing below changed a record. Counts are from production on
9 September 2026 (337 candidates at the time of the last query; the audit
counted 334 earlier the same day).

## Legacy labels (`candidates.lily_verdict`)

| First line of the field | Rows | Seeded as |
|---|---:|---|
| free prose (no token) | 199 | `capability = prose`, legacy_unverified |
| strong | 33 | `capability = strong`, legacy_unverified |
| weak | 14 | `capability = weak`, legacy_unverified |
| very_strong | 13 | `capability = very_strong`, legacy_unverified |
| moderate | 13 | `capability = moderate`, legacy_unverified |
| low | 2 | `capability = weak`, alias recorded, legacy_unverified |
| pass | 1 | `capability = pass`, legacy_unverified |

275 rows carry a value; 201 of them have no attributable call evidence
(no call note, no transcript, no met journey stage). None of the 275 is
used for calibration. The raw text is preserved unchanged; the seeded rows
say `decided_at` was approximated from `updated_at`.

The two historical mappings (desk: moderate = A-; skill: moderate = B+)
are kept side by side in `lib/engine/labels.ts` and neither is applied.
The 13 `moderate` rows cannot be split between "hold, off market" and
"middling ability" from the data; they stay unverified until Lily confirms
them one by one.

## Verified human decisions seeded

| Kind | Value | Rows | Source |
|---|---|---:|---|
| met | call_note | 61 | recruiter_notes (note_type = call) |
| met | call_transcript | 52 | candidate_activity_log |
| met | call_recap | 1 | call_recaps |
| role_decision | bench | 2 | candidate_decisions |
| role_decision | not_fit | 2 | candidate_decisions |
| role_decision | intro_now | 1 | candidate_decisions |
| role_decision | declined (job-scoped) | 4 | role_submissions |
| capability | (post-call verdicts) | 0 | none recorded yet with an actor |

Calibration examples therefore start empty: there is no verified post-call
capability decision on record. The panel runs without worked examples until
Lily's reactions on recap cards (which now write these rows) accumulate.

## Exclusions under eligibility-v1

| Reason | Candidates |
|---|---:|
| candidate_consent_unknown (a question, not a block) | 324 |
| not_met_yet (information) | 127 |
| legacy_not_fit_unverified | 127 |
| calibration_sample | 24 |
| filed_not_a_candidate | 23 |
| temporarily_off_market | 10 |
| human_not_fit_after_call | 6 |
| human_not_fit | 2 |
| candidate_not_told | 1 |

`not_fit` by who set it: backfill 103, automation 19, rule 5, desk 2. The
127 non-desk rows are preserved as exclusions and labelled unverified. They
are the reason-aware review list: none is reopened by this release, and a
human can reopen any of them with a recorded override.

Matchable: 171 (the old grade gate admitted 159). Of the 171, 24 are B+ and
6 ungraded. Client-ready: 0, because no candidate has consent recorded as
true and the warm stage together.

## "Met" provenance

The bench's old rule counted a non-null `lily_verdict` as "met". Under the
new rule (a met journey stage, or an attributable call note, transcript or
recap) the pool's met flags come from 114 evidence rows across candidates,
not from the verdict field.

## Current pointers

6 of the 21 desk-paneled candidates carry a `candidates.panel_grade` that
differs from their latest `candidate_panels.grade` (all desk-sourced, all on
8 or 9 September). The cause is not established from the data; this release
makes a failed candidate update after a saved panel an error instead of a
silent skip, and the parity script can list the six for review.

## Identities

2 email groups and 1 LinkedIn group point at more than one candidate row.
Not merged; the duplicate-owner check on the decision card still names the
earlier row.

## Presentation

38 of 40 panels have a percentile in `positioning`. Nothing is rewritten:
every renderer now strips percentiles from legacy rows and new panels
carry a peer line without one.

## Embeddings

9 of 21 paneled candidates have an embedding older than their latest panel.
No hash exists for those vectors, so alignment cannot be proven either
way. New embeddings record `embedding_input_hash` and `embedding_version`;
the builder content itself is unchanged in this release (a re-embed of all
rows is a later release).

## Queues

No stale running or failed rows at the time of the query.
