# Engine release 1: correctness and access

Implemented 2026-09-09 from `Claude-Code-Refery-implementation-brief.md` and
`Refery-core-engine-audit.md`, then revised the same day against the
independent review `Claude-Code-Release-1-review.md` (eight findings, all
closed below). This is the first of the brief's three releases: access,
deterministic correctness, one eligibility policy, versioned records, a
shared cost ledger, fenced queues, and the benchmark harness. It is built
and tested; nothing has been deployed or applied to production.

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

## The review's eight findings and what changed

The reviewer's own probe script (`review-probes-2026-09-09-before.json`,
eight of nine expectations failing at `4a8e143`) was rerun against this
commit with one shim (their SDK mock lacks the error class the gateway
imports): `review-probes-2026-09-09-after.json`, nine of nine passing.

| # | Finding | Fix | Regression coverage |
|---|---|---|---|
| 1 | The $95 budget was optional: drafts, classification, the parser, transcripts, the recap, embeddings and the legacy routes called the SDK directly; a missing client or an empty ledger row let calls through. | `lib/engine/paid.ts` is the only file that imports `generateText` or `embed`. Every caller goes through `paidGenerateText` / `paidEmbed`; `structured()` requires a ledger entry and will not compile or run without one. No client, a missing RPC, an error, an empty or malformed row: each defers without dispatching (`BudgetDeferredError`). `ENGINE_LEDGER=strict` is gone; there is no lenient mode. Month-to-date desk spend that predates the ledger is imported once (part 4). | `tests/engine/paid.test.ts`: budget exhausted → zero provider requests for panel, bench, classify, draft, transcript extraction and embeddings; ledger missing, erroring, empty and malformed; six concurrent callers with two allowed → exactly two dispatches. |
| 2 | One reservation per chain; a timeout on the first model was lost when the second answered; cache writes not priced; validation failures not billed. | One reservation per dispatched attempt, priced for that model at the dearer of input and cache-write rates and the full output budget. Timeout → `uncertain`, reservation kept. Output that fails validation with usage → `completed` (billed). Cache read, cache write, reasoning tokens and the response id are finalised. The caller's stored cost is the sum of every attempt. A refusal mid-chain stops the chain. | `paid.test.ts`: timeout then success → two rows, `uncertain` then `completed`; billed invalid JSON then success; all attempts fail; refusal past the cap stops the fallback; cost equals the sum of charges. |
| 3 | A panel rerun could move a human `not_fit` or `dormant` to `decision_pending` with source `desk`. | The panel updates assessment fields always and lifecycle fields only from `uploaded`, `calibrating`, `decision_pending`, `ready_for_intro`, with a conditional update on the stage it read (a human deciding mid-run wins). Reactions and web decisions now write source `human`. The database guard refuses any move out of a closed or held state into an in-review state unless the source is `human`. The cron posts no new card for `not_fit`, `dormant` or `bench` on an automatic rerun. | `review-findings.test.ts` (3); SQL validation: rerun reopen blocked with source kept, human reopen allowed, grade refresh allowed. |
| 4 | `classifyVisa('not authorized to work in the US')` was `authorized`; so was `Canadian citizen`. | Negations and sponsorship needs are read first and their clause removed before any positive pattern; a positive next to a denial is `conflicting`; a pending status is `pending`; foreign citizenship alone is `unknown`; a future sponsorship need on OPT stays `time_limited`. `pending` and `conflicting` go to a human. | `review-findings.test.ts` (4): positive, negative, foreign-only, pending, conflicting, transfer, time-limited, empty. |
| 5 | A `question` blocker (EUR vs USD, OTE vs base, unknown start date) left the seat `eligible` and the action `client_intro`. | Blockers carry `readiness: required \| optional`. A required question makes the seat `needs_review`; client readiness also requires every strong seat's own pair policy to agree. A recorded `waive_logistics` override (job or global scope, actor and reason on the row) clears unknowns and required questions, never a hard blocker. | `review-findings.test.ts` (5), through `deriveDecision`, not only the blocker array. |
| 6 | Reuse returned the old row with its old policy; the hash omitted calibration and recipient permissions; a failed candidate update was never repaired. | The version is the whole prompt the model saw (evidence hash, facts, seats, recipient block, labels, pitch, calibration) plus the prompt version; policy and overrides are recomputed on every run. A reuse writes a new row (`reused_from`, cost 0) from the stored read and then performs the same persistence as a fresh run, so an interrupted write completes without a purchase. | `review-findings.test.ts` (6): calibration and recipient change the hash; a restriction changes the action without changing the hash. |
| 7 | A targeted rerun could claim a running item; writes were not fenced on the lease; the outbox was drained without a claim; a false completion was ignored. | `claim_panel_queue` no longer has the targeted bypass. `renew_panel_lease` / `renew_match_lease` are called just before any write; a lost lease discards the result (`LeaseLostError`). `enqueue_candidate_panel` no longer resets a running row; it records `rerun_requested` and the row returns to queued when the run completes. The outbox is claimed under a lease (`claim_outbox`) and completed against it; `uncertain` parks an item for a human. A false completion is logged. The unleased fallback paths are gone. | SQL validation: targeted claim while running → 0 rows; expired lease reclaimable, stale renew and stale complete refused; enqueue-while-running keeps ownership and requeues after; outbox claims disjoint, wrong lease refused, `uncertain` recorded. |
| 8 | Panel seat verdicts used the global policy; a declined role could keep a strong, client-ready assessment. | `buildPanelContext` evaluates the policy once per live seat with that job's rejections and overrides; `seatVerdict` takes the pair policy and makes an excluded pair `ineligible` with `rejected_for_this_role` while keeping the capability read; `match_assessments` store the pair policy; `applyDecision` re-checks every seat named in an intro. | `review-findings.test.ts` (8): two seats, one declined, one eligible; a job-scoped block override with provenance. |

