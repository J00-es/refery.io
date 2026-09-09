# Engine release 1: correctness and access

Implemented 2026-09-09 from `Claude-Code-Refery-implementation-brief.md` and
`Refery-core-engine-audit.md` (the handoff bundle of the same date). This is
the first of the brief's three releases: access, deterministic correctness,
one eligibility policy, versioned records, a shared cost ledger, atomic
queues, and the benchmark harness. It is built and tested; nothing here has
been deployed or applied to production.

## What was verified before anything was written

The deployed commit is `51adc90`, the same as the local checkout, so the
audit's source hashes describe what runs. Every audit count reproduced on
production on 2026-09-09 with the audit's own SQL:

| Finding | Audit | Re-run |
|---|---:|---:|
| B+ candidates excluded from the bench by grade alone | 8 | 8 |
| Calibration rows recognised of 60 (exact / first line) | 2 / 20 | 2 / 20 |
| Pipeline rows created after an excluded stage, last 7 days | 76 of 887 | 76 of 887 |
| Bench pool "met" only by a non-null legacy verdict | 100 of 159 | 100 of 159 |
| Latest panels: intro_now with blocker text; grade/percentile mismatch | 2 of 3; 3 of 18 | 2 of 3; 3 of 18 |
| `match_jobs_for_candidate` overloads | 2 | 2 |
| `bench_candidates_for_job` anon-executable, SECURITY DEFINER | yes | yes |
| `tmp_investors`, `deletion_log` RLS off, anon SELECT | yes | yes |

Two things the audit did not list were found on the way: 21 other
SECURITY DEFINER functions are anon-executable with no caller check
(including `desk_cron_post`, which fires any cron with the vault secret, and
`enqueue_candidate_panel`, which queues a paid model call), and the
production 4-argument matching function fails for `max_results` above 166
because it passes the raw pool size to `hnsw.ef_search` (capped at 1000).

## Migrations (not applied)

Three SQL files under `scripts/engine/`, applied in order. All three were
executed against production inside one transaction that was then aborted
on purpose, with assertions computed inside it; nothing persisted (checked
afterwards). Every assertion passed:

| File | What it does | Validated inside the rolled-back run |
|---|---|---|
| `2026-09-09-01-access-hardening.sql` | Bench retrieval and 21 other privileged functions become service-role only; RLS on `tmp_investors` and `deletion_log`; anon and authenticated SELECT revoked. Public forms, RLS helpers and key-gated dashboards are left alone. | anon and authenticated calls denied with 42501; service role allowed; RLS on. |
| `2026-09-09-02-eligibility-and-matching.sql` | `candidate_eligibility(uuid, uuid)` (policy eligibility-v1); `candidate_human_decisions` and `candidate_eligibility_overrides`; drops the plain 3-argument overload and adds `match_jobs_for_candidate_v2` with the legacy signature delegating to it; the nightly matcher's function gets the policy guard; `bench_candidates_for_job_v2` (no grade gate, exclusion before the limit, embedding plus lexical routes fused by reciprocal rank); a BEFORE INSERT trigger that refuses machine proposals for excluded people. | one overload left; the legacy 3-argument call resolves; policy on the four audit candidates as expected; matchable pool 171 vs 159 under the old gate, 24 B+ and 6 ungraded now reachable; v2 returns 40 per live seat and another 40 after excluding the first 40; the guard refused `auto_matched` for a not_fit person and allowed a human `job_shared`. |
| `2026-09-09-03-engine-records.sql` | `engine_settings` (95 / 85 / 70), `engine_reserve_budget` and `engine_finalize_budget` on the existing `brain_ai_usage` ledger, with the Brain's own entry point delegating to them; leased queue claims (`claim_panel_queue`, `claim_match_queue`, completion conditioned on the lease); `candidate_source_versions`, `candidate_facts`, `role_scorecard_versions`, `candidate_assessments`, `match_assessments`, `match_slates`, `engine_runs`, `desk_outbox`; new columns on panels, runs, queues and candidates; the seed of `candidate_human_decisions` with provenance. | two claims of one item are disjoint; completion with a wrong lease is refused; a $0.40 desk reservation is allowed and finalised; a Brain reservation still works; $200 is refused at the hard line; a discretionary $90 is deferred; seeded rows: 275 legacy_unverified capability, 114 verified met, 9 verified role decisions. |

Apply order matters (3 depends on 2). Rollback notes are in the file headers.
After applying: run `pnpm engine:parity` (row-by-row TypeScript versus SQL
policy) and the Supabase security advisor (RLS-without-policy INFO rows on
the new server-only tables are expected).

