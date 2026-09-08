# Email kit, v0.1 (proposed, nothing sent)

Every template below has a trigger, the facts it needs before it may render, its one primary action, and the conditions that stop it. Braced fields are facts the sender must supply from a verified source. A template with an unfilled brace does not reach a send path; it becomes a task for Lily.

Links marked `{proposed}` do not exist yet. `refery.xyz/partner-terms` exists. `refery.xyz/start`, a preview page, and a resume link are proposed.

All templates are plain text from `Lily Joo <lily@refery.io>` with reply-to lily@refery.io, unless the row says otherwise. 70% is supported by the current partner terms; the recipient's accepted version governs any figure in a message to them.

## Part 1: the templates

### A. Application received

- Trigger: a valid new application, after deduplication against `users_admin` and existing applications, and after the test-row filter.
- Needs: first name; a real review date from a stated service target (two working days), else the sentence is dropped.
- Primary action: none. This is a receipt.
- Stops: an active account with the same email or a verified alias (send nothing, route to reconciliation); a duplicate application inside 30 days; an internal or test row.

```
Subject: [Refery] {Full name} | Application received

Hi {First},

Thanks for applying to Refery :)

I have your details. I'm checking where the people you know could fit the searches we're working on, and you'll hear from me by {review_date}.

If we go ahead, you'll get a link to set up your partner account and see how to start.

Best,
Lily
```

### B. Approved scout, independent start

- Trigger: Lily's admission decision is "approved, independent start", contribution mode "introduce people I know".
- Needs: first name; one verified detail from the application (a shared candidate, a named community, a city); a working onboarding link that prefills the application.
- Primary action: set up the account.
- Stops: no working onboarding link; an existing active account (use H or F instead); the decision was reversed before send.

```
Subject: [Refery] {Full name} | Let's get started :)

Hi {First},

Thanks for applying, and for {verified_detail}. I'd be happy to have you join Refery :)

How it works on your side: you introduce people you know and would vouch for. We check the fit, talk to them, and run the process with the client. If someone you introduced is hired, 70% of the placement fee is yours under the partner terms.

Set up your account here: {onboarding_link}. It explains the rest and takes you through the agreement.

No need to have someone ready today. When a person comes to mind, ask them first, then send their CV as a PDF and a few lines on why.

Best,
Lily
```

### C. Approved recruiter, one relevant opportunity

- Trigger: decision "approved", contribution mode "actively recruit", and at least one live search whose anonymised summary is approved for pre-agreement viewing.
- Needs: specialty from the application; the approved anonymised summary; a preview link that leads into account creation.
- Primary action: look at the search.
- Stops: no live search matches (use F); the preview is not approved for this stage; existing account (use H).

```
Subject: [Refery] {Full name} | A first search for us

Hi {First},

Thanks for applying. You recruit {specialty}, and one of the searches we're working on now sits right there: {approved_anonymised_role_summary}.

With Refery you source and introduce candidates for the searches you choose. We handle calibration, the client and the process. You receive 70% of the placement fee, and each search shows its fee before you take it on.

Take a look here: {preview_and_start_link}. If it's your kind of search, you can create your account and complete the agreement from the same page. The client's name and full brief open after that.

Happy to answer anything that's unclear :)

Best,
Lily
```

### D. Selected partner, with a purposeful call at the end

- Trigger: Lily chose "approved, assisted start" because a conversation has a specific purpose (calibration on a named search, a firm, a strategic partnership, an unresolved question).
- Needs: one verified reason tied to the opportunity; the preview link; the question Lily wants to discuss.
- Primary action: look at the search; second action, book 15 minutes once they have.
- Stops: no purpose for the call is recorded (fall back to B or C).

```
Subject: [Refery] {Full name} | A good place to start

Hi {First},

Thanks for applying, and for {verified_detail}. {One_verified_reason_connected_to_the_opportunity}, so I'd like to explore working together.

Here's a short overview and the search I'd start with: {preview_and_start_link}. It shows what we'd each handle, how the fee works, and how to set up your account if it feels right.

I'd also like to hear how you'd approach {specific_search_or_partnership_question}. When you've had a look, let's find 15 minutes: cal.com/refery-lily/15

Best,
Lily
```

### E. Not moving forward

