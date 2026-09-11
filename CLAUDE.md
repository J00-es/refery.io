# Refery app: conventions

## URLs never carry UUIDs (since 2026-09-11)

Every path a person can see uses a short slug, never a database id:

- `/searches/<company slug>` and `/searches/<company slug>/roles/<role slug>` (e.g. `/searches/k7m2qxf/roles/applied-ai-engineer-7kq3`)
- `/candidates/<candidate slug>` (e.g. `/candidates/frznf6z`)

Rules for anything new:

1. Give the table a `slug text not null unique` column, minted by the database: `default public.short_slug(7)` for a random slug, or a `before insert` trigger like `partner_roles_set_slug()` for `<title>-<4 chars>`. Never mint slugs in application code, so no insert path is missed.
2. Random when the slug would name a person or a client that some viewers see anonymised (candidates, desk clients). Title plus a short random tail when the name is already public to everyone who can open the page (roles).
3. Build links with `lib/paths.ts` (`searchPath`, `rolePath`, `rolePathFrom`, `candidatePath`, and the `*Url` absolute forms). Add a builder there for a new surface; never write `/thing/${id}` inline.
4. Pages resolve the segment with `lib/slugs.ts` (`canonicalCompany`, `canonicalRole`, `canonicalCandidate`), which accept a slug or an old UUID and redirect the UUID form permanently. Add a resolver there for a new surface so old links keep working.
5. API routes under `/api/...` stay on ids. Only the address bar and links in emails, Slack and pages change.
