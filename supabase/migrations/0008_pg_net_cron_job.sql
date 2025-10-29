-- Enable pg_net extension for HTTP requests from cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Clean up old failed cron jobs
SELECT cron.unschedule('resolve-due-matchups');
SELECT cron.unschedule('resolve-due-matchups-cron');

-- Create new cron job using pg_net
SELECT cron.schedule(
  'resolve-due-matchups-pgnet',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA'
    ),
    body := '{}'::jsonb
  );
  $$
);