- Trigger: Lily's decision is "declined", after the reconciliation check.
- Needs: the current focus line, generated from live searches (cities, functions, stages).
- Primary action: none. Reply is offered as a choice.
- Stops: an active account or an ongoing conversation exists (never send); the row is spam or a test (mark invalid, send nothing); a decline within 30 days of a previous decline.

```
Subject: [Refery] {Full name} | Your application

Hi {First},

Thank you for your interest in Refery.

We're keeping this intake focused on scouts and recruiting partners with experience closest to our current searches: {current_focus_line}.

We're not moving forward with your application at the moment. If you'd like to hear from us when that focus broadens, reply and let me know.

Thanks again for taking the time to apply.

Best,
Lily
```

### F. Good potential, no matching search

- Trigger: decision "no matching demand". Suitability is not the problem.
- Needs: the specialty or geography that does not match, stated as a fact about our searches, not about them.
- Primary action: reply to stay on the list.
- Stops: a live matching search appears before send (use C or H instead).

```
Subject: [Refery] {Full name} | Working together, an update

Hi {First},

Thanks for applying. {Verified_strength_of_their_network} is a strong one, but every search we're working on today is {where_our_searches_are}, and I wouldn't ask you to spend time on those.

If you'd like, reply and I'll keep you in mind when something closer opens. There's nothing you need to set up in the meantime.

Best,
Lily
```

### G. Finish an incomplete setup

- Trigger: the person holds the next step (account not created, or agreement not accepted) for 3 days, then once more at 10 days. Two sends maximum.
- Needs: the actual incomplete step, read from the database; a resume link.
- Primary action: continue setup.
- Stops: any reply from them in the thread; a support flag; a broken-access flag; the shared contact budget (one non-essential email per person per 72 hours across every sender); the step completed.

```
Subject: Re: {existing_subject}

Hi {First},

If you'd still like to get started, you can continue from where you left off here: {resume_link}.

The remaining step is {actual_incomplete_step}. If the page isn't working or you have a question, reply here and I'll help.

Best,
Lily
```

Never says "your searches are waiting" unless a search is verified live and the person is entitled to see it.

### H. First search proposal after account access is ready

- Trigger: account active, partner terms accepted, Searches access granted, and a search with open capacity matches their preferences. A proposal row is created without overwriting an earlier answer.
- Needs: role, client (they are entitled now), the match reason, one decisive requirement from the brief, the brief link.
- Primary action: open the brief and accept or decline there.
- Stops: they already declined this search; no access to Searches (the beta gate); capacity is full; the role is not live.

```
Subject: [Refery] {Full name} | {Role} in {City}, worth a look?

Hi {First},

I thought of you for {Role} at {Client} because {specific_match_reason}.

The key requirement is {one_decisive_requirement}. The brief has the scope, working setup, fee and interview process: {brief_link}

If it looks like a search you'd want to work on, you can accept it there. If it isn't your focus, let me know and I'll adjust what I suggest :)

Best,
Lily
```

### I. Check capacity on an accepted search

- Trigger: an accepted search, no submission, and a check-in date the partner chose when accepting has passed. Recruiters only.
- Needs: role; the check-in date they set.
- Primary action: reply.
- Stops: Refery owes them an answer on this search; a submission exists; they paused it; a scout who never set a check-in.

```
Subject: Re: {search_subject}

Hi {First},

Is {Role} still a search you'd like to work on this week?

If the brief needs clarifying or your capacity has changed, let me know. We can adjust the focus or pause it for now.

Best,
Lily
```

### J. Post-call recap

- Trigger: a Granola-recorded call with a known person. Drafted in Gmail, never sent automatically.
- Needs: the transcript; the account state read at draft time; the brief link they are entitled to; the terms version they accepted, if a figure is used.
- Primary action: the one thing that moves the relationship (a brief to review, a CV to send, a question to answer).
- Stops: not applicable, a human sends it.

Shape: one line naming a specific thing from the call, the recommended first step with its link, one section of what they told us if it is needed to correct the record, one open question if there is one. The full biography goes in the CRM. Dual-track people get their own purpose first, in the order they raised it. Illustration using Sherrie's 3 September context:

