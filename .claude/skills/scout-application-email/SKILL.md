---
name: scout-application-email
description: Draft and send the first reply to someone who applied to the Refery scout network. Use whenever the user wants to reply to a scout application, follow up with a scout applicant, or asks for "the scout application email". Also the reference copy for the automated reply that fires on a :+1: in #refery-scouts-application.
---

# Scout application reply

The first email a scout applicant gets. Its only job is to book a 15 minute call.

## Where this fires automatically

`:+1:` on a message in `#refery-scouts-application` sends exactly this email and marks the
row `qualified` in `scout_applications`. The code lives in `lib/intake-emails.ts`
(`scoutApplicationEmail`), driven by `app/api/slack/events/route.ts`.

**If you change the copy here, change it there too.** Two copies that drift are worse than
one that is slightly wrong, because nobody can tell which one an applicant actually got.

## The email

From: `Lily Joo <lily@refery.io>`
Subject: `[Refery] Scout Application | {Full Name}`

```
Hi {FirstName},

Lily from Refery! Saw that you're interested in becoming a scout for Refery. :)

Happy to meet you and get to know you better.

cal.com/refery-lily/15 works?

Best,
Lily
```

## Rules

- **Plain text.** No HTML shell, no signature block, no logo. The moment it looks like a
  template it stops reading as a note from a person.
- **No em dashes.** Colon, comma, or full stop instead.
- Keep the `:)`. It is in every one of these Lily has sent by hand.
- Do not pitch the 70% split or explain the model. That is what the call is for.
- Do not personalise from their application. Tried and rejected: referencing their city or
  network makes the email longer without making the call more likely, and it signals the
  applicant was screened, which invites a debate about the screening.

## Sending by hand

Look the applicant up first so the reply is not sent twice:

```sql
select full_name, email, status, outreach_sent_at
from scout_applications
where email = '<their email>';
```

Send only if `status = 'new'`. Afterwards set `status = 'qualified'`,
`reviewed_at = now()`, and `outreach_sent_at = now()` so the Slack reaction path and the
manual path cannot both fire.

## When someone is not a fit

Send nothing. Set `status = 'not_qualified'` and `reviewed_at = now()`. This is what
`:-1:` does. There is deliberately no rejection email: a network application that goes
quiet is normal, and a rejection note invites a reply asking why.
