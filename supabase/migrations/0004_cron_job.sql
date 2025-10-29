-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create cron job to run resolve_due_matchups every minute
-- Note: This will be configured via Supabase Dashboard or CLI
-- The function is deployed and ready to be called via cron
