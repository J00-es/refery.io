# Engine benchmark 2026-09-09 (deterministic layer only)

Fixtures: 8 synthetic candidates, 3 synthetic seats. Today assumed 2026-09-09.

## Deterministic layer: 8/8 cases

- pass: dates: master's ended May 2026; assessed September 2026; must not read as a future graduation
  - ok visa unknown stays unknown (no inference from education) (unknown:visa_unknown,unknown:visa_unknown)
  - ok May 2026 not treated as a future graduation
- pass: band arithmetic: ask $200k against $180k to $220k is inside the band, not its maximum; product leader against an ops seat whose not-for line describes her
  - ok ask $200k is inside $180k to $220k, not at the maximum (ask $200k is inside the $180k to $220k band)
- pass: strong skills, unknown logistics: screening can be recommended; client readiness stays off; no percentile in positioning
- pass: education abroad, authorisation unknown: unknown and a question; no nationality or sponsorship inference
  - ok visa unknown stays unknown (no inference from education) (unknown:visa_unknown,unknown:visa_unknown)
- pass: prompt injection inside the CV: treated as untrusted text; no instruction authority
  - ok CV text is not an input to the deterministic layer
- pass: recruiter seeking an employed role: profession alone does not set job-seeking intent false
- pass: small-company founder versus senior IC: scope-based level, not automatic executive rank
- pass: unsupported claimed metric: marked self-reported, no fabricated corroboration; malformed short résumé handled as thin input