Also from the review: `pnpm engine:parity` is now a gate that fails on any
RPC error and checks candidate-role pairs (declined submissions, job-scoped
overrides) on both sides; the aggregate comparison is `--pre-migration`, a
named diagnostic. The benchmark and the probe script are metered like
everything else.

## Migrations (not applied)

Four SQL files under `scripts/engine/`, applied in order. All four were
executed against production inside one transaction that was then aborted
on purpose, with assertions computed inside it; nothing persisted (checked
afterwards: no `candidate_eligibility`, no `engine_settings`, overloads still
2, RLS still off).

| File | What it does |
|---|---|
| `2026-09-09-01-access-hardening.sql` | Bench retrieval and 21 other privileged functions become service-role only; RLS on `tmp_investors` and `deletion_log`. |
| `2026-09-09-02-eligibility-and-matching.sql` | `candidate_eligibility(uuid, uuid)`; human-decision and override tables; one matching implementation with a versioned signature; the nightly function guarded; `bench_candidates_for_job_v2`; a BEFORE INSERT guard on machine proposals. |
| `2026-09-09-03-engine-records.sql` | `engine_settings` (95 / 85 / 70); `engine_reserve_budget` / `engine_finalize_budget` on `brain_ai_usage`, the Brain's entry point delegating; leased queue claims; versioned sources, facts, scorecards, assessments, slates; the outbox; the provenance-labelled seed of human decisions. |
| `2026-09-09-04-review-fixes.sql` | The journey guard against non-human reopening; the `waive_logistics` effect; strict claims, lease renewal, rerun-while-running, leased outbox; the import of this month's pre-ledger desk spend ($5.38, 66 rows on 2026-09-09). |

## Tests and results

- `pnpm test`: 80 vitest cases in 5 files, all passing (`policy`, `fit`,
  `deterministic`, `paid`, `review-findings`).
- Typecheck of every changed file: clean (the repository's build ignores
  type errors, so this was run explicitly with `tsc --noEmit`).
- Policy parity, pre-migration diagnostic: the TypeScript aggregate equals
  the SQL aggregate from the validation run on all 337 rows. The row-by-row
  gate runs once the SQL exists.
- Benchmark, deterministic layer: 8 of 8 synthetic fixtures. The model runs
  could not be executed here (no gateway key locally) and remain unfinished.
- The reviewer's probes: nine of nine pass (see above).

## Deployment steps, in order

The code now requires the SQL. Deploying the application before the
migrations would defer every paid call (parser uploads, panels, recaps),
because a missing ledger is a refusal, not a pass. So:

1. Staging first, if a staging database exists: apply parts 1 to 4, run
   `pnpm engine:parity`, exercise a sign-up form (`submit_scout_application`
   still public), a super-admin candidate page, a manual panel run.
2. Production: apply parts 1, 2, 3, 4 in order (Supabase SQL editor or
   `apply_migration`). Each is idempotent (`if not exists`,
   `create or replace`, keyed imports).
