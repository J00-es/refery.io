---
name: work-email-sourcing
description: Find work emails for key people (founders, execs, talent leaders) at a list of companies given company name + domain. Use whenever the user supplies a list of companies/domains and wants contact emails, outbound/BD contacts, "get me emails for these companies", or wants to enrich a company list with decision-maker contacts. Covers Apollo/Specter sourcing, domain verification, CSV output, and loading results into Supabase.
---

# Work-email sourcing

Input: a list of `Company Name | domain`. Output: a verified CSV of work emails for
decision-makers, plus the same data in Supabase.

Calibrated over ~780 companies and ~2,000 contacts. **The gotchas below are the whole
value of this skill — they were learned by getting them wrong.** Read them before running.

---

## 0. The five rules that matter most

1. **Filter by `person_seniorities`, NOT `person_titles`.** Title filters silently return
   ZERO people for companies that are plainly in Apollo (CoinTracker, Treasury Prime,
   Homebase all returned 0 by title and 5–42 by seniority). Title filtering is the single
   biggest cause of false "this company isn't in Apollo".
2. **The listed domain is often stale.** Apollo's org domain, the live site, and the mail
   domain are frequently three different things. Always try variants before concluding zero.
3. **Check `organization.name` before spending a credit.** Apollo's domain filter silently
   returns unrelated companies (`aline.co` → Arity employees; a "Biotic" query returned a
   different Biotic's staff).
4. **Judge acceptance on the EMAIL domain, never on a provider's confidence label.**
   Specter's `email_type` was wrong ~50% of the time in both directions.
5. **A wrong-company address is worse than a missing one.** It burns sender reputation.
   When unsure, leave it in review.

---

## 1. Setup

Load tools in ONE call:

```
ToolSearch: "select:mcp__claude_ai_Apollo_io__apollo_mixed_people_api_search,mcp__claude_ai_Apollo_io__apollo_people_bulk_match,mcp__claude_ai_Specter__find_person,mcp__claude_ai_Specter__get_person_email"
```

**Specter is free, Apollo costs credits — try Specter first if it has quota.**
Probe it once. The moment you see `Daily MCP limit reached` (resets 00:00 UTC), stop using
Specter entirely for the run and send everything to Apollo. Do not keep retrying a capped
service.

Split the list across parallel subagents, **~40 companies each**. 8 agents at once is fine.
Give each its own input file and its own output CSV so there are no write races.

---

## 2. Discovery (free, no credits)

Per company, stop at the first attempt that returns people whose `organization.name`
plausibly matches:

**a. Seniority query (primary)**
```
apollo_mixed_people_api_search
  q_organization_domains_list: ["<domain>"]
  person_seniorities: ["founder","c_suite","owner","partner","head","vp","director"]
  per_page: 10
```
**b. Keyword** — `q_keywords: "<Company Name>"`, no domain filter.
**c. Domain variants** — swap `.com/.io/.ai/.co/.dev`; add or strip `get`/`join`/`try`/`use`;
   try the former name (snapmagic→snapeda); try country TLDs (`.in`, `.com.au`, `.jp`).
**d. `apollo_mixed_companies_search`** on the name to read Apollo's canonical domain, then redo (a).

Run 8–10 companies concurrently per message. Long-tail regional firms (small Chinese,
Japanese, EU companies) are genuinely absent — after these attempts, record zero-yield and
move on. Do not over-invest.

---

## 3. Select — max 4–6 per company

| Persona | Roles |
|---|---|
| **P1** | Founder, Co-Founder, CEO, President, Chief of Staff |
| **P2** | COO, CTO, CFO, CRO, Chief Product Officer |
| **P3** | Chief People Officer, Head of Talent / TA, VP People, Head of Recruiting, Director of Talent, Technical Recruiter |

Take all P1, then P2, then P3. **P3 is the scarcest and most valuable — always take it.**

Seniority filtering surfaces many out-of-persona people (VP Sales, VP Engineering,
Director of Ops, VP Quality). **Do not select those** — they waste credits and aren't the buyer.

Exclude before enriching: anyone whose headline points at a different business; obvious
phantom duplicates under common-word company names; anyone titled "Late Co-founder"
(deceased — never contact).

---

## 4. Enrich (paid)

```
apollo_people_bulk_match
  details: [{"id": "<apollo id>", "first_name": .., "last_name": .., "domain": "<domain that worked>"}]
```

- **MAX 5 people per call.** Several calls concurrently.
- **NEVER** set `reveal_personal_emails`, `reveal_phone_number`, `run_waterfall_email`,
  `run_waterfall_phone`. Waterfall cost is variable and can exceed a standard match.
- Read ONLY `email`, `email_status`, `credits_consumed`, `employment_history`.
  **Never echo the payload** — it is enormous and will blow up context.
- Roughly 1 credit per person; expect ~1 row per credit at good yield.

To get a person's email at their *own current* company (not the one you queried), omit
`domain` from the details object entirely.

---

## 5. Domain guard — decides acceptance

Judge **only** the email domain:

| Outcome | Rule |
|---|---|
| **ACCEPT** `domain_match=Y` | matches the listed domain |
| **ACCEPT** `domain_match=ALIAS` | TLD / subdomain / legacy / rebrand variant of the **same** company — say why in the note |
| **REJECT** | a different company's domain, gmail/outlook/ISP |
| **REJECT** | role inbox (`info@`, `team@`, `hello@`) |
| **REJECT** | `email_status: unavailable` / no email |

If `employment_history` shows the person now works elsewhere, **drop the row** — stale
former-employer records are very common. Credits are spent either way; never retry a reject.

---

## 6. Output CSV

```
company,domain,persona,full_name,title,linkedin_url,email,source,domain_match,note
```

- `source` = `apollo_paid` or `specter_free`
- `note` = `apollo:verified` / `apollo:extrapolated` + any caveat
- **Wrap any field containing a comma in double quotes.** Prefer `;` over `,` inside notes.
  (One unquoted comma in a note silently corrupted a row in an earlier run.)

---

## 7. Web-verification pass (free, high ROI)

Anything marked ALIAS or flagged goes through web search before it can be mailed.
**This recovered 374 of 388 review rows at zero credit cost — always do it.**

**Cluster first.** Group review rows by `(company, listed_domain, email_domain)` and verify
once per cluster, not per person — 388 rows collapsed to 189 questions.

Per cluster, 1–2 searches to establish the company's real current mail domain:
- **CONFIRMED** → same company (incl. legit rebrand/acquisition/regional domain) → promote to send
- **REJECTED** → different company, or people clearly moved on → delete
- **UNCERTAIN** → couldn't establish in 2 searches → stays in review

A live 301/307 redirect from the alt domain to the primary site is decisive evidence.
**Prefer UNCERTAIN over guessing.**

Also sanity-check the *person*, not just the domain: Apollo carries phantom records
(two fake "CEOs" at Render with throwaway LinkedIn handles). No domain check catches those.

---

## 8. Quality split

- `quality=send` — `domain_match=Y` **and** note contains none of:
  `extrapolated|verify|stale|caution|mis-filed|corrected domain|may not be|catch-all`
- `quality=review` — everything else

**Catch-all domains** (vercel.com, arize.com, gilead.com, firecrawl.dev, safe.security …)
accept any address, so "verified" is weak evidence there. They are the likeliest bounces —
flag them even when they pass the guard.

---

## 9. Load into Supabase

Project `ofujlvuejuvhpzemjaic`. See `reference/supabase.md` for the exact SQL.

Key facts that will bite you:
- `company_contacts` has **NO unique constraint on email** — you must dedupe manually or
  you will silently create duplicates.
- `companies` joins on `website` (`http(s)://[www.]domain[/]`), not a domain column.
  Normalise before matching, then fall back to matching on company **name** — many companies
  exist under an **older** domain.
- `persona_type` enum: `founder | cto_eng | talent | other | exec`. Map P1→founder,
  P3→talent, P2→cto_eng if the title is technical else exec.
- **Any new table you create must have RLS enabled and anon/authenticated revoked.**
  Supabase's default grants otherwise let the public anon key read and write it.

---

## 10. Helper scripts

In the repo root:
- `python email-status.py` — per-chunk coverage, persona mix, duplicates, rollup
  consistency. Exits non-zero on any problem.
- `python email-merge.py` — folds agent CSVs into the master files and rebuilds
  ALL/SEND/REVIEW. Idempotent, backs up to `.bak` first.

---

## 11. Deduplicate before spending anything

Check the new list against existing data **by normalised domain, not company name.**
Name matching produces false gaps — "ALSO." vs "Also" and "CHAOS Industries" vs "Chaos"
were both counted as missing and re-sourced at real credit cost.

Also skip anything already in `email-IGNORED.csv` (companies proven absent from Apollo)
so they never re-burn credits.

---

## 12. Report at the end

companies processed / zero-yield · rows written · **total credits_consumed** ·
send vs review counts · corrected domains found · notable data-quality problems.

Always surface corrected domains — they are the highest-leverage fix, since a stale source
domain causes false zeros, failed company matches, *and* review flags all at once.
