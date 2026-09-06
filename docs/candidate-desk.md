# The candidate desk

Live since 6 September 2026. Grade at the door, decide in Slack, let the system chase.

## The shape

```
any door ─▶ candidates insert ─▶ trigger queues panel ─▶ /api/cron/panel (every minute)
                                                            │
                                     one Opus 5 call: grade, seat fits, three drafts
                                                            │
                                                     decision card in #refery-desk
                                                            │
              🔥 intro now      👍 bench      👎 not a fit (reason in thread)     🙋 by hand     💤 a week
                   │                │               │
        email to owner or       note to owner    note to owner
        candidate (Gmail,       journey → bench   journey → not_fit
        as lily@refery.io)
        journey → intro_requested / intro_sent
                   │
        /api/cron/followups (every 30 min): nudges, intro detection, calendar reply,
        booking detection, escalations back to the card thread, a sweep so nobody waits
        without a timer
                   │
        Granola note ─▶ /api/cron/call-recaps ─▶ recap card ─▶ 🔥 👍 👎 💤 verdict,
        thread reply = Lily's note, drafts for the founder blurb and the referrer update
        each with their own 👍 to send

seat goes live ─▶ trigger queues search_match_queue ─▶ /api/cron/bench (every 5 min,
Monday 07:00 UTC for all seats) ─▶ one Sonnet 5 call over the nearest 40 on the bench ─▶
numbered card, 1️⃣..6️⃣ act on one, 🔥 all strong, 💤 dismiss
```

## Where things live

| What | Where |
| --- | --- |
| Model choice, prices, cached prefix | `lib/desk/model.ts` (env: `DESK_PANEL_MODEL`, `DESK_BENCH_MODEL`, `DESK_CLASSIFY_MODEL`, `DESK_DRAFT_MODEL`) |
| The panel prompt, schema, persistence | `lib/desk/panel.ts` → `candidate_panels`, `candidates.panel_grade / recruiter_verdict / person_type / panel_at` |
| Live seats as the panel reads them | `lib/desk/seats.ts` (from `partner_roles_v` where live and open) |
| Logos and schools | `lib/desk/tiers.ts` (from `companies_tiers`, `schools_tiers`) |
| The decision card | `lib/desk/card.ts` → `candidates.desk_card_channel / desk_card_ts` |
| Decisions and their side effects | `lib/desk/decide.ts` → `candidate_decisions`, `candidate_emails`, `candidate_followups` |
| Follow-up engine and escalations | `lib/desk/followups.ts`, signals in `lib/desk/signals.ts` |
| Bench re-match | `lib/desk/bench.ts` → `search_match_runs`; RPC `bench_candidates_for_job` |
| Post-call verdicts and drafts | `lib/desk/verdict.ts` (on `call_recaps` cards) |
| Every email the desk sends | `lib/desk/outbound.ts` → `candidate_emails`; Gmail in `lib/google.ts` |
| Fixed-wording emails | `lib/desk/emails.ts` |
| Slack wiring | `app/api/slack/events/route.ts` (recognises each card by its message) |
| Timers and the one automation | `desk_settings`, edited at `/admin/settings` |
| Schedules | `cron.job`: `desk-panel`, `desk-followups`, `desk-bench`, `desk-bench-weekly`, `call-recaps`; all call `public.desk_cron_post(path)` with the vault `cron_secret` |

## Journey A after the desk

`uploaded → decision_pending → intro_requested → intro_sent → committee_call → warm → placed`, with `bench`, `not_fit`, `post_committee_not_fit` and `dormant` off the strip. `ready_for_intro` is retired; the 111 people who were there moved to `bench` on launch day. `journey_stage_source = 'desk'` marks moves the desk made, and a trigger stops the nightly automation from undoing a desk or human move, or replacing a desk grade.

## What sends itself, what waits for a tap

| Auto | One tap (a reaction or a button) | Never automatic |
| --- | --- | --- |
| panel, card, referrer nudges day 3 and 7, calendar-link reply when an intro lands, pre-call questions, one candidate nudge, HM chase at 48 h, escalation lines, decision reminders, Sunday digest | intro ask, bench note, founder blurb, referrer update after a call, going direct after a referrer never connected, HM blurb from a bench card | the not-a-fit note (needs a line or "send"), the post-call verdict |

`bench_autosend_hours` in `desk_settings` is the one exception: off by default, and when set the bench note goes on its own after that many hours of silence on a card that suggested bench.

## Loopholes the design closes

- Every waiting stage has a timer. The sweep at the end of each follow-up run gives anyone without one an escalation, which puts them in Slack.
- A send that fails is written to `candidate_emails.error` and said in the thread. The decision stands; the email is the thing to redo by hand.
- A referrer's reply is classified (Haiku 4.5) before a nudge goes, so nobody is nudged after answering.
- A duplicate under another owner is named on the card; the first claim holds.
- A founder, recruiter or investor whose CV arrived is graded but never drafted an intro; :+1: files them.
- A panel that fails three times posts a warning to the desk with the reason.

## Setup that has to happen once

1. The Google refresh token behind `GOOGLE_REFRESH_TOKEN` needs `gmail.send` and `gmail.readonly` in addition to `gmail.compose`. Until it does, every send answers 403 and the card thread says so.
2. The Refery Ops bot must be in `#refery-desk` (it is) and `SLACK_CHANNEL_CALLS` set for recap cards.
3. The nightly automation does not re-panel. A candidate is panelled once, at upload or submission, and the desk owns the grade from then on. The nightly job's only work on candidates is the embedding used by the GTM matcher, and the guard trigger throws away any grade or stage the old panel step might still write.

## Cost

Opus 5 per panel with a cached prefix: about $0.05. Sonnet 5 per bench seat: about $0.12. Haiku 4.5 per reply read: under a cent. `candidate_panels.cost_usd` and `search_match_runs.cost_usd` hold the real numbers.
