---
name: scout-application-email
description: How a scout or partner application is answered. Use whenever the user wants to reply to a scout application, follow up with an applicant, or asks for "the scout application email". The copy lives in lib/voice/templates.ts; the decisions live in lib/onboarding/decisions.ts.
---

# Answering a scout application

Since 8 September 2026 there is no single "application email". There is a
receipt and five decisions, and the copy for all of them lives in one place:
`lib/voice/templates.ts` (templates A to P). Edit there, never here. The voice
rules are `docs/proposals/2026-09-07-onboarding/01-voice-spec.md`.

## What happens without anyone

- On a valid application the receipt (A) goes the same minute: "you'll hear by
  {two working days}". Test rows are marked invalid and get nothing. An active
  partner who applies again is closed as already-partner and gets nothing.
- The Slack card in `#refery-scouts-application` shows who we already know this
  to be, what they told us, what is unverified, and the search we would suggest.
- 48 hours with no decision: one honest pending note (P), and the card is
  marked overdue on the desk. Nothing is approved or declined by a timer.

## The five reactions

| Reaction | Decision | Email |
|---|---|---|
| `:+1:` | approved, independent start | B (scout) or C (recruiter with an approved preview) |
| `:raised_hands:` | approved, offer a call | D, or B if no preview exists |
| `:question:` | clarification needed | nothing yet; the next thread reply goes to them as your question |
| `:world_map:` | no matching search | F |
| `:-1:` | declined | E to a real person; nothing to spam |

Each reaction queues its email for three minutes. Reply `cancel` in the
thread to stop it. The decision stands either way.

## Sending by hand

Use the same templates. Fill only facts you can verify. Subjects are
`[Refery] Full name | context`. No calendar link unless the decision is
"offer a call", and then it comes after the search, never instead of it.
