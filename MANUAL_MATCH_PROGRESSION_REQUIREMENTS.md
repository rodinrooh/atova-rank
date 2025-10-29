# Manual Match Progression Requirements - Atova Rank

**Date:** October 25, 2025  
**Priority:** Critical - Complete System Redesign

---

## New Requirements (User's Final Decision)

### ❌ What We're Removing
- **NO automatic scheduler** at all
- **NO pg_cron jobs**
- **NO automatic match progression**
- User will manually start matches at 9 PM PST

### ✅ What We Need

#### 1. Manual Match Start
- Admin starts each match manually via admin page
- Match runs for exactly **72 hours** from start time
- Countdown timer shows time remaining

#### 2. Automatic Resolution at 72 Hours
- **At exactly 72 hours**, the system automatically:
  - Determines the winner (highest CP)
  - Marks match as finished
  - Records final scores
  - Does NOT start next match automatically

#### 3. "Waiting for Next Match" State
- After match ends at 72 hours, all pages show:
  - **"Next match starting shortly..."**
  - **Winner of last match**: `A16Z` (or whoever won)
  - **Final Score**: `A16Z: 1001 CP, SoftBank: 1000 CP`
  - This state persists until admin manually starts the next match

#### 4. Admin Manual Control
- Admin clicks "Start Next Match" when ready (at 9 PM PST)
- This starts the next match in the tournament progression
- New match runs for 72 hours
- Cycle repeats

---

## Current System (What's Broken)

### Architecture Overview

**Tech Stack:**
- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres, Edge Functions)
- Clerk (admin auth)
- Client-side React components

**Current Match Flow:**
1. Admin seeds quarterfinals (8 VCs, 4 matches)
2. Admin starts season (activates Match #1)
3. Match #1 runs with 72-hour timer
4. **PROBLEM**: When timer hits 0, nothing happens automatically
5. **PROBLEM**: Scheduler (pg_cron + Edge Function) fails silently
6. **PROBLEM**: Match stays in "active" state forever

### Database Schema

**`matchups` table:**
```sql
CREATE TABLE matchups (
  id UUID PRIMARY KEY,
  season_id UUID REFERENCES seasons(id),
  match_number INTEGER NOT NULL,
  round INTEGER NOT NULL,
  vc_a_id UUID REFERENCES vcs(id),
  vc_b_id UUID REFERENCES vcs(id),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  current_cp_a INTEGER DEFAULT 1000,
  current_cp_b INTEGER DEFAULT 1000,
  final_cp_a INTEGER,
  final_cp_b INTEGER,
  winner_id UUID REFERENCES vcs(id),
  active BOOLEAN DEFAULT false,
  finished BOOLEAN DEFAULT false,
  next_match_id UUID REFERENCES matchups(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Fields:**
- `active`: TRUE when match is live
- `finished`: TRUE when match is resolved
- `ends_at`: Exact timestamp when match should end (started_at + 72 hours)
- `winner_id`: Set when match is resolved
- `final_cp_a`, `final_cp_b`: Final scores when match ends

### Current Scheduler Attempt (Broken)

**Migration:** `supabase/migrations/0012_fix_scheduler_hardcoded.sql`

```sql
-- SECURITY DEFINER function to call Edge Function
create or replace function scheduler.invoke_resolve_due_matchups()
returns void
language plpgsql
security definer
as $$
declare
  v_request_id bigint;
begin
  -- Fire HTTP POST via pg_net
  select net.http_post(
    url := 'https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer <SERVICE_ROLE_KEY>',
      'x-supabase-schedule','pg_cron'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into v_request_id;
end;
$$;

-- Schedule cron job to run every minute
SELECT cron.schedule(
  'resolve-due-matchups',
  '* * * * *',
  $$select scheduler.invoke_resolve_due_matchups();$$
);
```

**Edge Function:** `supabase/functions/resolve_due_matchups/index.ts`

Core logic:
1. Find matchups where `active = true AND finished = false AND ends_at <= NOW()`
2. Determine winner (highest CP)
3. Update matchup: set `finished = true`, `winner_id`, `final_cp_a/b`
4. Advance tournament: find next match, update with winner
5. Start next match automatically (NOT WANTED ANYMORE)

**Why It's Failing:**
- Cron job shows "Succeeded" but Edge Function never runs
- No logs in Edge Function → HTTP call never reaches it
- `pg_net.http_post` is async, doesn't block or return response
- Race-proof guard in Edge Function prevents re-entry

---

## What Needs To Change

### 1. Remove Automatic Scheduler Entirely

**Delete/Disable:**
- All cron jobs in Supabase Dashboard
- `scheduler.invoke_resolve_due_matchups()` function
- Any automatic triggering mechanism

**Keep:**
- Edge Function `resolve_due_matchups` (will be called on-demand)
- Database schema (no changes needed)

### 2. Add Time-Based Auto-Resolution

**New Mechanism:**
Instead of a scheduler checking every minute, we need a **client-side interval** that:

**Frontend Timer (all pages):**
```typescript
useEffect(() => {
  const checkMatchExpiration = async () => {
    if (!currentMatchup) return
    
    const now = new Date().getTime()
    const endsAt = new Date(currentMatchup.endsAt).getTime()
    
    if (now >= endsAt && currentMatchup.active && !currentMatchup.finished) {
      // Match just expired - call resolution
      await fetch('/api/resolve-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchupId: currentMatchup.id })
      })
      
      // Reload to show "next match starting shortly" state
      window.location.reload()
    }
  }
  
  // Check every 10 seconds
  const interval = setInterval(checkMatchExpiration, 10000)
  return () => clearInterval(interval)
}, [currentMatchup])
```

**New API Route:** `/api/resolve-match`
```typescript
// app/api/resolve-match/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/src/lib/supabase'

export async function POST(req: NextRequest) {
  const { matchupId } = await req.json()
  
  // Call Edge Function to resolve this specific match
  const response = await fetch('https://vmyrfpuzxtzglpayktmj.supabase.co/functions/v1/resolve_due_matchups', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ matchupId })
  })
  
  const result = await response.json()
  return NextResponse.json({ ok: true, result })
}
```

### 3. Update Edge Function Logic

**Modify:** `supabase/functions/resolve_due_matchups/index.ts`

**Key Change:** Do NOT automatically start the next match

```typescript
// AFTER resolving match and determining winner...

