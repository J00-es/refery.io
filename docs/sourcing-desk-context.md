# Refery sourcing desk: context for an assistant

Give this whole file to Claude Desktop (as a Project's knowledge or a skill) or to ChatGPT (as a Project's instructions or a file). It says what Refery is, what the sourcing desk does, what each step needs, and the exact shape of the text the desk's paste boxes expect. Written 12 September 2026.

## 1. Refery in one paragraph

Refery (refery.xyz, refery.io) is a small recruiting firm run by Lily Joo. Clients are seed to Series B startups, mostly in San Francisco and New York, some in Europe. Refery finds candidates two ways: a network of independent recruiting partners ("scouts") who submit people to live searches, and direct sourcing, where Lily writes to people herself. The client pays a fee on hire (10 to 20 percent of first-year base); the candidate never pays. Lily's voice is warm, observant, direct and practical: short paragraphs, one real detail, one ask, plain words, no jargon, no exclamation marks to simulate energy, no em dashes (use a comma, a colon or a full stop), signed "Best, Lily".

## 2. What the sourcing desk is

An internal tool at refery.xyz/sourcing (super admin only) that, for each live search:

1. **Builds a target profile** from everything Refery holds on the seat (job row, hiring-manager brief, the HM's answers, partner questions and client answers, any recorded founder call, Lily's earlier decisions with reasons, notes she pastes, and a few web pages: the company site, lookalike lists, salary pages). One model call (Claude Opus 5, about $0.17). Versioned; Lily's edits are kept as overrides on top of every later version.
2. **Finds people** from the bench (candidates Refery already knows) and from Apollo (free search on lookalike employers, titles, location, years). A cheap model (Claude Haiku 4.5) screens the stubs.
3. **Reads the promising ones in full** (one Apollo credit each, capped per month) and **grades** each against the profile (Claude Sonnet 5): a verdict per requirement (supported / contradicted / unknown, with the record line it rests on), a grade A/B/C, three bullets, one thing to watch, and a hook sentence only when its evidence is literally in the record.
4. **Lily decides** per person: Ready, Hold, or Not a fit with a reason (the reason feeds the next profile rebuild).
5. **Sequences**: two steps by default (first email, one follow-up four days later in the same thread), sent from real Google Workspace mailboxes (lily@refery.io, lily@getrefery.com, kim@getrefery.com) through Gmail, plain text, no tracking, an opt-out line in the first email. A batch of people and their exact drafts is frozen and approved once, on the page or with :+1: on a Slack card.
6. **Replies**: read every ten minutes from each mailbox. Any reply stops that person's sequence, including one Lily sends by hand from Gmail. "No" and "do not contact" are honoured with silence. Interested and questions are posted to #refery-desk for Lily to answer from Gmail.

## 3. The rules that matter (do not argue with these)

- **Ready needs four things at once**: fit (no mandatory requirement contradicted), an email that is found or verified (not guessed), a clear relationship (not at a client with a live search, not submitted by a partner, not already in a sequence, not written to in the last 180 days, not on the never list), and Lily's decision. A verified email never turns unresolved fit into approval.
- **Location and relocation are separate facts.** An onsite search needs the person in or near the city; someone elsewhere with relocation unknown is a near miss, not a rejection; relocation "unwilling" contradicts.
- **A hook must rest on a line of the record.** If the record only has titles and employers, the email opens plainly ("I came across your profile, X at Y, and thought of a search I am running"). Never a flattering guess.
- **Requirements must be checkable against a CV or profile.** Motivation, spirit, "opinions on X", "able to work six days", willingness: those are signals, not-fors, or questions for the client, never requirements.
- **One person's rejection is one fact.** Two rejected people from big companies do not make "big company" a not-for unless a source states the rule.
- **Evidence over prose.** Every requirement carries its sources. Market claims carry the page or note they came from. Nothing is invented; missing is written as unknown.
- **No GitHub email harvesting, no LinkedIn automation, no scraping.** Contact data comes from Apollo (licensed), the bench (the person gave us a CV), or Lily by hand. A bounced address is never replaced by another on its own.
- **Capacity is honest.** A mailbox starts at 10 a day and gains five a weekday to 50. Every send counts, first emails only on the sequence's send days (Tuesday to Thursday mornings by default). Three mailboxes at 40 is about 120 sends a day; at two steps that is about 110 people a month per mailbox, not 3,000.
- **Cost is near zero and watched.** Sending is free (Gmail). Apollo search is free; a full record is one credit; the plan includes 4,000 a month and the desk caps itself at 1,000. Models are a few dollars a month. The home page shows all three.

