# Cron Job Failure Report - Atova Rank Scheduler

**Date:** October 24, 2025  
**Issue:** Supabase cron job `resolve-due-matchups-vault` is failing to automatically progress tournament matches

---

## Problem Description

### Current Behavior
- Cron job `resolve-due-matchups-vault` is **failing** every minute
- Job shows "Failed" status in Supabase Dashboard → Integrations → Cron → Jobs
- Failed at: 8:45 PM, 8:46 PM, 8:47 PM (and continuing)
- Tournament matches do NOT automatically progress when timer hits 0
- Manual calls to the Edge Function work perfectly (via "Debug Scheduler" button or direct curl)

### Expected Behavior
- Cron job should run every minute successfully
- When a match's `ends_at` time passes, the scheduler should automatically:
  1. Resolve the finished match
  2. Determine the winner (highest CP)
  3. Mark the loser as eliminated
  4. Start the next match in the tournament bracket

### What Works
- ✅ Edge Function `resolve_due_matchups` works when called manually
- ✅ Tournament progression logic is correct (QF → SF → Final)
- ✅ Race-proof guards prevent duplicate processing
- ✅ Database schema and migrations are correct
- ✅ Vault secrets are stored correctly

### What Doesn't Work
- ❌ Automatic cron job execution fails silently
- ❌ No Edge Function logs appear for automatic triggers
- ❌ Tournament does not progress without manual intervention

---

## Technical Context

### Project Stack
- **Platform:** Supabase (Postgres + Edge Functions)
- **Database:** PostgreSQL with `pg_cron` and `pg_net` extensions
- **Edge Functions:** Deno runtime
- **Secrets:** Stored in `supabase_vault`
- **Scheduler:** `pg_cron` + `pg_net.http_post()`

### Cron Job Configuration

**Migration File:** `supabase/migrations/0009_secure_vault_cron.sql`

```sql
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
```

**Job Details in Supabase:**
- **Name:** `resolve-due-matchups-vault`
- **Schedule:** `* * * * *` (every minute)
- **Command:** `SELECT net.http_post(...)` with Vault secret lookups
- **Status:** Failed (3 consecutive failures at 8:45, 8:46, 8:47 PM)
- **Next run:** Continues every minute

### Edge Function Details

**File:** `supabase/functions/resolve_due_matchups/index.ts`

**Key Features:**
- Fetches matchups where `active = true`, `finished = false`, and `ends_at <= NOW()`
- Race-proof guard: Claims matchup atomically before processing
- Determines winner based on CP (or random if tied)
- Updates matchup records (sets `finished = true`, `winner_id`, `final_cp_a/b`)
- Starts next match in tournament progression
- Updates Hall of Fame for tournament winner
- Returns JSON response with result

**Trigger Source Detection:**
```typescript
const triggerSource = req.headers.get('x-supabase-schedule') ? 'Automatic' : 'Manual'
console.log(`Scheduler: Trigger Source: ${triggerSource}`)
```

**Race-Proof Guard:**
```typescript
const claim = await supabase
  .from('matchups')
  .update({ updated_at: new Date().toISOString() })
  .eq('id', matchup.id)
  .eq('active', true)
  .eq('finished', false)
  .lte('ends_at', new Date().toISOString())
  .select('id')
  .single()

if (!claim.data) {
  console.log('Scheduler: matchup already handled by another run. Exiting.')
  return new Response(JSON.stringify({ success: true, message: 'Already handled' }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
}
```

### Database Schema (Relevant Tables)

**matchups table:**
```sql
CREATE TABLE matchups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  match_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  vc_a_id UUID REFERENCES vcs(id) ON DELETE SET NULL,
  vc_b_id UUID REFERENCES vcs(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  current_cp_a INTEGER DEFAULT 1000,
  current_cp_b INTEGER DEFAULT 1000,
  final_cp_a INTEGER,
  final_cp_b INTEGER,
  winner_id UUID REFERENCES vcs(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT false,
  finished BOOLEAN DEFAULT false,
  next_match_id UUID REFERENCES matchups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Current Database State:**
- Season created with 8 VCs
- Match #1: SoftBank (1000 CP) vs A16Z (1001 CP) - Timer expired, `ends_at` passed
- Match #1: `active = true`, `finished = false`, `ends_at = 2025-10-24 20:44:40+00` (in the past)
- Match #2, #3, #4 (other QFs): Not active, waiting to start
- Matches #5, #6 (SFs): Placeholder matches, waiting for QF winners
- Match #7 (Final): Placeholder match, waiting for SF winners

### Manual Testing Results

**Manual call to Edge Function (works perfectly):**
```bash
curl -X POST "https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Result:** 
- ✅ Match #1 resolves correctly
- ✅ A16Z wins (1001 CP > 1000 CP)
- ✅ Match #2 starts automatically
- ✅ Logs show "Scheduler: Trigger Source: Manual"

---

## Previous Attempts and Fixes

### Attempt 1: `http_post()` (Migration 0007)
- **Issue:** Supabase sandbox blocks outbound HTTP calls from `pg_cron` workers
- **Result:** Silent failures, no logs in Edge Function

### Attempt 2: `pg_net.http_post()` (Migration 0008)
- **Issue:** Same as Attempt 1, still failed silently
- **Result:** Job showed "Failed" in dashboard

### Attempt 3: Vault + `pg_net.http_post()` (Migration 0009 - Current)
- **Issue:** Still failing, but now using Vault for secure secret storage
- **Result:** Job shows "Failed" status, no Edge Function logs for automatic triggers

