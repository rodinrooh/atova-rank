-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function that calls our Edge Function
CREATE OR REPLACE FUNCTION call_resolve_due_matchups()
RETURNS void AS $$
DECLARE
  response jsonb;
BEGIN
  -- Make HTTP request to our Edge Function
  SELECT INTO response
  http_post(
    'https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups',
    '{}',
    'Authorization=Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA; Content-Type=application/json'
  );
  
  RAISE NOTICE 'Scheduler called: %', response;
END;
$$ LANGUAGE plpgsql;

-- Schedule it to run every minute
SELECT cron.schedule(
  'resolve-due-matchups-cron',
  '* * * * *', -- Every minute
  $$ SELECT call_resolve_due_matchups(); $$
);

-- Check if the cron job was created
SELECT * FROM cron.job WHERE jobname = 'resolve-due-matchups-cron';
