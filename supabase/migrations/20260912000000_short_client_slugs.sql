-- Short, readable links for everything a client is sent.
--
-- A hiring-manager brief used to live at /b/<company>-<7 random chars>, and a
-- client agreement at /sign/client-agreement/<64-char token> unless someone set
-- a short alias by hand. From here on both are the company name and nothing
-- else: refery.xyz/b/edge-markets and refery.xyz/agreement/edge-markets.
--
-- Briefs already sent keep working: the old slug moves into previous_slugs and
-- the page redirects to the new address. Rotating a brief still mints an
-- unguessable slug and clears the aliases, so a rotated link is still dead.

-- 1. A slug can be as short as the company name (was 6+).
alter table public.hm_briefs drop constraint if exists hm_briefs_slug_check;
alter table public.hm_briefs
  add constraint hm_briefs_slug_check
  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 80);

alter table public.hm_briefs
  add column if not exists previous_slugs text[] not null default '{}';
comment on column public.hm_briefs.previous_slugs is
  'Older addresses that still resolve to this brief (redirected to slug). Cleared on rotate.';

create index if not exists hm_briefs_previous_slugs_idx
  on public.hm_briefs using gin (previous_slugs);

-- 2. Existing briefs: drop the random suffix where the short name is free.
update public.hm_briefs b
set previous_slugs = array_append(b.previous_slugs, b.slug),
    slug = regexp_replace(b.slug, '-[23456789abcdefghjkmnpqrstuvwxyz]{7}$', '')
where b.slug ~ '-[23456789abcdefghjkmnpqrstuvwxyz]{7}$'
  and length(regexp_replace(b.slug, '-[23456789abcdefghjkmnpqrstuvwxyz]{7}$', '')) >= 2
  and not exists (
    select 1 from public.hm_briefs o
    where o.id <> b.id
      and o.slug = regexp_replace(b.slug, '-[23456789abcdefghjkmnpqrstuvwxyz]{7}$', '')
  );

-- 3. Existing agreement links: the newest live or signed link per real company
--    gets the company's short name, matching lib/hm-brief.ts slugifyCompany
--    (apostrophes dropped, everything else non-alphanumeric becomes a dash).
with latest as (
  select distinct on (company_id) id, company_name
  from public.client_agreement_links
  where status in ('sent', 'viewed', 'signed')
    and short_slug is null
    and company_name not ilike '%sandbox%'
    and coalesce(recipient_email, '') not ilike 'test@%'
  order by company_id, created_at desc
), named as (
  select id,
         trim(both '-' from regexp_replace(lower(regexp_replace(company_name, '[''’]', '', 'g')), '[^a-z0-9]+', '-', 'g')) as slug
  from latest
)
update public.client_agreement_links l
set short_slug = n.slug
from named n
where l.id = n.id
  and length(n.slug) between 2 and 60
  and not exists (select 1 from public.client_agreement_links o where o.short_slug = n.slug);