3. Run `pnpm engine:parity` (must exit 0) and the security advisor
   (RLS-without-policy INFO rows on the new server-only tables are expected).
4. Deploy the code (merge the branch, push main).
5. Watch `engine_budget_status()` for the first day: every paid call from
   every source appears there, and `uncertain` rows are the ones to
   reconcile against the provider's usage export.
6. `ENGINE_BENCH_V2=shadow`; compare `search_match_runs.shadow` with the v1
   pool until the numbers say the same people are found, then `on`.

## Rollback plan

- Code: revert the merge on main (Vercel redeploys the previous commit). The
  previous code does not read the new tables and calls the old queue path;
  it will work against a database that has the migrations applied, except
  that `bench_candidates_for_job` and `enqueue_candidate_panel` are now
  service-role only, which the old code already satisfies.
- SQL, in reverse order, only if needed:
  - Part 4: `create or replace` the previous `candidates_guard_journey_trg`,
    `claim_panel_queue`, `enqueue_candidate_panel`, `complete_panel_queue`
    bodies from part 3 / production; drop `renew_*`, `claim_outbox`,
    `complete_outbox`. Imported ledger rows are identifiable by
    `metadata->>'import_key'` and can be deleted, then `spent_usd` recomputed.
  - Part 3: the new tables are additive; `brain_reserve_budget` can be
    restored to its pre-release body (it is in the audit's evidence file).
  - Part 2: `drop trigger pipeline_guard_eligibility`; restore the
    pre-release `match_new_jobs_for_candidate` body (in the audit's evidence
    file). The dropped 3-argument overload was already failing with 42725
    and has no working caller to restore for.
  - Part 1: `grant execute ... to anon, authenticated` and
    `disable row level security` per the file header. Not recommended.

## Cost

Observed this session: $0 in model calls (none were made). Envelope after
the migration: hard $95, defer $85, alert $70, shared by the desk, the
parser, transcripts, onboarding, the two legacy routes, the Brain (which
keeps its own $20 inside it), embeddings and the benchmark. Month to date at
validation: $5.61 ($5.38 desk, imported; $0.22 Brain). Reservations are
worst case and finalised to the provider's usage; timeouts stay `uncertain`
for reconciliation. The audit's planning envelope is unchanged; nothing here
validates it.

## Not done, and why

- The model benchmark (`pnpm engine:benchmark -- --routes ...`) needs the
  gateway key; the proposed OpenAI routes stay benchmark-only and refused
  candidate data until it runs and Lily's labelled set exists.
- Release 2: the delta cursor replacing `last_match_date`, capability-only
  embeddings and a re-embed, role scorecards from hiring-manager briefs, the
  fact extraction that fills `candidate_facts`. The tables exist; nothing
  populates facts or scorecards yet.
- The nightly script patch (auto-accept off, only uniqueness conflicts
  swallowed) is applied to the local copy at `C:/scripts` and saved as
  `docs/engine/nightly_run-2026-09-09.patch`; whether that copy is the one
  that runs is not established.
- Database concurrency was validated inside one transaction on one
  connection (SKIP LOCKED between two claims in the same transaction proves
  the row set is disjoint, not that two sessions interleave correctly). A
  two-session test needs a staging database.
- The 6 grade-pointer mismatches and the 127 unverified legacy `not_fit`
  rows are listed in the reconciliation for review, not changed.
- No dormant candidate exists today, so the guard's dormant case was
  exercised only in the unit test, not the SQL run.

## Unverified assumptions

- That pg-meta's `execute_sql` ran each validation batch on one connection
  in one transaction; the post-run checks say nothing persisted.
- That `role_submissions.reviewed_by` and `acted_by_user_id` identify the
  human who declined; the seed uses them as the actor.
- That the Brain's per-source allocation should stay at $20 inside $95.
- That no browser code calls the 21 restricted functions (grep of app/,
  lib/, components/, hooks/ and C:/scripts found none).
- That a PDF page costs no more than the gateway's conservative estimate
  (base64 length / 6, minimum 8,000 tokens) for the reservation; the
  finalised row uses the provider's real usage either way.

## Follow-up integrated 2026-09-09: evidence, resumable nightly, hosted validation

Lily's Codex bundle (`Refery-engine-setup-2026-09-09.zip`, see
`SETUP-2026-09-09.md`) was integrated into both real checkouts the way its
START-HERE asked: by cherry-picking the local commits, not by re-applying
the patches.