## Code (this repository)

New, under `lib/engine/`:

| Module | Purpose |
|---|---|
| `policy.ts` | eligibility-v1, the TypeScript twin of the SQL function: reasons with classes, overrides, `client_intro_ready`. |
| `fit.ts` | Typed blockers (hard / preference / unknown / question) from facts on record; visa, location, pay, years, education timing; `role_fit`, seat eligibility, `next_action`, and the derived decision with the model's own suggestion kept beside it. |
| `money.ts`, `dates.ts` | Band comparison with currency, period and base/OTE kinds; education end timing. |
| `grade.ts` | The grade contract (grade-v1): labels and criteria, no percentiles; `stripPercentiles` for legacy rows. |
| `labels.ts` | Legacy verdict parsing as a migration aid; both historical mappings kept visible. |
| `routes.ts` | The model route register: candidate-data approval, benchmark-only routes, list prices (Sol corrected to 4/20), effort options per provider. |
| `ledger.ts` | Reserve before dispatch, finalise after, `uncertain` on a timeout. |
| `queue.ts` | Leased claims with a logged fallback to the old path until the RPCs exist. |
| `evidence.ts` | Content hashes and source versions. |
| `decisions.ts` | Writes human decisions as they happen; met evidence; policy inputs. |
| `outbox.ts` | Side effects retried without repurchasing the model call. |

Changed:

| File | Change |
|---|---|
| `lib/desk/model.ts` | Allowlist and prices from the register; ledger reservation and finalisation around every call; provider request id kept; duplicate routes in a chain removed. Production chains unchanged. |
| `lib/desk/panel.ts` | Prompt v3: no percentiles, evidence rules (untrusted CV text, no inference of authorisation from schools or names, no level from pay, dates and pay computed by code), scope field, unknowns field. Calibration reads only verified post-call decisions and never the person being read. Idempotent by input hash (manual reruns excepted). Deterministic layer derives the decision; every seat becomes a `match_assessments` row; a failed candidate update is an error. |
| `lib/desk/card.ts`, `app/api/cron/panel/route.ts`, `components/candidates/desk-assessment.tsx`, `lib/desk/verdict.ts` | Grade label from the contract, percentiles stripped from legacy text, typed blockers rendered by kind, next action and eligibility lines on the card. |
| `app/api/cron/panel/route.ts` | Leased claims, typed outcomes, budget deferral keeps the item queued without counting an attempt, decision cards retried from the outbox. |
| `lib/desk/bench.ts` | `ENGINE_BENCH_V2` = off / shadow / on; met from evidence, not the legacy verdict; whole pool, positives and slate stored separately (`results` never overwritten); outbox for the card; reactions re-check the policy at the moment of action. |
| `lib/desk/decide.ts` | Contact check before writing to a candidate directly; role decisions recorded with actor and time. |
| `lib/desk/verdict.ts` | `:zzz:` is an availability decision and no longer writes `moderate` into the capability field; verdicts and met events recorded; HM blurbs refused when the policy forbids contact, and marked when not client-ready. |
| `lib/embeddings.ts` | `embedding_input_hash` and `embedding_version`; unchanged content is not re-embedded. |
| `app/api/candidates/[id]/verdict/route.ts` | The web chip records a verified capability decision beside the legacy column. |
| `components/searches/bench-block.tsx` | Same met rule as the bench. |
| `lib/desk/seats.ts` | Seats carry `salaryCurrency`. |

Outside this repository: `C:/scripts/nightly_run.py` patched (diff in
`docs/engine/nightly_run-2026-09-09.patch`): only the uniqueness conflict is
swallowed on insert, policy refusals are counted, and the 0.70 auto-accept
is off unless `AUTO_ACCEPT_ENABLED=1`. Whether that file is the copy that
runs is not established (the memory notes say the scheduled jobs run from
private repositories); the database guard applies regardless of caller.

## Tests and results

`pnpm test` (vitest): 50 tests in 3 files, all passing.

