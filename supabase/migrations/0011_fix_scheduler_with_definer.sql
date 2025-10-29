-- 1) Safety: create a dedicated schema for scheduler assets
create schema if not exists scheduler;

-- 2) Minimal run log for visibility (no secrets stored)
create table if not exists scheduler.job_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  status_code int,
  ok boolean,
  error text,
  response_body jsonb
);

-- 3) Ensure the calling role can use the required schemas/extensions
grant usage on schema scheduler to postgres, supabase_admin;
grant usage on schema net to postgres, supabase_admin;
grant usage on schema vault to postgres, supabase_admin;

-- 4) Allow execution of pg_net functions to the definer
grant execute on all functions in schema net to postgres;
-- future-proof new net functions
alter default privileges in schema net grant execute on functions to postgres;

-- 5) Limit read access to vault view to the definer only (postgres already has it)
-- If your project tightened Vault, keep this explicit:
grant select on all tables in schema vault to postgres;
alter default privileges in schema vault grant select on tables to postgres;

-- 6) SECURITY DEFINER wrapper that reads Vault and calls the Edge Function.
--    IMPORTANT: Owner must be postgres so it carries the right privileges.
create or replace function scheduler.invoke_resolve_due_matchups()
returns void
language plpgsql
security definer
set search_path = scheduler, public, net, vault
as $$
declare
  v_project_url text;
  v_service_key text;
  v_status int;
  v_body jsonb;
begin
  -- Read secrets from Vault (no leakage to callers)
  select decrypted_secret
    into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url';

  select decrypted_secret
    into v_service_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_project_url is null or v_service_key is null then
    insert into scheduler.job_runs(status_code, ok, error)
    values (null, false, 'Missing Vault secrets: project_url and/or service_role_key');
    raise exception 'Scheduler: missing Vault secrets';
  end if;

  -- Fire the HTTP POST via pg_net; add an explicit scheduler header so your function detects "Automatic"
  select r.status, r.body
    into v_status, v_body
  from net.http_post(
    url := v_project_url || '/functions/v1/resolve_due_matchups',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_service_key,
      'x-supabase-schedule','pg_cron'   -- lets your function tag it as Automatic
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as r;

  insert into scheduler.job_runs(status_code, ok, response_body)
  values (v_status, (v_status >= 200 and v_status < 300), v_body);

  if v_status >= 400 then
    raise exception 'Scheduler HTTP failed with status %', v_status;
  end if;
end;
$$;

-- Ensure postgres owns the function (so SECURITY DEFINER is effective on hosted Supabase)
alter function scheduler.invoke_resolve_due_matchups() owner to postgres;

-- 7) Replace the old cron with a call to the definer wrapper
-- Unschedule old jobs if they exist (idempotent)
do $$
begin
  perform cron.unschedule('resolve-due-matchups-vault');
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.unschedule('resolve-due-matchups');
exception when others then
  null;
end;
$$;

-- Schedule the new job
select cron.schedule(
  'resolve-due-matchups',
  '* * * * *',  -- every minute
  $$select scheduler.invoke_resolve_due_matchups();$$
);

-- 8) Quick self-test (runs once now so you don't wait a minute)
-- Comment this line out if you don't want an immediate run during migration.
-- select scheduler.invoke_resolve_due_matchups();
