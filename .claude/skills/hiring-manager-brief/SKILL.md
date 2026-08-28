---
name: hiring-manager-brief
description: Build and publish a Refery hiring-manager brief at refery.xyz/b/<slug> for a company, in the shape of the Alcor Labs brief. Use whenever the user wants a "role brief", "hiring manager brief", "HM brief", "the note we send a founder before sourcing", a brief "like the one we made for Alcor", or wants to update, publish, revoke, or rotate an existing brief link.
---

# The hiring-manager brief

The note sent to a founder before sourcing starts. Public link, no login, and the
founder can correct any section in place. Corrections and reading telemetry land in
Slack (`clients` stream) and on the company page.

Reference brief: `https://refery.xyz/b/alcor-labs-rdmg3xa` (slug `alcor-labs-rdmg3xa`).
Skeleton with every block kind: `template.json` next to this file.

**Nothing is rendered from HTML.** The page draws from the `content` JSONB alone. Write
content, not markup.

---

## 0. The five rules that matter most

1. **`normalizeBrief` drops silently.** A section with no `heading` vanishes; a `stats`
   item missing `label` vanishes; an unknown `kind` vanishes. The page will not error, it
   will just be short. Always re-read the published page after writing. There is a checker
   for this: transpile `lib/brief.ts`, run the authored JSON through the real
   `normalizeBrief`, and diff the counts. It catches a dropped block in a second.
2. **Only two bits of inline markup exist**: `**bold**` and `[label](https://…)`.
   Schemes are restricted to `http`, `https`, `mailto:`, `#`. Everything else renders as
   literal text. No HTML, ever.
3. **No em dashes.** House style. Use a colon, comma, or full stop.
4. **Write it as Lily, in first person, about what she will *do*.** Headings are
   "The company, as I will pitch it", not "About the company". Every claim is phrased so a
   founder can correct it, because the correction is the product.
5. **Rotating the slug is the only way to take a link back**, and it breaks the founder's
   bookmark too. Never rotate casually.

---

## 1. Gather the input

You need, in rough order of value:

- The intro-call transcript (Granola: `mcp__claude_ai_Granola__get_meeting_transcript`,
  or `lib/transcript-extract.ts`).
- Whatever roles pack / JD the company sent.
- The company row in Supabase (`companies`) and public research on the raise, customers,
  founders.

Where the transcript and the pack disagree, **use the pack and put the discrepancy on the
confirm checklist.** That is exactly what the Alcor brief does with Burlingame vs Millbrae,
and it is the single strongest trust signal in the document.

---

## 2. The eight-section spine

Keep this order. It is the order a founder reads in, and it earns the right to ask
questions at the end.

| id | heading | blocks | what it is for |
|----|---------|--------|----------------|
| `company` | The company, as I will pitch it | `lede`, `stats`, `bullets`, `callout` | Prove you understood the business. |
| `team` | The team, as I present it | `paragraph` (tone `note`), `people`, `cards` | Who candidates will ask about. |
| `roles` | The roles | `lede`, `roles` | One `roles` item per seat. The core. |
| `bar` | The bar | `bar` (3 groups: `must` / `nice` / `no`) | The filter, stated plainly. |
| `logistics` | Logistics | `facts`, `callout` | Location, visa, comp, tempo, process. |
| `how` | How we work from here | `paragraph`, `steps` | How Refery operates. Reusable near-verbatim. |
| `blurb` | What we will share with candidates | `paragraph` (note), `blurb`, `callout` | The anonymised blurb, shown back to them. |
| `confirm` | A few things to confirm | `checklist` | 2 to 4 open questions. Answerable in one line each. |

Set `nav` on every section (short: "Company", "The bar", "To confirm") for the contents rail,
and `summary` for the "In short" line that opens it.

Two more sections are optional and earn their place when the work is there. Both come
from the Arx Labs brief, `arx-labs-ujnz9q2`:

| id | heading | blocks | when to include it |
|----|---------|--------|--------------------|
| `comp` | Compensation, against the market | `compbars`, `table`, `heading`, `bar`, `steps` | Whenever their bands are wrong, or you want them changed. This is the section that moves a founder. |
| `jds` | The job descriptions, drafted for you | `jd` | When their JD is out of date or missing. |

Put `comp` after `logistics` and `jds` after `how`, so the argument lands before the ask.

### The optional blocks

- **`compbars`** draws salary bands on one shared scale. Amounts are whole dollars
  (`150000`, not `150`). `tone` is `ours` for the client's own bands, `peer` for the market
  at their stage, `named` for the specific companies they said they hire from. Set `min` and
  `max` so the axis ends on round hundreds of thousands. A band with `high <= low` is dropped.
