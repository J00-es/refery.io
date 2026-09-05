-- Schedule the call-recap poller from inside Postgres.
--
-- Why not a Vercel cron: this project is on the Vercel Hobby plan, where cron
-- jobs may only run once a day. A recap that arrives tomorrow morning is not a
-- recap. pg_cron and pg_net are already installed on this project and cost
-- nothing, so the database rings the endpoint instead.
--
-- Run this once. It is idempotent: re-running replaces the schedule rather than
-- adding a second one.

-- The endpoint checks a bearer token, and cron.job is readable by anyone with
-- database access, so the token goes in Vault rather than in the command text.
-- Replace the placeholder with the CRON_SECRET already set in Vercel, run this
-- line, then delete it from your editor.
--
--   select vault.create_secret('PASTE_CRON_SECRET_HERE', 'cron_secret',
--                              'Bearer token for /api/cron/* endpoints');
--
-- To rotate later:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'cron_secret'), 'NEW_VALUE');

select cron.unschedule('call-recaps')
where exists (select 1 from cron.job where jobname = 'call-recaps');

select cron.schedule(
  'call-recaps',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://refery.xyz/api/cron/call-recaps',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'
      )
    ),
    body    := '{}'::jsonb,
    -- Longer than the function's own budget. pg_net does not wait for the
    -- response, so this only bounds how long the request is held open.
    timeout_milliseconds := 30000
  );
  $$
);

-- Check it is there:
--   select jobname, schedule, active from cron.job where jobname = 'call-recaps';
--
-- Check what happened on recent runs. pg_net answers land here, not in cron's
-- own log, because the cron job's only job is to fire the request:
--   select id, status_code, left(content, 400) as body, created
--     from net._http_response order by created desc limit 10;
--
-- And what the poller actually did:
--   select occurred_at, person_name, entity_type, status, attempts,
--          gmail_draft_id is not null as drafted, error
--     from call_recaps order by created_at desc limit 20;
