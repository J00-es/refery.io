---
name: inbound-hiring-lead-reply
description: Draft and send the first reply to a founder or hiring manager who submitted the Refery start-hiring form. Use whenever the user wants to reply to an inbound hiring lead, follow up with a company that asked about hiring, or asks for "the hiring lead email". Also the reference copy for the automated reply that fires on a :+1: in #refery-new-hiring-lead.
---

# Inbound hiring lead reply

The first email a company gets after filling in the start-hiring form. Its only job is to
book a call.

## Where this fires automatically

`:+1:` on a message in `#refery-new-hiring-lead` sends exactly this email and moves the row to `in_conversation` in `hiring_manager_leads`. The code lives in `lib/intake-emails.ts`
(`hiringLeadEmail`), driven by `app/api/slack/events/route.ts`.

**If you change the copy here, change it there too.**

## The email

From: `Lily Joo <lily@refery.io>`
Subject: `[Refery] {Company} / Lily :)`

```
Hi {FirstName},

Lily from Refery! Saw you're hiring at {Company}. :)

We work with a network of scouts and independent recruiters who bring people
out of their own networks, so you see profiles that are not sitting on job
boards or applying anywhere else.

{roles line}

Happy to do a quick call. cal.com/refery-lily/15 works?

Best,
Lily
```

The roles line depends on whether `roles_hiring_for` was filled in:

- Filled in: `You mentioned {roles}, and that sits right in what our network covers.`
- Blank: `Would be good to hear which roles are open and where the gaps are.`

Quoting their own words back is the one bit of personalisation that earns its place here.
It is also why the blank case gets a question rather than a generic claim: promising to
cover roles you have not been told about is a claim you cannot support on the call.

## Rules

- **Plain text.** Same reason as the scout reply: it has to read like a person wrote it.
- **No em dashes.**
- One paragraph on the model, maximum. Do not explain the fee, the scout split, or the
  guarantee. Those land better on the call, and pricing in a first email invites a
  comparison against agencies before anyone has heard the difference.
- The form already rejects freemail domains, so treat the sender as a real company contact
  and do not open by asking who they are.

## Sending by hand

```sql
select full_name, work_email, company_name, roles_hiring_for, status, outreach_sent_at
from hiring_manager_leads
where work_email = '<their email>';
```

Send only if `status = 'new'`. Afterwards set `status = 'in_conversation'`,
`reviewed_at = now()`, `outreach_sent_at = now()`.

## When a lead is not a fit

Send nothing. Set `status = 'rejected'` and `reviewed_at = now()`. This is what
`:-1:` does.
