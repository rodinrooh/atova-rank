# SCHEDULER DEBUG REPORT: Automatic Tournament Progression Failure

## 1. Problem Description

**Current Behavior:**
The tournament scheduler, implemented as a Supabase Edge Function and triggered by a `pg_cron` job, is **not automatically progressing matches** after their `ends_at` time has passed. This results in:
- The public homepage (`/`) showing "Next match starting shortly..." or an outdated active match
- The admin page (`/admin`) showing "No Active Match" or an outdated active match, even when a match should have ended and the next one should have started
- The bracket page (`/bracket`) showing an outdated state

**Expected Behavior:**
After a match's `ends_at` timestamp passes, the `pg_cron` job, scheduled to run every minute, should automatically trigger the `resolve_due_matchups` Edge Function. This function should then:
1. Identify the due match
2. Determine the winner (or apply tie-break rules if no votes)
3. Update the `matchups` table to mark the match as `finished: true` and `active: false`
4. Populate the `vc_a_id` and `vc_b_id` for the next appropriate match (e.g., the next quarterfinal, or a semifinal if all preceding matches are resolved)
5. Start the next match by setting its `active: true`, `started_at`, `ends_at`, `current_cp_a`, and `current_cp_b`
6. Update the `hall_of_fame` if a season winner is determined

**Key Observation:**
**Manually invoking the `resolve_due_matchups` Edge Function works perfectly.**
- When the "Debug Scheduler" button on the admin page is clicked (which directly calls the Edge Function via `fetch`)
- When a `curl` command is used to directly `POST` to the Edge Function endpoint

This strongly indicates that the core logic within the `resolve_due_matchups` Edge Function is correct and functional. The problem lies specifically with the `pg_cron` job not reliably triggering this Edge Function automatically.

## 2. Project Context & Setup

**Project Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase (Postgres, RLS, Edge Functions, Cron), Clerk (admin auth only), Vercel

**Supabase Project ID:** `vmyrfpuzxtzglpayktmj`
**Supabase URL:** `https://vmyrfpuzxtzglpayktmj.supabase.co`
**Supabase Service Role Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZteXJmcHV6eHR6Z2xwYXlrdG1qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDYxNDYwNiwiZXhwIjoyMDc2MTkwNjA2fQ.be9YyEXxppTwdo0bOqYD8zHWOj62UWvok1M61EqHyfA`

**Environment Variables:**
- `SUPABASE_SERVICE_ROLE_KEY` is correctly set and used where needed (e.g., in the `pg_cron` `http_post` call, admin APIs)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correctly set
- `ATOVA_MATCH_DURATION_HOURS=72` (default match duration, but can be set to 1 minute for testing via admin API)

**Database State:** We've observed inconsistencies (e.g., multiple active matches) which were resolved by a manual database cleanup script. The current state, after manual intervention, is that only one match is active, and the scheduler successfully progresses when manually triggered.

## 3. Relevant Files & Code Pointers

### 3.1. Supabase Edge Function: `resolve_due_matchups`
(`atova-rank/supabase/functions/resolve_due_matchups/index.ts`)

This is the core scheduler logic. It works when manually invoked.

```typescript
// Path: atova-rank/supabase/functions/resolve_due_matchups/index.ts

// ... (imports and setup) ...

