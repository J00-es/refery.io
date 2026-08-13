# Known stale domains in the source list

Every row here caused a **false zero**, a **failed company match**, or a **review flag** in a
real run. Fixing them at source is the single highest-leverage improvement to this pipeline.

> **STATUS: 32 of these are now FIXED in Supabase `public.companies`** (2026-08).
> The old value is preserved in `website_previous`, with `website_source` set to
> `web-verified-2026-08` / `sourcing-verified-2026-08`. To see or roll back:
> ```sql
> select name, website_previous, website, website_source
> from public.companies where website_previous is not null order by name;
> -- rollback: update public.companies set website = website_previous,
> --   website_previous = null where website_previous is not null;
> ```
> The table below is kept as the reference of record, and because **lists exported from
> other systems (Crunchbase, Affinity, spreadsheets) may still carry the stale values.**

If your input list contains the left-hand domain, replace it with the right-hand one.

## Confirmed by live redirect or the company's own site

| Company | Listed (stale) | Real mail / live domain |
|---|---|---|
| Homebase | gethomebase.com | **joinhomebase.com** |
| Promise | promise-pay.com | **joinpromise.com** |
| Sieve | sievedata.com | **sieve.ai** |
| CoinTracker | cointracker.com | **cointracker.io** |
| Athelas | athelas.com | **getathelas.com** (merged into **commure.com**) |
| The Company Company | thecompany.company | **companycompany.ai** |
| Section | sectionschool.com | **sectionai.com** (rebrand from Section4) |
| Neo Group | neo.group | **neo-group.in** |
| Float | floatfinance.com | **gofloat.io** |
| Endurance Energy | enduranceenergy.com | **endurancegeo.com** |
| Slash | slash.com | **joinslash.com** |
| Alembic | getalembic.com | **alembic.com** |
| UpKeep | onupkeep.com | **upkeep.com** |
| Nourish | nourish.com | **usenourish.com** |
| Garner Health | garnerhealth.com | **getgarner.com** |
| Clipboard | clipboardworks.com | **clipboardhealth.com** |
| Infravision | infravisioninc.com | **infravision.com.au** |
| GOAT Group | goatgroup.com | **goat.com** |
| Giga | giga.ai | **gigaml.com** (legacy GigaML) |
| Tuesday Labs | tuesdaylabs.com | **tuesdaylab.com** |
| TireTutor | tiretutor.ai | **tiretutor.com** |
| Vorflux | vorflux.ai | **vorflux.com** |
| Doctorsa | doctorsa.com | **doctorsinitaly.com** |
| Falcomm | falcomm.com | **myfalcomm.com** |
| Zip | ziphq.com | **zip.com** |
| ARQ | arqfinance.com | **dolarapp.com** (Mar 2026 rebrand of DolarApp) |
| Voyager Space | voyagertechnologies.com | **voyagerspace.com** (legacy, still valid) |
| Extend | extend.ai | **extend.app** |
| Town | town.com | **corp.town.com** |
| Aurelius | aurelius.com | **aureliussystems.us** |
| Flox | flox.dev | **floxdev.com** |
| Brainbase | brainbaselabs.com | **usebrainbase.xyz** |
| Cogent Security | cogent.security | **cogent.com** (not Cogent Communications) |
| Astrocade | astrocade.com | **astroblox.ai** (rebrand) |
| SnapMagic | snapmagic.com | **snapeda.com** (former name) |

Other confirmed legacy→primary redirects: huntresslabs→huntress, endor.ai→endorlabs,
langchain.dev→langchain.com, oligosecurity.io→oligo.security, firecrawl.com→firecrawl.dev,
workstream.is→workstream.us, siftscience→sift.com, dynamofl→dynamo.ai, censys.io→censys.com,
abacum.io→abacum.ai, rungalileo.io→galileo.ai, prolific.co→prolific.com,
usespeak→speak, joinmodernhealth→modernhealth, redaptiveinc→redaptive, apiphani.com→apiphani.io,
jinba.ai→jinba.io, triomics.in→triomics.com, patlytics.com→patlytics.ai,
coverbase.ai→coverbase.com, goodfin.co→goodfin.com, guidde.co→guidde.com,
stack-ai.com→stackai.com, legion.health→legionhealth.com, cyberhaven.io→cyberhaven.com,
semgrep.com→semgrep.dev, skal.ar→skalar.de, artos-ai.com→artosai.com, squared.ai→aisquared.ai.

---

# Wrong-company traps (never accept these)

These looked like plausible domain aliases but are **different businesses**. All were
caught only by web-checking the company or the person — the domain guard alone passes them.

| Listed company | Trap domain | What it actually is |
|---|---|---|
| Nudge (nudge.works) | nudge.com | Fred Ehrsam's neurotech company |
| Aline (aline.co) | aline.com | ALINE Systems, 2005 footwear/orthotics maker |
| Circle Health (circle.healthcare) | circle.health | Circle Health Europe GmbH, Berlin clinic |
| Overview (overview.ai) | overview.earth | climate/methane investment firm |
| Envision Construction (envsn.com) | envisioncpd.com | Brooklyn site-photography firm |
| LiteLLM | litellm.ai (Kayla Mathisen) | she is Chief of Staff at Circleback |
| Shadeform | shadeform.io | does not resolve; real format is `first@shadeform.ai` |
| Biotic (biotic.org) | biotic-labs.com | unrelated Israeli bioplastics firm |
| Tuesday Labs | cedarcon.com | Ahmad Sinno runs Cedar Consulting |
| Short Story | drinkshortstory.com | a different Short Story (drinks) |
| Meru Health | bridgestohealing.net | Mahima Mohan left Meru in Oct 2024 |
| Arkestro | latitude39.com | Ron Rasmussen's primary employer |
| Govini | air.ai | Apollo stamped Govini records with the wrong domain |

## Phantom people (domain correct, person fabricated)

- **Render** — "John Frank (CEO)" and "Amet Alvirde (Founder)" do not exist there.
  Render's CEO is **Anurag Goel**. Throwaway LinkedIn handles, no corroboration.
- **Y Combinator / ycombinator.com** — mostly YC-*backed* founders self-tagging, not YC staff.
  Enrich them with **no `domain`** to get their real startup email; reject anything
  `@ycombinator.com` (that means actual YC staff) and any `.edu`.
- **Formula 1** — several "Founder"/"Co-Founder" records who aren't staff.
- Common-word company names attract phantom duplicate executives generally.

## Name corrections

- Mercor's cofounder is **Adarsh Hiremath** (recorded as "Adarsh Prakash A").
- Slash's CEO is **Victor Cardenas Codriansky** (recorded as "Victor Codriansky").
- Stracker's second co-founder is listed as "Late Co-founder" — **deceased, never contact.**

---

# Catch-all domains (higher bounce risk)

These accept any address, so Apollo's "verified" is weak evidence of a real mailbox.
They pass the domain guard but are the likeliest bounces — warm or verify separately
before a large send.

vercel.com · arize.com · gilead.com · firecrawl.dev · safe.security · netradyne.com ·
doji.com · infinite.dev · dittowords.com · getagency.com · manychat.com · extend.app ·
serval.com · albertinvent.com · boompop.com · complete.so · opencall.ai · coocaa.com