```
Subject: [Refery] Sherrie Stifter | Our call, and the first search

Hi Sherrie,

Great speaking with you :) The startup recruiting studio and the app you're building give us two useful ways to work together.

For the first search, I'd start with your Silicon Valley engineering network. You mentioned more than 20 years placing people into funded startups, so the hands-on founding-engineer roles are the clearest fit. Here's the brief I'd read first: {verified_brief_link}. Let me know whether this is the one Startup Hires would like to take on.

We also discussed a possible Refery submission path inside your app. Let's keep that as a separate conversation so the first search can move ahead.

Best,
Lily
```

### K. Submission received

- Trigger: a role submission row exists. The attribution sentence renders only if the claim succeeded.
- Needs: candidate name, role, the candidate status link, a real review date from the panel schedule (48 hours).
- Primary action: follow the review.
- Stops: the submission was rejected at intake (a different, precise request goes instead); the candidate has not consented (draft kept, permission blurb sent).

```
Subject: [Refery] {Full name} | {Candidate} received

Hi {First},

Thanks for introducing {Candidate}. We have the profile and your notes for {Role}.

You can follow the review here: {candidate_status_link}. The next update is due by {real_review_date}.

{Confirmed_attribution_sentence_if_verified}

Best,
Lily
```

### L. Not a match for this role

- Trigger: a reviewed, role-specific decision with a recorded reason.
- Needs: one specific strength; the specific requirement that is missing; one truthful next step.
- Primary action: the next step (send missing evidence, keep them for future searches with permission, or close).
- Stops: the reason is not recorded (Lily writes the line herself).

```
Subject: [Refery] {Full name} | Update on {Candidate}

Hi {First},

Thanks for sending {Candidate}. {Specific_strength} came through clearly.

For this role, the missing piece is {specific_job_requirement}, so we won't move forward with this match.

{One_truthful_next_step}

Best,
Lily
```

### M. Refery is waiting on the client

- Trigger: a promised update date passed and no client decision is recorded.
- Needs: the last verified contact with the client, or the follow-up that is scheduled; the next committed update date with an owner.
- Primary action: none needed from them.
- Stops: a decision arrives before send.

```
Subject: Re: {candidate_subject}

Hi {First},

There isn't a decision from the client on {Candidate} yet. {Last_verified_contact_or_scheduled_follow_up}.

I'll update you by {next_committed_update_date}, even if we're still waiting. Nothing needed from you for now.

Best,
Lily
```

### N. Closing the reminder sequence

- Trigger: G has been sent twice with no reply, no support flag, no active commitment.
- Needs: nothing beyond the thread.
- Primary action: reply.
- Stops: any reply. Pausing reminders never revokes an account, abandons a candidate, or erases attribution.

```
Subject: Re: {existing_subject}

Hi {First},

I'll pause the onboarding reminders here. If the timing becomes better, reply and we can pick it up from where you left off.

Best,
Lily
```

### O. Firm setup (new)

- Trigger: two or more people from one company hold individual accounts, or a call recorded a firm intent.
- Needs: what is already true (who has an account, what has been submitted); the three facts a firm needs (contracting entity and payee, signer, members); the firm setup link (`/firm/new` exists).
- Primary action: reply with the entity, or open the setup.
- Stops: the firm row already exists and is active.

```
Subject: Re: {existing_subject}

Hi {First},

{What_is_already_true_in_one_sentence} :)

One thing to settle so the rest of your team can join without each person signing their own agreement: the firm account. It needs three things from you: the legal entity that contracts and gets paid, the person who signs for it, and the people who should have access. {firm_setup_link}

Until that's done, each of you works as an individual account, which is fine for now, and payment on anything placed follows the individual terms each person accepted.

If it's easier to walk through it together, happy to. Otherwise reply with the entity name and I'll set the rest up.

Best,
Lily
```

### P. Pending review, honest update (new)

- Trigger: an application has waited 24 hours with no decision. Replaces auto-approval and auto-rejection. Also creates an overdue task for Lily.
- Needs: first name.
- Primary action: none.
- Stops: a decision is recorded; A was sent less than 24 hours ago; one send maximum.

```
Subject: Re: [Refery] {Full name} | Application received

Hi {First},

Quick note so you're not left wondering: your application is still with me, and I'll come back to you by {new_review_date}.

Best,
Lily
```

## Part 2: representative personalised previews

