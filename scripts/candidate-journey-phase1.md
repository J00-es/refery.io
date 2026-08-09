# Candidate journey — phase 1 (schema)

Applied to Supabase as migration **`candidate_journey_stage_phase1`** on 2026-08-09.
The SQL lives in the project's migration history (`list_migrations`), not duplicated here.

**Additive only.** `candidates.status` was left untouched and still carries its old
values, because the external nightly automation writes it. Nothing rendered on the
site changed in this phase.

What it added:

| Object | Purpose |
| --- | --- |
| `candidates.journey_stage` (+ `_at`, `_source`) | Journey A — where we are with the person. Backfilled for all 270. |
| `candidates.panel_grade` | The panel verdict as a comparable grade (`A+`…`pass`). NULL for the 27 rows whose `recruiter_verdict` is prose — those need re-panelling, not a guess. |
| `pipeline_internal_state` | Journey B's internal ladder, admin-only RLS. Separate table on purpose: RLS hides rows, not column values, so putting these inside `job_candidate_pipeline.stage` would make a scout's candidate vanish once it advanced. |
| `candidate_activity_log.{source,confidence,from_state,to_state}` | Turns the existing log into the journey event log. Two new activity types. |

Backfill result (270 rows): `not_fit` 113 · `ready_for_intro` 109 · `calibrating` 26 · `warm` 22.

The vocabulary in code is `lib/journey.ts` — that is the source of truth for labels,
the A− bar, and the next-action mapping. Do not hardcode stage strings elsewhere.