---

## Hypotheses

### Hypothesis 1: Vault Secret Retrieval Issue
- The cron job command may be failing to retrieve secrets from Vault
- `vault.decrypted_secrets` view might not be accessible from cron context
- **Evidence:** No Edge Function logs at all (suggests HTTP call never happens)

### Hypothesis 2: Permission Issue
- The cron job may not have permissions to access Vault or make HTTP calls
- `pg_net` extension may require additional grants
- **Evidence:** Manual calls work, automatic calls fail

### Hypothesis 3: SQL Syntax Issue in Cron Command
- The multi-line SQL command with subqueries might be malformed
- String concatenation or JSONB building might have errors
- **Evidence:** Job status shows "Failed" immediately

### Hypothesis 4: Network/Timeout Issue
- The HTTP call might be timing out (8000ms timeout set)
- Network policy might block internal Supabase → Supabase calls from cron
- **Evidence:** Similar to previous `http_post` failures

---

## Environment Details

**Supabase Project:**
- Project URL: `https://vmyrfpuzxtzglpayktmj.supabase.co`
- Service Role Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA`

**Extensions Enabled:**
- ✅ `pg_cron` (version: latest)
- ✅ `pg_net` (version: latest)
- ✅ `supabase_vault` (version: latest, marked as "Alpha")

**Edge Function Deployment:**
- ✅ Deployed successfully
- ✅ Accessible via direct HTTP calls
- ✅ Logs work for manual triggers

---

## Logs and Evidence

### Cron Job Dashboard
- **Status:** Failed
- **Last run:** 24 Oct 2025 20:46:00 (+0700)
- **Next run:** 24 Oct 2025 20:47:00 (+0700)
- **Command:** `SELECT net.http_post( url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='project_url') || '/functions/v1/resolve_due_matchups', ...)`

### Edge Function Logs
- **Manual triggers:** Show "Scheduler: Trigger Source: Manual" and full execution logs
- **Automatic triggers:** No logs at all (function never called)

### Database State
- Match #1 has `ends_at` in the past
- Match #1 is still `active = true`, `finished = false`
- No automatic progression after 3+ minutes past `ends_at`

---

## Questions for ChatGPT

1. **Why is the cron job failing?**
   - Is there a syntax error in the SQL command?
   - Are Vault secrets accessible from the cron context?
   - Does `pg_net.http_post()` require additional permissions?

2. **How can we debug this further?**
   - Are there Postgres logs we can check for detailed error messages?
   - Can we test the exact SQL command manually in the SQL Editor?
   - Is there a way to log the HTTP request/response from `pg_net`?

3. **What's the correct way to implement this?**
   - Should we use a different approach (e.g., Supabase native Function Invocation Scheduler)?
   - Should we avoid Vault and hardcode secrets in the cron command?
   - Is there a simpler, more reliable way to trigger Edge Functions on a schedule?

4. **Alternative solutions?**
   - Can we use a Postgres trigger instead of cron?
   - Should we use an external service (e.g., Vercel Cron, GitHub Actions)?
   - Is there a way to make Supabase's built-in scheduler work without pg_cron?

---

## Desired Outcome

A working cron job that:
1. Runs every minute without failing
2. Successfully calls the Edge Function with proper authentication
3. Automatically progresses the tournament when matches expire
4. Logs "Scheduler: Trigger Source: Automatic" in Edge Function logs

---

## Additional Context

### Previous Success (Now Failing)
We previously had a working setup with `pg_cron` + hardcoded service role key in migration `0008_pg_net_cron_job.sql`. That was working but failed due to Supabase sandbox restrictions. We then moved to Vault (migration 0009) for security, but now the job fails.

### Working Components
- ✅ Database schema and RLS policies
- ✅ Edge Function logic (tournament progression, race guards, winner determination)
- ✅ Manual triggering via admin page or curl
- ✅ Frontend (voting, bracket display, admin controls)
- ✅ Vault secrets storage

### Only Failing Component
- ❌ Automatic cron job execution

---

## Files for Reference

**Key Files:**
1. `supabase/migrations/0009_secure_vault_cron.sql` - Current cron job setup
2. `supabase/functions/resolve_due_matchups/index.ts` - Edge Function code
3. `app/admin/page.tsx` - Admin interface with "Debug Scheduler" button
4. `supabase/migrations/0001_init.sql` - Database schema and RLS policies

**All migration files in order:**
1. `0001_init.sql` - Core schema
2. `0002_seed_quarterfinals_function.sql` - Database functions
3. `0003_hall_of_fame.sql` - Hall of Fame table
4. `0004_cron_job.sql` - Initial cron attempt (deprecated)
5. `0005_fix_start_season_function.sql` - Function fix
6. `0006_setup_cron_job.sql` - Second cron attempt (deprecated)
7. `0007_setup_cron_job_with_key.sql` - Third cron attempt (deprecated)
8. `0008_pg_net_cron_job.sql` - Fourth cron attempt with `pg_net` (deprecated)
9. `0009_secure_vault_cron.sql` - **Current failing setup**
10. `0010_reset_tournament_data.sql` - Data cleanup

---

## Request for ChatGPT

Please analyze this issue and provide:
1. **Root cause analysis** - Why is the cron job failing?
2. **Immediate fix** - SQL or configuration changes to make it work
3. **Testing steps** - How to verify the fix works
4. **Long-term recommendation** - Best practice for this use case in Supabase

Assume you have full access to modify SQL, Edge Functions, and Supabase configuration. Provide complete, production-ready code that we can deploy immediately.
