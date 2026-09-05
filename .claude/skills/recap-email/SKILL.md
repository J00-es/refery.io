---
name: recap-email
description: Draft the recap email Lily sends after an intro call, for a candidate, a scout, or a recruiter. Use whenever the user wants the post-call recap, "the email I send after a call", a follow-up to someone she just spoke to, or asks to redraft one. Also the reference copy for the draft that is created automatically in Gmail after every Granola-recorded call.
---

# Post-call recap email

The email Lily sends after an intro call. It goes out the same day, ideally within
the hour.

Its job is not to be friendly. It is to **write down what was said so the other
person can correct it.** That is why it works: people reply with their CV, with a
missing job title, with "actually I'm a founding engineer at Breezy". Those
replies are how the CRM gets fixed. A vague, warm email gets a vague, warm reply
and teaches us nothing.

## Where this fires automatically

After every Granola-recorded call that resolves to a person we know, a draft of
this email is created in Gmail and announced in `#refery-calls`. **Nothing is
ever sent.** Lily edits and sends from Gmail.

The code lives in `lib/call-recap.ts`, driven by
`app/api/cron/call-recaps/route.ts`. It reads *this file* as its prompt, so
editing the copy here changes the drafts. There is no second place to update.

## Envelope

```
From:    Lily Joo <lily@refery.io>
Subject: [Refery] {Full Name} / Lily :)
```

Plain text. No HTML, no signature block, no logo. If a thread with this person
already exists, the draft goes into that thread and the subject becomes
`Re: ...` on its own.

## Shape

Every recap has the same four moves.

```
Hi {First},

{One warm sentence naming ONE specific thing from the call.}
Quick recap so you have it all in one place. :)

{Section: what they told us about themselves}
- bullet
- bullet

{Section: what happens now / how we work}
- bullet
- bullet

{Section: the ask}
{One or two sentences, or bullets.}

{One warm closing line.}

Best,
Lily
```

Rules that do not bend:

- **Only what was actually said.** If the call did not cover compensation, there
  is no compensation line. Never fill a section by inference. An invented detail
  is worse than a missing one, because the recipient trusts this email to be a
  record.
- **Three to six bullets per section.** More than that and nobody reads it.
- **Bullets are facts, not prose.** Years, companies, cities, numbers, stages.
- **Name the specific people and things they mentioned.** "your girlfriend, a
  Stanford-trained ML perception engineer at Waymo" is the line that makes the
  email work. "your network" is not.
- **No em dashes.** Use a comma, a colon, or a full stop.
- **Keep the `:)`.** Usually one in the opener, sometimes one at the close. Never
  more than two in the email.
- **Flag anything that needs correcting.** If a CV says one thing and the call
  said another, say so plainly: "Your Amazon experience was an internship, so we
  should make sure that is clearly labeled on the updated CV."

## The three variants

Which one to write is decided by who they are, not by what they asked for.

### A. Candidate (they want a job)

Opener line: `Quick recap so I have your search right. :)`

| Section | Heading | Holds |
|---|---|---|
| 1 | `Your background` | Where they have worked, for how long, on what. |
| 2 | `What you are looking for` | Sector, stage, company size, cities, comp, visa, start window. |
| 3 | `Next step` | Reply with latest CV as a PDF. |

Close with the promise that keeps them warm without committing us:

> I will keep it selective and reach out when there is a genuinely strong fit
> rather than flooding you with roles :)

### B. Scout (an individual with a network, not an agency)

| Section | Heading | Holds |
|---|---|---|
| 1 | `Your side, as I noted it` | Their role, their network, geography, the specific people they named. |
| 2 | `Next steps` | Account status, who to send, how to send them. |
| 3 | terms | One line on the split, taken from the reference. |

Always include, near the end, a single sentence stating the scout's share of
the placement fee. Take the number from the Refery reference, never from memory:

> As discussed, scouts receive {split} of the placement fee when someone they
> refer is hired.

### C. Recruiter or agency partner

| Section | Heading | Holds |
|---|---|---|
| 1 | `Your side, as I noted it` | Their search focus, seniority, geography, and their concerns. |
| 2 | `How we can work together` | The terms block below, trimmed to what was discussed. |
| 3 | `How to start` | Sign up and sign the partner agreement. |

