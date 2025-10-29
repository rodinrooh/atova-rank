-- Clean up old pg_cron job
DROP FUNCTION IF EXISTS call_resolve_due_matchups();
SELECT cron.unschedule('resolve-due-matchups-cron');