Labelled previews. Facts come from the application form or from sent mail; anything not verified is bracketed. None of these has been sent, and several of these people have already received a different email, which is exactly why the reconciliation step comes first.

### Scout, independent start · Vikram Seth (applied 1 September, status new)

Facts: SF, New York, Chicago, LA; engineering, AI, ops, GTM; three candidate links shared; has not hired directly. No account.

```
Subject: [Refery] Vikram Seth | Let's get started :)

Hi Vikram,

Thanks for applying, and for the three people you shared. That's exactly the kind of thing I look for, so I'd be happy to have you join Refery :)

How it works on your side: you introduce people you know and would vouch for, mostly engineers and GTM people at Seed to Series B startups in San Francisco and New York. We check the fit, talk to them, and run the process with the client. If someone you introduced is hired, 70% of the placement fee is yours under the partner terms.

Set up your account here: {onboarding_link, proposed}. It explains the rest and takes you through the agreement.

No need to have someone ready today. When a person comes to mind, ask them first, then send their CV as a PDF and a few lines on why.

Best,
Lily
```

### Active recruiter, one relevant opportunity · Sunil Kumar (applied 22 August, status new)

Facts: independent recruiter; SF, New York, Boston, Seattle and six more US cities; engineering, AI, product, ops, GTM; three candidate links shared. No account. Anonymised summary taken from the 13 August Dan email, which Lily already sent as shareable copy.

```
Subject: [Refery] Sunil Kumar | A first search for us

Hi Sunil,

Thanks for applying. You recruit engineering and GTM across San Francisco, New York and Boston, and one of the searches we're working on now sits right there: a seed-stage company in the SF Bay Area making its first four engineering hires, on-site, across applied AI, full-stack, systems and forward-deployed engineering.

With Refery you source and introduce candidates for the searches you choose. We handle calibration, the client and the process. You receive 70% of the placement fee, and each search shows its fee before you take it on.

Take a look here: {preview_and_start_link, proposed}. If it's your kind of search, you can create your account and complete the agreement from the same page. The client's name and full brief open after that.

Happy to answer anything that's unclear :)

Best,
Lily
```

### Firm · Leigh Obery, Coders Connect (recruiter account 4 September, one submission)

Facts from the database: Leigh and Rinat Nazmutdinov each created individual recruiter accounts on 4 September; Leigh has one candidate in; no firm row exists. [From the 1 September call notes: Leigh wanted the team onboarded with Rinat as signer. Verify before sending.]

```
Subject: Re: [Refery] Leigh Obery / Lily :)

Hi Leigh,

Rinat's account is set up and your first candidate is in, so the Coders Connect side is moving :)

One thing to settle so the rest of your team can join without each person signing their own agreement: the firm account. It needs three things from you: the legal entity that contracts and gets paid, the person who signs for it [you mentioned Rinat], and the people who should have access. refery.xyz/firm/new

Until that's done, you and Rinat work as two individual accounts, which is fine for now, and payment on anything either of you places follows the terms you each accepted.

If it's easier to walk through it together, happy to. Otherwise reply with the entity name and I'll set the rest up.

Best,
Lily
```

### Existing approved partner still marked new · Keana Alabre

Facts: `keana@copatible.com` has an active recruiter account since 23 July with no activity, and an application from 6 July still marked new. `keanarecruiting@gmail.com` has an active recruiter account since 1 August with 36 candidates uploaded, last on 5 August. Same name, two logins.

The correct output is not an email. It is a reconciliation task: confirm the two accounts are one person, link them, close the application row as "already a partner", and only then decide whether template H or F applies to the combined history. Sending B here would tell an active partner to sign up again, which is the Sonam problem.

If, after merging, a matching search exists, the note is short:

```
Subject: Re: {existing_subject}

Hi Keana,

Housekeeping first: you have two Refery logins, and I've kept keanarecruiting@gmail.com as the main one so the 36 people you uploaded in August stay under one name. If you'd rather use the other address, tell me and I'll switch it.

{H_body_from_here_if_a_search_matches, else F}

Best,
Lily
```

### No current match · Edouard Treccani (applied 20 August, in conversation)

Facts: Zurich and Lausanne; founders, operators, engineers; self-rated top 1%; has not hired directly. He already received the call-link email on 20 August, so this replaces a call, and the thread subject stays.

