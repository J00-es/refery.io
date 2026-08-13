# Loading sourced emails into Supabase

Project: `ofujlvuejuvhpzemjaic`

## Schema facts

`public.company_contacts`
- `company_id uuid NOT NULL` → FK to `public.companies(id)`
- `name text NOT NULL`, `email`, `linkedin_url`, `title`, `notes`
- `persona_type` enum **NOT NULL**: `founder | cto_eng | talent | other | exec`
- `email_type` enum: `business | personal`
- `source text` (default `'specter'`), `is_current bool`
- **No unique index on email.** Only the PK on `id`. Dedupe yourself.

`public.companies`
- Joined on `website`, stored as `http(s)://[www.]domain[/]` — ~half carry `www.`,
  some have a trailing slash. Normalise before matching.

## Staging table

Created once by this pipeline:

```sql
create table if not exists public.email_sourcing_staging (
  id bigserial primary key,
  batch text not null, company_name text not null, domain text not null,
  persona text, full_name text, title text, linkedin_url text,
  email text not null, source text, domain_match text, note text,
  quality text not null default 'review',
  company_id uuid references public.companies(id),
  promoted boolean not null default false,
  loaded_at timestamptz not null default now()
);
create unique index on public.email_sourcing_staging (lower(email));
```

**Immediately after creating it:**

```sql
alter table public.email_sourcing_staging enable row level security;
revoke all on public.email_sourcing_staging from anon, authenticated;
revoke all on sequence public.email_sourcing_staging_id_seq from anon, authenticated;
```

Without this, Supabase's default public-schema grants let the **public anon key read and
write the table**. This happened once in a real run with 1,229 work emails exposed. Verify
with a curl using the anon key — you want `401` on both read and write.

## Loading

`SUPABASE_SERVICE_ROLE_KEY` in `.env.local` was **stale/rotated** as of the last run — it
returns `401 Invalid API key` in every header combination while the anon key returns 200.
Check it before relying on it.

Options, in order of preference:
1. **Valid service-role key** → POST batches of 500 to `/rest/v1/email_sourcing_staging`.
2. **MCP `execute_sql`** in batches of ~250 rows. Safe but token-expensive (~50KB/batch).
3. **Last resort** — a *temporary*, INSERT-only, batch-scoped RLS policy for `anon`,
   reverted immediately and verified:

```sql
grant insert on public.email_sourcing_staging to anon;
grant usage, select on sequence public.email_sourcing_staging_id_seq to anon;
create policy tmp_insert_only on public.email_sourcing_staging
  for insert to anon with check (batch = '<this batch>');
-- ...load...
drop policy tmp_insert_only on public.email_sourcing_staging;
revoke all on public.email_sourcing_staging from anon, authenticated;
revoke all on sequence public.email_sourcing_staging_id_seq from anon, authenticated;
```
Never grant SELECT. Always verify `401` afterwards.

## Match companies

```sql
-- 1) by normalised website host
with clean as (
  select id, split_part(rtrim(lower(regexp_replace(regexp_replace(website,'^https?://',''),'^www\.','')),'/'),'/',1) as domain
  from public.companies where website is not null
)
update public.email_sourcing_staging s set company_id = c.id
from clean c where c.domain = s.domain and s.company_id is null;

-- 2) fallback by name (catches companies stored under an OLDER domain)
update public.email_sourcing_staging s set company_id = c.id
from public.companies c
where s.company_id is null and lower(c.name) = lower(s.company_name);

-- 3) create anything genuinely new, then re-run (2)
```

Step 2 matters: 15 of 17 unmatched companies in a real run already existed under a stale
domain (Athelas/athelas.com, Sieve/sievedata.com, Homebase/gethomebase.com).

## Promote to company_contacts

```sql
insert into public.company_contacts
  (company_id, name, email, linkedin_url, title, notes, persona_type, email_type, source, is_current)
select s.company_id,
       coalesce(nullif(s.full_name,''), split_part(s.email,'@',1)),
       lower(s.email), nullif(s.linkedin_url,''), nullif(s.title,''),
       concat_ws(' | ','sourced:'||s.batch,'quality:'||s.quality,
                 'domain_match:'||coalesce(s.domain_match,'?'), nullif(s.note,'')),
       (case when s.persona='P1' then 'founder'
             when s.persona='P3' then 'talent'
             when s.persona='P2' and (s.title ilike '%cto%' or s.title ilike '%chief technology%'
                                      or s.title ilike '%technolog%') then 'cto_eng'
             when s.persona='P2' then 'exec' else 'other' end)::contact_persona_type,
       'business'::contact_email_type,
       case when s.source='specter_free' then 'specter' else 'apollo' end,
       true
from public.email_sourcing_staging s
where s.batch = '<this batch>'
  and not exists (select 1 from public.company_contacts cc where lower(cc.email)=lower(s.email));
```

The `not exists` clause is mandatory — there is no unique constraint to protect you.

Then `update ... set promoted = true` for rows now present in `company_contacts`.
