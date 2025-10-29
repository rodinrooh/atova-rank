-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create the cron job to run every minute
-- This will call the resolve_due_matchups function every minute
SELECT cron.schedule(
  'resolve-due-matchups',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups',
    headers := '{"Authorization": "Bearer ' || current_setting('app.settings.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Set the service role key for the cron job
-- Note: This needs to be set in Supabase Dashboard or via CLI
-- ALTER SYSTEM SET app.settings.service_role_key = 'your-service-role-key-here';