```
Subject: Re: [Refery] Scout Application | Edouard Treccani

Hi Edouard,

Thanks for applying. Your network of founders and operators around Zurich and Lausanne is a strong one, but every search we're working on today is on-site in San Francisco or New York, and I wouldn't ask you to spend time on those.

If you'd like, reply and I'll keep you in mind when something closer opens. There's nothing you need to set up in the meantime.

Best,
Lily
```

## Part 3: what changed from the review's drafts

- B now names what a scout actually does with a person before introducing them, and names the demand focus once, because the review's version left a scout unsure whether anyone they knew was relevant.
- C keeps the anonymised summary but adds when the client name opens, because "see the roles first" is the objection that lost Luke and worried Madiha and Cody.
- D drops the review's "That should give us something useful to work through together", which reads as filler.
- E is unchanged. It is right.
- F names where the searches are as a fact about Refery, not about the person's city.
- K, L, M, N are kept with minor tightening.
- O and P are new. The review asked for firm setup and for an honest pending update; it did not draft them.
- The scout-application template in `lib/intake-emails.ts` ("cal.com/refery-lily/15 works?") is retired as the first reply. It becomes the optional second action in D.

## Part 4: decisions applied on 7 September (Lily)

- **Subjects.** Every subject carries the recipient's full name so threads are easy to find: `[Refery] Full name | context`. Replies keep the thread subject. Applied to A to P and the previews; the canvas artboards show the final form.
- **CV as PDF only.** A candidate enters Refery only as a CV in PDF, uploaded on the search page or forwarded to candidates@refery.io. There is no LinkedIn-URL submission. Sample links on the application form stay as context for Lily and are never turned into candidates.
- **Pass note (E).** Sent on every decline of a real person. Spam and test rows are marked invalid and get nothing.
- **Pending note (P).** Sent automatically, once, at 48 hours, alongside the overdue task. It is never a decision.
- **Pre-agreement preview.** Urgent searches only. The anonymised summary may say stage band, city, on-site or remote, function, one clause on what they build, base range and fee. It may not say the name, the funding amount, investors, customers, launch dates or founder background. Lily approves the preview once per search with a checkbox on the role.

## Part 5: outbound templates Q to T

Outbound differs from inbound in one way: Lily chose the person before the first message, so there is no application and no admission step. The reply earns an invitation link, and the link carries her decision.

### Q. Outbound first touch, email

- Trigger: Lily, or the Outreach hub, picks a prospect from the Recruiters or Talents pages. One reason, one anonymised urgent search.
- Needs: one verified reason they were picked; one approved anonymised summary.
- Primary action: reply.
- Stops: already a partner or applicant (use the existing thread); do-not-contact; same company contacted inside 30 days.

```
Subject: [Refery] {Full name} | {Role} in {City}, would your network fit?

Hi {First},

Lily from Refery. {One_verified_reason_you_were_picked}, so I thought I'd write directly rather than send a form :)

We run searches for Seed to Series B startups, mostly engineering and GTM in San Francisco and New York. Right now one of them is {approved_anonymised_role_summary}. Partners who introduce someone who's hired receive 70% of the placement fee.

If that's the kind of search you could work on, reply and I'll send you the brief and a link to set up an account. If not, no need to answer.

Best,
Lily
```

### R. Outbound first touch, LinkedIn DM from Marj

Sent by Marj through Aimfox as a mass, scheduled message, so there is one universal campaign link for the whole audience (for example refery.xyz/join/sf-engineering) in place of Lily's calendar link. The page asks who they are and matches them to the campaign audience; matched people go straight to account setup, unmatched people go into normal review. Keeps the shape of the DM Marj sends today.

- Needs: one verified reason in a few words; one approved anonymised urgent search in one line; the personal invitation link; numbers Refery can stand behind.
- Stops: already a partner or applicant; do-not-contact; same company inside 30 days; Lily marked this person meet-me (then the ending switches to her link).

