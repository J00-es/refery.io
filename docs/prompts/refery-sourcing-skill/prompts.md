# Prompts for Claude Desktop and ChatGPT

Three prompts that use your subscription, not the API. Each produces text in the shape the sourcing desk's paste boxes expect (see docs/sourcing-desk-context.md, section 4). Turn web search on for the first one.

Set-up once: make a Project called "Refery sourcing" in Claude Desktop or ChatGPT, attach `docs/sourcing-desk-context.md` as project knowledge (or paste it into the project instructions), and keep these three prompts in it.

---

## Prompt 1: market research for a seat (paste the result as "Market research")

```
You are doing market research for one recruiting search. Use web search. Cite a URL for every figure and every company you name. Where you are relying on your own knowledge, say "my knowledge, unverified". Do not invent numbers.

Search: {TITLE} at {COMPANY} ({COMPANY_WEBSITE}), {LOCATION}, {ONSITE / HYBRID / REMOTE}, base band {BAND}.
Who they are looking for, in the client's words:
{PASTE THE "WHO THEY ARE ACTUALLY LOOKING FOR" PARAGRAPH FROM THE PROFILE PAGE}

Answer with exactly these headings, in this order, plain text, no tables, no em dashes:

Company: what they build, stage, team size, funding, notable customers, anything in the news this year. Sources.

Who competes for these people: five to ten companies that hire this exact profile in this city, one line each on why, with a source.

Pay for {TITLE} in {LOCATION}: the ranges you can find for 2025 to 2026 (levels.fyi, job posts, salary surveys), with sources. Then one sentence on where the band {BAND} sits against them.

Where these people are: teams, company types, open-source projects, communities, meetups and conferences where people who do this work are found in numbers. One line each on why.

Lookalike employers: eight to fifteen lines, each "Name, domain, why". These drive a people search, so prefer companies where people actually did this work over famous names.

Risks: what will make this search hard (band under market, onsite in a remote market, a tiny pool, competing offers), two to five lines.

Sources: every URL you used, one per line.
```

---

## Prompt 2: read one person against the profile (for a CV or profile you have in front of you)

```
Read one person against one recruiting profile. You only know what the record says. Do not infer a skill from an employer's reputation.

PROFILE (requirements with keys; "must" ends the conversation if contradicted):
{PASTE THE REQUIREMENTS LIST FROM THE PROFILE PAGE}

RECORD:
{PASTE THE CV TEXT OR THE PROFILE TEXT}

Answer, plain text, no em dashes:

Verdicts: one line per requirement key: supported / contradicted / unknown, then the line of the record it rests on in quotes (or "nothing in the record").
Fit: fit / near miss / not a fit, one sentence why. A must that is contradicted is not a fit. A must that is unknown is a near miss, not a rejection. Elsewhere with relocation unknown is a near miss.
Grade: A (fit and the strong signals are present), B (a call can settle the gaps), C (not a fit).
Why: up to three bullets, each resting on a line of the record.
Watch for: the one thing to check on a call.
Hook: one sentence for the top of a first email about a specific thing this person did, only if the record states it; otherwise write "none: the record has only titles and employers".
Hook evidence: the exact record line, or "none".
```

---

## Prompt 3: draft the first email in Lily's voice

```
Draft a first email from Lily Joo, who runs Refery, a small search firm, to one person about one role. Rules: warm, observant, direct; short paragraphs of three lines or fewer; one real detail about the person only if it is in the record below, otherwise open plainly with their current title and employer; the role's pay band and location in the open; one ask (fifteen minutes with Lily this week, no CV needed, "I will tell you straight if it is not a fit"); an opt-out line ("If you would rather I did not write again, reply no thanks and I will not"); sign "Best, Lily". 90 to 150 words. No jargon, no exclamation marks, no em dashes, no promises about fees or referral bonuses, no company name if the profile says the client is anonymous.

Role: {TITLE} at {COMPANY}, {LOCATION}, {ONSITE / HYBRID / REMOTE}, {BAND} base.
What to lead with (from the profile's "How to open the email"): {PASTE}
Person's record: {PASTE}
Hook and its evidence (from prompt 2, or "none"): {PASTE}

Output: Subject line (five to eight words, no "opportunity"), then the body.
```

---

## Where each result goes

- Prompt 1: Profile tab of the search, "Market research and notes", kind "Market research (pasted)", Save note, then **Rebuild from sources**. The profile's "The market" section and the lookalike employers will cite it.
- Prompt 2: your own judgement on the Pool tab: Ready, Hold, or Not a fit with the reason.
- Prompt 3: edit the search's sequence template on the Sequence tab if the draft is better than the default, or paste the opener as a note on the person. Do not send from ChatGPT or Claude; the desk sends so that replies are tracked and the sequence stops on a reply.
