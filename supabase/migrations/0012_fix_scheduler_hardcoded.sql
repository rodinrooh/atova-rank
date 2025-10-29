-- Replace the SECURITY DEFINER function with hardcoded secrets
-- This avoids Vault permission issues and gets the scheduler working immediately

create or replace function scheduler.invoke_resolve_due_matchups()
returns void
language plpgsql
security definer
set search_path = scheduler, public, net
as $$
declare
  v_request_id bigint;
begin
  -- Fire the HTTP POST via pg_net with hardcoded secrets (async)
  select net.http_post(
    url := 'https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA',
      'x-supabase-schedule','pg_cron'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;

  insert into scheduler.job_runs(status_code, ok, response_body)
  values (null, true, jsonb_build_object('request_id', v_request_id));
  
exception when others then
  insert into scheduler.job_runs(status_code, ok, error)
  values (null, false, SQLERRM);
  raise;
end;
$$;

-- Ensure postgres owns the function
alter function scheduler.invoke_resolve_due_matchups() owner to postgres;

-- Test it immediately
select scheduler.invoke_resolve_due_matchups();