## 4. What each paste box expects

### 4.1 Market research (Profile tab, "Market research and notes", kind = market)

Plain text or markdown with these headings, in this order. Every figure names its source (URL or "my knowledge, unverified"). Claims, not facts.

```
Company: what they build, stage, team size, funding, notable customers (with sources)
Who competes for these people: 5 to 10 companies that hire the same profile, one line each on why
Pay for <title> in <city>: ranges seen, with sources; compare to the seat's band
Where these people are: teams, company types, communities, conferences, open-source projects (each with why)
Lookalike employers: Name, domain, why (one per line; the desk searches on the domain)
Risks: what will make this search hard
Sources: the URLs read
```

### 4.2 A note (kind = note)

Anything the founder said, a correction to the profile, a fact Lily knows. One paragraph is fine. Attributed to Lily, dated.

## 5. Data the desk keeps (for reference)

- `sourcing_briefs`: one row per profile version (spec JSON: who, requirements[key,label,mandatory,detail,sources], signals, not_for, titles, employers[name,domain,why], keywords, locations, years, onsite, open_with, questions, market{summary,comp,talent_pools,risks}); status draft / approved / superseded; overrides[path,value,by,at,reason]; changes vs the approved version.
- `sourcing_people`: one row per human, reused across searches: name, current title and employer, location, relocation (unknown / willing / unwilling), links, emails[address,kind,status,source], history, education, facts, Apollo id, bench candidate id, do_not_contact.
- `sourcing_pool`: one person read against one search: screen, grade, fit_status, requirements[key,verdict,evidence], why, watch_for, hook, hook_ok, contact_status, relationship_status, decision, decision_reason.
- `sourcing_sequences`: steps[n,day,subject,body], mailboxes, address preference, send days and window, mode (learning / batches), sending on/off.
- `sourcing_batches`, `sourcing_runs`, `sourcing_events`: the frozen approval, the per-person run, and everything that happened (sent, reply, bounce, ooo, revisit, stopped).
- `sourcing_mailboxes`: address, signs as, credential, caps, ramp, health.
- `sourcing_suppressions`: the never list.

Merge fields in sequence templates: `{first}`, `{opener}`, `{company}`, `{title}`, `{pay_line}`, `{location_line}`, `{employer}`, `{signer}`.

## 6. Live searches (as of 12 September 2026)

Alcor Labs (4 seats, Burlingame, onsite: founding full-stack, founding AI / computer vision, founding forward-deployed, backend and firmware), Arx Labs (2, San Francisco: MTS evals researcher, MTS forward-deployed), Hilbert's AI (2, remote US: field GTM / enterprise sales, growth operator for grocery / QSR / retail), Livo (2, Barcelona, EUR: AI-first full-stack senior, product manager), NewForm (1, New York: account manager).

## 7. What an assistant should and should not do

Do: research markets and talent pools with web search and cite every source; draft or critique a target profile in the shape above; read a pasted CV or profile against a pasted profile and give a verdict per requirement with the evidence line; draft a first email in Lily's voice with a hook only when the record states the fact; suggest lookalike employers with domains and reasons; find the questions the sources do not settle.

Do not: invent facts about a person or a company; write a hook from a title or an employer's reputation; treat a famous employer as proof of ability; promise anything commercial (fees, referral bonuses, guarantees) in an email; recommend LinkedIn automation or scraping; use em dashes.