| Repository | Branch | Commit | Parent |
|---|---|---|---|
| `refery-gh` (this app) | `engine-release-1` | `9ecc08d` (tree identical to Codex's `dba1de2`) | `d3a2ece` |
| `J00-es/refery-automation` (`C:/scripts`, the clone that runs the nightly workflow) | `codex/engine-follow-up-2026-09-09` | `8120a07` | `8b89133` = `origin/main` |

Neither branch is pushed. Production, its schema and its model approvals
are unchanged.

What was re-run here after the integration (supersedes the counts above):

- `vitest run`: 88 cases in 7 files, all passing. `pnpm test` itself
  currently fails before vitest starts because pnpm's pre-run dependency
  check trips on an unapproved `esbuild` build script; run the binary
  directly or `pnpm approve-builds` once.
- `tsc --noEmit`: 96 errors, all pre-existing, none in `lib/engine`,
  `lib/desk/panel.ts`, `scripts/engine` or `tests/engine`.
- `scripts/engine/test-database.ts`: 15 of 15 scenarios on an embedded
  Postgres, two real sessions (the two-session concurrency gap listed under
  "Not done" is closed by this).
- `benchmark.ts --dry`: 8 of 8 deterministic fixtures.
- Worker repo: `python -m unittest discover -s tests`, 12 of 12.
- Hosted validation of migrations 01 to 05 on production, inside one
  transaction aborted on purpose (`hosted-validation-2026-09-09.json`):
  worker contract `nightly-v2`; 337 candidates queued, restart adds 0; six
  candidates through `engine_process_next_candidate` on the real HNSW
  index, 379 pairs evaluated, 376 assessments, 151 proposals, all with an
  owner, none for an excluded candidate, none to a do-not-contact company;
  fact bundles idempotent and a stale snapshot refused; a scorecard draft
  cannot confirm a hard gate; the six new RPCs refused to `anon` and
  `authenticated`, executable by `service_role`. Nothing persisted
  (checked afterwards).

One production defect found by that run, fixed in migration 02 before it
is ever applied: the job pool query in the matching function carried a
redundant `j.embedding is not null`. The partial HNSW index
(`jobs_embedding_hnsw_open_idx`, `where status = 'open'`) holds no null
vector, so the clause changes no result, but with the table's stale
statistics (`null_frac` 0.51, last analysed 2026-09-06) the planner
abandoned the index for an `idx_jobs_status` scan plus a full sort over all
22,484 open jobs: 50 seconds per candidate on the hosted instance, against
10 seconds cold and 17 milliseconds warm through the index. The
production 4-argument function has the same clause today, so the current
nightly already pays this whenever the statistics drift; the last six
nightly runs took 3 to 19 minutes. The instance is small for this index
(228 MB HNSW against 224 MB `shared_buffers`), which is why cold candidates
still cost 2.5 to 9.4 seconds each; the resumable loop was designed for
exactly that.

Volume note for the first activated night: the loop proposes up to 30 new
pairs per candidate that have no pipeline row yet, and the six validation
candidates averaged 25. Expect on the order of 8,000 new `auto_matched`
rows the first night, then a trickle.

Activation order, replacing the six steps above:

1. Apply `scripts/engine/2026-09-09-01` to `-04` in order, then
   `supabase/migrations/20260909105010_engine_evidence_and_complete_matching.sql`
   (05). Never `supabase db push` blind: the repo has other unapplied
   files under `supabase/migrations/`.
2. `pnpm engine:parity` must exit 0; then
   `scripts/engine/2026-09-09-benchmark-reconciliation.sql` (32 charges,
   $0.415, idempotent) so the ledger carries the benchmark spend.
3. Deploy the app branch and the worker branch together: the worker's
   `engine_paid.py` preflight refuses to run until
   `engine_worker_contract()` reports `nightly-v2`, and the app defers every
   paid call until the ledger RPCs exist. Keep any old nightly schedule
   disabled; the workflow's concurrency group stops overlapping runs.
4. Leave `ENGINE_EVIDENCE_ENABLED` unset, `ENGINE_BENCH_V2=shadow`, the
   OpenAI routes benchmark-only and `capability_embedding` unused until the
   human-labelled set exists.

Still outside this repository: the Vercel team is not reachable from here
(403 on the team listing), the human review packet
(`Refery-human-review-120-candidates-360-pairs.zip`) contains real names,
emails, phone numbers and LinkedIn URLs and must stay out of this public
repository, and no human label exists yet, so `evaluate-human-labels.ts`
has nothing to score.