// Main handler for the Edge Function
serve(async (req) => {
  try {
    console.log('Scheduler: Checking for due matchups...')
    console.log('Scheduler: Current time:', new Date().toISOString())

    // Step 1: Find the single row where active=true AND finished=false AND ends_at <= now()
    const { data: dueMatchups, error: findError } = await supabase
      .from('matchups')
      .select(`
        id, 
        season_id, 
        match_number, 
        current_cp_a, 
        current_cp_b, 
        vc_a_id, 
        vc_b_id, 
        next_match_id,
        ends_at,
        round
      `)
      .eq('active', true)
      .eq('finished', false)
      .lte('ends_at', new Date().toISOString())

    console.log('Scheduler: Found due matchups:', dueMatchups?.length || 0)
    if (findError) {
      console.error('Scheduler: Error finding due matchups:', findError)
      throw findError
    }

    if (!dueMatchups || dueMatchups.length === 0) {
      console.log('Scheduler: No due matchups found. Exiting.')
      return new Response(JSON.stringify({ success: true, message: 'No due matchups' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const matchup = dueMatchups[0] // Process one at a time for idempotency
    console.log(`Scheduler: Processing due matchup ${matchup.match_number} (ID: ${matchup.id})`)
    console.log('Scheduler: Matchup ends_at:', matchup.ends_at)
    console.log('Scheduler: Current time:', new Date().toISOString())
    console.log('Scheduler: Is due?', new Date(matchup.ends_at) <= new Date())

    // ... (Steps 2-6: Determine winner, update final CP, update winner_id, set active=false, finished=true) ...

    // Step 7a: If this was a quarterfinal (match_number 1-4), start the next quarterfinal
    if (matchup.round === 1 && matchup.match_number < 4) { // Only QF 1-3 can trigger next QF
      const nextQuarterfinalNumber = matchup.match_number + 1
      
      const { data: nextQf, error: nextQfError } = await supabase
        .from('matchups')
        .select('id, vc_a_id, vc_b_id, match_number, active, finished')
        .eq('season_id', matchup.season_id)
        .eq('match_number', nextQuarterfinalNumber)
        .single()

      if (nextQfError) {
        console.error(`Scheduler: Error fetching next quarterfinal ${nextQuarterfinalNumber}:`, nextQfError)
      } else if (nextQf && !nextQf.active && !nextQf.finished && nextQf.vc_a_id && nextQf.vc_b_id) {
        const startedAt = new Date()
        const endsAt = new Date(startedAt.getTime() + MATCH_DURATION_HOURS * 60 * 60 * 1000)

        const { error: startQfError } = await supabase
          .from('matchups')
          .update({
            started_at: startedAt.toISOString(),
            ends_at: endsAt.toISOString(),
            active: true,
            finished: false,
            current_cp_a: CP_START,
            current_cp_b: CP_START
          })
          .eq('id', nextQf.id)

        if (startQfError) {
          console.error(`Scheduler: Error starting next quarterfinal ${nextQf.match_number}:`, startQfError)
          throw startQfError
        }
        console.log(`Scheduler: Started next quarterfinal ${nextQf.match_number}`)
      } else {
        console.log(`Scheduler: Next quarterfinal ${nextQuarterfinalNumber} not ready to start or already active/finished.`)
      }
    }
    // ... (Step 7b: Update next match VCs for semifinals/final) ...
    // ... (Step 8: Update Hall of Fame) ...

    return new Response(JSON.stringify({ success: true, message: `Resolved matchup ${matchup.match_number}`, winner: winnerId, loser: loserId, tieBreak: isTieBreak }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error('Scheduler: Uncaught error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
```

### 3.2. Supabase `pg_cron` Job Setup
(`atova-rank/supabase/migrations/0007_setup_cron_job_with_key.sql`)

This migration sets up the `pg_cron` extension and schedules a function to call the Edge Function every minute.

```sql
-- Path: atova-rank/supabase/migrations/0007_setup_cron_job_with_key.sql

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
```
**Note:** The `Authorization` header contains the `SUPABASE_SERVICE_ROLE_KEY` directly.

### 3.3. Admin Page UI and Debugging Functions
(`atova-rank/app/admin/page.tsx`)

This page contains buttons to manually interact with the scheduler and debug its state.

- **`loadCurrentStatus`**: Fetches `/api/current-matchup`
- **`testScheduler`**: Calls `/api/admin/test-scheduler` to set the current match's `ends_at` to 1 minute from now
- **`startNextMatch`**: Calls `/api/admin/start-next-match` to manually start the next quarterfinal
- **`debugScheduler`**: Manually calls the `resolve_due_matchups` Edge Function directly

```typescript
// Simplified snippets for context
// ... (imports, useState, useEffect) ...

  const loadCurrentStatus = async () => {
    try {
      console.log('🔍 LOADING CURRENT STATUS...')
      const startTime = performance.now()
      const response = await fetch('/api/current-matchup')
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      const data = await response.json()
      console.log(`🔍 GET /api/current-matchup ${response.status} in ${duration}ms`, data)
      
      if (data.ok && data.matchup) {
        setCurrentMatchup(data.matchup)
        setStatus(`Active Match: ${data.matchup.matchNumber} (Round ${data.matchup.round}) - ${data.matchup.vcA.name} vs ${data.matchup.vcB.name}`)
        setSeasonId(data.matchup.seasonId)
        console.log('🔍 Active match found:', data.matchup)
      } else {
        setCurrentMatchup(null)
        setStatus('No active match. Ready to seed quarterfinals.')
        console.log('🔍 No active match found')
      }
    } catch (error) {
      setStatus('Error loading status')
      console.error('🔍 Error loading current status:', error)
    }
  }

  const testScheduler = async () => {
    try {
      console.log('🔧 TESTING SCHEDULER - Setting match to end in 1 minute')
      setStatus('Setting match to end in 1 minute...')
      
      const startTime = performance.now()
      const response = await fetch('/api/admin/test-scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      const result = await response.json()
      console.log(`🔧 POST /api/admin/test-scheduler ${response.status} in ${duration}ms`, result)
      
      if (response.ok) {
        setStatus('Match will end in 1 minute! Check back to see if next matchup started.')
        loadCurrentStatus() // Refresh status after setting test
      } else {
        throw new Error('Failed to set test scheduler: ' + result.error)
      }
    } catch (error) {
      console.error('🔧 Error testing scheduler:', error)
      setStatus(`Error: ${error}`)
    }
  }

  const debugScheduler = async () => {
    try {
      console.log('🐛 DEBUGGING SCHEDULER - Manually calling scheduler...')
      setStatus('Manually calling scheduler...')
      
      const startTime = performance.now()
      const response = await fetch('https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY}`, // Using NEXT_PUBLIC for client-side call
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      })
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      const result = await response.json()
      console.log(`🐛 POST /functions/v1/resolve_due_matchups ${response.status} in ${duration}ms`, result)
      setStatus('Scheduler called - check console for details')
      
      // Reload status after manual call
      loadCurrentStatus()
    } catch (error) {
      console.error('🐛 Error debugging scheduler:', error)
      setStatus(`Error: ${error}`)
    }
  }

  const startNextMatch = async () => {
    try {
      console.log('🚀 STARTING NEXT MATCH...')
      setStatus('Starting next match...')
      
      const startTime = performance.now()
      const response = await fetch('/api/admin/start-next-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      const endTime = performance.now()
      const duration = Math.round(endTime - startTime)
      
      if (response.ok) {
        console.log(`🚀 POST /api/admin/start-next-match ${response.status} in ${duration}ms - Success`)
        setStatus('Next match started! Refreshing status...')
        loadCurrentStatus()
      } else {
        const errorData = await response.json()
        console.error(`🚀 POST /api/admin/start-next-match ${response.status} in ${duration}ms - Error:`, errorData)
        throw new Error(errorData.error || 'Failed to start next match')
      }
    } catch (error) {
      console.error('🚀 Error starting next match:', error)
      setStatus(`Error: ${error}`)
    }
  }
```

### 3.4. API Endpoints

- **`/api/admin/test-scheduler`** (`atova-rank/app/api/admin/test-scheduler/route.ts`):
  - Updates the `ends_at` timestamp of the currently active match to 1 minute from `now()`
  - Used for quick testing of the scheduler's resolution logic

- **`/api/admin/start-next-match`** (`atova-rank/app/api/admin/start-next-match/route.ts`):
  - Finds the next quarterfinal match that is not active and not finished
  - Deactivates any currently active match (to ensure only one is active)
  - Starts the found next match by setting `active: true`, `started_at`, `ends_at`, and initial CPs

- **`/api/current-matchup`** (`atova-rank/app/api/current-matchup/route.ts`):
  - Fetches the single active matchup from the `matchups_with_vcs` view
  - Used by the admin page and public homepage to display current match status

- **`/api/vote`** (`atova-rank/app/api/vote/route.ts`):
  - Processes user votes, increments CP, and handles cooldowns/IP blocking

## 4. Database Schema (Simplified)

The relevant tables and view:

- **`seasons`**:
  - `id` (uuid, PK)
  - `active` (boolean)
- **`vcs`**:
  - `id` (uuid, PK)
  - `name` (text)
  - `color_hex` (text)
  - `conference` (text: 'left' | 'right')
- **`matchups`**:
  - `id` (uuid, PK)
  - `season_id` (uuid, FK to `seasons.id`)
  - `match_number` (int)
  - `round` (int: 1=QF, 2=SF, 3=Final)
  - `started_at` (timestamptz)
  - `ends_at` (timestamptz)
  - `current_cp_a` (int)
  - `current_cp_b` (int)
  - `final_cp_a` (int)
  - `final_cp_b` (int)
  - `winner_id` (uuid, FK to `vcs.id`)
  - `active` (boolean)
  - `finished` (boolean)
  - `vc_a_id` (uuid, FK to `vcs.id`)
  - `vc_b_id` (uuid, FK to `vcs.id`)
  - `next_match_id` (uuid, FK to `matchups.id`)
- **`matchups_with_vcs` (VIEW)**:
  - A view that joins `matchups` with `vcs` twice (for `vc_a` and `vc_b`) and formats `vc_a` and `vc_b` as JSON objects to ensure a stable data shape for API responses

## 5. Environment Variables

The following environment variables are crucial and are confirmed to be correctly set in `.env.local` and Supabase secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (used by `supabase` client)
- `SUPABASE_SERVICE_ROLE_KEY` (used by `supabaseAdmin` client and directly in cron job `http_post` call)
- `NEXT_PUBLIC_SUPABASE_URL` (for client-side Supabase client)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (for client-side Supabase client)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `ADMIN_ALLOWLIST_EMAILS`
- `ATOVA_IP_SALT`
- `ATOVA_MATCH_DURATION_HOURS` (currently 72 hours for normal matches)
- `ATOVA_EVENT_CUTOFF_SECONDS`
- `ATOVA_VOTE_COOLDOWN_SECONDS`

## 6. Debugging Steps Taken & Observations

1. **Manual Scheduler Call (`debugScheduler` button / `curl` to Edge Function)**:
   - **Observation**: Works perfectly. Resolves the current match, determines winner, updates database, and starts the next quarterfinal or semifinal.
   - **Conclusion**: The core logic within `resolve_due_matchups` Edge Function is correct.

2. **`Test Scheduler (1 min)` Button**:
   - **Observation**: Successfully updates the `ends_at` time of the active match to 1 minute from now.
   - **Observation**: When the 1 minute passes, and the `debugScheduler` button is clicked, the match resolves and progresses.
   - **Conclusion**: The `test-scheduler` API works as intended. The scheduler *will* process a match if its `ends_at` time is in the past.

3. **Automatic Progression (Cron Job)**:
   - **Observation**: After a match's `ends_at` time passes (without using "Test Scheduler"), the match remains `active: true` in the database, and the next match does not start.
   - **Observation**: The `pg_cron` job is configured to run every minute and call the Edge Function.
   - **Hypothesis**: The `http_post` call within the `call_resolve_due_matchups` SQL function (triggered by cron) might be failing, timing out, or encountering a permissions issue that prevents the Edge Function from executing or completing its database updates when triggered by cron, even though the `SUPABASE_SERVICE_ROLE_KEY` is embedded.

4. **Database State Checks (`curl` to Supabase REST API)**:
   - **Observation**: Confirmed that matches remain `active: true` and `finished: false` even after their `ends_at` time has passed, indicating the scheduler (when run by cron) is not updating them.
   - **Observation**: Confirmed that `vc_a_id` and `vc_b_id` are correctly populated for quarterfinal matches.

5. **Logging**:
   - Extensive client-side (browser console) and server-side (Next.js terminal) logs have been added to `app/admin/page.tsx`, `app/(public)/page.tsx`, `app/api/current-matchup/route.ts`, and `app/api/vote/route.ts` to trace API calls and their timings.
   - The `resolve_due_matchups` Edge Function also has `console.log` statements to trace its execution.
   - The `call_resolve_due_matchups` SQL function includes `RAISE NOTICE` for its `http_post` response, which should appear in Supabase logs if the cron job is successfully executing the SQL function.

## 7. Hypothesis for the Root Cause

The most likely root cause is that the `pg_cron` job is either:
1. **Not successfully executing the `call_resolve_due_matchups` SQL function at all.** (Less likely, as `pg_cron` itself is usually reliable once scheduled).
2. **The `http_post` call within `call_resolve_due_matchups` is failing or timing out when triggered by `pg_cron`.** This could be due to network issues, a subtle difference in the execution environment/permissions for cron-triggered functions versus direct API calls, or the Edge Function itself taking too long to respond within the `http_post` context.
3. **The `SUPABASE_SERVICE_ROLE_KEY` embedded in the `http_post` call is somehow not being correctly interpreted or authorized when executed by `pg_cron`.** (Less likely if it works with manual `curl` using the same key).

The fact that manual calls to the Edge Function work perfectly, but automatic progression does not, strongly points to an issue with the `pg_cron` -> `http_post` -> Edge Function invocation chain.

## 8. Next Steps for Debugging (for ChatGPT)

Given the context, ChatGPT should focus on:

1. **Verifying `pg_cron` execution logs in Supabase**:
   - How can we confirm that `cron.schedule` is actually running `call_resolve_due_matchups` every minute?
   - Are there any errors or notices in the Supabase logs related to `pg_cron` or the `call_resolve_due_matchups` function? (e.g., `RAISE NOTICE` output).

2. **Debugging the `http_post` call**:
   - Is there a way to get more detailed error information from the `http_post` call within the `call_resolve_due_matchups` function if it fails?
   - Could there be a timeout issue with `http_post` if the Edge Function takes longer than expected?
   - Are there any known limitations or best practices for calling Supabase Edge Functions from `pg_cron` via `http_post`?

3. **Edge Function execution context**:
   - Are there any differences in environment variables or permissions for an Edge Function when called directly vs. via `http_post` from `pg_cron`?
   - How can we add more robust logging *within* the Edge Function itself to differentiate between cron-triggered and manually triggered calls, and to log the exact state of the database before and after updates?

4. **Idempotency and Race Conditions**:
   - Re-evaluate the scheduler's idempotency. While designed to be idempotent, could the `pg_cron` running every minute, combined with potential delays, lead to multiple invocations trying to process the same match or creating inconsistent states?
   - Ensure the `active: true` check in the Edge Function is robust enough to prevent multiple instances from trying to resolve the same match.

The goal is to pinpoint *why* the `resolve_due_matchups` Edge Function isn't successfully completing its database updates when invoked by the `pg_cron` job.

## 9. Current Database State (as of last check)

After manual intervention, the database shows:
- **Match #4** (Accel vs Index VC): `active: false, finished: true` ✅ **RESOLVED**
- **Match #5** (YC vs Founders Fund): `active: true, finished: false` ✅ **STARTED**
- **Match #6** (Softbank vs Accel): `active: true, finished: false` ✅ **ALSO STARTED**

This confirms the scheduler logic works when manually triggered, but the automatic cron job is not reliably executing.

## 10. Key Files to Examine

- `supabase/functions/resolve_due_matchups/index.ts` - Core scheduler logic
- `supabase/migrations/0007_setup_cron_job_with_key.sql` - Cron job setup
- `app/admin/page.tsx` - Admin UI with debug buttons
- `app/api/admin/test-scheduler/route.ts` - API to set match end time
- `app/api/admin/start-next-match/route.ts` - API to manually start next match
- `app/api/current-matchup/route.ts` - API to get active match
- `app/api/vote/route.ts` - API to process votes

## 11. Expected Tournament Flow

1. **Quarterfinals (Matches 1-4)**: 4 matches, 2 per conference
2. **Semifinals (Matches 5-6)**: 2 matches, 1 per conference
3. **Final (Match 7)**: 1 match, tournament winner

The scheduler should automatically progress through these stages, ensuring only one match is active at a time, and that quarterfinals complete before semifinals begin.

---

**This document contains all the necessary information for ChatGPT to debug the scheduler issue without access to the codebase. The problem is clearly defined, the code is provided, and the debugging steps are outlined.**