| Brief case | Where |
|---|---|
| Legacy three-argument matching call | SQL validation: resolves after the migration (and exposed the ef_search bug, fixed in v2) |
| Anonymous bench caller; unauthorised authenticated caller | SQL validation: 42501 on both |
| B+ with exact evidence included | SQL validation: 24 B+ matchable; `policy.test.ts` |
| Do-not-contact, applicable rejection, role-specific rejection | `policy.test.ts` |
| Missing visa or relocation: unknown plus a question | `fit.test.ts` |
| Strong skills, unknown logistics: screening, not client-ready | `fit.test.ts` |
| Confirmed hard mismatch plus a strong read: no client-ready match | `fit.test.ts` |
| Master's ended May 2026 | `deterministic.test.ts`, `fit.test.ts`, benchmark dry run |
| $200k in $180k to $220k: inside, not maximum | `deterministic.test.ts`, benchmark dry run |
| EUR vs USD, OTE vs base: not compared | `deterministic.test.ts`, `fit.test.ts` |
| Low ask does not lower capability | `fit.test.ts` |
| Legacy `strong` plus prose; `low` alias; prose is not a grade | `deterministic.test.ts` |
| CV instructions have no authority | `fit.test.ts` (deterministic layer); prompt v3 rule; benchmark fixture 5 for the model layer |
| Foreign candidate or role id rejected | `fit.test.ts`; `keepKnownIds` in panel and bench |
| Two workers claim one item | SQL validation |
| Assessment succeeds, Slack fails | outbox (`decision_card`, `bench_card`) |
| Provider response uncertain after timeout | ledger `uncertain` |
| Budget exhausted: queue with reason | SQL validation (defer and hard line); panel route |
| Role reopened / brief edited; capped delta run; top-40 fence | v2 exclusion before the limit and refill validated; the delta cursor is release 2 (see below) |

Policy parity (`pnpm engine:parity`) against production rows: the
TypeScript aggregate equals the SQL aggregate exactly (171 matchable, 24
B+, 6 ungraded, 0 client-ready, identical reason counts). Row-by-row
comparison runs automatically once the SQL function exists.

Benchmark harness (`pnpm engine:benchmark -- --dry`): 8 synthetic
fixtures, deterministic layer 8/8. The model runs (`--routes ...`) could
not be executed here: the AI gateway refuses unauthenticated calls and the
key is not in the local environment. Run it where `AI_GATEWAY_API_KEY` is
set; the report lands in `docs/engine/benchmark-<date>.md`. The proposed
OpenAI routes (Luna, Terra, 5.4 mini) are registered as benchmark-only and
are refused candidate data by the allowlist.

## Cost

Observed this session: $0 in model calls (none were made). Ledger
envelope after the migration: hard $95, defer $85, alert $70, shared by
the desk, the parser, transcripts, the Brain (which keeps its own $20
inside it) and embeddings. Reservations are worst case (no cache, full
output budget) and finalised to the provider's usage; timeouts are kept as
uncertain for reconciliation. The audit's planning envelope ($87.02 for
500 candidates a month) is unchanged; nothing here validates it.

## Deployment steps, in order

1. Apply the three migrations (Supabase SQL editor or `apply_migration`),
   part 1, 2, 3.
2. Run `pnpm engine:parity` and the security advisor.
3. Deploy the code (push to main). Until the migrations exist the code
   degrades: claims fall back to the old path with a log line, the ledger
   lets calls through unrecorded, human decisions are logged as not
   recorded. `ENGINE_LEDGER=strict` turns a missing ledger into a failure.
4. Set `ENGINE_BENCH_V2=shadow` for a week; compare `search_match_runs.shadow`
   against the v1 pool; then `on`.
5. Run the model benchmark with the gateway key; keep the incumbent routes
   unless the blinded comparison and the human-labelled set both pass the
   brief's gates.

## Not done in this release, and why

- Release 2 items: the delta cursor replacing `last_match_date`, the
  capability-only embedding builder and a re-embed of all rows, role
  scorecards from hiring-manager briefs, the fact extraction step that
  fills `candidate_facts`. The tables exist; nothing populates facts or
  scorecards yet.
- The human-adjudicated benchmark (section 8) needs Lily's labels; the
  harness measures invariants and economics only.
- The 0.70 auto-accept is turned off in the local copy of the nightly
  script; if the scheduled copy lives elsewhere, the same patch applies.
- The 6 grade-pointer mismatches and the 127 unverified legacy `not_fit`
  rows are listed for review, not changed.
- Brain edge functions still call `brain_reserve_budget`; its body now
  delegates to the shared authority. The functions themselves were not
  redeployed and did not need to be.

## Unverified assumptions

- That pg-meta's `execute_sql` ran the validation batch on one connection
  in one transaction; the post-run checks (function absent, RLS still off,
  overloads still 2) say it did.
- That `role_submissions.reviewed_by` and `acted_by_user_id` identify the
  human who declined; the seed uses them as the actor.
- That the Brain's per-source allocation should stay at its current $20;
  the envelope treats it as a sub-cap inside $95.
- That no browser code calls the 21 restricted functions (grep of app/,
  lib/, components/, hooks/ and C:/scripts found none).
