# The seven drafts a partner can send to a candidate

Reviewed and revised 11 September 2026 (seven edits from an outside read). Source of truth: `lib/messages/templates.ts` (drafts) and `lib/messages/index.ts` (when each is available, what moves on send). Everything in `{braces}` is filled from the record before the partner sees it; the partner then edits every word. Nothing is ever sent automatically.

## When a chip is clickable

The composer always shows all seven chips. A chip is grey (not clickable) when the record cannot support that moment yet. Hover the chip and it says why.

| Chip | Available when | What fills the draft | What moves on send |
|---|---|---|---|
| **Received your CV** | Always (an email on file) | first name, your signature | "told the candidate" becomes yes |
| **Put you forward** | The person is on an open submission (submitted, shortlisted or sent to client) whose consent is not yet asked or agreed | search headline, the client alias, the city, a fresh one-tap consent link | consent requested; the candidate's tap answers it |
| **Meet Lily** | Lily has asked you for a warm intro (the person is at "Intro asked") | search headline, Lily's booking link | Intro asked → Intro sent; Lily in copy; her follow-ups start |
| **They want to meet you** | A submission is at Interviewing (or Offer) | the client's name, the booking link if the client has one, their interview steps | nothing moves; the booking link is the call to action |
| **Not this time** | A submission is Not moving forward | the client's name, their reason | nothing moves |
| **Congratulations** | A submission is Placed | the client's name, the start date | nothing moves |
| **Blank** | Always | your signature only | nothing moves |

Two rules sit above every chip:

- **Whole composer blocked** when there is no email on the profile, the address bounced, the person tapped "stop", or you have sent 30 messages in 24 hours. The composer says which.
- **Send refused** when the text names the client before the person has agreed to be put forward (the alias is used until then), or when you already wrote to this person in the last 24 hours and they have not replied.

Why only a few chips are live on most people: the last four depend on a submission being at a specific stage, and "Meet Lily" depends on Lily having asked. On a person who was just added and not submitted anywhere, only **Received your CV** and **Blank** are live. On someone at "Intro asked", **Meet Lily** joins them. The moment a submission moves, the matching chip lights up.

The alias: until the person has said yes on the one-tap page, drafts say "a healthcare marketplace, Barcelona" (the client's alias) instead of the company's name. After yes, or once the client is interviewing, the name is used.

## The drafts

Sender on every one: `{Partner name} via Refery <partners@refery.io>`. Reply-To: the partner's own address. Every message ends with this footer:

> Sent by {Partner name} through Refery. Replies go to {Partner first}. Prefer no email from Refery? {stop link}

### 1. Received your CV

Subject: `You are on Refery, here is what happens next`

```
Hi {first},

I’ve added your CV to Refery, the network I use to introduce people to early-stage teams. Nothing goes to any company until you say yes to that specific conversation, and I will only come back to you when something is worth your time.

If anything in your CV should change, reply to this email.

{signature, or the partner's name}
```

### 2. Put you forward

Subject: `A role I would like to put you forward for`

```
Hi {first},

There is a {search headline} role at {client alias}{ in {city}, when the alias does not already name it} that fits what you told me.

May I share your profile with them through Refery? The company’s name is revealed when you say yes. Nothing is shared with them before then.

Choose ‘yes’ or ‘not now’ here:
{consent link, refery.xyz/c/…}

Either choice comes back to me.

{signature}
```

### 3. Meet Lily

Subject: `Intro: {first} <> Lily Joo (Refery)`  · Cc: lily@refery.io (on by default)

```
{first}, meet Lily from Refery. Lily is working on the {search headline} search.

Lily, meet {first}. I’ll let you two take it from here.

{first}, the quickest way in is fifteen minutes with Lily whenever suits you: https://cal.com/refery-lily/15

{signature}
```

When no search headline is on file the first line reads "Lily is working on a few early-stage searches".

### 4. They want to meet you

Subject: `{Client name} would like to meet you`

With a booking link on the client:

```
Hi {first},

Good news: {Client name} read your profile for the {search headline} role and want to talk. Book a time that suits you here:
{booking link}

Their process, as they described it:
1. {step}
2. {step}

If you want to prep together before the first call, reply and we will find twenty minutes.

{signature}
```

Without a booking link (most clients today):

```
Hi {first},

Good news: {Client name} read your profile for the {search headline} role and want to talk. Lily at Refery is setting up the first call with them and will come back to you with times.

If you want to prep together before the first call, reply and we will find twenty minutes.

{signature}
```

### 5. Not this time

Subject: `{Client name}, an update`

```
Hi {first},

{Client name} decided not to move forward this time. Their feedback: {the client's reason, as recorded on the submission}

I’d like to keep you in mind for other roles that fit. If you’d prefer otherwise, let me know.

{signature}
```

### 6. Congratulations

Subject: `Congratulations, {first}`

```
Hi {first},

Congratulations on accepting the offer from {Client name}. You’re set to start on {Start date}. Thank you for trusting me with this one.

If anything comes up between now and your start, or after, you know where I am.

{signature}
```

### 7. Blank

Subject: empty. Body: the signature only.

## Notes for whoever reviews these

- Voice is the partner's, first person. "Lily" appears only where she is genuinely the next step (Meet Lily, and the no-booking-link interview note).
- No Refery jargon (bench, panel, desk, grade) reaches a candidate.
- Subjects are the partner's own words; the "[Refery] Name | step" form is reserved for Lily's mail.
- The signature is saved once on /profile ("name · firm · phone"); with none saved, the partner's name signs.
- Every template is covered by `tests/messages/templates.test.ts`: renders with every optional fact empty and full, never leaves a brace, never contains an em dash, never signs as Lily.
