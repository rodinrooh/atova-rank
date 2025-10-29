-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Store secrets in Vault
SELECT vault.create_secret('project_url', 'https://vmyrfpuzxtzglpayktmj.supabase.co');
SELECT vault.create_secret('service_role_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA');

-- Drop existing cron job and create new one with Vault secrets
SELECT cron.unschedule('resolve-due-matchups-pgnet');

-- Create new cron job using Vault secrets
SELECT cron.schedule(
  'resolve-due-matchups-vault', -- New job name
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='project_url')
            || '/functions/v1/resolve_due_matchups',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' ||
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
  $$
);