Sign off with the title on this variant only:

```
Best,
Lily Joo
Founding Partner, Refery
```

### Dual track

Some people are both, most often a recruiter who is also job hunting. Write the
partner sections first, then add a final section headed `On your own search`
with what they want for themselves. Do not merge the two, and do not drop one.

## Facts that must be exact

Every commercial term in this email comes from the **Refery reference** supplied
alongside this specification. It is the Refery Commercial Terms document, read
from the Brain at the moment of writing, so it is current by construction.

This file used to carry the numbers itself. That copy drifted: it told partners
the company-introduction bonus was "10% of Refery's revenue" when the signed
agreement says 10% of the placement fee, roughly three times larger. Numbers do
not live here any more, and should never be added back.

Rules for using the reference:

- **Quote it, never recall it.** If a term is not in the reference, it does not
  go in the email, however certain you feel about it.
- **Only what the call covered.** The reference says what is true. It does not
  say what to mention. A term the conversation never touched stays out.
- **When the reference is silent** on something the call raised, write that Lily
  will confirm it. Never estimate.
- **Never mention when a partner gets paid.** Payment timing does not belong in
  a first-call follow-up: it reads as a caveat before anyone has done any work.
  If they ask directly, Lily answers it herself.

Things this specification still fixes, because they are voice rather than
commercial fact:

- Refery is 100% contingency-based, also said as success-based.
- On a focused search we work with only **2 to 3 recruiters**.
- We handle calibration, curation, the hiring-manager relationship, and the
  process end to end.
- Sign-up and agreement: **https://refery.xyz**
- Booking link, when another call is needed: **cal.com/refery-lily/15**
- Fractional work sits outside contingency and needs a separate SOW.

## Worked example, candidate

```
Hi Devangi,

Really lovely meeting you today, and glad Boardy connected us! Quick
recap so I have your search right. :)

Your background
- Around 3 years at MetafoodX, working on its hardware-software platform for
tracking and optimizing large kitchen operations, including deployments and
integrations with legacy food-management systems.
- Your Amazon experience was an internship, so we should make sure that is
clearly labeled on the updated CV.

What you are looking for
- B2B SaaS or B2B2C SaaS, ideally moving beyond food tech.
- Preferably seed to Series A and around 11 to 50 employees, although the
mission and company matter more than the exact stage.
- San Francisco or New York only.
- Compensation is flexible based on the role and the value you can bring.
- H-1B approval is in progress and expected within 2 to 3 weeks, with
activation on October 1. Your target start window is late September to
mid-October.

Next step
Please reply with your latest CV as a PDF, including the corrected Amazon
internship title. That will upload cleanly into our system, and I can start
matching you against relevant roles across our SF and New York network.

I will keep it selective and reach out when there is a genuinely strong fit
rather than flooding you with roles :)

Really nice meeting you, and talk soon!

Best,
Lily
```

## Worked example, scout

```
Hi Bruno,

Really great meeting you today! Your engineering network across Chile, broader
Latin America, and the Bay Area feels very relevant for what we are building.
Quick recap so you have it all in one place. :)

Your side, as I noted it
- Frontend engineer at Breezy in SF, previously at Fintual, with a University
of Chile CS background and a master's in France.
- Strong engineering network across Chile, Colombia, Brazil, Argentina, and the
Bay Area.
- The Chilean H-1B1 route is especially interesting, with no lottery and a much
faster process than the standard H-1B.
- Two immediate profiles stood out: the ex-Meta engineer you met, and especially
your girlfriend, a Stanford-trained ML perception engineer at Waymo who is
exploring physical-AI opportunities.

Next steps
- Your account is approved. :)
- Please share the physical-AI role I sent in the chat with your girlfriend.
Meanwhile, you can upload her directly or email me her CV as a PDF so it goes
into our system cleanly.
- Same for the ex-Meta engineer or anyone else you genuinely rate.

As discussed, scouts receive 70% of the placement fee when someone they refer
is hired.

Really excited to see where we can collaborate!

Best,
Lily
```

## What to do when the call was thin

Some calls are ten minutes and cover nothing. Do not pad. Write the opener, one
short section of what was said, the ask, and stop. A four-line recap is a fine
recap. Inventing three bullets to make it look substantial is the one failure
mode that costs us trust.