// Update matchup to finished
await supabase
  .from('matchups')
  .update({
    finished: true,
    active: false, // IMPORTANT: deactivate
    winner_id: winnerId,
    final_cp_a: matchup.current_cp_a,
    final_cp_b: matchup.current_cp_b,
    updated_at: new Date().toISOString()
  })
  .eq('id', matchup.id)

// Update next match with winner (but DON'T start it)
if (matchup.next_match_id) {
  // Determine if winner goes to slot A or B
  const isLeftConference = matchup.vc_a.conference === 'left'
  const updateField = isLeftConference ? 'vc_a_id' : 'vc_b_id'
  
  await supabase
    .from('matchups')
    .update({
      [updateField]: winnerId,
      updated_at: new Date().toISOString()
    })
    .eq('id', matchup.next_match_id)
}

// DO NOT START NEXT MATCH AUTOMATICALLY
// Admin will manually start it

console.log(`Match ${matchup.match_number} resolved. Winner: ${winnerId}`)
return new Response(JSON.stringify({
  success: true,
  matchNumber: matchup.match_number,
  winnerId: winnerId,
  winnerName: winnerVc.name,
  finalScores: {
    vcA: { name: matchup.vc_a.name, cp: matchup.current_cp_a },
    vcB: { name: matchup.vc_b.name, cp: matchup.current_cp_b }
  }
}), {
  headers: { 'Content-Type': 'application/json' },
  status: 200
})
```

### 4. "Waiting for Next Match" UI State

**All Pages** (home, bracket, admin) need to detect:
- `currentMatchup === null` (no active match)
- Last finished match exists

**New API Route:** `/api/last-finished-match`
```typescript
export async function GET() {
  const { data: lastMatch, error } = await supabase
    .from('matchups_with_vcs')
    .select('*')
    .eq('finished', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  
  if (error || !lastMatch) {
    return NextResponse.json({ ok: false })
  }
  
  return NextResponse.json({
    ok: true,
    match: {
      matchNumber: lastMatch.match_number,
      round: lastMatch.round,
      winner: lastMatch.winner_id === lastMatch.vc_a.id ? lastMatch.vc_a : lastMatch.vc_b,
      finalScores: {
        vcA: { name: lastMatch.vc_a.name, cp: lastMatch.final_cp_a },
        vcB: { name: lastMatch.vc_b.name, cp: lastMatch.final_cp_b }
      }
    }
  })
}
```

**Home Page UI:**
```tsx
if (!currentMatchup) {
  // Fetch last finished match
  const [lastMatch, setLastMatch] = useState(null)
  
  useEffect(() => {
    fetch('/api/last-finished-match')
      .then(r => r.json())
      .then(data => {
        if (data.ok) setLastMatch(data.match)
      })
  }, [])
  
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">Next Match Starting Shortly...</h1>
        
        {lastMatch && (
          <div className="bg-white rounded-lg shadow-lg p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Previous Match Result</h2>
            <div className="mb-4">
              <p className="text-2xl font-bold text-green-600">
                🏆 Winner: {lastMatch.winner.name}
              </p>
            </div>
            <div className="text-lg">
              <p className="font-medium">Final Score:</p>
              <p>{lastMatch.finalScores.vcA.name}: <span className="font-bold">{lastMatch.finalScores.vcA.cp} CP</span></p>
              <p>{lastMatch.finalScores.vcB.name}: <span className="font-bold">{lastMatch.finalScores.vcB.cp} CP</span></p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

### 5. Admin Manual Start Next Match

**Admin Page Button:**
```tsx
<button 
  onClick={() => startNextMatch()}
  className="bg-green-500 text-white px-6 py-3 rounded hover:bg-green-600"
>
  Start Next Match (at 9 PM PST)
</button>
```

**API Route:** `/api/admin/start-next-match` (already exists, just verify logic)

Should:
1. Find next match in progression (QF #2, #3, #4, then SF #5, #6, then Final #7)
2. Set `active = true`, `started_at = NOW()`, `ends_at = NOW() + 72 hours`
3. Return success

---

## Implementation Steps

### Step 1: Clean Up Scheduler
1. Go to Supabase Dashboard → Integrations → Cron → Jobs
2. Delete all cron jobs (`resolve-due-matchups`, `resolve-due-matchups-vault`, etc.)
3. Run SQL to drop scheduler function:
```sql
DROP FUNCTION IF EXISTS scheduler.invoke_resolve_due_matchups();
DROP SCHEMA IF EXISTS scheduler CASCADE;
```

### Step 2: Update Edge Function
1. Edit `supabase/functions/resolve_due_matchups/index.ts`
2. Remove automatic next match start logic
3. Add response with winner details
4. Redeploy: `supabase functions deploy resolve_due_matchups`

### Step 3: Add Client-Side Auto-Resolution
1. Create `/api/resolve-match` route
2. Add timer logic to home page (`app/(public)/page.tsx`)
3. Add timer logic to bracket page (`app/bracket/page.tsx`)
4. Add timer logic to admin page (`app/admin/page.tsx`)

### Step 4: Add "Waiting" State UI
1. Create `/api/last-finished-match` route
2. Update home page to show winner + scores
3. Update bracket page to show winner + scores
4. Update admin page to show winner + scores

### Step 5: Test Flow
1. Admin seeds quarterfinals
2. Admin starts Match #1 manually
3. Set match to end in 1 minute (test-scheduler button)
4. Wait 1 minute - match auto-resolves
5. All pages show "Next match starting shortly..." with winner/scores
6. Admin clicks "Start Next Match" → Match #2 begins
7. Repeat for all 7 matches

---

## Key Files to Modify

### New Files to Create:
1. `app/api/resolve-match/route.ts` - Client-triggered resolution
2. `app/api/last-finished-match/route.ts` - Get last match winner/scores

### Files to Modify:
1. `supabase/functions/resolve_due_matchups/index.ts` - Remove auto-start next
2. `app/(public)/page.tsx` - Add timer + waiting state UI
3. `app/bracket/page.tsx` - Add timer + waiting state UI  
4. `app/admin/page.tsx` - Add timer + waiting state UI
5. `app/api/admin/start-next-match/route.ts` - Verify logic

### Files to Delete/Ignore:
1. All cron-related migrations (`0009`, `0011`, `0012`)
2. `scheduler` schema and functions
3. `app/api/admin/manual-resolve/route.ts` (will be replaced)

---

## Expected Final Behavior

### Timeline Example:

**9:00 PM PST (Day 1):** Admin starts Match #1
- Home page: Shows Match #1, timer starts at 72h 0m 0s
- Bracket: Match #1 highlighted green "LIVE"
- Voting opens

**9:00 PM PST (Day 4):** 72 hours pass
- Timer hits 0h 0m 0s
- Client-side timer detects expiration
- Calls `/api/resolve-match`
- Edge Function resolves match, determines winner (e.g., A16Z)
- **Does NOT start next match**

**9:01 PM PST (Day 4):** After resolution
- Home page: "Next match starting shortly... Winner of last match: A16Z. Final Score: A16Z: 1001 CP, SoftBank: 1000 CP"
- Bracket: Match #1 shows finished, A16Z highlighted as winner
- Admin page: Shows same waiting state + "Start Next Match" button

**9:00 PM PST (Day 5):** Admin manually starts Match #2
- Admin clicks "Start Next Match"
- Match #2 (Sequoia vs YC) becomes active
- Timer starts at 72h 0m 0s
- Cycle repeats

**Tournament Completes:**
- After 7 matches (4 QF + 2 SF + 1 Final)
- Winner goes to Hall of Fame
- Season marked as complete

---

## Current Bugs to Fix

1. **Match stays active after expiration** - UI shows "LIVE" even at 0h 0m
2. **No auto-resolution at 72 hours** - Match never finishes automatically
3. **Scheduler fails silently** - pg_cron + pg_net doesn't work
4. **Race-proof guard blocks resolution** - Already-claimed matches can't finish
5. **No "waiting" state** - After match ends, pages show nothing or old data
6. **Admin can't see winner** - No UI to show last match result
7. **Exposed service role key** - Client-side code had hardcoded key

---

## Success Criteria

✅ **No automatic scheduler** - All cron jobs removed  
✅ **72-hour auto-resolution** - Match finishes exactly at timer expiration  
✅ **Manual progression** - Admin controls when next match starts  
✅ **Waiting state UI** - Shows winner + scores between matches  
✅ **Clean admin UX** - Single "Start Next Match" button at 9 PM  
✅ **Security** - No exposed keys, all server-side calls  
✅ **Tournament completion** - All 7 matches progress correctly

---

## Questions for ChatGPT

1. **Best approach for client-side auto-resolution?**
   - Should we use `setInterval` on all pages?
   - Or a single background worker?
   - How to prevent multiple clients from calling resolution simultaneously?

2. **Race condition prevention?**
   - How to ensure only one resolution happens per match?
   - Should we use optimistic locking in the database?

3. **Edge Function reliability?**
   - Current direct fetch from client works
   - Is there a better pattern?

4. **State management?**
   - How to reliably detect "waiting for next match" state?
   - Should we add a `season.current_phase` field?

5. **User experience?**
   - Should we add a countdown on admin page for next 9 PM?
   - Should we send notifications when match ends?

---

## Environment Details

- **Supabase Project URL:** `https://vmyrfpuzxtzglpayktmj.supabase.co`
- **Service Role Key:** Available in `.env.local` as `SUPABASE_SERVICE_ROLE_KEY`
- **Deployment:** Vercel
- **Next.js Version:** 15.5.5
- **Node Version:** v18+

---

## Request for ChatGPT

Please provide:
1. **Complete implementation plan** with step-by-step instructions
2. **All code changes** needed (full file contents or precise diffs)
3. **SQL commands** to clean up old scheduler
4. **Testing checklist** to verify everything works
5. **Migration strategy** if database changes needed

Assume you have full access to modify anything. Provide production-ready, clean, well-documented code that follows Next.js and React best practices.