```
Hi {First},

Marj from Refery here. I saw {one_verified_reason_in_a_few_words}, so wanted to reach out directly :)

Refery is a referral hiring network. Founders and operators introduce exceptional people they personally know, mostly engineers and AEs, and we match them with Seed to Series B startups in SF, New York and other US hubs. You make a warm intro, our team reads and speaks to them, and if there is a fit we run the process with the startup.

Hiring teams pay 10 to 20% of base salary and 70% of that goes to the scout. A $350k senior engineer at a 20% fee is about $49k to you. No time commitment, just an intro when you know someone truly exceptional.

One of the searches open right now: {anonymised_role_in_one_line}. Here it is in more detail, with how to join in about four minutes: {campaign_link}

P.S. If you are hiring, or open to something yourself, email lily@refery.io and cc candidates@refery.io.

Marj
```

The current DM says "400+ scouts and 200+ well-funded startups". The database shows 75 external partner accounts. If the larger figures count the wider community, say so in words that are true, or drop them. No claim about placements anywhere.

### R2. Marj answers a question in the DM

- Trigger: a question the How-it-works page already answers (time, exclusivity, payment, what a scout does, visas, seeing the client).
- Stops: questions about specific terms, a specific client, a partnership or a fee negotiation go to Lily as a task, and Marj says so. A request to talk gets Lily's link.

```
Hi {First}, good question. {Answer_from_the_how_it_works_page, two or three sentences}.

Everything else is on the page, and you can set up the account from there whenever suits: {campaign_link}

If you would rather talk it through, Lily does 15-minute calls: cal.com/refery-lily/15

Marj
```

### U. Lily opens the door to a call

- Trigger: a partner joined, from outbound or inbound, and Lily taps "I would like 15 minutes" on their row. Her choice, per person, never a rule.
- Needs: one verified reason she wants to talk; the search they looked at or were suggested.
- Stops: they already booked; they asked not to be contacted; one send.

```
Subject: [Refery] {Full name} | 15 minutes on {Role}?

Hi {First},

Welcome, and thanks for setting up your account :)

I saw you have had a look at {Role}. {One_verified_reason_Lily_wants_to_talk}. I would like to hear how you would approach it, and it is a good moment to calibrate before you send anyone.

Fifteen minutes here, whenever suits: cal.com/refery-lily/15

If you would rather just get going, that is completely fine too.

Best,
Lily
```

This is the only message where Lily's calendar link appears by default, and only because Lily chose this person. The prospect's own way in is the "prefer to talk it through first?" line on the invitation page and the Start page.

### S. Reply with the invitation

- Trigger: a positive or curious reply to Q or R.
- Needs: a working invitation link, single use, 14 days, prefilled with name, email, contribution mode and the search. The full brief is not attached; it opens after the terms.
- Primary action: open the invitation.
- Stops: the reply was a question (answer it first, in the same message); the reply was a no.

```
Subject: Re: [Refery] {Full name} | {Role} in {City}, would your network fit?

Hi {First},

Great, thanks for coming back to me :)

{Answer_to_anything_they_asked, if they asked}

Here's your invitation: {invitation_link}. It shows the search in a little more detail, what we'd each handle, and takes you through creating your account and the partner terms. The client's name and the full brief open once that's done, because every client has a confidentiality agreement with us.

Best,
Lily
```

On LinkedIn the same text goes as a message with the link. The thread moves to email once the account exists.

### T. Invitation not opened

- Trigger: invitation sent 5 days ago, never opened, no reply since. Drafted in the same thread for Lily to send. Never automatic: an outbound conversation is hers.
- Stops: any reply; the link was opened; the link expired (Lily decides whether to reissue).

```
Subject: Re: [Refery] {Full name} | {Role} in {City}, would your network fit?

Hi {First},

Quick one. The invitation I sent is here in case it got buried: {invitation_link}. It's valid until {expiry_date}.

If the timing isn't right, a one-line no is completely fine and I'll leave it there.

Best,
Lily
```

### The invitation link

`refery.xyz/invite/{token}` is proposed, not built. Opening it creates the application row already approved, source outbound, decided by Lily at the moment she generated the link. The page shows the anonymised search in more detail, how it works in three lines, the terms link, and "create my account", which runs the same three account steps as inbound with name and email prefilled. On completion the account is auto-approved, the access check runs, and the search Lily picked appears on the Start page by name with the full brief. Expired, already-used and search-closed states are on the canvas. The link is generated from the prospect row on the desk or with a Slack slash command, and copying it also copies the S text.
