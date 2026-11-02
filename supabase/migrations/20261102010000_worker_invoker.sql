-- Lets Postgres call the poll-wikipedia worker. Supabase Cron runs this on a schedule.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Sends one request to the worker. The secret key is read from Vault at call time,
-- so it's never stored in this SQL or in the cron job.
create or replace function private.invoke_poll_wikipedia()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://ntbammrxfslyithbnmia.supabase.co/functions/v1/poll-wikipedia',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'worker_secret_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 9000
  );
$$;

revoke execute on function private.invoke_poll_wikipedia() from public, anon, authenticated;