- **`table`** is any grid: columns plus rows of cells. **Blank cells must still be present
  as `""`** or the row shifts left. Set `emphasis: true` on the client's own rows.
- **`jd`** is one or more drafted job descriptions, collapsed behind a summary line, each
  with a Copy button that yields plain text with the inline syntax stripped. Each item is
  `{ title, meta, parts: [{ heading, paragraphs, items }] }`. Keep the part headings the ones
  a JD actually has: About, The role, What you'll do, You should have, Strong candidates
  often look like, Not required, Compensation and logistics, How we hire.
- **`heading`** is a sub-heading, for a section long enough to need turning. Only `comp` has
  needed one so far.
- **`confidential.points`** is the "if you have two minutes" list. Each point links to the
  section that argues it: `[the claim](#comp)`. In-page anchors are a permitted scheme.

### Writing the `roles` block

One item per seat. Fields, all optional except `title`:

- `tag` — "Live now", or "Scarcest profile · founding equity" for the seat that matters most.
- `title` — the seat as candidates will see it.
- `points[]` — 3 bullets: what they own, the domain signal, the hard requirement.
- `want` — open with `**What I will screen for:**` then years, background, education window.
- `exclude` — open with `I will filter out:`. State disqualifiers as plainly as the bar.
  A hiring manager corrects a wrong exclusion far faster than a vague requirement.
- `comp` — "$180K to $240K base + 0.25 to 0.75% equity".
- `secondary: true` — renders with a lighter rule, for a non-priority track.

### Writing the `bar` block

Exactly three groups, in this order and tone:

- `must` / "Non-negotiable"
- `nice` / "Explicitly not required" (this one surprises founders and gets corrections)
- `no` / "What I will filter out"

### Writing the `checklist`

Every item is `{ ask, why }`. The `why` is one line on what it changes. Cap it at four
questions: a founder answers three and abandons eight.

---

## 3. Create the draft

**Preferred, in the app:** open `/companies/<id>` as a super admin and press
"Start a hiring manager brief". It mints the slug and leaves `content` empty.

**Or by SQL** (Supabase project `ofujlvuejuvhpzemjaic`) when working headless. The slug is
`slugify(company name) + '-' + 7 chars` from the alphabet `23456789abcdefghjkmnpqrstuvwxyz`
(no `0 O 1 l i`, they break when read aloud). Mint the suffix yourself, do not reuse one.

```sql
insert into hm_briefs (company_id, slug, title, status, content, recipient_name, ribbon_note)
values (
  '<company uuid>',
  'acme-robotics-k7p2mqd',
  'Acme Robotics',
  'draft',
  '{}'::jsonb,
  'Jane Doe & Sam Roe',
  'Prepared for Acme Robotics by Refery · please don''t forward'
)
returning id, slug;
```

`recipient_name` is who it was written for, so the Slack ping can say whose desk it landed
on. `ribbon_note` is the line under the "Private link" ribbon.

---

## 4. Fill the content

Write the JSON, then either:

- `PATCH /api/hm-briefs/<id>` with `{ "content": { … } }` as a super admin. This bumps
  `version`, which is what you want for an edit after the founder has seen it.
- Or `update hm_briefs set content = '<json>'::jsonb, version = version + 1 where id = '<id>';`

Then read the JSON back and diff it against what you wrote. Anything missing was dropped by
`normalizeBrief` for a missing required field.

---

## 5. Publish and hand it over

`PATCH /api/hm-briefs/<id>` with `{ "status": "published" }`. The route stamps
`published_at` on the first publish only, so it keeps meaning "when this went out". By SQL,
stamp it yourself.

Then **open the URL and read the whole page** before sending it. A draft and a wrong slug
both 404 identically, so a broken link looks exactly like a link that was never made.

URL: `https://refery.xyz/b/<slug>`.

---

## 6. After it is sent

- Slack `clients` gets `:eyes:` on open, `:book:` with where they stopped reading, and
  `:speech_balloon:` on every correction. The stop point is the signal worth acting on.
- The company page card summarises opens, read-to, and the latest comments.
- Corrections are the founder's words. Fold them into `content` and PATCH; the version
  counter carries the history.
- `{ "rotate": true }` mints a fresh slug and kills every link already sent. Comments and
  history survive. Use it when a brief was forwarded outside the company, and only then.

---

## Reusable near-verbatim

The `how` section (what Refery is, the five steps) and the shape of the closing `signoff`
change only in small ways between companies. Lift them from the Alcor brief and adjust the
one or two clauses that are company-specific, such as an open point on the agreement.
